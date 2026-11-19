package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"

	"github.com/Seizmann/patabin/apps/patabin-ai/internal/agent"
	"github.com/Seizmann/patabin/apps/patabin-ai/internal/sse"
)

type tokenKeyType struct{}

var tokenKey tokenKeyType

type semaphoreMap struct {
	mu     sync.Mutex
	counts map[string]int
}

func newSemaphoreMap() *semaphoreMap {
	return &semaphoreMap{counts: map[string]int{}}
}

func (m *semaphoreMap) acquire(key string, max int) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.counts[key] >= max {
		return false
	}
	m.counts[key]++
	return true
}

func (m *semaphoreMap) release(key string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.counts[key] > 0 {
		m.counts[key]--
	}
}

type chatRequest struct {
	ConversationID string `json:"conversation_id"`
	Message        string `json:"message"`
	ModelID        string `json:"model_id"`
	AnswerTo       string `json:"answer_to"`
}

func (s *server) handleChat(w http.ResponseWriter, r *http.Request) {
	uid := userIDFrom(r.Context())
	semKey := "user:" + uid
	if !s.chatSem.acquire(semKey, s.cfg.ChatConcurrent) {
		writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "rate_limited"})
		return
	}
	defer s.chatSem.release(semKey)

	if ok, retry := s.chatRate.allow(semKey, float64(s.cfg.ChatRPM), s.cfg.ChatBurst); !ok {
		w.Header().Set("Retry-After", retryAfter(retry))
		writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "rate_limited"})
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 64<<10)
	var req chatRequest
	if err := decodeJSON(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad_request"})
		return
	}
	msg := []rune(req.Message)
	if len(msg) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "empty_message"})
		return
	}
	if len(msg) > 8000 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "message_too_long"})
		return
	}

	token := bearerToken(r)
	sw, err := sse.New(w)
	if err != nil {
		return
	}
	sw.StartHeartbeat(r.Context(), s.cfg.Heartbeat)

	ctx, cancel := context.WithTimeout(r.Context(), s.cfg.RequestTimeout)
	defer cancel()
	ctx = context.WithValue(ctx, tokenKey, token)

	loop := &agent.Loop{
		Supa:      s.supaClient,
		LLM:       s.llmClient,
		Keys:      s.keyCache,
		History:   s.history,
		Limits:    agent.Limits{MaxRounds: s.cfg.MaxRounds, MaxProposals: s.cfg.MaxProposals, MaxToolChars: 20 * 1024},
		MaxTokens: 4096,
	}
	input := agent.ChatInput{ConversationID: req.ConversationID, UserMessage: req.Message, ModelID: req.ModelID, AnswerTo: req.AnswerTo}

	runErr := loop.Run(ctx, token, uid, input, func(event string, payload any) error {
		return sw.Event(event, payload)
	})
	if runErr != nil && ctx.Err() == nil {
		s.log.Error("chat loop failed", "request_id", requestIDFrom(r.Context()), "user_id", uid, "error", runErr.Error())
		_ = sw.Event("error", map[string]any{"code": "INTERNAL", "message_bn": "সমস্যা হয়েছে; আবার চেষ্টা করুন।", "retryable": true})
	}
	_ = sw.Event("done", map[string]any{})
}

func decodeJSON(r *http.Request, out any) error {
	if err := json.NewDecoder(r.Body).Decode(out); err != nil {
		return fmt.Errorf("decode: %w", err)
	}
	return nil
}
