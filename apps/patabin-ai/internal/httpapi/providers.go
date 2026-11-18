package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

type testProvider struct {
	ID            string            `json:"id"`
	Name          string            `json:"name"`
	BaseURL       string            `json:"base_url"`
	VaultSecretID *string           `json:"vault_secret_id"`
	KeyLast4      *string           `json:"key_last4"`
	ExtraHeaders  map[string]string `json:"extra_headers"`
	IsActive      bool              `json:"is_active"`
}

type testModel struct {
	ModelID          string `json:"model_id"`
	SupportsTools    bool   `json:"supports_tools"`
	IsDefault        bool   `json:"is_default"`
	FallbackPosition *int   `json:"fallback_position"`
}

type testResult struct {
	OK        bool   `json:"ok"`
	Model     string `json:"model,omitempty"`
	LatencyMS int64  `json:"latency_ms,omitempty"`
	Error     string `json:"error,omitempty"`
}

func (s *server) handleProviderTest(w http.ResponseWriter, r *http.Request) {
	uid := userIDFrom(r.Context())
	if ok, retry := s.providerTest.allow("user:"+uid, float64(s.cfg.ProviderTestRPM), s.cfg.ProviderTestRPM); !ok {
		w.Header().Set("Retry-After", retryAfter(retry))
		writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "rate_limited"})
		return
	}
	providerID := r.PathValue("id")
	token := bearerToken(r)

	provider, status, err := s.fetchProvider(r.Context(), providerID, token)
	if err != nil {
		writeJSON(w, status, testResult{OK: false, Error: err.Error()})
		return
	}
	model, status, err := s.fetchTestModel(r.Context(), providerID, token)
	if err != nil {
		writeJSON(w, status, testResult{OK: false, Error: err.Error()})
		return
	}
	if provider.KeyLast4 == nil || provider.VaultSecretID == nil {
		writeJSON(w, http.StatusBadRequest, testResult{OK: false, Error: "KEY_NOT_SET"})
		return
	}
	key, err := s.supaClient.RPCString(r.Context(), "agent_get_provider_key", token,
		map[string]string{"p_provider_id": providerID})
	if err != nil {
		s.log.Error("provider key fetch failed", "request_id", requestIDFrom(r.Context()), "user_id", uid)
		writeJSON(w, http.StatusBadGateway, testResult{OK: false, Error: "KEY_FETCH_FAILED"})
		return
	}

	start := time.Now()
	err = s.probeProvider(r.Context(), provider, model, key)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		s.log.Info("provider test failed", "request_id", requestIDFrom(r.Context()), "user_id", uid, "provider_id", providerID, "error_code", err.Error())
		writeJSON(w, http.StatusOK, testResult{OK: false, Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, testResult{OK: true, Model: model.ModelID, LatencyMS: latency})
}

func (s *server) fetchProvider(ctx context.Context, id, token string) (*testProvider, int, error) {
	data, err := s.supaClient.Get(ctx, "/rest/v1/agent_providers?id=eq."+id+"&select=id,name,base_url,vault_secret_id,key_last4,extra_headers,is_active", token)
	if err != nil {
		return nil, http.StatusBadGateway, fmt.Errorf("UPSTREAM")
	}
	var providers []testProvider
	if err := json.Unmarshal(data, &providers); err != nil || len(providers) == 0 {
		return nil, http.StatusNotFound, fmt.Errorf("PROVIDER_NOT_FOUND")
	}
	return &providers[0], http.StatusOK, nil
}

func (s *server) fetchTestModel(ctx context.Context, providerID, token string) (*testModel, int, error) {
	data, err := s.supaClient.Get(ctx, "/rest/v1/agent_models?provider_id=eq."+providerID+"&is_active=eq.true&select=model_id,supports_tools,is_default,fallback_position", token)
	if err != nil {
		return nil, http.StatusBadGateway, fmt.Errorf("UPSTREAM")
	}
	var models []testModel
	if err := json.Unmarshal(data, &models); err != nil {
		return nil, http.StatusBadGateway, fmt.Errorf("UPSTREAM")
	}
	var chosen *testModel
	for i := range models {
		if models[i].IsDefault {
			chosen = &models[i]
			break
		}
	}
	if chosen == nil && len(models) > 0 {
		chosen = &models[0]
	}
	if chosen == nil {
		return nil, http.StatusBadRequest, fmt.Errorf("NO_MODEL")
	}
	return chosen, http.StatusOK, nil
}

func (s *server) probeProvider(ctx context.Context, p *testProvider, m *testModel, key string) error {
	payload := map[string]any{
		"model":      m.ModelID,
		"max_tokens": 5,
		"stream":     false,
		"messages":   []map[string]string{{"role": "user", "content": "ping"}},
	}
	if m.SupportsTools {
		payload["tools"] = []map[string]any{{
			"type": "function",
			"function": map[string]any{
				"name":        "ping_probe",
				"description": "connectivity probe",
				"parameters":  map[string]any{"type": "object", "properties": map[string]any{}},
			},
		}}
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("PROBE_BUILD_FAILED")
	}
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.BaseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("PROBE_BUILD_FAILED")
	}
	req.Header.Set("Authorization", "Bearer "+key)
	req.Header.Set("Content-Type", "application/json")
	for k, v := range p.ExtraHeaders {
		req.Header.Set(k, v)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("PROVIDER_UNREACHABLE")
	}
	defer res.Body.Close()
	io.Copy(io.Discard, io.LimitReader(res.Body, 1<<20))
	if res.StatusCode >= 400 {
		return fmt.Errorf("PROVIDER_HTTP_%d", res.StatusCode)
	}
	return nil
}
