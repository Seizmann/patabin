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
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/Seizmann/patabin/apps/patabin-ai/internal/supa"
)

var ErrUnauthorized = errors.New("unauthorized")

type Claims struct {
	Sub string
	Aud string
	Iss string
	exp int64
}

type jwk struct {
	Kid string `json:"kid"`
	Kty string `json:"kty"`
	N   string `json:"n"`
	E   string `json:"e"`
	Crv string `json:"crv"`
	X   string `json:"x"`
	Y   string `json:"y"`
}

type jwksDoc struct {
	Keys []jwk `json:"keys"`
}

type publicKey struct {
	rsa *rsa.PublicKey
	ec  *ecdsa.PublicKey
}

func (p publicKey) verify(digest []byte, sig []byte) error {
	switch {
	case p.rsa != nil:
		return rsa.VerifyPKCS1v15(p.rsa, crypto.SHA256, digest, sig)
	case p.ec != nil:
		if len(sig) != 64 {
			return errors.New("bad signature length")
		}
		r := new(big.Int).SetBytes(sig[:32])
		s := new(big.Int).SetBytes(sig[32:])
		if !ecdsa.Verify(p.ec, digest, r, s) {
			return errors.New("signature mismatch")
		}
		return nil
	}
	return errors.New("no key")
}

type jwksCache struct {
	baseURL string
	httpc   *http.Client
	mu      sync.Mutex
	keys    map[string]publicKey
	fetched time.Time
}

func newJWKSCache(baseURL string, httpc *http.Client) *jwksCache {
	return &jwksCache{baseURL: strings.TrimRight(baseURL, "/"), httpc: httpc, keys: map[string]publicKey{}}
}

func (j *jwksCache) fetch(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, j.baseURL+"/auth/v1/.well-known/jwks.json", nil)
	if err != nil {
		return err
	}
	res, err := j.httpc.Do(req)
	if err != nil {
		return fmt.Errorf("jwks fetch failed: %w", err)
	}
	defer func() { _ = res.Body.Close() }()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("jwks fetch returned %d", res.StatusCode)
	}
	var doc jwksDoc
	if err := json.NewDecoder(io.LimitReader(res.Body, 1<<20)).Decode(&doc); err != nil {
		return fmt.Errorf("jwks decode failed: %w", err)
	}
	keys := map[string]publicKey{}
	for _, k := range doc.Keys {
		switch {
		case k.Kty == "RSA" && k.N != "" && k.E != "":
			pub, err := parseRSA(k.N, k.E)
			if err == nil {
				keys[k.Kid] = publicKey{rsa: pub}
			}
		case k.Kty == "EC" && k.Crv == "P-256" && k.X != "" && k.Y != "":
			pub, err := parseEC(k.X, k.Y)
			if err == nil {
				keys[k.Kid] = publicKey{ec: pub}
			}
		}
	}
	j.keys = keys
	j.fetched = time.Now()
	return nil
}

func (j *jwksCache) get(ctx context.Context, kid string) (publicKey, error) {
	j.mu.Lock()
	defer j.mu.Unlock()
	if len(j.keys) == 0 || time.Since(j.fetched) > time.Hour {
		if err := j.fetch(ctx); err != nil {
			return publicKey{}, err
		}
	}
	pub, ok := j.keys[kid]
	if !ok {
		if err := j.fetch(ctx); err != nil {
			return publicKey{}, err
		}
		pub, ok = j.keys[kid]
	}
	if !ok {
		return publicKey{}, fmt.Errorf("%w: unknown kid", ErrUnauthorized)
	}
	return pub, nil
}

func parseEC(xB64, yB64 string) (*ecdsa.PublicKey, error) {
	x, err := base64.RawURLEncoding.DecodeString(xB64)
	if err != nil {
		return nil, err
	}
	y, err := base64.RawURLEncoding.DecodeString(yB64)
	if err != nil {
		return nil, err
	}
	return ecdsa.ParseUncompressedPublicKey(elliptic.P256(), append(append([]byte{4}, x...), y...))
}

func parseRSA(nB64, eB64 string) (*rsa.PublicKey, error) {
	n, err := base64.RawURLEncoding.DecodeString(nB64)
	if err != nil {
		return nil, err
	}
	e, err := base64.RawURLEncoding.DecodeString(eB64)
	if err != nil {
		return nil, err
	}
	if len(e) > 4 {
		return nil, fmt.Errorf("exponent too long")
	}
	eVal := 0
	for _, b := range e {
		eVal = eVal<<8 | int(b)
	}
	return &rsa.PublicKey{N: new(big.Int).SetBytes(n), E: eVal}, nil
}

type cacheEntry struct {
	until time.Time
}

type Authenticator struct {
	jwks     *jwksCache
	supa     *supa.Client
	issuer   string
	audience string
	anonKey  string
	httpc    *http.Client
	cacheTTL time.Duration
	mu       sync.Mutex
	cache    map[string]cacheEntry
}

func New(baseURL, anonKey string, cacheTTL time.Duration, supaClient *supa.Client, httpc *http.Client) *Authenticator {
	if httpc == nil {
		httpc = &http.Client{Timeout: 15 * time.Second}
	}
	return &Authenticator{
		jwks:     newJWKSCache(baseURL, httpc),
		supa:     supaClient,
		issuer:   strings.TrimRight(baseURL, "/") + "/auth/v1",
		audience: "authenticated",
		anonKey:  anonKey,
		httpc:    httpc,
		cacheTTL: cacheTTL,
		cache:    map[string]cacheEntry{},
	}
}

func (a *Authenticator) Verify(ctx context.Context, token string) (Claims, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return Claims{}, fmt.Errorf("%w: malformed token", ErrUnauthorized)
	}
	var header struct {
		Alg string `json:"alg"`
		Kid string `json:"kid"`
	}
	headerJSON, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return Claims{}, fmt.Errorf("%w: bad header", ErrUnauthorized)
	}
	if err := json.Unmarshal(headerJSON, &header); err != nil {
		return Claims{}, fmt.Errorf("%w: bad header", ErrUnauthorized)
	}

	payloadJSON, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return Claims{}, fmt.Errorf("%w: bad payload", ErrUnauthorized)
	}
	var payload struct {
		Sub string `json:"sub"`
		Aud any    `json:"aud"`
		Iss string `json:"iss"`
		Exp int64  `json:"exp"`
	}
	if err := json.Unmarshal(payloadJSON, &payload); err != nil {
		return Claims{}, fmt.Errorf("%w: bad payload", ErrUnauthorized)
	}
	claims := Claims{Sub: payload.Sub, Aud: audString(payload.Aud), Iss: payload.Iss, exp: payload.Exp}

	switch header.Alg {
	case "RS256", "ES256":
		pub, err := a.jwks.get(ctx, header.Kid)
		if err != nil {
			return Claims{}, err
		}
		sig, err := base64.RawURLEncoding.DecodeString(parts[2])
		if err != nil {
			return Claims{}, fmt.Errorf("%w: bad signature", ErrUnauthorized)
		}
		digest := sha256.Sum256([]byte(parts[0] + "." + parts[1]))
		if err := pub.verify(digest[:], sig); err != nil {
			return Claims{}, fmt.Errorf("%w: bad signature", ErrUnauthorized)
		}
	case "HS256":
		if err := a.verifyViaUserEndpoint(ctx, token); err != nil {
			return Claims{}, err
		}
	default:
		return Claims{}, fmt.Errorf("%w: unsupported alg", ErrUnauthorized)
	}

	if claims.Aud != a.audience {
		return Claims{}, fmt.Errorf("%w: wrong audience", ErrUnauthorized)
	}
	if claims.Iss != a.issuer {
		return Claims{}, fmt.Errorf("%w: wrong issuer", ErrUnauthorized)
	}
	if time.Now().Unix() >= claims.exp {
		return Claims{}, fmt.Errorf("%w: token expired", ErrUnauthorized)
	}
	return claims, nil
}

func (a *Authenticator) verifyViaUserEndpoint(ctx context.Context, token string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, a.jwks.baseURL+"/auth/v1/user", nil)
	if err != nil {
		return err
	}
	req.Header.Set("apikey", a.anonKey)
	req.Header.Set("Authorization", "Bearer "+token)
	res, err := a.httpc.Do(req)
	if err != nil {
		return fmt.Errorf("%w: user check failed", ErrUnauthorized)
	}
	defer func() { _ = res.Body.Close() }()
	_, _ = io.Copy(io.Discard, io.LimitReader(res.Body, 1<<20))
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("%w: user check failed", ErrUnauthorized)
	}
	return nil
}

func (a *Authenticator) cached(key string) bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	_, ok := a.cache[key]
	if !ok || time.Now().After(a.cache[key].until) {
		if ok {
			delete(a.cache, key)
		}
		return false
	}
	return true
}

func (a *Authenticator) cacheSet(key string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	now := time.Now()
	for k, v := range a.cache {
		if now.After(v.until) {
			delete(a.cache, k)
		}
	}
	a.cache[key] = cacheEntry{until: now.Add(a.cacheTTL)}
}

func (a *Authenticator) SuperAdmin(ctx context.Context, token string) (bool, error) {
	key := tokenHash(token)
	if a.cached(key) {
		return true, nil
	}
	su, err := a.supa.RPCBool(ctx, "is_su_admin", token)
	if err != nil {
		return false, err
	}
	if !su {
		return false, nil
	}
	gate, err := a.supa.RPCBool(ctx, "password_gate", token)
	if err != nil {
		return false, err
	}
	if !gate {
		return false, nil
	}
	a.cacheSet(key)
	return true, nil
}

func tokenHash(token string) string {
	sum := sha256.Sum256([]byte(token))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

func audString(v any) string {
	switch t := v.(type) {
	case string:
		return t
	case []any:
		if len(t) > 0 {
			if s, ok := t[0].(string); ok {
				return s
			}
		}
	}
	return ""
}

func RandomID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}
	binary.BigEndian.PutUint32(b[0:4], uint32(time.Now().Unix()))
	return base64.RawURLEncoding.EncodeToString(b)
}
