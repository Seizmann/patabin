package normalize

import "strings"

var bnDigits = map[rune]rune{
	'০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4',
	'৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9',
}

func Digits(s string) string {
	var b strings.Builder
	for _, r := range s {
		if d, ok := bnDigits[r]; ok {
			b.WriteRune(d)
		} else {
			b.WriteRune(r)
		}
	}
	return b.String()
}
