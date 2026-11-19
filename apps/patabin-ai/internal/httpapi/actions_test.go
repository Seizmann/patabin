package httpapi

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
)

type actionBackend struct {
	mu        sync.Mutex
	rpcCalls  []string
	rpcBodies []map[string]any
	responses []string
	events    []map[string]any
}

func (f *actionBackend) handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /rest/v1/rpc/agent_approve_action", func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		var body map[string]any
		_ = json.Unmarshal(raw, &body)
		f.mu.Lock()
		idx := len(f.rpcCalls)
		f.rpcCalls = append(f.rpcCalls, "approve")
		f.rpcBodies = append(f.rpcBodies, body)
		resp := f.responses[idx]
		f.mu.Unlock()
		_, _ = w.Write([]byte(resp))
	})
	mux.HandleFunc("POST /rest/v1/rpc/agent_reject_action", func(w http.ResponseWriter, r *http.Request) {
		f.mu.Lock()
		f.rpcCalls = append(f.rpcCalls, "reject")
		f.mu.Unlock()
		_, _ = w.Write([]byte(`{"status":"rejected"}`))
	})
	mux.HandleFunc("GET /rest/v1/agent_pending_actions", func(w http.ResponseWriter, r *http.Request) {
		f.mu.Lock()
		defer f.mu.Unlock()
		_, _ = w.Write([]byte(`[{"conversation_id":"conv-1"}]`))
	})
	mux.HandleFunc("GET /rest/v1/agent_messages", func(w http.ResponseWriter, r *http.Request) {
		f.mu.Lock()
		defer f.mu.Unlock()
		_, _ = w.Write([]byte(`[]`))
	})
	mux.HandleFunc("POST /rest/v1/agent_messages", func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		var body map[string]any
		_ = json.Unmarshal(raw, &body)
		f.mu.Lock()
		f.events = append(f.events, body)
		f.mu.Unlock()
		_, _ = w.Write([]byte(`[{"id":"m-1"}]`))
	})
	mux.HandleFunc("PATCH /rest/v1/agent_conversations", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})
	return mux
}

func newActionTestServer(t *testing.T, backend *actionBackend) *server {
	t.Helper()
	ts := httptest.NewServer(backend.handler())
	t.Cleanup(ts.Close)
	cfg := testConfig(ts.URL)
	cfg.ActionRPM = 60
	s := New(cfg, slog.New(slog.NewTextHandler(os.Stderr, nil)))
	s.authenticator = &stubAuthenticator{su: true}
	return s
}

func doActionReq(s *server, method, path, body string) *httptest.ResponseRecorder {
	var reader io.Reader
	if body != "" {
		reader = strings.NewReader(body)
	}
	req := httptest.NewRequest(method, path, reader)
	req.Header.Set("Authorization", "Bearer good-token")
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	s.Handler().ServeHTTP(res, req)
	return res
}

func TestApproveForwardsHash(t *testing.T) {
	backend := &actionBackend{responses: []string{`{"status":"executed","result_table":"sales","result_id":"s-1"}`}}
	s := newActionTestServer(t, backend)
	res := doActionReq(s, "POST", "/v1/actions/11111111-1111-1111-1111-111111111111/approve", `{"preview_hash":"abc"}`)
	if res.Code != http.StatusOK {
		t.Fatalf("status = %d", res.Code)
	}
	backend.mu.Lock()
	defer backend.mu.Unlock()
	if len(backend.rpcBodies) != 1 || backend.rpcBodies[0]["p_expected_preview_hash"] != "abc" {
		t.Fatalf("rpc body = %v", backend.rpcBodies)
	}
	if len(backend.events) != 1 {
		t.Fatalf("approve must record one event message, got %d", len(backend.events))
	}
	if backend.events[0]["role"] != "event" {
		t.Fatalf("event role = %v", backend.events[0]["role"])
	}
}

func TestApproveBadID(t *testing.T) {
	s := newActionTestServer(t, &actionBackend{})
	res := doActionReq(s, "POST", "/v1/actions/not-a-uuid/approve", `{}`)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("status = %d", res.Code)
	}
}

func TestRejectCallsRPC(t *testing.T) {
	backend := &actionBackend{}
	s := newActionTestServer(t, backend)
	res := doActionReq(s, "POST", "/v1/actions/11111111-1111-1111-1111-111111111111/reject", `{}`)
	if res.Code != http.StatusOK {
		t.Fatalf("status = %d", res.Code)
	}
	backend.mu.Lock()
	defer backend.mu.Unlock()
	if len(backend.rpcCalls) != 1 || backend.rpcCalls[0] != "reject" {
		t.Fatalf("rpc calls = %v", backend.rpcCalls)
	}
}

func TestApproveAllStopsAtFirstFailure(t *testing.T) {
	backend := &actionBackend{responses: []string{
		`{"status":"executed","result_id":"s-1"}`,
		`{"status":"stale","preview":{}}`,
		`{"status":"executed","result_id":"s-2"}`,
	}}
	s := newActionTestServer(t, backend)
	body := `{"actions":[{"id":"11111111-1111-1111-1111-111111111111","preview_hash":"h1"},{"id":"22222222-2222-2222-2222-222222222222","preview_hash":"h2"},{"id":"33333333-3333-3333-3333-333333333333","preview_hash":"h3"}]}`
	res := doActionReq(s, "POST", "/v1/actions/approve-all", body)
	if res.Code != http.StatusOK {
		t.Fatalf("status = %d", res.Code)
	}
	var out struct {
		Results []map[string]any `json:"results"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	if len(out.Results) != 3 {
		t.Fatalf("results = %v", out.Results)
	}
	backend.mu.Lock()
	defer backend.mu.Unlock()
	if len(backend.rpcCalls) != 2 {
		t.Fatalf("approve-all must stop after first non-success, calls = %d", len(backend.rpcCalls))
	}
	if out.Results[2]["status"] != "skipped" {
		t.Fatalf("third action must be skipped, got %v", out.Results[2])
	}
}

func TestApproveAllEmptyRejected(t *testing.T) {
	s := newActionTestServer(t, &actionBackend{})
	res := doActionReq(s, "POST", "/v1/actions/approve-all", `{"actions":[]}`)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("status = %d", res.Code)
	}
}
