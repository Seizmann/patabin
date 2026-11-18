package agent

import (
	"context"
	_ "embed"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/Seizmann/patabin/apps/patabin-ai/internal/supa"
)

//go:embed system.md
var systemTemplate string

func RenderSystemPrompt(ctx context.Context, sc *supa.Client, token, userID string) (string, error) {
	now := time.Now().In(dhakaLoc)
	var b strings.Builder
	b.WriteString(systemTemplate)
	b.WriteString("\n\nবর্তমান সময়: ")
	b.WriteString(now.Format("2006-01-02 15:04"))
	b.WriteString(" (ঢাকা)।\n\n")

	if partners, err := fetchJSON(ctx, &ToolContext{Supa: sc, Token: token}, "/rest/v1/partners?select=id,name&deleted_at=is.null&order=name"); err == nil {
		b.WriteString("পার্টনার (id: নাম):\n")
		if list, ok := partners.([]any); ok {
			for _, row := range list {
				if m, ok := row.(map[string]any); ok {
					fmt.Fprintf(&b, "- %s: %s\n", m["id"], m["name"])
				}
			}
		}
		b.WriteString("\n")
	}

	if settings, err := fetchJSON(ctx, &ToolContext{Supa: sc, Token: token}, "/rest/v1/settings?select=default_buy_rate,default_sell_price,default_packet_size&id=eq.1"); err == nil {
		if list, ok := settings.([]any); ok && len(list) > 0 {
			if m, ok := list[0].(map[string]any); ok {
				fmt.Fprintf(&b, "সেটিংস: কেনা দর ৳%v, বিক্রির দর ৳%v, প্যাকেট সাইজ %v পিস\n\n", m["default_buy_rate"], m["default_sell_price"], m["default_packet_size"])
			}
		}
	}

	if chalans, err := fetchJSON(ctx, &ToolContext{Supa: sc, Token: token}, "/rest/v1/v_chalan_summary?select=chalan_id,code&status=eq.open"); err == nil {
		b.WriteString("খোলা চালান:\n")
		if list, ok := chalans.([]any); ok && len(list) > 0 {
			for _, row := range list {
				if m, ok := row.(map[string]any); ok {
					fmt.Fprintf(&b, "- %s: %s\n", m["code"], m["chalan_id"])
				}
			}
		} else {
			b.WriteString("- নেই\n")
		}
		b.WriteString("\n")
	}

	if profile, err := fetchJSON(ctx, &ToolContext{Supa: sc, Token: token}, "/rest/v1/profiles?select=display_name&id=eq."+url.QueryEscape(userID)); err == nil {
		if list, ok := profile.([]any); ok && len(list) > 0 {
			if m, ok := list[0].(map[string]any); ok {
				fmt.Fprintf(&b, "ব্যবহারকারী: %s\n", m["display_name"])
			}
		}
	}

	b.WriteString("\nপাওয়া টুল: ")
	for i, t := range Registry() {
		if i > 0 {
			b.WriteString(", ")
		}
		b.WriteString(t.Name)
	}
	b.WriteString(", ask_user\n")
	return b.String(), nil
}
