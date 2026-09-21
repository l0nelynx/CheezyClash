package linuxhelper

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strconv"
	"sync"
	"syscall"
	"time"

	"golang.org/x/sys/unix"
)

func Run(args []string) error {
	if len(args) == 3 && args[0] == "--install" {
		return install(args[1], args[2])
	}
	if len(args) == 2 && args[0] == "--uninstall" {
		return uninstall(args[1])
	}
	if len(args) != 1 || args[0] != "--serve" {
		return fmt.Errorf("usage: cheezy-helper --install UID CORE | --uninstall UID | --serve (systemd only)")
	}
	return serve()
}

func fileHash(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

// Resolve Atomic's /usr/local symlink, then verify every actual ancestor.
func trustedPath(path string) error {
	p, err := filepath.EvalSymlinks(path)
	if err != nil {
		return err
	}
	for {
		st, err := os.Stat(p)
		if err != nil {
			return err
		}
		if st.Sys().(*syscall.Stat_t).Uid != 0 || st.Mode().Perm()&0o022 != 0 {
			return fmt.Errorf("unsafe ownership or permissions: %s", p)
		}
		if p == "/" {
			return nil
		}
		p = filepath.Dir(p)
	}
}

type coreProcess struct {
	mu     sync.Mutex
	cmd    *exec.Cmd
	done   chan struct{}
	binary string
	closed bool
}

func (p *coreProcess) stopLocked() {
	if p.cmd == nil {
		return
	}
	_ = p.cmd.Process.Signal(syscall.SIGTERM)
	select {
	case <-p.done:
	case <-time.After(8 * time.Second):
		_ = p.cmd.Process.Kill()
		<-p.done
	}
	p.cmd = nil
}

func (p *coreProcess) stop() { p.mu.Lock(); defer p.mu.Unlock(); p.stopLocked() }

func (p *coreProcess) close() {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.closed = true
	p.stopLocked()
}

func (p *coreProcess) start(req StartRequest) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.closed {
		return fmt.Errorf("helper is shutting down")
	}
	if st, err := os.Stat(req.Config); err != nil || !st.Mode().IsRegular() {
		return fmt.Errorf("configuration is not a regular file accessible on the host")
	}
	if st, err := os.Stat(req.Home); err != nil || !st.IsDir() {
		return fmt.Errorf("core home is not a directory accessible on the host")
	}
	p.stopLocked()
	cmd := exec.Command(p.binary, "-d", req.Home, "-f", req.Config)
	// Never inherit loader/runtime injection variables from an interactive client.
	cmd.Env = []string{"PATH=/usr/sbin:/usr/bin:/sbin:/bin", "HOME=" + req.Home, "SAFE_PATHS=" + req.SafePaths}
	cmd.Dir = req.Home
	cmd.Stdout, cmd.Stderr = os.Stdout, os.Stderr
	cmd.SysProcAttr = &syscall.SysProcAttr{Pdeathsig: syscall.SIGTERM}
	if err := cmd.Start(); err != nil {
		return err
	}
	done := make(chan struct{})
	p.cmd, p.done = cmd, done
	go func() { err := cmd.Wait(); log.Printf("core exited: %v", err); close(done) }()
	return nil
}

type peerKey struct{}

func peerUID(conn net.Conn) (uint32, error) {
	u, ok := conn.(*net.UnixConn)
	if !ok {
		return 0, fmt.Errorf("Unix socket required")
	}
	raw, err := u.SyscallConn()
	if err != nil {
		return 0, err
	}
	var cred *unix.Ucred
	var sockErr error
	err = raw.Control(func(fd uintptr) { cred, sockErr = unix.GetsockoptUcred(int(fd), unix.SOL_SOCKET, unix.SO_PEERCRED) })
	if err != nil {
		return 0, err
	}
	if sockErr != nil {
		return 0, sockErr
	}
	return cred.Uid, nil
}

func serve() error {
	if os.Getuid() == 0 {
		return fmt.Errorf("run the system service as its configured non-root user")
	}
	if os.Getenv("LISTEN_PID") != strconv.Itoa(os.Getpid()) || os.Getenv("LISTEN_FDS") != "1" {
		return fmt.Errorf("systemd socket activation required")
	}
	var caps [2]unix.CapUserData
	header := unix.CapUserHeader{Version: unix.LINUX_CAPABILITY_VERSION_3}
	if err := unix.Capget(&header, &caps[0]); err != nil {
		return err
	}
	if caps[0].Effective&(1<<unix.CAP_NET_ADMIN) == 0 {
		return fmt.Errorf("service is missing CAP_NET_ADMIN")
	}
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	core := filepath.Join(filepath.Dir(exe), "mihomo")
	if err := trustedPath(core); err != nil {
		return err
	}
	hash, err := fileHash(core)
	if err != nil {
		return err
	}
	helperHash, err := fileHash(exe)
	if err != nil {
		return err
	}
	ns, err := os.Readlink("/proc/self/ns/net")
	if err != nil {
		return err
	}
	f := os.NewFile(3, "systemd-socket")
	listener, err := net.FileListener(f)
	_ = f.Close()
	if err != nil {
		return err
	}
	defer listener.Close()
	if listener.Addr().Network() != "unix" {
		return fmt.Errorf("Unix socket required")
	}
	p := &coreProcess{binary: core}
	defer p.close()
	api := handler(ns, hash, helperHash, p.start, p.stop)
	server := &http.Server{
		ReadHeaderTimeout: 3 * time.Second, ReadTimeout: 5 * time.Second, WriteTimeout: 20 * time.Second, IdleTimeout: 5 * time.Second,
		ConnContext: func(ctx context.Context, conn net.Conn) context.Context {
			uid, err := peerUID(conn)
			return context.WithValue(ctx, peerKey{}, err == nil && uid == uint32(os.Getuid()))
		},
		Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Context().Value(peerKey{}) != true || r.Header.Get("Origin") != "" {
				http.Error(w, "forbidden", 403)
				return
			}
			api.ServeHTTP(w, r)
		}),
	}
	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer cancel()
	go func() { <-ctx.Done(); _ = server.Close() }()
	err = server.Serve(listener)
	if err == http.ErrServerClosed {
		return nil
	}
	return err
}
