package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sync"

	"github.com/gorilla/mux"
)

const listenAddr = "127.0.0.1:47991"
const identity = "CheezyHelper/1"

// TOKEN is overwritten at build: -ldflags "-X main.TOKEN=<sha256>"
var TOKEN = "dev-allow-any"

type StartParams struct {
	Path    string  `json:"path"`
	Arg     string  `json:"arg"`
	HomeDir *string `json:"home_dir"`
}

type ReplaceParams struct {
	Pending string `json:"pending"`
	Target  string `json:"target"`
}

var (
	procMu sync.Mutex
	child  *exec.Cmd
)

func sha256File(path string) (string, error) {
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

func allowedHash() string {
	exe, err := os.Executable()
	if err == nil {
		p := filepath.Join(filepath.Dir(exe), "allowed_core.sha256")
		if b, err := os.ReadFile(p); err == nil {
			s := string(bytesTrim(b))
			if len(s) == 64 {
				return s
			}
		}
	}
	return TOKEN
}

func bytesTrim(b []byte) []byte {
	for len(b) > 0 && (b[len(b)-1] == '\n' || b[len(b)-1] == '\r' || b[len(b)-1] == ' ') {
		b = b[:len(b)-1]
	}
	return b
}

func stopChild() {
	procMu.Lock()
	defer procMu.Unlock()
	if child != nil && child.Process != nil {
		_ = child.Process.Kill()
		_, _ = child.Process.Wait()
		child = nil
	}
}

func handlePing(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("X-Cheezy-Helper", identity)
	_, _ = w.Write([]byte(identity + "\n" + allowedHash()))
}

func handleWhoami(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain")
	_, _ = w.Write([]byte(identity))
}

type AllowParams struct {
	Path string `json:"path"`
	Hash string `json:"hash"`
}

func writeAllowedHash(sum string) error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(filepath.Dir(exe), "allowed_core.sha256"), []byte(sum), 0o644)
}

func handleAllow(w http.ResponseWriter, r *http.Request) {
	var p AllowParams
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, err.Error(), 400)
		return
	}
	sum := p.Hash
	if sum == "" && p.Path != "" {
		var err error
		sum, err = sha256File(p.Path)
		if err != nil {
			_, _ = w.Write([]byte(err.Error()))
			return
		}
	}
	if len(sum) != 64 {
		_, _ = w.Write([]byte("invalid hash"))
		return
	}
	if err := writeAllowedHash(sum); err != nil {
		_, _ = w.Write([]byte(err.Error()))
		return
	}
	w.WriteHeader(200)
}

func handleStart(w http.ResponseWriter, r *http.Request) {
	var p StartParams
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, err.Error(), 400)
		return
	}
	sum, err := sha256File(p.Path)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}
	allow := allowedHash()
	if allow != "dev-allow-any" && sum != allow {
		msg := fmt.Sprintf(
			"The SHA256 hash of the program requesting execution is: %s. The helper program only allows execution of applications with the SHA256 hash: %s.",
			sum, allow,
		)
		_, _ = w.Write([]byte(msg))
		return
	}
	stopChild()
	procMu.Lock()
	defer procMu.Unlock()
	// Arg is a full argument string from Electron; split naively for -d/-f.
	args := splitArgs(p.Arg)
	cmd := exec.Command(p.Path, args...)
	if p.HomeDir != nil {
		cmd.Env = append(os.Environ(), "SAFE_PATHS="+*p.HomeDir)
	}
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Start(); err != nil {
		_, _ = w.Write([]byte(err.Error()))
		return
	}
	child = cmd
	go func() {
		_ = cmd.Wait()
		procMu.Lock()
		if child == cmd {
			child = nil
		}
		procMu.Unlock()
	}()
	w.WriteHeader(200)
}

func splitArgs(s string) []string {
	var out []string
	var cur []rune
	inQuote := false
	for _, r := range s {
		switch {
		case r == '"':
			inQuote = !inQuote
		case r == ' ' && !inQuote:
			if len(cur) > 0 {
				out = append(out, string(cur))
				cur = cur[:0]
			}
		default:
			cur = append(cur, r)
		}
	}
	if len(cur) > 0 {
		out = append(out, string(cur))
	}
	return out
}

func handleStop(w http.ResponseWriter, _ *http.Request) {
	stopChild()
	w.WriteHeader(200)
}

func handleReplace(w http.ResponseWriter, r *http.Request) {
	var p ReplaceParams
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, err.Error(), 400)
		return
	}
	stopChild()
	if err := os.Rename(p.Pending, p.Target); err != nil {
		data, rerr := os.ReadFile(p.Pending)
		if rerr != nil {
			_, _ = w.Write([]byte(err.Error()))
			return
		}
		if werr := os.WriteFile(p.Target, data, 0o755); werr != nil {
			_, _ = w.Write([]byte(werr.Error()))
			return
		}
		_ = os.Remove(p.Pending)
	}
	if sum, err := sha256File(p.Target); err == nil {
		exe, _ := os.Executable()
		_ = os.WriteFile(filepath.Join(filepath.Dir(exe), "allowed_core.sha256"), []byte(sum), 0o644)
	}
	w.WriteHeader(200)
}

func runHTTP() error {
	r := mux.NewRouter()
	r.HandleFunc("/ping", handlePing).Methods("GET")
	r.HandleFunc("/whoami", handleWhoami).Methods("GET")
	r.HandleFunc("/start", handleStart).Methods("POST")
	r.HandleFunc("/stop", handleStop).Methods("POST")
	r.HandleFunc("/replace_core", handleReplace).Methods("POST")
	r.HandleFunc("/allow", handleAllow).Methods("POST")
	log.Printf("cheezy helper listening on %s (%s/%s)", listenAddr, runtime.GOOS, runtime.GOARCH)
	return http.ListenAndServe(listenAddr, r)
}
