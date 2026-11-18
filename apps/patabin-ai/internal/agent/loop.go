package agent

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/Seizmann/patabin/apps/patabin-ai/internal/llm"
	"github.com/Seizmann/patabin/apps/patabin-ai/internal/normalize"
	"github.com/Seizmann/patabin/apps/patabin-ai/internal/secrets"
	"github.com/Seizmann/patabin/apps/patabin-ai/internal/supa"
)

type Limits struct {
	MaxRounds    int
	MaxProposals int
	MaxToolChars int
}

type EmitFunc func(event string, payload any) error

type Loop struct {
	Supa      *supa.Client
	LLM       *llm.Client
	Keys      *secrets.Cache
	History   *History
	Limits    Limits
	MaxTokens int
}

type ChatInput struct {
	ConversationID string
	UserMessage    string
	ModelID        string
	AnswerTo       string
}

type modelCandidate struct {
	ProviderID    string
	ProviderName  string
	BaseURL       string
	ExtraHeaders  map[string]string
	ModelID       string
	SupportsTools bool
}

var errAskUser = errors.New("ask_user")

type question struct {
	ID      string   `json:"id"`
	Text    string   `json:"text"`
	Kind    string   `json:"kind"`
	Options []option `json:"options,omitempty"`
}
type option struct {
	Label string `json:"label"`
	Value string `json:"value"`
}

func (l *Loop) Run(ctx context.Context, token, uid string, in ChatInput, emit EmitFunc) error {
	var conversationID string
	if in.ConversationID == "" {
		title := in.UserMessage
		if len([]rune(title)) > 40 {
			title = string([]rune(title)[:40])
		}
		id, err := l.History.CreateConversation(ctx, token, title)
		if err != nil {
			return err
		}
		conversationID = id
	} else {
		ok, err := l.History.ConversationOwner(ctx, token, in.ConversationID)
		if err != nil || !ok {
			return fmt.Errorf("conversation not found")
		}
		conversationID = in.ConversationID
	}

	if in.AnswerTo != "" {
		eventJSON, _ := json.Marshal(map[string]any{"type": "answer", "question_id": in.AnswerTo})
		if _, err := l.History.Append(ctx, token, conversationID, AppendInput{Role: "event", Content: in.UserMessage, Event: eventJSON}); err != nil {
			return err
		}
	}

	if _, err := l.History.Append(ctx, token, conversationID, AppendInput{Role: "user", Content: in.UserMessage}); err != nil {
		return err
	}

	rows, err := l.History.Load(ctx, token, conversationID)
	if err != nil {
		return err
	}
	history := dbToNeutral(rows)

	systemPrompt, err := RenderSystemPrompt(ctx, l.Supa, token, uid)
	if err != nil {
		return err
	}
	messages := make([]llm.Message, 0, len(history)+1)
	messages = append(messages, llm.Message{Role: "system", Content: systemPrompt})
	messages = append(messages, history...)

	candidates, err := l.candidates(ctx, token, in.ModelID)
	if err != nil {
		return err
	}
	if len(candidates) == 0 {
		emit("error", map[string]any{"code": "NO_MODEL", "message_bn": "কোনো চালু মডেল নেই; এজেন্ট সেটিংসে মডেল যোগ করুন।", "retryable": false})
		return nil
	}

	emit("meta", map[string]any{"conversation_id": conversationID, "model": candidates[0].ModelID})
	modelID := candidates[0].ModelID
	modelRef := func() string { return modelID }

	registry := map[string]Tool{}
	var defs []llm.ToolDef
	allTools := append(Registry(),
		proposeSaleTool(modelRef),
		proposeExpenseTool(modelRef),
		proposePersonalUseTool(modelRef),
		proposeAdjustmentTool(modelRef),
	)
	for _, t := range allTools {
		registry[t.Name] = t
		defs = append(defs, llm.ToolDef{Name: t.Name, Description: t.Description, Schema: t.Schema})
	}
	defs = append(defs, llm.ToolDef{
		Name:        "ask_user",
		Description: "প্রয়োজনীয় তথ্য না থাকলে ব্যবহারকারীকে প্রশ্ন করো। সব প্রশ্ন এক কলে করো; প্রশ্নের লেখা বাংলায়।",
		Schema: obj(map[string]any{
			"questions": map[string]any{
				"type": "array",
				"items": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"id":      strProp("ছোট ইংরেজি আইডি"),
						"text":    strProp("প্রশ্ন, বাংলায়"),
						"kind":    map[string]any{"type": "string", "enum": []string{"single", "multi", "text", "number"}},
						"options": map[string]any{"type": "array", "items": map[string]any{"type": "object", "properties": map[string]any{"label": strProp("অপশন, বাংলায়"), "value": strProp("মান")}}},
					},
					"required": []string{"id", "text", "kind"},
				},
			},
		}, []string{"questions"}),
	})

	tc := &ToolContext{Supa: l.Supa, Token: token, UserID: uid}
	rounds := 0
	failKey := ""
	failCount := 0
	proposals := 0

	for {
		if rounds >= l.Limits.MaxRounds {
			return emitError(emit, "MAX_ROUNDS", "অনেক ধাপ হয়ে গেছে; আবার চেষ্টা করুন।")
		}
		rounds++

		var assistant strings.Builder
		var calls []llm.ToolCall
		var usage json.RawMessage
		emitted := false

		provider := candidates[0]
		var attemptErr error
		for idx, cand := range candidates {
			if idx > 0 {
				emit("model_fallback", map[string]any{"from": provider.ModelID, "to": cand.ModelID, "reason": attemptErr.Error()})
			}
			provider = cand
			assistant.Reset()
			calls = nil
			emitted = false
			key, keyErr := l.Keys.Get(ctx, cand.ProviderID)
			if keyErr != nil {
				attemptErr = fmt.Errorf("key fetch failed")
				continue
			}
			cfg := llm.ProviderConfig{BaseURL: cand.BaseURL, APIKey: key, ExtraHeaders: cand.ExtraHeaders}
			_, attemptErr = l.LLM.StreamChat(ctx, cfg, cand.ModelID, messages, defs, l.MaxTokens, llm.StreamCallbacks{
				OnText: func(delta string) {
					emitted = true
					assistant.WriteString(delta)
					_ = emit("token", map[string]any{"delta": delta})
				},
				OnToolCall: func(call llm.ToolCall) {
					emitted = true
					calls = append(calls, call)
				},
				OnUsage: func(u json.RawMessage) { usage = u },
			})
			if attemptErr == nil {
				break
			}
			if emitted {
				_ = emitError(emit, "STREAM_BROKEN", "উত্তরের মাঝপথে সংযোগ ভেঙেছে; আবার চেষ্টা করুন।")
				return nil
			}
			if ctx.Err() != nil {
				return ctx.Err()
			}
		}
		if attemptErr != nil {
			return emitError(emit, "LLM_FAILED", "সব মডেল ব্যর্থ হয়েছে; পরে আবার চেষ্টা করুন।")
		}

		content := assistant.String()
		if len(calls) == 0 {
			if _, err := l.History.Append(ctx, token, conversationID, AppendInput{
				Role: "assistant", Content: content, ModelID: provider.ModelID, ProviderID: provider.ProviderID, Usage: usage,
			}); err != nil {
				return err
			}
			return nil
		}

		if _, err := l.History.Append(ctx, token, conversationID, AppendInput{
			Role: "assistant", Content: content, ToolCalls: calls, ModelID: provider.ModelID, ProviderID: provider.ProviderID, Usage: usage,
		}); err != nil {
			return err
		}
		messages = append(messages, llm.Message{Role: "assistant", Content: content, ToolCalls: calls})

		for _, call := range calls {
			callKey := call.Name + "|" + string(call.Args)
			if callKey == failKey {
				failCount++
			} else {
				failKey = callKey
				failCount = 1
			}
			if failCount > 2 {
				return emitError(emit, "LOOP_STUCK", "একই ভুল বারবার হচ্ছে; থামানো হলো।")
			}

			call.Name = strings.TrimSpace(call.Name)
			if call.Name == "ask_user" {
				questions, qErr := parseQuestions(call.Args)
				if qErr != nil {
					_ = l.appendToolResult(ctx, token, conversationID, call, `{"error":"BAD_QUESTIONS"}`)
					emit("tool_result", map[string]any{"name": call.Name, "summary": "bad questions"})
					continue
				}
				eventJSON, _ := json.Marshal(map[string]any{"type": "question", "questions": questions})
				if _, err := l.History.Append(ctx, token, conversationID, AppendInput{
					Role: "assistant", Content: "", Event: eventJSON, ModelID: provider.ModelID,
				}); err != nil {
					return err
				}
				emit("question", map[string]any{"questions": questions})
				return nil
			}

			tool, known := registry[call.Name]
			if known && strings.HasPrefix(call.Name, "propose_") {
				if proposals >= l.Limits.MaxProposals {
					result := map[string]any{"error": "PROPOSAL_CAP", "message_bn": "এক বার্তায় সর্বোচ্চ " + fmt.Sprint(l.Limits.MaxProposals) + "টি প্রস্তাব করা যায়।"}
					payload, _ := json.Marshal(map[string]any{"source": "database", "note": "untrusted data", "data": result})
					if err := l.appendToolResult(ctx, token, conversationID, call, string(payload)); err != nil {
						return err
					}
					emit("tool_result", map[string]any{"name": call.Name, "summary": summarize(payload)})
					messages = append(messages, llm.Message{Role: "tool", Content: string(payload), ToolCallID: call.ID, ToolName: call.Name})
					continue
				}
				proposals++
			}
			emit("tool_call", map[string]any{"name": call.Name, "args": shortArgs(call.Args)})
			var result any
			if !known {
				result = map[string]any{"error": "UNKNOWN_TOOL"}
			} else {
				res, runErr := tool.Run(ctx, tc, call.Args)
				if runErr != nil {
					result = map[string]any{"error": runErr.Error()}
				} else {
					result = res
				}
				if resMap, ok := res.(map[string]any); ok && resMap["status"] == "awaiting_approval" {
					emit("proposal", map[string]any{"action_id": resMap["action_id"], "tool": call.Name})
				}
			}
			payload, _ := json.Marshal(map[string]any{"source": "database", "note": "untrusted data", "data": result})
			if len(payload) > l.Limits.MaxToolChars {
				payload = []byte(`{"source":"database","note":"untrusted data","data":{"truncated":true}}`)
			}
			if err := l.appendToolResult(ctx, token, conversationID, call, string(payload)); err != nil {
				return err
			}
			emit("tool_result", map[string]any{"name": call.Name, "summary": summarize(payload)})
			messages = append(messages, llm.Message{Role: "tool", Content: string(payload), ToolCallID: call.ID, ToolName: call.Name})
		}
		messages = trimHistory(messages, 120*1024)
	}
}

func (l *Loop) appendToolResult(ctx context.Context, token, conversationID string, call llm.ToolCall, payload string) error {
	_, err := l.History.Append(ctx, token, conversationID, AppendInput{
		Role: "tool", Content: payload, ToolCallID: call.ID, ToolName: call.Name,
	})
	return err
}

func (l *Loop) candidates(ctx context.Context, token, modelID string) ([]modelCandidate, error) {
	providers, err := fetchJSON(ctx, &ToolContext{Supa: l.Supa, Token: token}, "/rest/v1/agent_providers?select=id,name,base_url,extra_headers&is_active=eq.true")
	if err != nil {
		return nil, err
	}
	models, err := fetchJSON(ctx, &ToolContext{Supa: l.Supa, Token: token}, "/rest/v1/agent_models?select=id,provider_id,model_id,supports_tools,is_default,fallback_position&is_active=eq.true&fallback_position=not.is.null&order=fallback_position.asc")
	if err != nil {
		return nil, err
	}
	provMap := map[string]modelCandidate{}
	if list, ok := providers.([]any); ok {
		for _, row := range list {
			if m, ok := row.(map[string]any); ok {
				headers := map[string]string{}
				if raw, ok := m["extra_headers"].(map[string]any); ok {
					for k, v := range raw {
						headers[k] = fmt.Sprint(v)
					}
				}
				provMap[fmt.Sprint(m["id"])] = modelCandidate{
					ProviderID:   fmt.Sprint(m["id"]),
					ProviderName: fmt.Sprint(m["name"]),
					BaseURL:      fmt.Sprint(m["base_url"]),
					ExtraHeaders: headers,
				}
			}
		}
	}
	var chain []modelCandidate
	var def *modelCandidate
	if list, ok := models.([]any); ok {
		for _, row := range list {
			if m, ok := row.(map[string]any); ok {
				base, okP := provMap[fmt.Sprint(m["provider_id"])]
				if !okP {
					continue
				}
				base.ModelID = fmt.Sprint(m["model_id"])
				base.SupportsTools, _ = m["supports_tools"].(bool)
				chain = append(chain, base)
				if isDefault, _ := m["is_default"].(bool); isDefault {
					cp := base
					def = &cp
				}
			}
		}
	}
	if modelID != "" {
		for i, c := range chain {
			if c.ModelID == modelID {
				rest := append([]modelCandidate{c}, chain[:i]...)
				rest = append(rest, chain[i+1:]...)
				return rest, nil
			}
		}
		return nil, fmt.Errorf("model not found")
	}
	if def != nil {
		rest := []modelCandidate{*def}
		for _, c := range chain {
			if c.ModelID != def.ModelID || c.ProviderID != def.ProviderID {
				rest = append(rest, c)
			}
		}
		return rest, nil
	}
	return chain, nil
}

func parseQuestions(args json.RawMessage) ([]question, error) {
	var in struct {
		Questions []question `json:"questions"`
	}
	if err := json.Unmarshal(args, &in); err != nil {
		return nil, err
	}
	if len(in.Questions) == 0 {
		return nil, fmt.Errorf("no questions")
	}
	return in.Questions, nil
}

func shortArgs(args json.RawMessage) string {
	var m map[string]any
	if err := json.Unmarshal(args, &m); err != nil {
		return ""
	}
	for k, v := range m {
		if s, ok := v.(string); ok {
			m[k] = normalize.Digits(s)
		}
	}
	out, _ := json.Marshal(m)
	if len(out) > 200 {
		return string(out[:200])
	}
	return string(out)
}

func summarize(payload []byte) string {
	if len(payload) > 120 {
		return string(payload[:120])
	}
	return string(payload)
}

func emitError(emit EmitFunc, code, messageBn string) error {
	return emit("error", map[string]any{"code": code, "message_bn": messageBn, "retryable": true})
}

func trimHistory(messages []llm.Message, limit int) []llm.Message {
	total := 0
	for i := range messages {
		total += len(messages[i].Content)
	}
	if total <= limit {
		return messages
	}
	for i := 1; i < len(messages); i++ {
		if messages[i].Role == "tool" && len(messages[i].Content) > 200 {
			total -= len(messages[i].Content) - 200
			messages[i].Content = "(সংক্ষেপিত)"
		}
		if total <= limit {
			return messages
		}
	}
	for len(messages) > 2 && total > limit {
		total -= len(messages[1].Content)
		if messages[1].Role == "user" && len(messages) > 2 && messages[2].Role == "assistant" {
			total -= len(messages[2].Content)
			messages = append(messages[:1:1], messages[3:]...)
			continue
		}
		messages = append(messages[:1:1], messages[2:]...)
	}
	return messages
}
