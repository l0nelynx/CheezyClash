package linuxhelper

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestProtocol(t *testing.T) {
	home := "/home/test user"
	valid := StartRequest{Home: home, Config: home + "/a space ' $ config.yaml", SafePaths: home + ":/home/profiles", NetworkNS: "net:[42]", CoreHash: strings.Repeat("a", 64)}
	starts, stops := 0, 0
	h := handler(valid.NetworkNS, valid.CoreHash, strings.Repeat("c", 64), func(p StartRequest) error {
		starts++
		if p.Config != valid.Config {
			t.Fatal("configuration path changed")
		}
		return nil
	}, func() { stops++ })
	data, _ := json.Marshal(valid)
	for _, tc := range []struct {
		name, method, path, body string
		code                     int
	}{
		{"ping", "GET", "/ping", "", 200},
		{"start", "POST", "/start", string(data), 200},
		{"stop", "POST", "/stop", "", 200},
		{"cannot GET start", "GET", "/start", "", 405},
		{"cannot change allowlist", "POST", "/allow", "{}", 404},
		{"cannot replace files", "POST", "/replace_core", "{}", 404},
		{"cannot select executable", "POST", "/start", strings.Replace(string(data), "{", `{"path":"/bin/sh",`, 1), 400},
		{"cannot select arguments", "POST", "/start", strings.Replace(string(data), "{", `{"arg":"-c id",`, 1), 400},
		{"wrong namespace", "POST", "/start", strings.Replace(string(data), "net:[42]", "net:[99]", 1), 400},
		{"wrong core", "POST", "/start", strings.Replace(string(data), valid.CoreHash, strings.Repeat("b", 64), 1), 400},
		{"empty", "POST", "/start", "{}", 400},
		{"trailing object", "POST", "/start", string(data) + "{}", 400},
		{"oversized", "POST", "/start", `{"home":"` + strings.Repeat("x", 65536) + `"}`, 400},
	} {
		t.Run(tc.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			h.ServeHTTP(w, httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body)))
			if w.Code != tc.code {
				t.Fatalf("got %d: %s", w.Code, w.Body.String())
			}
			if tc.path == "/ping" && !strings.Contains(w.Body.String(), Identity) {
				t.Fatal("wrong identity")
			}
		})
	}
	if starts != 1 || stops != 1 {
		t.Fatalf("invalid requests reached process operations: starts=%d stops=%d", starts, stops)
	}
}

func TestUnits(t *testing.T) {
	socket, service := units("1000")
	for _, field := range []string{"ListenStream=/run/cheezyclash-helper-1000.sock", "SocketUser=1000", "SocketMode=0600", "RemoveOnStop=yes"} {
		if !strings.Contains(socket, field) {
			t.Fatalf("missing %s", field)
		}
	}
	for _, field := range []string{"User=1000", "NoNewPrivileges=yes", "AmbientCapabilities=CAP_NET_ADMIN CAP_NET_RAW CAP_NET_BIND_SERVICE", "KillMode=mixed"} {
		if !strings.Contains(service, field) {
			t.Fatalf("missing %s", field)
		}
	}
	for _, forbidden := range []string{"CAP_SYS_ADMIN", "User=root", "PrivateNetwork=yes", "PrivateDevices=yes"} {
		if strings.Contains(service, forbidden) {
			t.Fatalf("unexpected %s", forbidden)
		}
	}
}
