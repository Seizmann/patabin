package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"strconv"
	"strings"

	"github.com/Seizmann/patabin/apps/patabin-ai/internal/normalize"
)

type defaultSet struct {
	Fields []string
}

func (d *defaultSet) add(field string) {
	for _, f := range d.Fields {
		if f == field {
			return
		}
	}
	d.Fields = append(d.Fields, field)
}

type rpcOut struct {
	OK          bool            `json:"ok"`
	ActionID    string          `json:"action_id"`
	Status      string          `json:"status"`
	PreviewHash string          `json:"preview_hash"`
	Preview     json.RawMessage `json:"preview"`
	ExpiresAt   string          `json:"expires_at"`
	Error       string          `json:"error"`
}

func callCreateAction(ctx context.Context, tc *ToolContext, tool string, payload map[string]any, used []string, modelID string) (any, error) {
	if modelID == "" {
		return nil, fmt.Errorf("NO_MODEL_SELECTED")
	}
	usedOut := used
	if usedOut == nil {
		usedOut = []string{}
	}
	body, err := json.Marshal(map[string]any{
		"p_conversation_id": nil,
		"p_message_id":      nil,
		"p_tool":            tool,
		"p_payload":         payload,
		"p_defaults_used":   usedOut,
		"p_model_id":        modelID,
	})
	if err != nil {
		return nil, fmt.Errorf("PAYLOAD")
	}
	data, err := tc.Supa.Post(ctx, "/rest/v1/rpc/agent_create_action", tc.Token, body)
	if err != nil {
		return nil, fmt.Errorf("UPSTREAM")
	}
	var out rpcOut
	if err := json.Unmarshal(data, &out); err != nil {
		return nil, fmt.Errorf("UPSTREAM")
	}
	if !out.OK {
		return map[string]any{"error": "DOMAIN", "code": out.Error, "detail": out}, nil
	}
	usedAny := usedOut
	return map[string]any{
		"status":        "awaiting_approval",
		"action_id":     out.ActionID,
		"preview_hash":  out.PreviewHash,
		"expires_at":    out.ExpiresAt,
		"defaults_used": usedAny,
		"preview":       json.RawMessage(out.Preview),
	}, nil
}

func numArg(raw json.RawMessage, key string) (float64, bool) {
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		return 0, false
	}
	switch v := m[key].(type) {
	case float64:
		return v, true
	case string:
		if f, err := strconv.ParseFloat(strings.TrimSpace(normalize.Digits(v)), 64); err == nil {
			return f, true
		}
	}
	return 0, false
}

func strArg(raw json.RawMessage, key string) string {
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		return ""
	}
	s, _ := m[key].(string)
	return strings.TrimSpace(normalize.Digits(s))
}

func boolArg(raw json.RawMessage, key string) bool {
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		return false
	}
	b, _ := m[key].(bool)
	return b
}

func settingsRow(ctx context.Context, tc *ToolContext) (map[string]any, error) {
	out, err := fetchJSON(ctx, tc, "/rest/v1/settings?select=default_buy_rate,default_sell_price,default_packet_size&id=eq.1")
	if err != nil {
		return nil, err
	}
	list, ok := out.([]any)
	if !ok || len(list) == 0 {
		return nil, fmt.Errorf("UPSTREAM")
	}
	m, _ := list[0].(map[string]any)
	if m == nil {
		return nil, fmt.Errorf("UPSTREAM")
	}
	return m, nil
}

func fetchList(ctx context.Context, tc *ToolContext, path string) []any {
	out, err := fetchJSON(ctx, tc, path)
	if err != nil {
		return nil
	}
	list, _ := out.([]any)
	return list
}

func validUUID(s string) bool {
	if len(s) != 36 {
		return false
	}
	for i, r := range s {
		switch i {
		case 8, 13, 18, 23:
			if r != '-' {
				return false
			}
		default:
			if r < '0' || (r > '9' && (r < 'a' || r > 'f')) && (r < 'A' || r > 'F') {
				return false
			}
		}
	}
	return true
}

func proposeSaleTool(modelRef func() string) Tool {
	return Tool{
		Name:        "propose_sale",
		Description: "একটি বিক্রির প্রস্তাব তৈরি করো (সাথে সাথে লেখা হয় না; মালিক অনুমোদন দিলে তবেই লেখা হবে)। আবশ্যিক: qty, wallet_account_id (list_wallets থেকে)। amount_received না দিলে qty × বিক্রির দর (ছাড় ০, প্রিভিউতে 'default' চিহ্নিত হবে)। প্যাকেট জিজ্ঞেস করো না — প্রায়োরিটি ক্রমে ডেটাবেস নিজেই কাটবে। অনুমোদনের আগে কখনো দাবি করো না যে বিক্রি হয়ে গেছে।",
		Schema: obj(map[string]any{
			"qty":               intProp("পিস সংখ্যা, ১-এর সমান বা বেশি"),
			"wallet_account_id": strProp("ওয়ালেট uuid — list_wallets থেকে; ব্যবহারকারী না বললে ask_user করো"),
			"amount_received":   strProp("আসলে যত টাকা নেওয়া হলো (BDT); না বললে ডিফল্ট বসবে"),
			"list_unit_price":   strProp("প্রতি পিস তালিকা মূল্য; না দিলে সেটিংসের ডিফল্ট"),
			"customer_name":     strProp("ক্রেতার নাম (ঐচ্ছিক)"),
			"customer_phone":    strProp("ক্রেতার ফোন (ঐচ্ছিক)"),
			"note":              strProp("নোট (ঐচ্ছিক)"),
		}, nil),
		Run: func(ctx context.Context, tc *ToolContext, args json.RawMessage) (any, error) {
			qty, ok := numArg(args, "qty")
			if !ok || qty < 1 || qty != float64(int(qty)) {
				return nil, fmt.Errorf("BAD_ARG:qty")
			}
			wallet := strArg(args, "wallet_account_id")
			if !validUUID(wallet) {
				return nil, fmt.Errorf("MISSING_ARG:wallet_account_id")
			}
			st, err := settingsRow(ctx, tc)
			if err != nil {
				return nil, err
			}
			used := &defaultSet{}
			payload := map[string]any{"qty": int(qty), "wallet_account_id": wallet}
			if p := strArg(args, "list_unit_price"); p != "" {
				f, perr := strconv.ParseFloat(p, 64)
				if perr != nil || f < 0 {
					return nil, fmt.Errorf("BAD_ARG:list_unit_price")
				}
				payload["list_unit_price"] = f
			} else {
				f, _ := st["default_sell_price"].(float64)
				payload["list_unit_price"] = f
			}
			listPrice := payload["list_unit_price"].(float64)
			if a := strArg(args, "amount_received"); a != "" {
				f, aerr := strconv.ParseFloat(a, 64)
				if aerr != nil || f < 0 {
					return nil, fmt.Errorf("BAD_ARG:amount_received")
				}
				payload["amount_received"] = f
			} else {
				payload["amount_received"] = listPrice * float64(int(qty))
				used.add("amount_received")
			}
			if v := strArg(args, "customer_name"); v != "" {
				payload["customer_name"] = v
			}
			if v := strArg(args, "customer_phone"); v != "" {
				payload["customer_phone"] = v
			}
			if v := strArg(args, "note"); v != "" {
				payload["note"] = v
			}
			return callCreateAction(ctx, tc, "propose_sale", payload, used.Fields, modelRef())
		},
	}
}

func proposeExpenseTool(modelRef func() string) Tool {
	return Tool{
		Name:        "propose_expense",
		Description: "একটি খরচের প্রস্তাব তৈরি করো। আবশ্যিক: category_id (list_expense_categories থেকে), amount, paid_by_partner_id, attributed_to_partner_id, আর টাকা কোথা থেকে গেল — ওয়ালেট হলে wallet_account_id, নিজের পকেট হলে own_pocket=true। কোনো ঘর আন্দাজ করো না; না জানলে ask_user করো।",
		Schema: obj(map[string]any{
			"category_id":              strProp("ক্যাটাগরি uuid — list_expense_categories থেকে"),
			"amount":                   strProp("টাকার পরিমাণ (BDT), ০-এর বেশি"),
			"paid_by_partner_id":       strProp("যে টাকা দিয়েছে — list_partners থেকে"),
			"attributed_to_partner_id": strProp("যার খরচ — list_partners থেকে"),
			"wallet_account_id":        strProp("ওয়ালেট uuid; নিজের পকেট হলে খালি রাখো"),
			"own_pocket":               boolProp("নিজের পকেট থেকে দেওয়া হলে true"),
			"chalan_id":                strProp("চালান uuid (ঐচ্ছিক)"),
			"note":                     strProp("নোট (ঐচ্ছিক)"),
		}, nil),
		Run: func(ctx context.Context, tc *ToolContext, args json.RawMessage) (any, error) {
			category := strArg(args, "category_id")
			paidBy := strArg(args, "paid_by_partner_id")
			attributed := strArg(args, "attributed_to_partner_id")
			wallet := strArg(args, "wallet_account_id")
			ownPocket := boolArg(args, "own_pocket")
			amount, ok := numArg(args, "amount")
			if !ok || amount <= 0 {
				return nil, fmt.Errorf("BAD_ARG:amount")
			}
			if category == "" || paidBy == "" || attributed == "" {
				return nil, fmt.Errorf("MISSING_ARG:category_id,paid_by_partner_id,attributed_to_partner_id")
			}
			if wallet == "" && !ownPocket {
				return nil, fmt.Errorf("MISSING_ARG:wallet_account_id")
			}
			if wallet != "" && !validUUID(wallet) {
				return nil, fmt.Errorf("BAD_ARG:wallet_account_id")
			}
			if !validUUID(category) || !validUUID(paidBy) || !validUUID(attributed) {
				return nil, fmt.Errorf("BAD_ARG:id")
			}
			payload := map[string]any{
				"category_id":              category,
				"amount":                   amount,
				"paid_by_partner_id":       paidBy,
				"attributed_to_partner_id": attributed,
			}
			if wallet != "" {
				payload["wallet_account_id"] = wallet
			}
			if ch := strArg(args, "chalan_id"); ch != "" {
				if !validUUID(ch) {
					return nil, fmt.Errorf("BAD_ARG:chalan_id")
				}
				payload["chalan_id"] = ch
			}
			if v := strArg(args, "note"); v != "" {
				payload["note"] = v
			}
			return callCreateAction(ctx, tc, "propose_expense", payload, nil, modelRef())
		},
	}
}

func proposePersonalUseTool(modelRef func() string) Tool {
	return Tool{
		Name:        "propose_personal_use",
		Description: "ব্যক্তিগত ব্যবহারের প্রস্তাব তৈরি করো। আবশ্যিক: qty এবং উৎস — নির্দিষ্ট প্যাকেট হলে packet_id (get_packet_stock থেকে), নিজের মজুদ পিস হলে kept=true এবং chalan_id। eater_partner_id না দিলে লগইন করা ব্যবহারকারীর পার্টনার এবং unit_value না দিলে বর্তমান বিক্রির দর ডিফল্ট বসবে (প্রিভিউতে 'default' চিহ্নিত)।",
		Schema: obj(map[string]any{
			"qty":              intProp("পিস সংখ্যা, ১-এর সমান বা বেশি"),
			"packet_id":        strProp("প্যাকেট uuid — get_packet_stock থেকে"),
			"kept":             boolProp("নিজের মজুদ (kept) পিস হলে true"),
			"chalan_id":        strProp("kept হলে চালান uuid"),
			"eater_partner_id": strProp("যে খাবে — list_partners থেকে; না দিলে লগইন ইউজারের পার্টনার (ডিফল্ট)"),
			"unit_value":       strProp("প্রতি পিস মূল্য; না দিলে বর্তমান বিক্রির দর (ডিফল্ট)"),
			"note":             strProp("নোট (ঐচ্ছিক)"),
		}, nil),
		Run: func(ctx context.Context, tc *ToolContext, args json.RawMessage) (any, error) {
			qty, ok := numArg(args, "qty")
			if !ok || qty < 1 || qty != float64(int(qty)) {
				return nil, fmt.Errorf("BAD_ARG:qty")
			}
			packet := strArg(args, "packet_id")
			kept := boolArg(args, "kept")
			if packet == "" && !kept {
				return nil, fmt.Errorf("MISSING_ARG:packet_id")
			}
			if packet != "" && !validUUID(packet) {
				return nil, fmt.Errorf("BAD_ARG:packet_id")
			}
			used := &defaultSet{}
			payload := map[string]any{"qty": int(qty)}
			if packet != "" {
				payload["packet_id"] = packet
			} else {
				chalan := strArg(args, "chalan_id")
				if chalan == "" || !validUUID(chalan) {
					return nil, fmt.Errorf("MISSING_ARG:chalan_id")
				}
				payload["chalan_id"] = chalan
			}
			if e := strArg(args, "eater_partner_id"); e != "" {
				if !validUUID(e) {
					return nil, fmt.Errorf("BAD_ARG:eater_partner_id")
				}
				payload["eater_partner_id"] = e
			} else {
				uid := tc.UserID
				partners := fetchList(ctx, tc, "/rest/v1/partners?select=id&user_id=eq."+url.QueryEscape(uid))
				matched := false
				if len(partners) == 1 {
					if m, okM := partners[0].(map[string]any); okM {
						if id := fmt.Sprint(m["id"]); validUUID(id) {
							payload["eater_partner_id"] = id
							used.add("eater_partner_id")
							matched = true
						}
					}
				}
				if !matched {
					return nil, fmt.Errorf("MISSING_ARG:eater_partner_id")
				}
			}
			if uv := strArg(args, "unit_value"); uv != "" {
				f, uerr := strconv.ParseFloat(uv, 64)
				if uerr != nil || f < 0 {
					return nil, fmt.Errorf("BAD_ARG:unit_value")
				}
				payload["unit_value"] = f
			} else {
				st, serr := settingsRow(ctx, tc)
				if serr != nil {
					return nil, serr
				}
				f, _ := st["default_sell_price"].(float64)
				payload["unit_value"] = f
				used.add("unit_value")
			}
			if v := strArg(args, "note"); v != "" {
				payload["note"] = v
			}
			return callCreateAction(ctx, tc, "propose_personal_use", payload, used.Fields, modelRef())
		},
	}
}

func proposeAdjustmentTool(modelRef func() string) Tool {
	return Tool{
		Name:        "propose_adjustment",
		Description: "নষ্ট/ফ্রি/ক্ষতি/নমুনার প্রস্তাব তৈরি করো। আবশ্যিক: packet_id (get_packet_stock থেকে), qty, reason (gift/damage/loss/sample/other)। খরচ প্যাকেটের মালিক বহন করবে (কেনা দর × qty)।",
		Schema: obj(map[string]any{
			"packet_id": strProp("প্যাকেট uuid — get_packet_stock থেকে"),
			"qty":       intProp("পিস সংখ্যা, ১-এর সমান বা বেশি"),
			"reason":    map[string]any{"type": "string", "enum": []string{"gift", "damage", "loss", "sample", "other"}, "description": "কারণ"},
			"person":    strProp("কাকে দেওয়া হলো (ঐচ্ছিক)"),
			"note":      strProp("নোট (ঐচ্ছিক)"),
		}, nil),
		Run: func(ctx context.Context, tc *ToolContext, args json.RawMessage) (any, error) {
			packet := strArg(args, "packet_id")
			qty, ok := numArg(args, "qty")
			if !ok || qty < 1 || qty != float64(int(qty)) {
				return nil, fmt.Errorf("BAD_ARG:qty")
			}
			reason := strArg(args, "reason")
			if packet == "" || !validUUID(packet) {
				return nil, fmt.Errorf("MISSING_ARG:packet_id")
			}
			switch reason {
			case "gift", "damage", "loss", "sample", "other":
			default:
				return nil, fmt.Errorf("BAD_ARG:reason")
			}
			payload := map[string]any{"packet_id": packet, "qty": int(qty), "reason": reason}
			if v := strArg(args, "person"); v != "" {
				payload["person"] = v
			}
			if v := strArg(args, "note"); v != "" {
				payload["note"] = v
			}
			return callCreateAction(ctx, tc, "propose_adjustment", payload, nil, modelRef())
		},
	}
}
