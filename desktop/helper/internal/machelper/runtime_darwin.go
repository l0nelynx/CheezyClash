package machelper

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"os/user"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"golang.org/x/sys/unix"
)

func Run(args []string) error {
	if len(args) == 2 && args[0] == "--read-config" {
		if os.Geteuid() == 0 {
			return fmt.Errorf("configuration must be read as the desktop user")
		}
		f, err := os.Open(args[1])
		if err != nil {
			return err
		}
		defer f.Close()
		st, err := f.Stat()
		if err != nil {
			return err
		}
		if !st.Mode().IsRegular() || st.Size() > 32<<20 {
			return fmt.Errorf("configuration must be a regular file below 32 MiB")
		}
		b, err := io.ReadAll(io.LimitReader(f, (32<<20)+1))
		if err != nil {
			return err
		}
		if len(b) > 32<<20 {
			return fmt.Errorf("configuration too large")
		}
		_, err = os.Stdout.Write(b)
		return err
	}
	if len(args) == 7 && args[0] == "--install" {
		return install(args[1:])
	}
	if len(args) == 3 && args[0] == "--uninstall" {
		return uninstall(args[1], args[2])
	}
	if len(args) == 1 && args[0] == "--serve" {
		return serve()
	}
	return fmt.Errorf("usage: cheezy-helper --install UID INSTANCE DATA_ROOT CORE CORE_HASH HELPER_HASH | --uninstall UID INSTANCE | --serve")
}

func userIDs(uid int) (uint32, error) {
	u, err := user.LookupId(strconv.Itoa(uid))
	if err != nil {
		return 0, err
	}
	n, err := strconv.ParseUint(u.Gid, 10, 32)
	return uint32(n), err
}

type coreProcess struct {
	mu        sync.Mutex
	cmd       *exec.Cmd
	done      chan struct{}
	m         Manifest
	lease     time.Time
	closed    bool
	lastError string
	logMu     sync.Mutex
	logs      string
}

// A bounded tail is returned over the protected socket, including sandbox/startup
// failures. It never becomes a root-owned file in a user-controlled directory.
func (p *coreProcess) Write(b []byte) (int, error) {
	p.logMu.Lock()
	defer p.logMu.Unlock()
	p.logs += string(b)
	if len(p.logs) > 16384 {
		p.logs = p.logs[len(p.logs)-16384:]
	}
	return len(b), nil
}

func (p *coreProcess) runningLocked() bool {
	if p.cmd == nil {
		return false
	}
	select {
	case <-p.done:
		return false
	default:
		return true
	}
}

func (p *coreProcess) status() any {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.logMu.Lock()
	defer p.logMu.Unlock()
	return map[string]any{"identity": Identity, "core_hash": p.m.CoreHash, "helper_hash": p.m.HelperHash,
		"data_root": p.m.DataRoot, "running": p.runningLocked(), "last_error": p.lastError, "log_tail": p.logs}
}

func (p *coreProcess) stopLocked() {
	if p.cmd == nil {
		return
	}
	if p.runningLocked() {
		_ = p.cmd.Process.Signal(syscall.SIGTERM)
		select {
		case <-p.done:
		case <-time.After(8 * time.Second):
			_ = p.cmd.Process.Kill()
			<-p.done
		}
	}
	p.cmd = nil
}

func (p *coreProcess) stop()      { p.mu.Lock(); defer p.mu.Unlock(); p.stopLocked() }
func (p *coreProcess) close()     { p.mu.Lock(); defer p.mu.Unlock(); p.closed = true; p.stopLocked() }
func (p *coreProcess) heartbeat() { p.mu.Lock(); defer p.mu.Unlock(); p.lease = time.Now() }
func (p *coreProcess) expire() {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.runningLocked() && time.Since(p.lease) > 90*time.Second {
		p.lastError = "The application stopped responding; TUN was disconnected."
		p.stopLocked()
	}
}

func (p *coreProcess) start() error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.closed {
		return fmt.Errorf("service is shutting down")
	}
	if hash, err := fileHash(p.m.dir() + "/mihomo"); err != nil || hash != p.m.CoreHash {
		return fmt.Errorf("installed core integrity check failed; repair the service")
	}
	root, err := filepath.EvalSymlinks(p.m.DataRoot)
	if err != nil || root != p.m.DataRoot {
		return fmt.Errorf("application storage moved; repair the service")
	}
	config := filepath.Join(root, "home", "running-config.yaml")
	resolved, err := filepath.EvalSymlinks(config)
	if err != nil || !strings.HasPrefix(resolved, root+"/") {
		return fmt.Errorf("configuration must stay in application storage")
	}
	// Read as the authorizing user, preventing a root-only config file from being
	// imported through a path race. The sandbox still guards all subsequent reads.
	readContext, cancelRead := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancelRead()
	cmdRead := exec.CommandContext(readContext, p.m.dir()+"/cheezy-helper", "--read-config", config)
	u, err := userIDs(p.m.UID)
	if err != nil {
		return err
	}
	cmdRead.SysProcAttr = &syscall.SysProcAttr{Credential: &syscall.Credential{Uid: uint32(p.m.UID), Gid: u}}
	cmdRead.Env = []string{"PATH=/usr/bin:/bin"}
	payload, err := cmdRead.Output()
	if err != nil {
		return fmt.Errorf("cannot read application configuration: %w", err)
	}
	runtime := p.m.dir() + "/runtime"
	if err := systemDir(runtime); err != nil {
		return err
	}
	if err := os.Chmod(runtime, 0o700); err != nil {
		return err
	}
	if err := systemDir(runtime + "/tmp"); err != nil {
		return err
	}
	if err := writeAtomic(runtime+"/config.yaml", strings.NewReader(string(payload)), 0o600); err != nil {
		return err
	}
	p.stopLocked()
	p.logMu.Lock()
	p.logs = ""
	p.logMu.Unlock()
	cmd := exec.Command("/usr/bin/sandbox-exec", "-p", sandboxProfile(p.m), p.m.dir()+"/mihomo", "-d", runtime, "-f", runtime+"/config.yaml")
	cmd.Dir = runtime
	cmd.Env = []string{"PATH=/usr/bin:/bin:/usr/sbin:/sbin", "HOME=" + runtime, "TMPDIR=" + runtime + "/tmp", "SAFE_PATHS=" + root + ":" + runtime}
	cmd.Stdout, cmd.Stderr = p, p
	if err := cmd.Start(); err != nil {
		return err
	}
	done := make(chan struct{})
	p.cmd, p.done, p.lease, p.lastError = cmd, done, time.Now(), ""
	go func() {
		err := cmd.Wait()
		if err != nil {
			_, _ = p.Write([]byte(fmt.Sprintf("\ncore exited: %v\n", err)))
		}
		close(done)
	}()
	// Report immediate executable / sandbox errors instead of claiming readiness.
	select {
	case <-done:
		p.lastError = "The TUN core exited during startup. Open Logs for details."
		return fmt.Errorf("%s", p.lastError)
	case <-time.After(300 * time.Millisecond):
		return nil
	}
}

func peerUID(conn net.Conn) (uint32, error) {
	u, ok := conn.(*net.UnixConn)
	if !ok {
		return 0, fmt.Errorf("Unix socket required")
	}
	raw, err := u.SyscallConn()
	if err != nil {
		return 0, err
	}
	var cred *unix.Xucred
	var sockErr error
	err = raw.Control(func(fd uintptr) { cred, sockErr = unix.GetsockoptXucred(int(fd), unix.SOL_LOCAL, unix.LOCAL_PEERCRED) })
	if err != nil {
		return 0, err
	}
	if sockErr != nil {
		return 0, sockErr
	}
	return cred.Uid, nil
}

type peerKey struct{}

func serve() error {
	if os.Geteuid() != 0 {
		return fmt.Errorf("run the installed launchd service")
	}
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	if err := trustedPath(exe); err != nil {
		return err
	}
	m, err := readManifest(filepath.Dir(exe))
	if err != nil {
		return err
	}
	for file, expected := range map[string]string{"cheezy-helper": m.HelperHash, "mihomo": m.CoreHash} {
		if err := trustedPath(m.dir() + "/" + file); err != nil {
			return err
		}
		actual, err := fileHash(m.dir() + "/" + file)
		if err != nil || actual != expected {
			return fmt.Errorf("installed executable integrity check failed")
		}
	}
	if err := trustedPath("/var/run"); err != nil {
		return err
	}
	if st, err := os.Lstat(m.socket()); err == nil {
		if st.Mode()&os.ModeSocket == 0 {
			return fmt.Errorf("unexpected file at service socket")
		}
		if err := os.Remove(m.socket()); err != nil {
			return err
		}
	}
	// Restrictive from creation; there is no world-accessible listen/chmod window.
	oldMask := syscall.Umask(0o077)
	listener, err := net.Listen("unix", m.socket())
	syscall.Umask(oldMask)
	if err != nil {
		return err
	}
	defer listener.Close()
	defer os.Remove(m.socket())
	if err := os.Chown(m.socket(), m.UID, -1); err != nil {
		return err
	}
	p := &coreProcess{m: m}
	defer p.close()
	api := handler(m, p.status, p.start, p.stop, p.heartbeat)
	server := &http.Server{ReadHeaderTimeout: 3 * time.Second, ReadTimeout: 5 * time.Second, WriteTimeout: 20 * time.Second, IdleTimeout: 5 * time.Second,
		ConnContext: func(ctx context.Context, c net.Conn) context.Context {
			uid, err := peerUID(c)
			return context.WithValue(ctx, peerKey{}, err == nil && uid == uint32(m.UID))
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
	go func() {
		ticker := time.NewTicker(10 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				_ = server.Close()
				return
			case <-ticker.C:
				p.expire()
			}
		}
	}()
	if err := server.Serve(listener); err != http.ErrServerClosed {
		return err
	}
	return nil
}
