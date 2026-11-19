package httpapi

import (
	"context"
	"net/http"
)

func (s *server) requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if blocked, retry := s.authFailBlocked(r); blocked {
			w.Header().Set("Retry-After", retryAfter(retry))
			writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "rate_limited"})
			return
		}
		token := bearerToken(r)
		if token == "" {
			s.authFailRecord(r)
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
			return
		}
		claims, err := s.authenticator.Verify(r.Context(), token)
		if err != nil {
			s.authFailRecord(r)
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
			return
		}
		ok, err := s.authenticator.SuperAdmin(r.Context(), token)
		if err != nil || !ok {
			s.authFailRecord(r)
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
			return
		}
		ctx := context.WithValue(r.Context(), userIDKey, claims.Sub)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
