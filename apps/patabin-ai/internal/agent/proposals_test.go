package agent

import (
	"fmt"
	"strings"
	"testing"
)

func TestProposeSaleReturnsAwaitingApproval(t *testing.T) {
	ask := toolCallChunk("p1", "propose_sale", `{"qty":"৫","wallet_account_id":"11111111-1111-1111-1111-111111111111"}`) + "data: [DONE]\n"
	loop, state, llmFake := newLoopFixture(t, []string{
		ask,
		textChunk("প্রস্তাব তৈরি হয়েছে") + "data: [DONE]\n",
	}, "")
	state.mu.Lock()
	state.rpcResps = []string{`{"ok":true,"action_id":"act-1","status":"pending","preview_hash":"h1","preview":{"detail":{}},"expires_at":"2030-01-01T00:00:00Z"}`}
	state.mu.Unlock()
	loop.Limits.MaxRounds = 3

	events, err := runChat(t, loop, ChatInput{UserMessage: "৫ পিস বিক্রি"})
	if err != nil {
		t.Fatal(err)
	}
	foundProposal := false
	for _, e := range events {
		if e.name == "proposal" {
			foundProposal = true
			if e.payload["action_id"] != "act-1" {
				t.Fatalf("proposal payload = %v", e.payload)
			}
		}
	}
	if !foundProposal {
		t.Fatalf("proposal event missing: %+v", events)
	}
	state.mu.Lock()
	defer state.mu.Unlock()
	if len(state.rpcCalls) != 1 {
		t.Fatalf("rpc calls = %d", len(state.rpcCalls))
	}
	payload := state.rpcCalls[0]["p_payload"].(map[string]any)
	if payload["qty"] != float64(5) {
		t.Fatalf("qty must normalize from Bangla digits, got %v", payload["qty"])
	}
	if payload["amount_received"] != float64(1500) {
		t.Fatalf("default amount = %v", payload["amount_received"])
	}
	used := state.rpcCalls[0]["p_defaults_used"].([]any)
	if len(used) != 1 || used[0] != "amount_received" {
		t.Fatalf("defaults_used = %v", used)
	}
	foundTool := false
	for _, m := range state.msgs {
		if m["role"] == "tool" && strings.Contains(fmt.Sprint(m["content"]), "awaiting_approval") {
			foundTool = true
		}
	}
	if !foundTool {
		t.Fatal("tool result must say awaiting_approval")
	}
	if llmFake.requests < 2 {
		t.Fatalf("model must get the tool result, rounds = %d", llmFake.requests)
	}
}

func TestProposeSaleUserAmountOverridesDefault(t *testing.T) {
	ask := toolCallChunk("p1", "propose_sale", `{"qty":4,"wallet_account_id":"11111111-1111-1111-1111-111111111111","amount_received":"১১০০"}`) + "data: [DONE]\n"
	loop, state, _ := newLoopFixture(t, []string{ask}, "")
	state.mu.Lock()
	state.rpcResps = []string{`{"ok":true,"action_id":"a","status":"pending","preview_hash":"h","preview":{}}`}
	state.mu.Unlock()
	loop.Limits.MaxRounds = 1

	if _, err := runChat(t, loop, ChatInput{UserMessage: "৪ পিস ১১০০ টাকায়"}); err != nil {
		t.Fatal(err)
	}
	state.mu.Lock()
	defer state.mu.Unlock()
	payload := state.rpcCalls[0]["p_payload"].(map[string]any)
	if payload["amount_received"] != float64(1100) {
		t.Fatalf("user amount must win, got %v", payload["amount_received"])
	}
	if len(state.rpcCalls[0]["p_defaults_used"].([]any)) != 0 {
		t.Fatalf("defaults_used must be empty, got %v", state.rpcCalls[0]["p_defaults_used"])
	}
}

func TestProposeSaleMissingWalletIsToolError(t *testing.T) {
	ask := toolCallChunk("p1", "propose_sale", `{"qty":3}`) + "data: [DONE]\n"
	loop, state, _ := newLoopFixture(t, []string{ask}, "")
	loop.Limits.MaxRounds = 1

	events, err := runChat(t, loop, ChatInput{UserMessage: "বিক্রি"})
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range events {
		if e.name == "proposal" {
			t.Fatal("missing wallet must not propose")
		}
	}
	state.mu.Lock()
	defer state.mu.Unlock()
	found := false
	for _, m := range state.msgs {
		if m["role"] == "tool" && strings.Contains(fmt.Sprint(m["content"]), "MISSING_ARG:wallet_account_id") {
			found = true
		}
	}
	if !found {
		t.Fatal("missing wallet tool error missing")
	}
}

func TestProposeDomainErrorSurfacesAsToolError(t *testing.T) {
	ask := toolCallChunk("p1", "propose_sale", `{"qty":1000,"wallet_account_id":"11111111-1111-1111-1111-111111111111"}`) + "data: [DONE]\n"
	loop, state, _ := newLoopFixture(t, []string{ask}, "")
	state.mu.Lock()
	state.rpcResps = []string{`{"ok":false,"error":"NO_STOCK","code":"P0001"}`}
	state.mu.Unlock()
	loop.Limits.MaxRounds = 1

	events, err := runChat(t, loop, ChatInput{UserMessage: "1000 পিস"})
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range events {
		if e.name == "proposal" {
			t.Fatal("domain error must not emit proposal event")
		}
	}
	state.mu.Lock()
	defer state.mu.Unlock()
	found := false
	for _, m := range state.msgs {
		if m["role"] == "tool" && strings.Contains(fmt.Sprint(m["content"]), "NO_STOCK") {
			found = true
		}
	}
	if !found {
		t.Fatal("tool result must carry the domain error")
	}
}

func TestProposalCapStopsNewProposals(t *testing.T) {
	ask1 := toolCallChunk("p1", "propose_sale", `{"qty":1,"wallet_account_id":"11111111-1111-1111-1111-111111111111"}`) + "data: [DONE]\n"
	ask2 := toolCallChunk("p2", "propose_sale", `{"qty":2,"wallet_account_id":"11111111-1111-1111-1111-111111111111"}`) + "data: [DONE]\n"
	loop, state, _ := newLoopFixture(t, []string{ask1 + ask2}, "")
	state.mu.Lock()
	state.rpcResps = []string{
		`{"ok":true,"action_id":"a1","status":"pending","preview_hash":"h","preview":{}}`,
		`{"ok":true,"action_id":"a2","status":"pending","preview_hash":"h","preview":{}}`,
	}
	state.mu.Unlock()
	loop.Limits.MaxRounds = 2
	loop.Limits.MaxProposals = 1

	events, err := runChat(t, loop, ChatInput{UserMessage: "দুটো বিক্রি"})
	if err != nil {
		t.Fatal(err)
	}
	proposals := 0
	for _, e := range events {
		if e.name == "proposal" {
			proposals++
		}
	}
	if proposals != 1 {
		t.Fatalf("proposal events = %d, want 1", proposals)
	}
	state.mu.Lock()
	defer state.mu.Unlock()
	foundCap := false
	for _, m := range state.msgs {
		if m["role"] == "tool" && strings.Contains(fmt.Sprint(m["content"]), "PROPOSAL_CAP") {
			foundCap = true
		}
	}
	if !foundCap {
		t.Fatal("cap tool error missing")
	}
}

func TestProposePersonalUseDefaultsFilledByGo(t *testing.T) {
	ask := toolCallChunk("p1", "propose_personal_use", `{"qty":2,"kept":true,"chalan_id":"22222222-2222-2222-2222-222222222222"}`) + "data: [DONE]\n"
	loop, state, _ := newLoopFixture(t, []string{ask}, "")
	state.mu.Lock()
	state.rpcResps = []string{`{"ok":true,"action_id":"a","status":"pending","preview_hash":"h","preview":{}}`}
	state.mu.Unlock()
	loop.Limits.MaxRounds = 1

	if _, err := runChat(t, loop, ChatInput{UserMessage: "২ পিস নিজে খেলাম"}); err != nil {
		t.Fatal(err)
	}
	state.mu.Lock()
	defer state.mu.Unlock()
	payload := state.rpcCalls[0]["p_payload"].(map[string]any)
	if payload["eater_partner_id"] != "aaaaaaaa-1111-1111-1111-111111111111" {
		t.Fatalf("eater default = %v", payload["eater_partner_id"])
	}
	if payload["unit_value"] != float64(300) {
		t.Fatalf("unit_value default = %v", payload["unit_value"])
	}
	used := state.rpcCalls[0]["p_defaults_used"].([]any)
	if len(used) != 2 || used[0] != "eater_partner_id" || used[1] != "unit_value" {
		t.Fatalf("defaults_used = %v", used)
	}
}

func TestProposeExpenseOwnPocket(t *testing.T) {
	ask := toolCallChunk("p1", "propose_expense", `{"category_id":"22222222-2222-2222-2222-222222222222","amount":"৫০","paid_by_partner_id":"aaaaaaaa-1111-1111-1111-111111111111","attributed_to_partner_id":"bbbbbbbb-2222-2222-2222-222222222222","own_pocket":true}`) + "data: [DONE]\n"
	loop, state, _ := newLoopFixture(t, []string{ask}, "")
	state.mu.Lock()
	state.rpcResps = []string{`{"ok":true,"action_id":"a","status":"pending","preview_hash":"h","preview":{}}`}
	state.mu.Unlock()
	loop.Limits.MaxRounds = 1

	if _, err := runChat(t, loop, ChatInput{UserMessage: "খরচ"}); err != nil {
		t.Fatal(err)
	}
	state.mu.Lock()
	defer state.mu.Unlock()
	payload := state.rpcCalls[0]["p_payload"].(map[string]any)
	if _, has := payload["wallet_account_id"]; has {
		t.Fatalf("own pocket must omit wallet, got %v", payload)
	}
	if payload["amount"] != float64(50) {
		t.Fatalf("amount = %v", payload["amount"])
	}
}

func TestProposeExpenseMissingSourceIsToolError(t *testing.T) {
	ask := toolCallChunk("p1", "propose_expense", `{"category_id":"22222222-2222-2222-2222-222222222222","amount":50,"paid_by_partner_id":"aaaaaaaa-1111-1111-1111-111111111111","attributed_to_partner_id":"bbbbbbbb-2222-2222-2222-222222222222"}`) + "data: [DONE]\n"
	loop, state, _ := newLoopFixture(t, []string{ask}, "")
	loop.Limits.MaxRounds = 1

	if _, err := runChat(t, loop, ChatInput{UserMessage: "খরচ"}); err != nil {
		t.Fatal(err)
	}
	state.mu.Lock()
	defer state.mu.Unlock()
	found := false
	for _, m := range state.msgs {
		if m["role"] == "tool" && strings.Contains(fmt.Sprint(m["content"]), "MISSING_ARG:wallet_account_id") {
			found = true
		}
	}
	if !found {
		t.Fatal("missing wallet tool error missing")
	}
}
