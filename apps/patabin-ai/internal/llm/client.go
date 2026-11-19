package llm

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type ProviderConfig struct {
	BaseURL      string
	APIKey       string
	ExtraHeaders map[string]string
}

type StreamCallbacks struct {
	OnText     func(delta string)
	OnToolCall func(call ToolCall)
	OnUsage    func(usage json.RawMessage)
}

type Client struct {
	HTTP *http.Client
}

func NewClient(timeout time.Duration) *Client {
	return &Client{HTTP: &http.Client{Timeout: timeout}}
}

type wireMessage struct {
	Role       string         `json:"role"`
	Content    any            `json:"content,omitempty"`
	ToolCalls  []wireToolCall `json:"tool_calls,omitempty"`
	ToolCallID string         `json:"tool_call_id,omitempty"`
	Name       string         `json:"name,omitempty"`
}

type wireToolCall struct {
	ID       string `json:"id"`
	Type     string `json:"type"`
	Function struct {
		Name      string `json:"name"`
		Arguments string `json:"arguments"`
	} `json:"function"`
}

func WireMessages(msgs []Message) []wireMessage {
	out := make([]wireMessage, 0, len(msgs))
	for _, m := range msgs {
		w := wireMessage{Role: m.Role}
		switch m.Role {
		case "tool":
			w.Content = m.Content
			w.ToolCallID = m.ToolCallID
			w.Name = m.ToolName
		default:
			if m.Content != "" {
				w.Content = m.Content
			}
			if len(m.ToolCalls) > 0 {
				for _, tc := range m.ToolCalls {
					var wt wireToolCall
					wt.ID = tc.ID
					wt.Type = "function"
					wt.Function.Name = tc.Name
					wt.Function.Arguments = string(tc.Args)
					w.ToolCalls = append(w.ToolCalls, wt)
				}
			}
			if w.Content == nil && len(m.ToolCalls) == 0 {
				w.Content = ""
			}
		}
		out = append(out, w)
	}
	return out
}

type chatRequest struct {
	Model     string           `json:"model"`
	Messages  []wireMessage    `json:"messages"`
	Tools     []map[string]any `json:"tools,omitempty"`
	MaxTokens int              `json:"max_tokens,omitempty"`
	Stream    bool             `json:"stream"`
}

func (c *Client) StreamChat(ctx context.Context, provider ProviderConfig, model string, messages []Message, tools []ToolDef, maxTokens int, cb StreamCallbacks) (json.RawMessage, error) {
	body, err := json.Marshal(chatRequest{
		Model:     model,
		Messages:  WireMessages(messages),
		Tools:     WireTools(tools),
		MaxTokens: maxTokens,
		Stream:    true,
	})
	if err != nil {
		return nil, fmt.Errorf("llm request build failed: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(provider.BaseURL, "/")+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("llm request build failed: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+provider.APIKey)
	req.Header.Set("Content-Type", "application/json")
	for k, v := range provider.ExtraHeaders {
		req.Header.Set(k, v)
	}
	res, err := c.HTTP.Do(req)
	if err != nil {
		return nil, fmt.Errorf("llm call failed: %w", err)
	}
	defer res.Body.Close()
	if res.StatusCode >= 400 {
		_, _ = io.Copy(io.Discard, io.LimitReader(res.Body, 64<<10))
		return nil, &ProviderError{Status: res.StatusCode}
	}

	toolCalls := map[int]*ToolCall{}
	var usage json.RawMessage
	scanner := bufio.NewScanner(res.Body)
	scanner.Buffer(make([]byte, 64*1024), 512*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, ":") {
			continue
		}
		data, ok := strings.CutPrefix(line, "data:")
		if !ok {
			continue
		}
		data = strings.TrimSpace(data)
		if data == "[DONE]" {
			break
		}
		var chunk streamChunk
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			continue
		}
		if len(chunk.Usage) > 0 {
			usage = chunk.Usage
		}
		if len(chunk.Choices) == 0 {
			continue
		}
		delta := chunk.Choices[0].Delta
		if delta.Content != "" && cb.OnText != nil {
			cb.OnText(delta.Content)
		}
		for _, tc := range delta.ToolCalls {
			existing := toolCalls[tc.Index]
			if existing == nil {
				existing = &ToolCall{ID: tc.ID}
				toolCalls[tc.Index] = existing
			}
			if tc.ID != "" {
				existing.ID = tc.ID
			}
			if tc.Function.Name != "" {
				existing.Name += tc.Function.Name
			}
			if tc.Function.Arguments != "" {
				existing.Args = append(existing.Args, []byte(tc.Function.Arguments)...)
			}
		}
	}
	if err := scanner.Err(); err != nil {
		return usage, fmt.Errorf("llm stream broken: %w", err)
	}
	for i := 0; i < len(toolCalls); i++ {
		tc := toolCalls[i]
		if tc == nil || tc.Name == "" {
			return usage, fmt.Errorf("llm returned malformed tool call")
		}
		if len(tc.Args) == 0 {
			tc.Args = json.RawMessage("{}")
		}
		if cb.OnToolCall != nil {
			cb.OnToolCall(*tc)
		}
	}
	if cb.OnUsage != nil && len(usage) > 0 {
		cb.OnUsage(usage)
	}
	return usage, nil
}

type ProviderError struct {
	Status int
}

func (e *ProviderError) Error() string {
	return fmt.Sprintf("provider http %d", e.Status)
}

type streamChunk struct {
	Usage   json.RawMessage `json:"usage"`
	Choices []struct {
		Delta struct {
			Content   string `json:"content"`
			ToolCalls []struct {
				Index    int    `json:"index"`
				ID       string `json:"id"`
				Function struct {
					Name      string `json:"name"`
					Arguments string `json:"arguments"`
				} `json:"function"`
			} `json:"tool_calls"`
		} `json:"delta"`
	} `json:"choices"`
}
