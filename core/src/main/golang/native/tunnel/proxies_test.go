package tunnel

import (
	"testing"

	C "github.com/metacubex/mihomo/constant"
)

func TestDelayFromHistories(t *testing.T) {
	tests := []struct {
		name      string
		preferred []C.DelayHistory
		fallback  []C.DelayHistory
		wantDelay int
		wantKnown bool
	}{
		{name: "no history", wantDelay: 0, wantKnown: false},
		{
			name:      "preferred success",
			preferred: []C.DelayHistory{{Delay: 124}},
			fallback:  []C.DelayHistory{{Delay: 300}},
			wantDelay: 124,
			wantKnown: true,
		},
		{
			name:      "preferred timeout",
			preferred: []C.DelayHistory{{Delay: 0}},
			wantDelay: int(^uint16(0)),
			wantKnown: true,
		},
		{
			name:      "fallback success",
			fallback:  []C.DelayHistory{{Delay: 210}},
			wantDelay: 210,
			wantKnown: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotDelay, gotKnown := delayFromHistories(tt.preferred, tt.fallback)
			if gotDelay != tt.wantDelay || gotKnown != tt.wantKnown {
				t.Fatalf("delayFromHistories() = (%d, %t), want (%d, %t)", gotDelay, gotKnown, tt.wantDelay, tt.wantKnown)
			}
		})
	}
}
