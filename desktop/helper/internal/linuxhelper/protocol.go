// Package linuxhelper implements the Linux-only, socket-activated TUN service.
package linuxhelper

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"path"
	"strings"
)

const Identity = "CheezyHelper/Linux/2"

type StartRequest struct {
	Home      string `json:"home"`
	Config    string `json:"config"`
	SafePaths string `json:"safe_paths"`
	NetworkNS string `json:"network_ns"`
	CoreHash  string `json:"core_hash"`
}

func decodeStart(r io.Reader, namespace, hash string) (StartRequest, error) {
	var p StartRequest
	d := json.NewDecoder(r)
	d.DisallowUnknownFields()
	if err := d.Decode(&p); err != nil {
		return p, err
	}
	if err := d.Decode(new(any)); err != io.EOF {
		return p, fmt.Errorf("expected one JSON object")
	}
	if p.NetworkNS == "" || p.NetworkNS != namespace {
		return p, fmt.Errorf("client and helper must share the host network namespace; run CheezyClash on the host")
	}
	if p.CoreHash != hash {
		return p, fmt.Errorf("installed core differs from the application; repair the Linux helper on the host")
	}
	for _, path := range append([]string{p.Home, p.Config}, strings.Split(p.SafePaths, ":")...) {
		if !validHostPath(path) {
			return p, fmt.Errorf("expected absolute host paths")
		}
	}
	return p, nil
}

func validHostPath(p string) bool { return path.IsAbs(p) && !strings.ContainsAny(p, "\x00\r\n") }

// No executable path, shell arguments, allowlist updates or file replacement API.
func handler(namespace, hash, helperHash string, start func(StartRequest) error, stop func()) http.Handler {
	m := http.NewServeMux()
	m.HandleFunc("/ping", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.WriteHeader(405)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]string{"identity": Identity, "core_hash": hash, "helper_hash": helperHash, "network_ns": namespace})
	})
	m.HandleFunc("/start", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(405)
			return
		}
		p, err := decodeStart(http.MaxBytesReader(w, r.Body, 64<<10), namespace, hash)
		if err != nil {
			http.Error(w, err.Error(), 400)
			return
		}
		if err := start(p); err != nil {
			http.Error(w, err.Error(), 500)
		}
	})
	m.HandleFunc("/stop", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(405)
			return
		}
		stop()
	})
	return m
}
