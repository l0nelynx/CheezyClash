package tunnel

import (
	"testing"
	"time"

	C "github.com/metacubex/mihomo/constant"
)

type namedTestProxy string

func (p namedTestProxy) Name() string { return string(p) }

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

func TestParseGroupTestMetadata(t *testing.T) {
	tests := []struct {
		name         string
		raw          string
		wantURL      string
		wantExpected string
		wantErr      bool
	}{
		{
			name:    "selector default URL",
			raw:     `{"type":"Selector","testUrl":""}`,
			wantURL: C.DefaultTestURL,
		},
		{
			name:         "explicit URL and expected status",
			raw:          `{"testUrl":"https://example.test/204","expectedStatus":"200/204"}`,
			wantURL:      "https://example.test/204",
			wantExpected: "200/204",
		},
		{name: "invalid JSON", raw: `{`, wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotURL, gotExpected, err := parseGroupTestMetadata([]byte(tt.raw))
			if (err != nil) != tt.wantErr {
				t.Fatalf("parseGroupTestMetadata() error = %v, wantErr %v", err, tt.wantErr)
			}
			if gotURL != tt.wantURL || gotExpected != tt.wantExpected {
				t.Fatalf("parseGroupTestMetadata() = (%q, %q), want (%q, %q)", gotURL, gotExpected, tt.wantURL, tt.wantExpected)
			}
		})
	}
}

func TestFindNamed(t *testing.T) {
	items := []namedTestProxy{"vless-node", "hysteria2-node"}
	got, ok := findNamed(items, "hysteria2-node")
	if !ok || got.Name() != "hysteria2-node" {
		t.Fatalf("findNamed() = (%q, %v)", got, ok)
	}
	if _, ok := findNamed(items, "outside-group"); ok {
		t.Fatal("findNamed() accepted a proxy outside the group")
	}
}

func TestRunGroupHealthChecksWaitsForCompletion(t *testing.T) {
	release := make(chan struct{})
	done := make(chan struct{})
	go func() {
		runGroupHealthChecks([]string{"one", "two"}, func(string) { <-release })
		close(done)
	}()

	select {
	case <-done:
		t.Fatal("runGroupHealthChecks returned before checks completed")
	case <-time.After(20 * time.Millisecond):
	}
	close(release)
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("runGroupHealthChecks did not return after checks completed")
	}
}
