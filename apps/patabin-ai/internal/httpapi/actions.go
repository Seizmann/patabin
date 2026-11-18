package httpapi

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"github.com/Seizmann/patabin/apps/patabin-ai/internal/agent"
)

type actionRequest struct {
	PreviewHash string `json:"preview_hash"`
}

type approveAllItem struct {
	ID          string `json:"id"`
	PreviewHash string `json:"preview_hash"`
}

type approveAllRequest struct {
	Actions []approveAllItem `json:"actions"`
}

func (s *server) handleActionApprove(w http.ResponseWriter, r *http.Request) {
	uid := userIDFrom(r.Context())
	if ok, retry := s.actionRate.allow("user:"+uid, float64(s.cfg.ActionRPM), s.cfg.ActionRPM); !ok {
		w.Header().Set("Retry-After", retryAfter(retry))
		writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "rate_limited"})
		return
	}
	actionID := r.PathValue("id")
	if !validActionID(actionID) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad_request"})
		return
	}
	token := bearerToken(r)
	body := actionRequest{}
	if raw, err := io.ReadAll(io.LimitReader(r.Body, 8<<10)); err == nil && len(raw) > 0 {
		if err := json.Unmarshal(raw, &body); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad_request"})
			return
		}
	}
	payload, _ := json.Marshal(map[string]any{
		"p_action_id":             actionID,
		"p_expected_preview_hash": body.PreviewHash,
	})
	data, err := s.supaClient.Post(r.Context(), "/rest/v1/rpc/agent_approve_action", token, payload)
	if err != nil {
		s.log.Error("approve failed", "request_id", requestIDFrom(r.Context()), "user_id", uid)
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "upstream"})
		return
	}
	var out map[string]any
	if err := json.Unmarshal(data, &out); err == nil {
		out["action_id"] = actionID
		s.recordActionEvent(r.Context(), token, out, "approved")
	}
	writeJSON(w, http.StatusOK, json.RawMessage(data))
}

func (s *server) handleActionReject(w http.ResponseWriter, r *http.Request) {
	uid := userIDFrom(r.Context())
	if ok, retry := s.actionRate.allow("user:"+uid, float64(s.cfg.ActionRPM), s.cfg.ActionRPM); !ok {
		w.Header().Set("Retry-After", retryAfter(retry))
		writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "rate_limited"})
		return
	}
	actionID := r.PathValue("id")
	if !validActionID(actionID) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad_request"})
		return
	}
	token := bearerToken(r)
	payload, _ := json.Marshal(map[string]any{"p_action_id": actionID})
	data, err := s.supaClient.Post(r.Context(), "/rest/v1/rpc/agent_reject_action", token, payload)
	if err != nil {
		s.log.Error("reject failed", "request_id", requestIDFrom(r.Context()), "user_id", uid)
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "upstream"})
		return
	}
	var out map[string]any
	if err := json.Unmarshal(data, &out); err == nil {
		out["action_id"] = actionID
		s.recordActionEvent(r.Context(), token, out, "rejected")
	}
	writeJSON(w, http.StatusOK, json.RawMessage(data))
}

func (s *server) handleActionApproveAll(w http.ResponseWriter, r *http.Request) {
	uid := userIDFrom(r.Context())
	if ok, retry := s.actionRate.allow("user:"+uid, float64(s.cfg.ActionRPM), s.cfg.ActionRPM); !ok {
		w.Header().Set("Retry-After", retryAfter(retry))
		writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "rate_limited"})
		return
	}
	token := bearerToken(r)
	body := approveAllRequest{}
	if err := json.NewDecoder(io.LimitReader(r.Body, 64<<10)).Decode(&body); err != nil || len(body.Actions) == 0 || len(body.Actions) > 20 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad_request"})
		return
	}
	for _, item := range body.Actions {
		if !validActionID(item.ID) {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad_request"})
			return
		}
	}
	results := make([]map[string]any, 0, len(body.Actions))
	stopped := false
	for _, item := range body.Actions {
		if stopped {
			results = append(results, map[string]any{"id": item.ID, "status": "skipped"})
			continue
		}
		payload, _ := json.Marshal(map[string]any{
			"p_action_id":             item.ID,
			"p_expected_preview_hash": item.PreviewHash,
		})
		data, err := s.supaClient.Post(r.Context(), "/rest/v1/rpc/agent_approve_action", token, payload)
		if err != nil {
			s.log.Error("approve-all failed", "request_id", requestIDFrom(r.Context()), "user_id", uid)
			results = append(results, map[string]any{"id": item.ID, "status": "failed", "error": "upstream"})
			stopped = true
			continue
		}
		var out map[string]any
		if err := json.Unmarshal(data, &out); err != nil {
			out = map[string]any{"status": "failed", "error": "upstream"}
		}
		out["id"] = item.ID
		results = append(results, out)
		if status, _ := out["status"].(string); status != "executed" {
			stopped = true
		}
		ev := map[string]any{"action_id": item.ID}
		for k, v := range out {
			if k != "id" {
				ev[k] = v
			}
		}
		s.recordActionEvent(r.Context(), token, ev, "approved")
	}
	writeJSON(w, http.StatusOK, map[string]any{"results": results})
}

func validActionID(s string) bool {
	return len(s) == 36 && !strings.ContainsAny(s, " \t\r\n")
}

func (s *server) recordActionEvent(ctx context.Context, token string, out map[string]any, verb string) {
	actionID, _ := out["id"].(string)
	if actionID == "" {
		delete(out, "id")
		actionID, _ = out["action_id"].(string)
	}
	status, _ := out["status"].(string)
	if actionID == "" || status == "" {
		return
	}
	convID := s.conversationForAction(ctx, token, actionID)
	if convID == "" {
		return
	}
	content := verb + " " + status + ": " + actionID
	if table, ok := out["result_table"].(string); ok && table != "" {
		if rid, ok := out["result_id"].(string); ok && rid != "" {
			content += " (" + table + " " + rid + ")"
		}
	}
	if errStr, ok := out["error"].(string); ok && errStr != "" {
		content += " error=" + errStr
	}
	event, _ := json.Marshal(map[string]any{"type": verb, "action_id": actionID, "status": status})
	_, _ = s.history.Append(ctx, token, convID, agent.AppendInput{Role: "event", Content: content, Event: event})
}

func (s *server) conversationForAction(ctx context.Context, token, actionID string) string {
	data, err := s.supaClient.Get(ctx, "/rest/v1/agent_pending_actions?select=conversation_id&id=eq."+actionID, token)
	if err != nil {
		return ""
	}
	var rows []struct {
		ConversationID *string `json:"conversation_id"`
	}
	if err := json.Unmarshal(data, &rows); err != nil || len(rows) == 0 || rows[0].ConversationID == nil {
		return ""
	}
	return *rows[0].ConversationID
}
