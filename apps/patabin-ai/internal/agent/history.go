package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"strconv"
	"time"

	"github.com/Seizmann/patabin/apps/patabin-ai/internal/llm"
	"github.com/Seizmann/patabin/apps/patabin-ai/internal/supa"
)

type History struct {
	Supa *supa.Client
}

type DBMessage struct {
	ID         string          `json:"id"`
	Seq        int64           `json:"seq"`
	Role       string          `json:"role"`
	Content    string          `json:"content"`
	ToolCalls  json.RawMessage `json:"tool_calls"`
	ToolCallID string          `json:"tool_call_id"`
	ToolName   string          `json:"tool_name"`
	ModelID    string          `json:"model_id"`
	ProviderID string          `json:"provider_id"`
	Usage      json.RawMessage `json:"usage"`
	Event      json.RawMessage `json:"event"`
}

func (h *History) Load(ctx context.Context, token, conversationID string) ([]DBMessage, error) {
	data, err := h.Supa.Get(ctx, "/rest/v1/agent_messages?select=id,seq,role,content,tool_calls,tool_call_id,tool_name,model_id,provider_id,usage,event&conversation_id=eq."+url.QueryEscape(conversationID)+"&order=seq.asc", token)
	if err != nil {
		return nil, fmt.Errorf("history load failed: %w", err)
	}
	var msgs []DBMessage
	if err := json.Unmarshal(data, &msgs); err != nil {
		return nil, fmt.Errorf("history decode failed: %w", err)
	}
	return msgs, nil
}

func (h *History) nextSeq(ctx context.Context, token, conversationID string) (int64, error) {
	data, err := h.Supa.Get(ctx, "/rest/v1/agent_messages?select=seq&conversation_id=eq."+url.QueryEscape(conversationID)+"&order=seq.desc&limit=1", token)
	if err != nil {
		return 0, err
	}
	var rows []struct {
		Seq int64 `json:"seq"`
	}
	if err := json.Unmarshal(data, &rows); err != nil {
		return 0, err
	}
	if len(rows) == 0 {
		return 1, nil
	}
	return rows[0].Seq + 1, nil
}

type AppendInput struct {
	Role       string
	Content    string
	ToolCalls  []llm.ToolCall
	ToolCallID string
	ToolName   string
	ModelID    string
	ProviderID string
	Usage      json.RawMessage
	Event      json.RawMessage
}

func (h *History) Append(ctx context.Context, token, conversationID string, in AppendInput) (string, error) {
	seq, err := h.nextSeq(ctx, token, conversationID)
	if err != nil {
		return "", fmt.Errorf("seq fetch failed: %w", err)
	}
	var calls []map[string]any
	for _, tc := range in.ToolCalls {
		calls = append(calls, map[string]any{"id": tc.ID, "name": tc.Name, "args": json.RawMessage(tc.Args)})
	}
	payload := map[string]any{
		"conversation_id": conversationID,
		"seq":             strconv.FormatInt(seq, 10),
		"role":            in.Role,
	}
	if in.Content != "" {
		payload["content"] = in.Content
	}
	if len(calls) > 0 {
		payload["tool_calls"] = calls
	}
	if in.ToolCallID != "" {
		payload["tool_call_id"] = in.ToolCallID
	}
	if in.ToolName != "" {
		payload["tool_name"] = in.ToolName
	}
	if in.ModelID != "" {
		payload["model_id"] = in.ModelID
	}
	if in.ProviderID != "" {
		payload["provider_id"] = in.ProviderID
	}
	if len(in.Usage) > 0 {
		payload["usage"] = in.Usage
	}
	if len(in.Event) > 0 {
		payload["event"] = in.Event
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	data, err := h.Supa.Post(ctx, "/rest/v1/agent_messages?select=id", token, body)
	if err != nil {
		return "", fmt.Errorf("history append failed: %w", err)
	}
	var rows []struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(data, &rows); err != nil || len(rows) == 0 {
		return "", fmt.Errorf("history append decode failed")
	}
	_, _ = h.Supa.Patch(ctx, "/rest/v1/agent_conversations?id=eq."+url.QueryEscape(conversationID), token, map[string]any{"last_activity_at": time.Now().UTC().Format(time.RFC3339)})
	return rows[0].ID, nil
}

func (h *History) CreateConversation(ctx context.Context, token, title string) (string, error) {
	convBody, err := json.Marshal(map[string]any{"title": title})
	if err != nil {
		return "", err
	}
	data, err := h.Supa.Post(ctx, "/rest/v1/agent_conversations?select=id", token, convBody)
	if err != nil {
		return "", fmt.Errorf("conversation create failed: %w", err)
	}
	var rows []struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(data, &rows); err != nil || len(rows) == 0 {
		return "", fmt.Errorf("conversation create decode failed")
	}
	return rows[0].ID, nil
}

func (h *History) ConversationOwner(ctx context.Context, token, conversationID string) (bool, error) {
	data, err := h.Supa.Get(ctx, "/rest/v1/agent_conversations?select=id&id=eq."+url.QueryEscape(conversationID), token)
	if err != nil {
		return false, err
	}
	var rows []map[string]any
	if err := json.Unmarshal(data, &rows); err != nil {
		return false, err
	}
	return len(rows) > 0, nil
}

func dbToNeutral(rows []DBMessage) []llm.Message {
	out := make([]llm.Message, 0, len(rows))
	for _, r := range rows {
		m := llm.Message{Role: r.Role, Content: r.Content, ToolCallID: r.ToolCallID, ToolName: r.ToolName}
		if len(r.ToolCalls) > 0 {
			var calls []struct {
				ID   string          `json:"id"`
				Name string          `json:"name"`
				Args json.RawMessage `json:"args"`
			}
			if err := json.Unmarshal(r.ToolCalls, &calls); err == nil {
				for _, c := range calls {
					m.ToolCalls = append(m.ToolCalls, llm.ToolCall{ID: c.ID, Name: c.Name, Args: c.Args})
				}
			}
		}
		out = append(out, m)
	}
	return out
}
