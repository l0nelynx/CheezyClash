package machelper

import (
	"crypto/rand"
	"encoding/hex"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"testing"
)

func TestPeerUID(t *testing.T) {
	socket := filepath.Join(t.TempDir(), "peer.sock")
	l, err := net.Listen("unix", socket)
	if err != nil {
		t.Fatal(err)
	}
	defer l.Close()
	done := make(chan error, 1)
	go func() {
		conn, err := net.Dial("unix", socket)
		if err == nil {
			defer conn.Close()
			_, err = conn.Write([]byte("x"))
		}
		done <- err
	}()
	conn, err := l.Accept()
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	uid, err := peerUID(conn)
	if err != nil || uid != uint32(os.Getuid()) {
		t.Fatalf("UID %d: %v", uid, err)
	}
	if err := <-done; err != nil {
		t.Fatal(err)
	}
}

// Run this test binary as root only on a disposable macOS CI runner. The actual
// production Seatbelt profile is used, with no extra allow rules for the probe.
func TestNativeSandbox(t *testing.T) {
	if os.Geteuid() != 0 {
		t.Skip("requires disposable macOS runner and sudo")
	}
	var id [8]byte
	if _, err := rand.Read(id[:]); err != nil {
		t.Fatal(err)
	}
	m := Manifest{UID: 501, Instance: hex.EncodeToString(id[:]), DataRoot: "/nonexistent/cheezy-test-data"}
	for _, dir := range []string{"/Library/PrivilegedHelperTools", installRoot, m.dir(), m.dir() + "/runtime"} {
		if err := systemDir(dir); err != nil {
			t.Fatal(err)
		}
	}
	defer os.RemoveAll(m.dir())
	exe, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	hash, err := fileHash(exe)
	if err != nil {
		t.Fatal(err)
	}
	if err := copyBinary(exe, m.dir()+"/mihomo", hash); err != nil {
		t.Fatal(err)
	}
	outside, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(outside+"/secret", []byte("root secret"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside+"/secret", m.dir()+"/runtime/read-link"); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside+"/write", m.dir()+"/runtime/write-link"); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command("/usr/bin/sandbox-exec", "-p", sandboxProfile(m), m.dir()+"/mihomo", "-test.run=^TestSandboxProbe$")
	cmd.Env = []string{"PATH=/usr/bin:/bin", "CHEEZY_SANDBOX_PROBE=" + m.dir() + "/runtime", "CHEEZY_OUTSIDE=" + outside}
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("sandbox: %s: %v", out, err)
	}
}

func TestSandboxProbe(t *testing.T) {
	runtime := os.Getenv("CHEEZY_SANDBOX_PROBE")
	if runtime == "" {
		t.Skip("sandbox child only")
	}
	if os.Geteuid() != 0 {
		t.Fatal("probe must verify root confinement")
	}
	if err := os.WriteFile(runtime+"/allowed", []byte("ok"), 0o600); err != nil {
		t.Fatal("allowed write:", err)
	}
	outside := os.Getenv("CHEEZY_OUTSIDE")
	for _, path := range []string{outside + "/write", runtime + "/write-link", filepath.Dir(runtime) + "/mihomo"} {
		if err := os.WriteFile(path, []byte("forbidden"), 0o600); err == nil {
			t.Fatal("write escaped sandbox:", path)
		}
	}
	for _, path := range []string{outside + "/secret", runtime + "/read-link"} {
		if _, err := os.ReadFile(path); err == nil {
			t.Fatal("read escaped sandbox:", path)
		}
	}
	if err := exec.Command("/bin/sh", "-c", "exit "+strconv.Itoa(0)).Run(); err == nil {
		t.Fatal("arbitrary process execution permitted")
	}
}
