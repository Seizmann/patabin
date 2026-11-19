package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Seizmann/patabin/apps/patabin-ai/internal/llm"
	"github.com/Seizmann/patabin/apps/patabin-ai/internal/normalize"
	"github.com/Seizmann/patabin/apps/patabin-ai/internal/secrets"
	"github.com/Seizmann/patabin/apps/patabin-ai/internal/supa"
)

type fakeSupaState struct {
	mu          sync.Mutex
	convs       []string
	msgs        []map[string]any
	msgSeq      int64
	modelsBody  string
	lastErr     string
	rpcCalls    []map[string]any
	rpcResps    []string
	partnerBody string
}

type fakeLLM struct {
	mu       sync.Mutex
	resps    []string
	requests int
	bodies   []chatRequest
}

type chatRequest struct {
	Model    string `json:"model"`
	Messages []struct {
		Role    string `json:"role"`
		Content any    `json:"content"`
	} `json:"messages"`
}

func (f *fakeLLM) handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		f.mu.Lock()
		idx := f.requests
		if idx >= len(f.resps) {
			idx = len(f.resps) - 1
		}
		resp := f.resps[idx]
		f.requests++
		var req chatRequest
		_ = json.NewDecoder(r.Body).Decode(&req)
		f.bodies = append(f.bodies, req)
		f.mu.Unlock()
		if strings.HasPrefix(resp, "HTTP ") {
			var code int
			_, _ = fmt.Sscanf(resp, "HTTP %d", &code)
			w.WriteHeader(code)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		for _, line := range strings.Split(resp, "\n") {
			fmt.Fprintln(w, line)
			if fl, ok := w.(http.Flusher); ok {
				fl.Flush()
			}
		}
	})
}

func toolCallChunk(id, name, args string) string {
	fn := map[string]any{"name": name, "arguments": args}
	tc := map[string]any{"index": 0, "function": fn}
	if id != "" {
		tc["id"] = id
	}
	delta := map[string]any{"tool_calls": []any{tc}}
	return "data: " + mustJSON(map[string]any{"choices": []any{map[string]any{"delta": delta}}}) + "\n"
}

func textChunk(s string) string {
	return "data: " + mustJSON(map[string]any{"choices": []any{map[string]any{"delta": map[string]any{"content": s}}}}) + "\n"
}

func mustJSON(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}

func newLoopFixture(t *testing.T, llmResps []string, modelsBody string) (*Loop, *fakeSupaState, *fakeLLM) {
	t.Helper()
	state := &fakeSupaState{
		modelsBody:  modelsBody,
		partnerBody: `[{"id":"aaaaaaaa-1111-1111-1111-111111111111","name":"Sijan","user_id":"user-1"},{"id":"bbbbbbbb-2222-2222-2222-222222222222","name":"Bappy"}]`,
	}
	llmFake := &fakeLLM{resps: llmResps}
	llmTS := httptest.NewServer(llmFake.handler())
	t.Cleanup(llmTS.Close)

	supaMux := http.NewServeMux()
	supaMux.HandleFunc("POST /rest/v1/agent_conversations", func(w http.ResponseWriter, r *http.Request) {
		state.mu.Lock()
		defer state.mu.Unlock()
		state.convs = append(state.convs, "conv-1")
		_, _ = w.Write([]byte(`[{"id":"conv-1"}]`))
	})
	supaMux.HandleFunc("GET /rest/v1/agent_conversations", func(w http.ResponseWriter, r *http.Request) {
		state.mu.Lock()
		defer state.mu.Unlock()
		if len(state.convs) > 0 {
			_, _ = w.Write([]byte(`[{"id":"conv-1"}]`))
			return
		}
		_, _ = w.Write([]byte(`[]`))
	})
	supaMux.HandleFunc("POST /rest/v1/agent_messages", func(w http.ResponseWriter, r *http.Request) {
		state.mu.Lock()
		defer state.mu.Unlock()
		var body map[string]any
		raw, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(raw, &body); err != nil {
			state.lastErr = "decode: " + err.Error() + " raw: " + string(raw)
			http.Error(w, state.lastErr, http.StatusBadRequest)
			return
		}
		state.msgSeq++
		body["seq"] = state.msgSeq
		body["id"] = fmt.Sprintf("msg-%d", len(state.msgs)+1)
		state.msgs = append(state.msgs, body)
		_, _ = w.Write([]byte("[" + mustJSON(map[string]any{"id": body["id"]}) + "]"))
	})
	supaMux.HandleFunc("PATCH /rest/v1/agent_conversations", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})
	supaMux.HandleFunc("GET /rest/v1/agent_messages", func(w http.ResponseWriter, r *http.Request) {
		state.mu.Lock()
		defer state.mu.Unlock()
		if strings.Contains(r.URL.RawQuery, "order=seq.desc") {
			last := state.msgSeq
			if last == 0 {
				_, _ = w.Write([]byte(`[]`))
				return
			}
			_, _ = w.Write([]byte("[" + mustJSON(map[string]any{"seq": last}) + "]"))
			return
		}
		_, _ = w.Write([]byte(mustJSON(state.msgs)))
	})
	supaMux.HandleFunc("GET /rest/v1/partners", func(w http.ResponseWriter, r *http.Request) {
		state.mu.Lock()
		defer state.mu.Unlock()
		if strings.Contains(r.URL.RawQuery, "user_id=eq.") {
			_, _ = w.Write([]byte(`[{"id":"aaaaaaaa-1111-1111-1111-111111111111","name":"Sijan","user_id":"user-1"}]`))
			return
		}
		_, _ = w.Write([]byte(state.partnerBody))
	})
	supaMux.HandleFunc("POST /rest/v1/rpc/agent_create_action", func(w http.ResponseWriter, r *http.Request) {
		state.mu.Lock()
		defer state.mu.Unlock()
		var body map[string]any
		raw, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(raw, &body); err != nil {
			http.Error(w, "decode", http.StatusBadRequest)
			return
		}
		idx := len(state.rpcCalls)
		state.rpcCalls = append(state.rpcCalls, body)
		if idx < len(state.rpcResps) {
			resp := state.rpcResps[idx]
			if resp == "HTTP 500" {
				w.WriteHeader(http.StatusInternalServerError)
				return
			}
			_, _ = w.Write([]byte(resp))
			return
		}
		_, _ = w.Write([]byte(`{"ok":true,"action_id":"act-1","status":"pending","preview_hash":"h","preview":{"detail":{}},"expires_at":"2030-01-01T00:00:00Z"}`))
	})
	supaMux.HandleFunc("GET /rest/v1/v_packet_stock", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`[]`))
	})
	supaMux.HandleFunc("GET /rest/v1/settings", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`[{"default_buy_rate":190,"default_sell_price":300,"default_packet_size":20}]`))
	})
	supaMux.HandleFunc("GET /rest/v1/v_chalan_summary", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`[{"chalan_id":"ch-1","code":"C-001"}]`))
	})
	supaMux.HandleFunc("GET /rest/v1/profiles", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`[{"display_name":"Sijan"}]`))
	})
	supaMux.HandleFunc("POST /rest/v1/rpc/agent_get_provider_key", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`"sk-fake-provider-key"`))
	})
	models := modelsBody
	if models == "" {
		models = `[{"id":"m1","provider_id":"p1","model_id":"model-a","supports_tools":true,"is_default":true,"fallback_position":1},{"id":"m2","provider_id":"p1","model_id":"model-b","supports_tools":true,"is_default":false,"fallback_position":2}]`
	}
	supaMux.HandleFunc("GET /rest/v1/agent_models", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(models))
	})
	supaMux.HandleFunc("GET /rest/v1/agent_providers", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`[{"id":"p1","name":"Fake","base_url":"` + llmTS.URL + `","extra_headers":{}}]`))
	})
	supaTS := httptest.NewServer(supaMux)
	t.Cleanup(supaTS.Close)

	client := supa.New(supaTS.URL, "anon")
	loop := &Loop{
		Supa:      client,
		LLM:       llm.NewClient(0),
		Keys:      secrets.NewCache(func(ctx context.Context, providerID string) (string, error) { return "sk-fake-provider-key", nil }, time.Minute),
		History:   &History{Supa: client},
		Limits:    Limits{MaxRounds: 5, MaxProposals: 5, MaxToolChars: 20480},
		MaxTokens: 256,
	}
	return loop, state, llmFake
}

type recordedEvent struct {
	name    string
	payload map[string]any
}

func runChat(t *testing.T, loop *Loop, in ChatInput) ([]recordedEvent, error) {
	t.Helper()
	var events []recordedEvent
	err := loop.Run(context.Background(), "tok", "user-1", in, func(event string, payload any) error {
		events = append(events, recordedEvent{event, payload.(map[string]any)})
		return nil
	})
	return events, err
}

func TestLoopTextAnswer(t *testing.T) {
	loop, state, _ := newLoopFixture(t, []string{textChunk("হ্যালো") + "data: [DONE]\n"}, "")
	events, err := runChat(t, loop, ChatInput{UserMessage: "কেমন আছো"})
	if err != nil {
		t.Fatal(err)
	}
	if events[0].name != "meta" {
		t.Fatalf("first event = %s", events[0].name)
	}
	foundToken := false
	for _, e := range events {
		if e.name == "token" {
			foundToken = true
		}
	}
	if !foundToken {
		t.Fatalf("missing token event: %+v", events)
	}
	state.mu.Lock()
	defer state.mu.Unlock()
	last := state.msgs[len(state.msgs)-1]
	if last["role"] != "assistant" || last["content"] != "হ্যালো" {
		t.Fatalf("assistant not persisted: %v", last)
	}
}

func TestLoopToolDispatch(t *testing.T) {
	loop, state, llmFake := newLoopFixture(t, []string{
		toolCallChunk("c1", "get_settings", "") + toolCallChunk("", "", "{}") + "data: [DONE]\n",
		textChunk("দর ৩০০ টাকা") + "data: [DONE]\n",
	}, "")
	events, err := runChat(t, loop, ChatInput{UserMessage: "বিক্রির দর কত"})
	if err != nil {
		t.Fatal(err)
	}
	sawToolCall, sawToolResult := false, false
	for _, e := range events {
		if e.name == "tool_call" {
			sawToolCall = true
		}
		if e.name == "tool_result" {
			sawToolResult = true
		}
	}
	if !sawToolCall || !sawToolResult {
		t.Fatalf("missing tool events: %+v", events)
	}
	llmFake.mu.Lock()
	defer llmFake.mu.Unlock()
	if len(llmFake.bodies) < 2 {
		t.Fatal("second round missing")
	}
	roles := []string{}
	for _, m := range llmFake.bodies[1].Messages {
		roles = append(roles, m.Role)
	}
	found := false
	for i, role := range roles {
		if role == "tool" && i > 0 && roles[i-1] == "assistant" {
			found = true
		}
	}
	if !found {
		t.Fatalf("tool result not after assistant with tool calls: %v", roles)
	}
	state.mu.Lock()
	defer state.mu.Unlock()
	toolMsgs := 0
	for _, m := range state.msgs {
		if m["role"] == "tool" {
			toolMsgs++
		}
	}
	if toolMsgs != 1 {
		t.Fatalf("tool messages persisted = %d", toolMsgs)
	}
}

func TestLoopAskUserEndsTurn(t *testing.T) {
	ask := toolCallChunk("q1", "ask_user", `{"questions":[{"id":"qty","text":"কত পিস?","kind":"number"}]}`) + "data: [DONE]\n"
	loop, state, llmFake := newLoopFixture(t, []string{ask}, "")
	events, err := runChat(t, loop, ChatInput{UserMessage: "বিক্রি করো"})
	if err != nil {
		t.Fatal(err)
	}
	foundQuestion := false
	for _, e := range events {
		if e.name == "question" {
			foundQuestion = true
		}
	}
	if !foundQuestion {
		t.Fatalf("question event missing: %+v", events)
	}
	llmFake.mu.Lock()
	defer llmFake.mu.Unlock()
	if llmFake.requests != 1 {
		t.Fatalf("ask_user must end the loop, llm calls = %d", llmFake.requests)
	}
	state.mu.Lock()
	defer state.mu.Unlock()
	foundEvent := false
	for _, m := range state.msgs {
		if m["role"] == "assistant" && m["event"] != nil {
			foundEvent = true
		}
	}
	if !foundEvent {
		t.Fatal("question event message not persisted")
	}
}

func TestLoopFallbackBeforeFirstToken(t *testing.T) {
	loop, _, _ := newLoopFixture(t, []string{
		"HTTP 500",
		textChunk("উত্তর") + "data: [DONE]\n",
	}, "")
	events, err := runChat(t, loop, ChatInput{UserMessage: "হাই"})
	if err != nil {
		t.Fatal(err)
	}
	foundFallback := false
	var fallback map[string]any
	for _, e := range events {
		if e.name == "model_fallback" {
			foundFallback = true
			fallback = e.payload
		}
	}
	if !foundFallback {
		t.Fatalf("model_fallback missing: %+v", events)
	}
	if fallback["from"] != "model-a" || fallback["to"] != "model-b" {
		t.Fatalf("fallback = %v", fallback)
	}
}

func TestLoopNoModel(t *testing.T) {
	loop, st, _ := newLoopFixture(t, nil, `[]`)
	events, err := runChat(t, loop, ChatInput{UserMessage: "হাই"})
	st.mu.Lock()
	t.Logf("supa last error: %s", st.lastErr)
	st.mu.Unlock()
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, e := range events {
		if e.name == "error" && e.payload["code"] == "NO_MODEL" {
			found = true
		}
	}
	if !found {
		t.Fatalf("NO_MODEL error missing: %+v", events)
	}
}

func TestNormalizeDigits(t *testing.T) {
	if normalize.Digits("২৫") != "25" {
		t.Fatal("bangla digits must normalize")
	}
}
