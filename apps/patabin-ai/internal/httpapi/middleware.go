package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"math"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"golang.org/x/time/rate"

	"github.com/Seizmann/patabin/apps/patabin-ai/internal/agent"
	"github.com/Seizmann/patabin/apps/patabin-ai/internal/auth"
	"github.com/Seizmann/patabin/apps/patabin-ai/internal/config"
	"github.com/Seizmann/patabin/apps/patabin-ai/internal/llm"
	"github.com/Seizmann/patabin/apps/patabin-ai/internal/secrets"
	"github.com/Seizmann/patabin/apps/patabin-ai/internal/supa"
)

type ctxKey string

const (
	userIDKey    ctxKey = "user_id"
	requestIDKey ctxKey = "request_id"
)

func userIDFrom(ctx context.Context) string {
	v, _ := ctx.Value(userIDKey).(string)
	return v
}

func requestIDFrom(ctx context.Context) string {
	v, _ := ctx.Value(requestIDKey).(string)
	return v
}

type server struct {
	cfg           config.Config
	log           *slog.Logger
	authenticator authenticator
	supaClient    *supa.Client
	preAuth       *limiterMap
	authFail      *limiterMap
	providerTest  *limiterMap
	chatRate      *limiterMap
	chatSem       *semaphoreMap
	llmClient     *llm.Client
	keyCache      *secrets.Cache
	history       *agent.History
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(code int) {
	w.status = code
	w.ResponseWriter.WriteHeader(code)
}

type limiterEntry struct {
	limiter      *rate.Limiter
	blockedUntil time.Time
}

type limiterMap struct {
	mu      sync.Mutex
	entries map[string]*limiterEntry
}

func newLimiterMap() *limiterMap {
	return &limiterMap{entries: map[string]*limiterEntry{}}
}

func (m *limiterMap) allow(key string, eventsPerMinute float64, burst int) (bool, time.Duration) {
	m.mu.Lock()
	defer m.mu.Unlock()
	e, ok := m.entries[key]
	if !ok {
		e = &limiterEntry{limiter: rate.NewLimiter(rate.Limit(eventsPerMinute/60), burst)}
		m.entries[key] = e
	}
	now := time.Now()
	if now.Before(e.blockedUntil) {
		return false, time.Until(e.blockedUntil)
	}
	if !e.limiter.Allow() {
		reserve := 60 / eventsPerMinute
		return false, time.Duration(reserve * float64(time.Second))
	}
	return true, 0
}

func (m *limiterMap) blocked(key string) (bool, time.Duration) {
	m.mu.Lock()
	defer m.mu.Unlock()
	e, ok := m.entries[key]
	if !ok {
		return false, 0
	}
	if time.Now().Before(e.blockedUntil) {
		return true, time.Until(e.blockedUntil)
	}
	return false, 0
}

func (m *limiterMap) block(key string, blockFor time.Duration) {
	m.mu.Lock()
	defer m.mu.Unlock()
	e, ok := m.entries[key]
	if !ok {
		return
	}
	e.blockedUntil = time.Now().Add(blockFor)
}

func clientIP(r *http.Request) string {
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		if ip := net.ParseIP(host); ip != nil && ip.IsLoopback() {
			if cf := r.Header.Get("CF-Connecting-IP"); cf != "" {
				return "cf:" + cf
			}
		}
		return host
	}
	return r.RemoteAddr
}

func bearerToken(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if !strings.HasPrefix(h, "Bearer ") {
		return ""
	}
	return strings.TrimPrefix(h, "Bearer ")
}

func retryAfter(d time.Duration) string {
	return fmt.Sprintf("%d", int64(math.Ceil(d.Seconds())))
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func (s *server) recoverMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				s.log.Error("panic recovered", "request_id", requestIDFrom(r.Context()), "panic", fmt.Sprint(rec))
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal"})
			}
		}()
		next.ServeHTTP(w, r)
	})
}

func (s *server) requestIDMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := auth.RandomID()
		w.Header().Set("X-Request-Id", id)
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), requestIDKey, id)))
	})
}

func (s *server) corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin == "" {
			next.ServeHTTP(w, r)
			return
		}
		allowed := false
		for _, o := range s.cfg.AllowedOrigins {
			if origin == o {
				allowed = true
				break
			}
		}
		if !allowed {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
			return
		}
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Add("Vary", "Origin")
		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *server) preAuthRateLimitMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodOptions {
			next.ServeHTTP(w, r)
			return
		}
		ok, retry := s.preAuth.allow(clientIP(r), s.cfg.PreAuthRPM, s.cfg.PreAuthBurst)
		if !ok {
			w.Header().Set("Retry-After", retryAfter(retry))
			writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "rate_limited"})
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *server) authFailRecord(r *http.Request) {
	ip := clientIP(r)
	if ok, _ := s.authFail.allow(ip, float64(s.cfg.AuthFailRPM), s.cfg.AuthFailRPM); !ok {
		s.authFail.block(ip, s.cfg.AuthFailBlock)
	}
}

func (s *server) authFailBlocked(r *http.Request) (bool, time.Duration) {
	return s.authFail.blocked(clientIP(r))
}

func (s *server) loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		sw := &statusWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(sw, r)
		s.log.Info("request",
			"request_id", requestIDFrom(r.Context()),
			"user_id", userIDFrom(r.Context()),
			"route", r.URL.Path,
			"status", sw.status,
			"latency_ms", time.Since(start).Milliseconds(),
		)
	})
}
