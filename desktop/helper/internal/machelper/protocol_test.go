package machelper

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestStartBoundary(t *testing.T) {
	hash := strings.Repeat("a", 64)
	for _, bad := range []string{
		`{}`, `{"core_hash":"wrong"}`, `{"core_hash":"` + hash + `","path":"/bin/sh"}`,
		`{"core_hash":"` + hash + `","home":"/"}`, `{"core_hash":"` + hash + `"}{}`,
		`{"core_hash":"` + hash + `","arg":"--execute"}`,
	} {
		if decodeStart(strings.NewReader(bad), hash) == nil {
			t.Fatalf("accepted %s", bad)
		}
	}
	if err := decodeStart(strings.NewReader(`{"core_hash":"`+hash+`"}`), hash); err != nil {
		t.Fatal(err)
	}
}

func TestIdentityAndProtocol(t *testing.T) {
	for _, id := range [][2]string{{"0", "aaaaaaaaaaaaaaaa"}, {"0501", "aaaaaaaaaaaaaaaa"}, {"501", "../escape"}, {"-1", "aaaaaaaaaaaaaaaa"}} {
		if validID(id[0], id[1]) == nil {
			t.Fatal("accepted", id)
		}
	}
	if err := validID("501", "0123456789abcdef"); err != nil {
		t.Fatal(err)
	}
	m := Manifest{UID: 501, Instance: "0123456789abcdef", CoreHash: strings.Repeat("a", 64)}
	starts, stops := 0, 0
	h := handler(m, func() any { return m }, func() error { starts++; return nil }, func() { stops++ }, func() {})
	for _, test := range []struct {
		method, path, body string
		status             int
	}{
		{"GET", "/ping", "", 200}, {"GET", "/start", "", 405}, {"POST", "/allow", "", 404},
		{"POST", "/replace_core", "", 404}, {"POST", "/start", `{"path":"/bin/sh"}`, 400},
		{"POST", "/start", `{"core_hash":"` + m.CoreHash + `"}`, 200}, {"POST", "/stop", "", 200},
	} {
		w := httptest.NewRecorder()
		h.ServeHTTP(w, httptest.NewRequest(test.method, test.path, strings.NewReader(test.body)))
		if w.Code != test.status {
			t.Fatalf("%s %s: %d", test.method, test.path, w.Code)
		}
	}
	if starts != 1 || stops != 1 {
		t.Fatal(starts, stops)
	}
}

func TestServiceAndSandbox(t *testing.T) {
	m := Manifest{UID: 501, Instance: "0123456789abcdef", DataRoot: `/Users/test/Library/Application Support/Quote " App/cheezy`}
	plist := launchPlist(m)
	if strings.Contains(plist, m.DataRoot) {
		t.Fatal("user-controlled paths must not be interpolated into plist")
	}
	for _, s := range []string{m.label(), m.dir() + "/cheezy-helper", "--serve", "ExitTimeOut"} {
		if !strings.Contains(plist, s) {
			t.Fatal("missing", s)
		}
	}
	policy := sandboxProfile(m)
	for _, s := range []string{"(deny file-write*)", "(deny file-read-data)", "(deny process-exec)", m.dir() + "/runtime", `Quote \" App`} {
		if !strings.Contains(policy, s) {
			t.Fatal("missing sandbox constraint", s)
		}
	}
	if strings.Contains(policy, `(allow file-write* (subpath "/Users`) {
		t.Fatal("privileged core must not write user-controlled directories")
	}
}

func TestSocketBoundary(t *testing.T) {
	// Darwin sockaddr_un has 104 bytes, including the terminating NUL.
	m := Manifest{UID: 2147483647, Instance: "0123456789abcdef"}
	if m.socket() != m.dir()+"/control.sock" || len(m.socket()) >= 104 {
		t.Fatalf("socket must stay inside the protected installation and fit sockaddr_un: %s", m.socket())
	}
}
