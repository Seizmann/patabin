package httpapi

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/Seizmann/patabin/apps/patabin-ai/internal/agent"
	"github.com/Seizmann/patabin/apps/patabin-ai/internal/auth"
	"github.com/Seizmann/patabin/apps/patabin-ai/internal/config"
	"github.com/Seizmann/patabin/apps/patabin-ai/internal/llm"
	"github.com/Seizmann/patabin/apps/patabin-ai/internal/secrets"
	"github.com/Seizmann/patabin/apps/patabin-ai/internal/supa"
)

type authenticator interface {
	Verify(ctx context.Context, token string) (auth.Claims, error)
	SuperAdmin(ctx context.Context, token string) (bool, error)
}

func New(cfg config.Config, log *slog.Logger) *server {
	client := supa.New(cfg.SupabaseURL, cfg.SupabaseAnonKey)
	keyCache := secrets.NewCache(func(ctx context.Context, providerID string) (string, error) {
		token, _ := ctx.Value(tokenKey).(string)
		return client.RPCString(ctx, "agent_get_provider_key", token, map[string]string{"p_provider_id": providerID})
	}, cfg.ProviderKeyCacheTTL)
	s := &server{
		cfg:           cfg,
		log:           log,
		supaClient:    client,
		authenticator: auth.New(cfg.SupabaseURL, cfg.SupabaseAnonKey, cfg.AuthCacheTTL, client, nil),
		preAuth:       newLimiterMap(),
		authFail:      newLimiterMap(),
		providerTest:  newLimiterMap(),
		chatRate:      newLimiterMap(),
		actionRate:    newLimiterMap(),
		chatSem:       newSemaphoreMap(),
		llmClient:     llm.NewClient(0),
		keyCache:      keyCache,
		history:       &agent.History{Supa: client},
	}
	return s
}

func (s *server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.handleHealthz)
	mux.Handle("GET /v1/me", s.requireAuth(http.HandlerFunc(s.handleMe)))
	mux.Handle("POST /v1/providers/{id}/test", s.requireAuth(http.HandlerFunc(s.handleProviderTest)))
	mux.Handle("POST /v1/chat", s.requireAuth(http.HandlerFunc(s.handleChat)))
	mux.Handle("POST /v1/actions/{id}/approve", s.requireAuth(http.HandlerFunc(s.handleActionApprove)))
	mux.Handle("POST /v1/actions/{id}/reject", s.requireAuth(http.HandlerFunc(s.handleActionReject)))
	mux.Handle("POST /v1/actions/approve-all", s.requireAuth(http.HandlerFunc(s.handleActionApproveAll)))

	h := s.recoverMiddleware(mux)
	h = s.loggingMiddleware(h)
	h = s.preAuthRateLimitMiddleware(h)
	h = s.corsMiddleware(h)
	h = s.requestIDMiddleware(h)
	return h
}

func (s *server) handleHealthz(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"ok": "true"})
}

func (s *server) handleMe(w http.ResponseWriter, r *http.Request) {
	uid := userIDFrom(r.Context())
	data, err := s.supaClient.Get(r.Context(), "/rest/v1/profiles?select=role,display_name&id=eq."+uid, bearerToken(r))
	if err != nil {
		s.log.Error("profiles fetch failed", "request_id", requestIDFrom(r.Context()))
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "upstream"})
		return
	}
	var profiles []struct {
		Role        string `json:"role"`
		DisplayName string `json:"display_name"`
	}
	if err := json.Unmarshal(data, &profiles); err != nil || len(profiles) == 0 {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	enc := json.NewEncoder(w)
	_ = enc.Encode(map[string]string{
		"role":         profiles[0].Role,
		"display_name": profiles[0].DisplayName,
	})
}
