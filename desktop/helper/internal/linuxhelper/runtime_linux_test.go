package linuxhelper

import (
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestPeerUID(t *testing.T) {
	listener, err := net.Listen("unix", filepath.Join(t.TempDir(), "test.sock"))
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	done := make(chan error, 1)
	go func() {
		conn, err := net.Dial("unix", listener.Addr().String())
		if err == nil {
			defer conn.Close()
			_, err = peerUID(conn)
		}
		done <- err
	}()
	conn, err := listener.Accept()
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	uid, err := peerUID(conn)
	if err != nil || uid != uint32(os.Getuid()) {
		t.Fatalf("peer: %d %v", uid, err)
	}
	if err := <-done; err != nil {
		t.Fatal(err)
	}
}

func TestCoreLifecycle(t *testing.T) {
	home := t.TempDir()
	binary := filepath.Join(home, "test-core")
	config := filepath.Join(home, "config.yaml")
	if err := os.WriteFile(config, []byte("test"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(binary, []byte("#!/bin/sh\nexec sleep 300\n"), 0700); err != nil {
		t.Fatal(err)
	}
	p := &coreProcess{binary: binary}
	defer p.stop()
	req := StartRequest{Home: home, Config: config, SafePaths: home}
	if err := p.start(req); err != nil {
		t.Fatal(err)
	}
	oldDone := p.done
	if err := p.start(req); err != nil {
		t.Fatal(err)
	}
	select {
	case <-oldDone:
	default:
		t.Fatal("previous child was not reaped")
	}
	start := time.Now()
	p.stop()
	if time.Since(start) > 3*time.Second {
		t.Fatal("graceful stop timed out")
	}
	p.stop() // idempotent
	if p.cmd != nil {
		t.Fatal("child remains after stop")
	}
	if err := os.WriteFile(binary, []byte("#!/bin/sh\nexit 0\n"), 0700); err != nil {
		t.Fatal(err)
	}
	if err := p.start(req); err != nil {
		t.Fatal(err)
	}
	select {
	case <-p.done:
	case <-time.After(3 * time.Second):
		t.Fatal("natural exit was not reaped")
	}
	p.stop()
	req.Config = filepath.Join(home, "missing.yaml")
	if err := p.start(req); err == nil {
		t.Fatal("missing host config accepted")
	}
}

func TestSystemdUnitSyntax(t *testing.T) {
	analyze, err := exec.LookPath("systemd-analyze")
	if err != nil {
		t.Skip("systemd-analyze unavailable")
	}
	dir := t.TempDir()
	socket, service := units("1000")
	service = strings.ReplaceAll(service, installDir("1000")+"/cheezy-helper", "/usr/bin/true")
	socketFile := filepath.Join(dir, unitName("1000")+".socket")
	serviceFile := filepath.Join(dir, unitName("1000")+".service")
	if err := os.WriteFile(socketFile, []byte(socket), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(serviceFile, []byte(service), 0600); err != nil {
		t.Fatal(err)
	}
	if out, err := exec.Command(analyze, "verify", serviceFile, socketFile).CombinedOutput(); err != nil {
		t.Fatalf("unit verification: %s: %v", out, err)
	}
}
