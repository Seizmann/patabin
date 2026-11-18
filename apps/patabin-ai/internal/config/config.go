package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Port            string
	AppEnv          string
	LogLevel        string
	SupabaseURL     string
	SupabaseAnonKey string
	AllowedOrigins  []string

	PreAuthRPM          float64
	PreAuthBurst        int
	AuthFailRPM         int
	AuthFailBlock       time.Duration
	ChatRPM             int
	ChatBurst           int
	ChatConcurrent      int
	ActionRPM           int
	ProviderTestRPM     int
	ModelCallsPerHour   int
	MaxRounds           int
	MaxProposals        int
	RequestTimeout      time.Duration
	LLMTimeout          time.Duration
	AuthCacheTTL        time.Duration
	ProviderKeyCacheTTL time.Duration
	Heartbeat           time.Duration
}

func Load() (Config, error) {
	c := Config{}
	var err error

	if c.Port, err = envString("PORT", "8787"); err != nil {
		return c, err
	}
	if _, err = strconv.Atoi(c.Port); err != nil {
		return c, fmt.Errorf("PORT must be a number")
	}
	if c.AppEnv, err = envString("APP_ENV", "development"); err != nil {
		return c, err
	}
	if c.LogLevel, err = envString("LOG_LEVEL", "info"); err != nil {
		return c, err
	}
	if c.SupabaseURL, err = requireString("SUPABASE_URL"); err != nil {
		return c, err
	}
	c.SupabaseURL = strings.TrimRight(c.SupabaseURL, "/")
	if !strings.HasPrefix(c.SupabaseURL, "https://") && c.AppEnv == "production" {
		return c, fmt.Errorf("SUPABASE_URL must be https in production")
	}
	if c.SupabaseAnonKey, err = requireString("SUPABASE_ANON_KEY"); err != nil {
		return c, err
	}
	origins, err := requireString("ALLOWED_ORIGINS")
	if err != nil {
		return c, err
	}
	for _, o := range strings.Split(origins, ",") {
		o = strings.TrimSpace(strings.TrimRight(o, "/"))
		if o != "" {
			c.AllowedOrigins = append(c.AllowedOrigins, o)
		}
	}
	if len(c.AllowedOrigins) == 0 {
		return c, fmt.Errorf("ALLOWED_ORIGINS must list at least one origin")
	}

	if c.PreAuthRPM, err = envFloat("RL_PRE_AUTH_RPM", 30); err != nil {
		return c, err
	}
	if c.PreAuthBurst, err = envInt("RL_PRE_AUTH_BURST", 10); err != nil {
		return c, err
	}
	if c.AuthFailRPM, err = envInt("RL_AUTH_FAIL_RPM", 10); err != nil {
		return c, err
	}
	authFailBlock, err := envInt("RL_AUTH_FAIL_BLOCK_SECONDS", 300)
	if err != nil {
		return c, err
	}
	c.AuthFailBlock = time.Duration(authFailBlock) * time.Second
	if c.ChatRPM, err = envInt("RL_CHAT_RPM", 20); err != nil {
		return c, err
	}
	if c.ChatBurst, err = envInt("RL_CHAT_BURST", 5); err != nil {
		return c, err
	}
	if c.ChatConcurrent, err = envInt("RL_CHAT_CONCURRENT", 2); err != nil {
		return c, err
	}
	if c.ActionRPM, err = envInt("RL_ACTION_RPM", 60); err != nil {
		return c, err
	}
	if c.ProviderTestRPM, err = envInt("RL_PROVIDER_TEST_RPM", 5); err != nil {
		return c, err
	}
	if c.ModelCallsPerHour, err = envInt("RL_MODEL_CALLS_PER_HOUR", 300); err != nil {
		return c, err
	}
	if c.MaxRounds, err = envInt("MAX_ROUNDS", 30); err != nil {
		return c, err
	}
	if c.MaxProposals, err = envInt("MAX_PROPOSALS", 5); err != nil {
		return c, err
	}
	reqTimeout, err := envInt("REQUEST_TIMEOUT_SECONDS", 300)
	if err != nil {
		return c, err
	}
	c.RequestTimeout = time.Duration(reqTimeout) * time.Second
	llmTimeout, err := envInt("LLM_TIMEOUT_SECONDS", 120)
	if err != nil {
		return c, err
	}
	c.LLMTimeout = time.Duration(llmTimeout) * time.Second
	authCache, err := envInt("AUTH_CACHE_SECONDS", 60)
	if err != nil {
		return c, err
	}
	c.AuthCacheTTL = time.Duration(authCache) * time.Second
	keyCache, err := envInt("PROVIDER_KEY_CACHE_SECONDS", 300)
	if err != nil {
		return c, err
	}
	c.ProviderKeyCacheTTL = time.Duration(keyCache) * time.Second
	heartbeat, err := envInt("HEARTBEAT_SECONDS", 15)
	if err != nil {
		return c, err
	}
	c.Heartbeat = time.Duration(heartbeat) * time.Second

	return c, nil
}

func envString(key, def string) (string, error) {
	v := os.Getenv(key)
	if v == "" {
		return def, nil
	}
	return v, nil
}

func requireString(key string) (string, error) {
	v := os.Getenv(key)
	if v == "" {
		return "", fmt.Errorf("%s is required", key)
	}
	return v, nil
}

func envInt(key string, def int) (int, error) {
	v := os.Getenv(key)
	if v == "" {
		return def, nil
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return 0, fmt.Errorf("%s must be a number", key)
	}
	return n, nil
}

func envFloat(key string, def float64) (float64, error) {
	v := os.Getenv(key)
	if v == "" {
		return def, nil
	}
	f, err := strconv.ParseFloat(v, 64)
	if err != nil {
		return 0, fmt.Errorf("%s must be a number", key)
	}
	return f, nil
}
