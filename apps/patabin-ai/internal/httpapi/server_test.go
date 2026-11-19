package httpapi

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/Seizmann/patabin/apps/patabin-ai/internal/auth"
	"github.com/Seizmann/patabin/apps/patabin-ai/internal/config"
)

func testConfig(supaURL string) config.Config {
	return config.Config{
		Port:            "8787",
		SupabaseURL:     supaURL,
		SupabaseAnonKey: "anon-key",
		AllowedOrigins:  []string{"http://localhost:5173"},
		PreAuthRPM:      1.2,
		PreAuthBurst:    4,
		AuthFailRPM:     2,
		AuthFailBlock:   time.Minute,
		AuthCacheTTL:    time.Second,
	}
}

type stubAuthenticator struct {
	su              bool
	superAdminCalls int
}

func (s *stubAuthenticator) Verify(ctx context.Context, token string) (auth.Claims, error) {
	if token == "bad-token" {
		return auth.Claims{}, auth.ErrUnauthorized
	}
	return auth.Claims{Sub: "user-1", Aud: "authenticated", Iss: "iss"}, nil
}

func (s *stubAuthenticator) SuperAdmin(ctx context.Context, token string) (bool, error) {
	s.superAdminCalls++
	return s.su, nil
}

func newFakeSupa(t *testing.T, su bool) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("POST /rest/v1/rpc/is_su_admin", func(w http.ResponseWriter, r *http.Request) {
		if su {
			_, _ = w.Write([]byte("true"))
			return
		}
		_, _ = w.Write([]byte("false"))
	})
	mux.HandleFunc("POST /rest/v1/rpc/password_gate", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("true"))
	})
	mux.HandleFunc("GET /rest/v1/profiles", func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode([]map[string]string{{"role": "su_admin", "display_name": "Sijan"}})
	})
	ts := httptest.NewServer(mux)
	t.Cleanup(ts.Close)
	return ts
}

func newTestServer(t *testing.T, su bool) *server {
	t.Helper()
	ts := newFakeSupa(t, su)
	cfg := testConfig(ts.URL)
	s := New(cfg, slog.New(slog.NewTextHandler(os.Stderr, nil)))
	s.authenticator = &stubAuthenticator{su: su}
	return s
}

func TestHealthz(t *testing.T) {
	s := newTestServer(t, true)
	req := httptest.NewRequest("GET", "/healthz", nil)
	res := httptest.NewRecorder()
	s.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("status = %d", res.Code)
	}
}

func TestCorsAllowedOrigin(t *testing.T) {
	s := newTestServer(t, true)
	req := httptest.NewRequest("GET", "/healthz", nil)
	req.Header.Set("Origin", "http://localhost:5173")
	res := httptest.NewRecorder()
	s.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("status = %d", res.Code)
	}
	if res.Header().Get("Access-Control-Allow-Origin") != "http://localhost:5173" {
		t.Fatal("allow-origin header missing")
	}
	if res.Header().Get("Vary") != "Origin" {
		t.Fatal("vary header missing")
	}
}

func TestCorsDisallowedOrigin(t *testing.T) {
	s := newTestServer(t, true)
	req := httptest.NewRequest("GET", "/healthz", nil)
	req.Header.Set("Origin", "https://evil.example")
	res := httptest.NewRecorder()
	s.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusForbidden {
		t.Fatalf("status = %d", res.Code)
	}
}

func TestCorsPreflight(t *testing.T) {
	s := newTestServer(t, true)
	req := httptest.NewRequest("OPTIONS", "/v1/me", nil)
	req.Header.Set("Origin", "http://localhost:5173")
	req.Header.Set("Access-Control-Request-Method", "POST")
	res := httptest.NewRecorder()
	s.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusNoContent {
		t.Fatalf("status = %d", res.Code)
	}
	if res.Header().Get("Access-Control-Allow-Methods") != "GET, POST, OPTIONS" {
		t.Fatal("methods header missing")
	}
	if res.Header().Get("Access-Control-Allow-Headers") != "Authorization, Content-Type" {
		t.Fatal("headers header missing")
	}
}

func TestPreAuthRateLimit(t *testing.T) {
	s := newTestServer(t, true)
	handler := s.Handler()
	for i := 0; i < 4; i++ {
		req := httptest.NewRequest("GET", "/healthz", nil)
		res := httptest.NewRecorder()
		handler.ServeHTTP(res, req)
		if res.Code != http.StatusOK {
			t.Fatalf("burst request %d should pass, got %d", i, res.Code)
		}
	}
	req := httptest.NewRequest("GET", "/healthz", nil)
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	if res.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429, got %d", res.Code)
	}
	if res.Header().Get("Retry-After") == "" {
		t.Fatal("Retry-After missing")
	}
}

func TestCFConnectingIPSeparateBuckets(t *testing.T) {
	s := newTestServer(t, true)
	handler := s.Handler()
	for i := 0; i < 4; i++ {
		req := httptest.NewRequest("GET", "/healthz", nil)
		req.RemoteAddr = "127.0.0.1:1234"
		req.Header.Set("CF-Connecting-IP", "10.0.0.1")
		res := httptest.NewRecorder()
		handler.ServeHTTP(res, req)
		if res.Code != http.StatusOK {
			t.Fatalf("request %d blocked: %d", i, res.Code)
		}
	}
	req := httptest.NewRequest("GET", "/healthz", nil)
	req.RemoteAddr = "127.0.0.1:1234"
	req.Header.Set("CF-Connecting-IP", "10.0.0.2")
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("distinct CF ip should have its own bucket: %d", res.Code)
	}
	req = httptest.NewRequest("GET", "/healthz", nil)
	req.RemoteAddr = "127.0.0.1:1234"
	req.Header.Set("CF-Connecting-IP", "10.0.0.1")
	res = httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	if res.Code != http.StatusTooManyRequests {
		t.Fatalf("same CF ip should be limited: %d", res.Code)
	}
}

func TestAuthFailureBlocking(t *testing.T) {
	s := newTestServer(t, true)
	handler := s.Handler()
	for i := 0; i < 2; i++ {
		req := httptest.NewRequest("GET", "/v1/me", nil)
		req.Header.Set("Authorization", "Bearer bad-token")
		res := httptest.NewRecorder()
		handler.ServeHTTP(res, req)
		if res.Code != http.StatusUnauthorized {
			t.Fatalf("failure %d expected 401, got %d", i, res.Code)
		}
	}
	req := httptest.NewRequest("GET", "/v1/me", nil)
	req.Header.Set("Authorization", "Bearer bad-token")
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	if res.Code != http.StatusUnauthorized {
		t.Fatalf("limit-reaching failure expected 401, got %d", res.Code)
	}
	req = httptest.NewRequest("GET", "/v1/me", nil)
	req.Header.Set("Authorization", "Bearer good-token")
	res = httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	if res.Code != http.StatusTooManyRequests {
		t.Fatalf("expected block after repeated auth failures, got %d", res.Code)
	}
}

func TestMeUnauthorized(t *testing.T) {
	s := newTestServer(t, true)
	req := httptest.NewRequest("GET", "/v1/me", nil)
	res := httptest.NewRecorder()
	s.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d", res.Code)
	}
}

func TestMeForbiddenForNonSuperAdmin(t *testing.T) {
	s := newTestServer(t, false)
	req := httptest.NewRequest("GET", "/v1/me", nil)
	req.Header.Set("Authorization", "Bearer good-token")
	res := httptest.NewRecorder()
	s.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusForbidden {
		t.Fatalf("status = %d", res.Code)
	}
}

func TestMeSuccessForSuperAdmin(t *testing.T) {
	s := newTestServer(t, true)
	req := httptest.NewRequest("GET", "/v1/me", nil)
	req.Header.Set("Authorization", "Bearer good-token")
	res := httptest.NewRecorder()
	s.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("status = %d body = %s", res.Code, res.Body.String())
	}
	var body map[string]string
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["role"] != "su_admin" || body["display_name"] != "Sijan" {
		t.Fatalf("body = %v", body)
	}
}
