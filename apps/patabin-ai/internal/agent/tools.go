package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/Seizmann/patabin/apps/patabin-ai/internal/supa"
)

const resultCap = 20 * 1024
const defaultLimit = 50
const maxLimit = 200

type ToolContext struct {
	Supa   *supa.Client
	Token  string
	UserID string
}

type Tool struct {
	Name        string
	Description string
	Schema      map[string]any
	Run         func(ctx context.Context, tc *ToolContext, args json.RawMessage) (any, error)
}

func obj(props map[string]any, required []string) map[string]any {
	return map[string]any{"type": "object", "properties": props, "required": required}
}

func strProp(desc string) map[string]any {
	return map[string]any{"type": "string", "description": desc}
}

func intProp(desc string) map[string]any {
	return map[string]any{"type": "integer", "description": desc}
}

func boolProp(desc string) map[string]any {
	return map[string]any{"type": "boolean", "description": desc}
}

func argString(args json.RawMessage, key string) string {
	var m map[string]any
	if err := json.Unmarshal(args, &m); err != nil {
		return ""
	}
	s, _ := m[key].(string)
	return strings.TrimSpace(s)
}

func argInt(args json.RawMessage, key string, def, max int) int {
	var m map[string]any
	if err := json.Unmarshal(args, &m); err != nil {
		return def
	}
	switch v := m[key].(type) {
	case float64:
		n := int(v)
		if n < 1 {
			return def
		}
		if n > max {
			return max
		}
		return n
	case string:
		if n, err := strconv.Atoi(strings.TrimSpace(v)); err == nil {
			if n < 1 {
				return def
			}
			if n > max {
				return max
			}
			return n
		}
	}
	return def
}

func argBool(args json.RawMessage, key string) bool {
	var m map[string]any
	if err := json.Unmarshal(args, &m); err != nil {
		return false
	}
	b, _ := m[key].(bool)
	return b
}

func buildPath(base string, params map[string]string, limit int) string {
	v := url.Values{}
	for k, val := range params {
		if val != "" {
			v.Set(k, val)
		}
	}
	if limit > 0 {
		v.Set("limit", strconv.Itoa(limit))
	}
	q := v.Encode()
	if q == "" {
		return base
	}
	return base + "?" + q
}

func fetchJSON(ctx context.Context, tc *ToolContext, path string) (any, error) {
	data, err := tc.Supa.Get(ctx, path, tc.Token)
	if err != nil {
		return nil, fmt.Errorf("UPSTREAM")
	}
	var out any
	if err := json.Unmarshal(data, &out); err != nil {
		return nil, fmt.Errorf("UPSTREAM")
	}
	return out, nil
}

func wrapTruncated(rows []any) any {
	body, err := json.Marshal(rows)
	if err == nil && len(body) <= resultCap {
		return rows
	}
	for len(rows) > 1 {
		rows = rows[:len(rows)-1]
		body, err = json.Marshal(rows)
		if err == nil && len(body) <= resultCap {
			break
		}
	}
	return map[string]any{"truncated": true, "hint": "নারো ফিল্টার কমাও বা সীমা কমাও", "rows": rows}
}

func listTool(name, desc, base string, extraParams map[string]any, extra func(args json.RawMessage) map[string]string) Tool {
	props := map[string]any{
		"limit": intProp("সারি সীমা, ডিফল্ট ৫০, সর্বোচ্চ ২০০"),
	}
	for k, v := range extraParams {
		props[k] = v
	}
	schema := obj(props, nil)
	return Tool{
		Name:        name,
		Description: desc,
		Schema:      schema,
		Run: func(ctx context.Context, tc *ToolContext, args json.RawMessage) (any, error) {
			params := map[string]string{}
			if extra != nil {
				params = extra(args)
			}
			rows, err := fetchJSON(ctx, tc, buildPath(base, params, argInt(args, "limit", defaultLimit, maxLimit)))
			if err != nil {
				return nil, err
			}
			list, ok := rows.([]any)
			if !ok {
				return rows, nil
			}
			return wrapTruncated(list), nil
		},
	}
}

func dateParams(args json.RawMessage, col string) map[string]string {
	params := map[string]string{"deleted_at": "is.null"}
	from := argString(args, "date_from")
	to := argString(args, "date_to")
	switch {
	case from != "" && to != "":
		params["and"] = "(" + col + ".gte." + from + "," + col + ".lte." + to + ")"
	case from != "":
		params[col] = "gte." + from
	case to != "":
		params[col] = "lte." + to
	}
	return params
}

func Registry() []Tool {
	tools := []Tool{
		{
			Name:        "get_overview",
			Description: "আজকের ও এই মাসের আয়, খরচ, ছাড়, নিট লাভ এবং বর্তমান স্টক — ড্যাশবোর্ডের মূল সংখ্যা।",
			Schema:      obj(map[string]any{}, nil),
			Run: func(ctx context.Context, tc *ToolContext, args json.RawMessage) (any, error) {
				today, month := dhakaRanges()
				todayRows, err := fetchJSON(ctx, tc, "/rest/v1/rpc/dashboard_totals?p_start="+url.QueryEscape(today[0])+"&p_end="+url.QueryEscape(today[1]))
				if err != nil {
					return nil, err
				}
				monthRows, err := fetchJSON(ctx, tc, "/rest/v1/rpc/dashboard_totals?p_start="+url.QueryEscape(month[0])+"&p_end="+url.QueryEscape(month[1]))
				if err != nil {
					return nil, err
				}
				return map[string]any{"today": todayRows, "this_month": monthRows}, nil
			},
		},
		{
			Name:        "get_settings",
			Description: "সেটিংস: ডিফল্ট কেনা দর, বিক্রির দর, প্যাকেট সাইজ।",
			Schema:      obj(map[string]any{}, nil),
			Run: func(ctx context.Context, tc *ToolContext, args json.RawMessage) (any, error) {
				return fetchJSON(ctx, tc, "/rest/v1/settings?select=default_buy_rate,default_sell_price,default_packet_size&id=eq.1")
			},
		},
		{
			Name:        "list_partners",
			Description: "পার্টনারদের তালিকা (id ও নাম) — অন্য টুলে partner_id বসানোর আগে এখান থেকে মেলাও।",
			Schema:      obj(map[string]any{}, nil),
			Run: func(ctx context.Context, tc *ToolContext, args json.RawMessage) (any, error) {
				return fetchJSON(ctx, tc, "/rest/v1/partners?select=id,name&deleted_at=is.null&order=name")
			},
		},
		{
			Name:        "list_wallets",
			Description: "ওয়ালেট অ্যাকাউন্ট ও ব্যালেন্স — sales-এ wallet_account_id এখান থেকেই নিতে হবে।",
			Schema: obj(map[string]any{
				"active_only": boolProp("শুধু চালু ওয়ালেট (ডিফল্ট true)"),
			}, nil),
			Run: func(ctx context.Context, tc *ToolContext, args json.RawMessage) (any, error) {
				activeOnly := "true"
				if argBool(args, "active_only") == false && args != nil && len(args) > 0 && strings.Contains(string(args), "active_only") {
					activeOnly = ""
				}
				params := map[string]string{}
				if activeOnly != "" {
					params["is_active"] = "eq." + activeOnly
				}
				wallets, err := fetchJSON(ctx, tc, buildPath("/rest/v1/wallets?select=id,type,label,name,is_active", params, 0))
				if err != nil {
					return nil, err
				}
				balances, err := fetchJSON(ctx, tc, "/rest/v1/v_wallet_balance?select=wallet_id,balance")
				if err != nil {
					return nil, err
				}
				bal := map[string]any{}
				if list, ok := balances.([]any); ok {
					for _, row := range list {
						if m, ok := row.(map[string]any); ok {
							bal[fmt.Sprint(m["wallet_id"])] = m["balance"]
						}
					}
				}
				out := []any{}
				if list, ok := wallets.([]any); ok {
					for _, row := range list {
						if m, ok := row.(map[string]any); ok {
							m["balance"] = bal[fmt.Sprint(m["id"])]
							out = append(out, m)
						}
					}
				}
				return out, nil
			},
		},
		{
			Name:        "get_partner_balances",
			Description: "প্রতি পার্টনারের প্রাপ্য/পাওনা ব্যালেন্স (ক্যাশ পুল থেকে কে কত পাবে)।",
			Schema:      obj(map[string]any{}, nil),
			Run: func(ctx context.Context, tc *ToolContext, args json.RawMessage) (any, error) {
				return fetchJSON(ctx, tc, "/rest/v1/v_partner_balance?select=*")
			},
		},
		{
			Name:        "list_chalans",
			Description: "চালানের তালিকা ও সারসংক্ষেপ (কেনা, বিক্রি, বাকি, খরচ)।",
			Schema: obj(map[string]any{
				"status": map[string]any{"type": "string", "enum": []string{"open", "closed"}, "description": "চালানের অবস্থা"},
			}, nil),
			Run: func(ctx context.Context, tc *ToolContext, args json.RawMessage) (any, error) {
				status := argString(args, "status")
				params := map[string]string{}
				if status != "" {
					params["status"] = "eq." + status
				}
				rows, err := fetchJSON(ctx, tc, buildPath("/rest/v1/v_chalan_summary?select=*", params, argInt(args, "limit", defaultLimit, maxLimit)))
				if err != nil {
					return nil, err
				}
				if list, ok := rows.([]any); ok {
					return wrapTruncated(list), nil
				}
				return rows, nil
			},
		},
		{
			Name:        "get_chalan_settlement",
			Description: "একটি চালানের প্রতি পার্টনারের হিসাব (পুঁজি, লাভ, খরচ, প্রাপ্য)। chalan_id আবশ্যক।",
			Schema: obj(map[string]any{
				"chalan_id": strProp("চালানের uuid — list_chalans থেকে নাও"),
			}, []string{"chalan_id"}),
			Run: func(ctx context.Context, tc *ToolContext, args json.RawMessage) (any, error) {
				id := argString(args, "chalan_id")
				if id == "" {
					return nil, fmt.Errorf("MISSING_ARG:chalan_id")
				}
				return fetchJSON(ctx, tc, "/rest/v1/v_partner_chalan_settlement?select=*&chalan_id=eq."+url.QueryEscape(id))
			},
		},
		{
			Name:        "get_packet_stock",
			Description: "প্যাকেট ও অবশিষ্ট পিস (মালিক সহ) — propose_adjustment-এর packet_id এখান থেকে নাও।",
			Schema: obj(map[string]any{
				"chalan_id":        strProp("নির্দিষ্ট চালানে সীমাবদ্ধ করো"),
				"owner_partner_id": strProp("নির্দিষ্ট মালিকের প্যাকেট"),
				"only_with_stock":  boolProp("শুধু যেগুলোতে পিস আছে (ডিফল্ট true)"),
			}, nil),
			Run: func(ctx context.Context, tc *ToolContext, args json.RawMessage) (any, error) {
				params := map[string]string{"chalan_status": "eq.open"}
				if id := argString(args, "chalan_id"); id != "" {
					params["chalan_id"] = "eq." + id
				}
				if owner := argString(args, "owner_partner_id"); owner != "" {
					params["owner_partner_id"] = "eq." + owner
				}
				if strings.Contains(string(args), "only_with_stock") && !argBool(args, "only_with_stock") {
					params["remaining"] = "gte.0"
				} else {
					params["remaining"] = "gt.0"
				}
				rows, err := fetchJSON(ctx, tc, buildPath("/rest/v1/v_packet_stock?select=*", params, argInt(args, "limit", defaultLimit, maxLimit)))
				if err != nil {
					return nil, err
				}
				if list, ok := rows.([]any); ok {
					return wrapTruncated(list), nil
				}
				return rows, nil
			},
		},
		listTool(
			"list_sales",
			"বিক্রির তালিকা (তারিখ, ক্রেতা, প্যাকেট, ছাড়)।",
			"/rest/v1/v_sales_agent?select=*",
			map[string]any{
				"date_from":   strProp("শুরু তারিখ (YYYY-MM-DD বা ISO, ঢাকা সময়)"),
				"date_to":     strProp("শেষ তারিখ"),
				"customer":    strProp("ক্রেতার নামে আংশিক মিল"),
				"packet_code": strProp("নির্দিষ্ট প্যাকেট কোড যেমন P-03"),
			},
			func(args json.RawMessage) map[string]string {
				params := dateParams(args, "sold_at")
				if c := argString(args, "customer"); c != "" {
					params["customer_name"] = "ilike.*" + c + "*"
				}
				return params
			},
		).withPacketFilter(),
		listTool(
			"list_expenses",
			"খরচের তালিকা (ক্যাটাগরি, কে দিল, কার খরচ, ওয়ালেট)।",
			"/rest/v1/v_expenses_enriched?select=*",
			map[string]any{
				"date_from":                strProp("শুরু তারিখ"),
				"date_to":                  strProp("শেষ তারিখ"),
				"category":                 strProp("ক্যাটাগরির নাম"),
				"paid_by_partner_id":       strProp("যে টাকা দিয়েছে"),
				"attributed_to_partner_id": strProp("যার খরচ"),
				"chalan_id":                strProp("চালান লিংক"),
			},
			func(args json.RawMessage) map[string]string {
				params := dateParams(args, "spent_at")
				if c := argString(args, "category"); c != "" {
					params["category_name"] = "eq." + c
				}
				if v := argString(args, "paid_by_partner_id"); v != "" {
					params["paid_by_partner_id"] = "eq." + v
				}
				if v := argString(args, "attributed_to_partner_id"); v != "" {
					params["attributed_to_partner_id"] = "eq." + v
				}
				if v := argString(args, "chalan_id"); v != "" {
					params["chalan_id"] = "eq." + v
				}
				return params
			},
		),
		listTool(
			"list_personal_uses",
			"ব্যক্তিগত ব্যবহারের তালিকা (কে খেল, কোথা থেকে, মূল্য)।",
			"/rest/v1/v_personal_uses_enriched?select=*",
			map[string]any{
				"date_from":        strProp("শুরু তারিখ"),
				"date_to":          strProp("শেষ তারিখ"),
				"eater_partner_id": strProp("যে খেয়েছে"),
				"packet_code":      strProp("প্যাকেট কোড"),
			},
			func(args json.RawMessage) map[string]string {
				params := dateParams(args, "at")
				if v := argString(args, "eater_partner_id"); v != "" {
					params["eater_partner_id"] = "eq." + v
				}
				if v := argString(args, "packet_code"); v != "" {
					params["packet_code"] = "eq." + v
				}
				return params
			},
		),
		listTool(
			"list_adjustments",
			"নষ্ট/ফ্রি/ক্ষতির তালিকা (প্যাকেট, কারণ, ব্যক্তি, খরচ কার)।",
			"/rest/v1/v_adjustments_enriched?select=*",
			map[string]any{
				"date_from":   strProp("শুরু তারিখ"),
				"date_to":     strProp("শেষ তারিখ"),
				"reason":      map[string]any{"type": "string", "enum": []string{"gift", "damage", "loss", "sample", "other"}},
				"packet_code": strProp("প্যাকেট কোড"),
			},
			func(args json.RawMessage) map[string]string {
				params := dateParams(args, "at")
				if v := argString(args, "reason"); v != "" {
					params["reason"] = "eq." + v
				}
				if v := argString(args, "packet_code"); v != "" {
					params["packet_code"] = "eq." + v
				}
				return params
			},
		),
		{
			Name:        "list_expense_categories",
			Description: "খরচের ক্যাটাগরির তালিকা — propose_expense-এর category_id এখান থেকে নাও।",
			Schema:      obj(map[string]any{}, nil),
			Run: func(ctx context.Context, tc *ToolContext, args json.RawMessage) (any, error) {
				return fetchJSON(ctx, tc, "/rest/v1/expense_categories?select=id,name&order=name")
			},
		},
	}
	return tools
}

func (t Tool) withPacketFilter() Tool {
	inner := t.Run
	t.Run = func(ctx context.Context, tc *ToolContext, args json.RawMessage) (any, error) {
		code := argString(args, "packet_code")
		if code == "" {
			return inner(ctx, tc, args)
		}
		packets, err := fetchJSON(ctx, tc, "/rest/v1/v_packet_stock?select=packet_id&packet_code=eq."+url.QueryEscape(code))
		if err != nil {
			return nil, err
		}
		ids := []string{}
		if list, ok := packets.([]any); ok {
			for _, row := range list {
				if m, ok := row.(map[string]any); ok {
					ids = append(ids, fmt.Sprint(m["packet_id"]))
				}
			}
		}
		if len(ids) == 0 {
			return []any{}, nil
		}
		allocs, err := fetchJSON(ctx, tc, "/rest/v1/sale_allocations?select=sale_id&packet_id=in.("+strings.Join(ids, ",")+")&limit=500")
		if err != nil {
			return nil, err
		}
		saleIDs := []string{}
		if list, ok := allocs.([]any); ok {
			for _, row := range list {
				if m, ok := row.(map[string]any); ok {
					saleIDs = append(saleIDs, fmt.Sprint(m["sale_id"]))
				}
			}
		}
		if len(saleIDs) == 0 {
			return []any{}, nil
		}
		params := dateParams(args, "sold_at")
		params["id"] = "in.(" + strings.Join(saleIDs, ",") + ")"
		rows, err := fetchJSON(ctx, tc, buildPath("/rest/v1/v_sales_agent?select=*", params, argInt(args, "limit", defaultLimit, maxLimit)))
		if err != nil {
			return nil, err
		}
		if list, ok := rows.([]any); ok {
			return wrapTruncated(list), nil
		}
		return rows, nil
	}
	return t
}

func dhakaRanges() ([2]string, [2]string) {
	now := time.Now().In(dhakaLoc)
	y, m, d := now.Date()
	dayStart := time.Date(y, m, d, 0, 0, 0, 0, dhakaLoc)
	monthStart := time.Date(y, m, 1, 0, 0, 0, 0, dhakaLoc)
	end := now.Format(time.RFC3339)
	return [2]string{dayStart.Format(time.RFC3339), end}, [2]string{monthStart.Format(time.RFC3339), end}
}

var dhakaLoc = time.FixedZone("+06", 6*3600)
