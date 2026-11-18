package supa

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type Client struct {
	BaseURL string
	AnonKey string
	HTTP    *http.Client
}

func New(baseURL, anonKey string) *Client {
	return &Client{
		BaseURL: strings.TrimRight(baseURL, "/"),
		AnonKey: anonKey,
		HTTP:    &http.Client{Timeout: 15 * time.Second},
	}
}

func (c *Client) Get(ctx context.Context, path, token string) ([]byte, error) {
	return c.do(ctx, http.MethodGet, path, token, nil)
}

func (c *Client) RPCBool(ctx context.Context, name, token string) (bool, error) {
	body, err := c.do(ctx, http.MethodPost, "/rest/v1/rpc/"+name, token, bytes.NewReader([]byte("{}")))
	if err != nil {
		return false, err
	}
	return strings.TrimSpace(string(body)) == "true", nil
}

func (c *Client) do(ctx context.Context, method, path, token string, body io.Reader) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, method, c.BaseURL+path, body)
	if err != nil {
		return nil, fmt.Errorf("postgrest request: %w", err)
	}
	req.Header.Set("apikey", c.AnonKey)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := c.HTTP.Do(req)
	if err != nil {
		return nil, fmt.Errorf("postgrest call failed: %w", err)
	}
	defer res.Body.Close()
	data, err := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if err != nil {
		return nil, fmt.Errorf("postgrest response read failed: %w", err)
	}
	if res.StatusCode >= 400 {
		return nil, fmt.Errorf("postgrest returned %d", res.StatusCode)
	}
	return data, nil
}
