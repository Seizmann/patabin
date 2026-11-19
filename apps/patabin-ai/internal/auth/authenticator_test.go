package auth

import (
	"context"
	"crypto"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Seizmann/patabin/apps/patabin-ai/internal/supa"
)

func b64(b []byte) string { return base64.RawURLEncoding.EncodeToString(b) }

func intBytes(i int) []byte {
	return []byte{byte(i >> 24), byte(i >> 16), byte(i >> 8), byte(i)}
}

func jwkFrom(key *rsa.PublicKey, kid string) jwk {
	return jwk{Kid: kid, Kty: "RSA", N: b64(key.N.Bytes()), E: b64(intBytes(key.E))}
}

type jwksState struct {
	mu   sync.Mutex
	keys []jwk
}

func (s *jwksState) set(keys ...jwk) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.keys = keys
}

func (s *jwksState) snapshot() []jwk {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]jwk(nil), s.keys...)
}

type fakeAuthServer struct {
	jwks      jwksState
	userOK    atomic.Bool
	userCalls atomic.Int64
}

func (f *fakeAuthServer) handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /auth/v1/.well-known/jwks.json", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(jwksDoc{Keys: f.jwks.snapshot()})
	})
	mux.HandleFunc("GET /auth/v1/user", func(w http.ResponseWriter, r *http.Request) {
		f.userCalls.Add(1)
		if !f.userOK.Load() {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		_, _ = w.Write([]byte(`{"id":"user-1","aud":"authenticated"}`))
	})
	return mux
}

type fakeSupa struct {
	suCalls   atomic.Int64
	gateCalls atomic.Int64
	su        bool
	gate      bool
}

func (f *fakeSupa) handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /rest/v1/rpc/is_su_admin", func(w http.ResponseWriter, r *http.Request) {
		f.suCalls.Add(1)
		_, _ = w.Write([]byte(boolJSON(f.su)))
	})
	mux.HandleFunc("POST /rest/v1/rpc/password_gate", func(w http.ResponseWriter, r *http.Request) {
		f.gateCalls.Add(1)
		_, _ = w.Write([]byte(boolJSON(f.gate)))
	})
	return mux
}

func boolJSON(b bool) string {
	if b {
		return "true"
	}
	return "false"
}

type testEnv struct {
	authn   *Authenticator
	supa    *fakeSupa
	authSrv *fakeAuthServer
	key     *rsa.PrivateKey
	baseURL string
}

func newTestEnv(t *testing.T, su, gate bool) *testEnv {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	authSrv := &fakeAuthServer{}
	authSrv.jwks.set(jwkFrom(&key.PublicKey, "k1"))
	supaFake := &fakeSupa{su: su, gate: gate}
	authMux := http.NewServeMux()
	authMux.Handle("/", authSrv.handler())
	supaMux := http.NewServeMux()
	supaMux.Handle("/", supaFake.handler())
	authTS := httptest.NewServer(authMux)
	t.Cleanup(authTS.Close)
	supaTS := httptest.NewServer(supaMux)
	t.Cleanup(supaTS.Close)
	client := supa.New(supaTS.URL, "anon-key")
	authn := New(authTS.URL, "anon-key", time.Second, client, nil)
	return &testEnv{authn: authn, supa: supaFake, authSrv: authSrv, key: key, baseURL: authTS.URL}
}

func mintRS256(t *testing.T, key *rsa.PrivateKey, kid, sub, aud, iss string, exp int64) string {
	t.Helper()
	header, _ := json.Marshal(map[string]any{"alg": "RS256", "kid": kid, "typ": "JWT"})
	payload, _ := json.Marshal(map[string]any{"sub": sub, "aud": aud, "iss": iss, "exp": exp})
	signing := b64(header) + "." + b64(payload)
	digest := sha256.Sum256([]byte(signing))
	sig, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, digest[:])
	if err != nil {
		t.Fatal(err)
	}
	return signing + "." + b64(sig)
}

func mintHS256(sub, aud, iss string, exp int64) string {
	header, _ := json.Marshal(map[string]any{"alg": "HS256", "typ": "JWT"})
	payload, _ := json.Marshal(map[string]any{"sub": sub, "aud": aud, "iss": iss, "exp": exp})
	return b64(header) + "." + b64(payload) + "." + b64([]byte("junk"))
}

func TestVerifyValidRS256(t *testing.T) {
	env := newTestEnv(t, true, true)
	future := time.Now().Add(time.Hour).Unix()
	token := mintRS256(t, env.key, "k1", "user-1", "authenticated", env.baseURL+"/auth/v1", future)
	claims, err := env.authn.Verify(context.Background(), token)
	if err != nil {
		t.Fatalf("expected valid: %v", err)
	}
	if claims.Sub != "user-1" {
		t.Fatalf("sub = %q", claims.Sub)
	}
}

func TestVerifyExpired(t *testing.T) {
	env := newTestEnv(t, true, true)
	past := time.Now().Add(-time.Hour).Unix()
	token := mintRS256(t, env.key, "k1", "user-1", "authenticated", env.baseURL+"/auth/v1", past)
	if _, err := env.authn.Verify(context.Background(), token); err == nil {
		t.Fatal("expected expired failure")
	}
}

func TestVerifyWrongAudienceAndIssuer(t *testing.T) {
	env := newTestEnv(t, true, true)
	future := time.Now().Add(time.Hour).Unix()
	token := mintRS256(t, env.key, "k1", "user-1", "other", env.baseURL+"/auth/v1", future)
	if _, err := env.authn.Verify(context.Background(), token); err == nil {
		t.Fatal("expected audience failure")
	}
	token = mintRS256(t, env.key, "k1", "user-1", "authenticated", "https://evil.example/auth/v1", future)
	if _, err := env.authn.Verify(context.Background(), token); err == nil {
		t.Fatal("expected issuer failure")
	}
}

func TestVerifyUnknownKidRefreshesJWKS(t *testing.T) {
	env := newTestEnv(t, true, true)
	other, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	future := time.Now().Add(time.Hour).Unix()
	token := mintRS256(t, other, "k2", "user-1", "authenticated", env.baseURL+"/auth/v1", future)
	if _, err := env.authn.Verify(context.Background(), token); err == nil {
		t.Fatal("expected unknown kid failure before rotation")
	}
	env.authSrv.jwks.set(jwkFrom(&other.PublicKey, "k2"))
	if _, err := env.authn.Verify(context.Background(), token); err != nil {
		t.Fatalf("expected success after jwks refresh: %v", err)
	}
}

func TestVerifyHS256Fallback(t *testing.T) {
	env := newTestEnv(t, true, true)
	future := time.Now().Add(time.Hour).Unix()
	token := mintHS256("user-1", "authenticated", env.baseURL+"/auth/v1", future)
	env.authSrv.userOK.Store(true)
	if _, err := env.authn.Verify(context.Background(), token); err != nil {
		t.Fatalf("expected HS256 fallback success: %v", err)
	}
	env.authSrv.userOK.Store(false)
	env2 := newTestEnv(t, true, true)
	if _, err := env2.authn.Verify(context.Background(), token); err == nil {
		t.Fatal("expected HS256 fallback failure when user endpoint rejects")
	}
}

func mintES256(t *testing.T, key *ecdsa.PrivateKey, kid, sub, aud, iss string, exp int64) string {
	t.Helper()
	header, _ := json.Marshal(map[string]any{"alg": "ES256", "kid": kid, "typ": "JWT"})
	payload, _ := json.Marshal(map[string]any{"sub": sub, "aud": aud, "iss": iss, "exp": exp})
	signing := b64(header) + "." + b64(payload)
	digest := sha256.Sum256([]byte(signing))
	r, s, err := ecdsa.Sign(rand.Reader, key, digest[:])
	if err != nil {
		t.Fatal(err)
	}
	sig := make([]byte, 64)
	r.FillBytes(sig[:32])
	s.FillBytes(sig[32:])
	return signing + "." + b64(sig)
}

func TestVerifyValidES256(t *testing.T) {
	env := newTestEnv(t, true, true)
	ecKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	env.authSrv.jwks.set(jwk{Kid: "ec1", Kty: "EC", Crv: "P-256", X: b64(ecKey.X.Bytes()), Y: b64(ecKey.Y.Bytes())})
	future := time.Now().Add(time.Hour).Unix()
	token := mintES256(t, ecKey, "ec1", "user-1", "authenticated", env.baseURL+"/auth/v1", future)
	claims, err := env.authn.Verify(context.Background(), token)
	if err != nil {
		t.Fatalf("expected valid ES256: %v", err)
	}
	if claims.Sub != "user-1" {
		t.Fatalf("sub = %q", claims.Sub)
	}
	badSig := []byte(token)
	badSig[len(badSig)-1] ^= 0xff
	if _, err := env.authn.Verify(context.Background(), string(badSig)); err == nil {
		t.Fatal("expected tampered ES256 failure")
	}
}

func TestVerifyMalformedToken(t *testing.T) {
	env := newTestEnv(t, true, true)
	for _, token := range []string{"", "abc", "a.b"} {
		if _, err := env.authn.Verify(context.Background(), token); err == nil {
			t.Fatalf("expected failure for %q", token)
		}
	}
}

func TestSuperAdminChecksAndCache(t *testing.T) {
	env := newTestEnv(t, true, true)
	future := time.Now().Add(time.Hour).Unix()
	token := mintRS256(t, env.key, "k1", "user-1", "authenticated", env.baseURL+"/auth/v1", future)
	ctx := context.Background()
	ok, err := env.authn.SuperAdmin(ctx, token)
	if err != nil || !ok {
		t.Fatalf("expected super admin: ok=%v err=%v", ok, err)
	}
	ok, err = env.authn.SuperAdmin(ctx, token)
	if err != nil || !ok {
		t.Fatalf("expected cached super admin: ok=%v err=%v", ok, err)
	}
	if env.supa.suCalls.Load() != 1 || env.supa.gateCalls.Load() != 1 {
		t.Fatalf("expected one upstream check pair, got su=%d gate=%d", env.supa.suCalls.Load(), env.supa.gateCalls.Load())
	}
}

func TestSuperAdminRejected(t *testing.T) {
	env := newTestEnv(t, false, true)
	future := time.Now().Add(time.Hour).Unix()
	token := mintRS256(t, env.key, "k1", "user-1", "authenticated", env.baseURL+"/auth/v1", future)
	ok, err := env.authn.SuperAdmin(context.Background(), token)
	if err != nil || ok {
		t.Fatalf("expected non-super rejection: ok=%v err=%v", ok, err)
	}
	if env.supa.gateCalls.Load() != 0 {
		t.Fatal("password_gate must not run when is_su_admin is false")
	}
}

func TestSuperAdminGateRejected(t *testing.T) {
	env := newTestEnv(t, true, false)
	future := time.Now().Add(time.Hour).Unix()
	token := mintRS256(t, env.key, "k1", "user-1", "authenticated", env.baseURL+"/auth/v1", future)
	ok, err := env.authn.SuperAdmin(context.Background(), token)
	if err != nil || ok {
		t.Fatalf("expected gate rejection: ok=%v err=%v", ok, err)
	}
}
