package httpapi

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"
)

type providerBackend struct {
	su             bool
	providerStatus int
	providerBody   string
	modelsBody     string
	keyBody        string
	providerCalled bool
	openaiURL      string
}

func (f *providerBackend) handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /rest/v1/agent_providers", func(w http.ResponseWriter, r *http.Request) {
		f.providerCalled = true
		status := f.providerStatus
		if status == 0 {
			status = http.StatusOK
		}
		w.WriteHeader(status)
		w.Write([]byte(f.providerBody))
	})
	mux.HandleFunc("GET /rest/v1/agent_models", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(f.modelsBody))
	})
	mux.HandleFunc("POST /rest/v1/rpc/agent_get_provider_key", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(f.keyBody))
	})
	return mux
}

func newProviderTestServer(t *testing.T, backend *providerBackend) (*server, *httptest.Server) {
	t.Helper()
	ts := httptest.NewServer(backend.handler())
	t.Cleanup(ts.Close)
	cfg := testConfig(ts.URL)
	cfg.ProviderTestRPM = 3
	s := New(cfg, slog.New(slog.NewTextHandler(os.Stderr, nil)))
	s.authenticator = &stubAuthenticator{su: backend.su}
	return s, ts
}

func TestProviderTestSuccess(t *testing.T) {
	var openaiHits int
	openai := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		openaiHits++
		if r.Header.Get("Authorization") != "Bearer test-key" {
			t.Errorf("missing bearer header")
		}
		json.NewEncoder(w).Encode(map[string]any{"id": "chatcmpl-1", "choices": []any{}})
	}))
	t.Cleanup(openai.Close)

	backend := &providerBackend{
		su:           true,
		providerBody: `[{"id":"p1","name":"OpenAI","base_url":"` + openai.URL + `","vault_secret_id":"v1","key_last4":"-key","extra_headers":{},"is_active":true}]`,
		modelsBody:   `[{"model_id":"gpt-test","supports_tools":true,"is_default":true,"fallback_position":1}]`,
		keyBody:      `"test-key"`,
	}
	s, _ := newProviderTestServer(t, backend)
	req := httptest.NewRequest("POST", "/v1/providers/p1/test", nil)
	req.Header.Set("Authorization", "Bearer good-token")
	res := httptest.NewRecorder()
	s.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("status = %d body = %s", res.Code, res.Body.String())
	}
	var body testResult
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if !body.OK || body.Model != "gpt-test" || body.LatencyMS < 0 {
		t.Fatalf("body = %v", body)
	}
	if openaiHits != 1 {
		t.Fatalf("openai hits = %d", openaiHits)
	}
}

func TestProviderTestNotFound(t *testing.T) {
	backend := &providerBackend{su: true, providerStatus: 200, providerBody: `[]`}
	s, _ := newProviderTestServer(t, backend)
	req := httptest.NewRequest("POST", "/v1/providers/p1/test", nil)
	req.Header.Set("Authorization", "Bearer good-token")
	res := httptest.NewRecorder()
	s.Handler().ServeHTTP(res, req)
	var body testResult
	json.Unmarshal(res.Body.Bytes(), &body)
	if body.OK || body.Error != "PROVIDER_NOT_FOUND" {
		t.Fatalf("body = %v", body)
	}
}

func TestProviderTestKeyNotSet(t *testing.T) {
	backend := &providerBackend{
		su:           true,
		providerBody: `[{"id":"p1","name":"OpenAI","base_url":"https://api.example.com/v1","key_last4":null,"extra_headers":{},"is_active":true}]`,
		modelsBody:   `[{"model_id":"m1","supports_tools":false,"is_default":false,"fallback_position":null}]`,
	}
	s, _ := newProviderTestServer(t, backend)
	req := httptest.NewRequest("POST", "/v1/providers/p1/test", nil)
	req.Header.Set("Authorization", "Bearer good-token")
	res := httptest.NewRecorder()
	s.Handler().ServeHTTP(res, req)
	var body testResult
	json.Unmarshal(res.Body.Bytes(), &body)
	if body.OK || body.Error != "KEY_NOT_SET" {
		t.Fatalf("body = %v", body)
	}
}

func TestProviderTestUnreachable(t *testing.T) {
	backend := &providerBackend{
		su:           true,
		providerBody: `[{"id":"p1","name":"OpenAI","base_url":"http://127.0.0.1:1/v1","vault_secret_id":"v1","key_last4":"abcd","extra_headers":{},"is_active":true}]`,
		modelsBody:   `[{"model_id":"m1","supports_tools":false,"is_default":false,"fallback_position":null}]`,
		keyBody:      `"test-key"`,
	}
	s, _ := newProviderTestServer(t, backend)
	req := httptest.NewRequest("POST", "/v1/providers/p1/test", nil)
	req.Header.Set("Authorization", "Bearer good-token")
	res := httptest.NewRecorder()
	s.Handler().ServeHTTP(res, req)
	var body testResult
	json.Unmarshal(res.Body.Bytes(), &body)
	if body.OK || !strings.HasPrefix(body.Error, "PROVIDER_") || body.Error == "PROVIDER_HTTP_" {
		t.Fatalf("body = %v", body)
	}
}

func TestProviderTestProviderHTTPError(t *testing.T) {
	openai := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	}))
	t.Cleanup(openai.Close)
	backend := &providerBackend{
		su:           true,
		providerBody: `[{"id":"p1","name":"OpenAI","base_url":"` + openai.URL + `","vault_secret_id":"v1","key_last4":"abcd","extra_headers":{},"is_active":true}]`,
		modelsBody:   `[{"model_id":"m1","supports_tools":false,"is_default":false,"fallback_position":null}]`,
		keyBody:      `"wrong-key"`,
	}
	s, _ := newProviderTestServer(t, backend)
	req := httptest.NewRequest("POST", "/v1/providers/p1/test", nil)
	req.Header.Set("Authorization", "Bearer good-token")
	res := httptest.NewRecorder()
	s.Handler().ServeHTTP(res, req)
	var body testResult
	json.Unmarshal(res.Body.Bytes(), &body)
	if body.OK || body.Error != "PROVIDER_HTTP_401" {
		t.Fatalf("body = %v", body)
	}
}

func TestProviderTestForbiddenForNonSuperAdmin(t *testing.T) {
	backend := &providerBackend{su: false}
	s, _ := newProviderTestServer(t, backend)
	req := httptest.NewRequest("POST", "/v1/providers/p1/test", nil)
	req.Header.Set("Authorization", "Bearer good-token")
	res := httptest.NewRecorder()
	s.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusForbidden {
		t.Fatalf("status = %d", res.Code)
	}
}

func TestProviderTestRateLimited(t *testing.T) {
	backend := &providerBackend{su: true, providerStatus: 200, providerBody: `[]`}
	s, _ := newProviderTestServer(t, backend)
	for i := 0; i < 3; i++ {
		req := httptest.NewRequest("POST", "/v1/providers/p1/test", nil)
		req.Header.Set("Authorization", "Bearer good-token")
		res := httptest.NewRecorder()
		s.Handler().ServeHTTP(res, req)
	}
	req := httptest.NewRequest("POST", "/v1/providers/p1/test", nil)
	req.Header.Set("Authorization", "Bearer good-token")
	res := httptest.NewRecorder()
	s.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429, got %d", res.Code)
	}
	if res.Header().Get("Retry-After") == "" {
		t.Fatal("Retry-After missing")
	}
	_ = time.Second
}
