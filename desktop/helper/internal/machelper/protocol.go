// Package machelper implements the macOS launchd service. The unsigned client is
// authenticated as an OS user, not as a cryptographically identified application.
package machelper

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"path"
	"regexp"
	"strconv"
	"strings"
)

const Identity = "CheezyHelper/macOS/1"
const installRoot = "/Library/PrivilegedHelperTools/com.cheezy.tun"

type Manifest struct {
	UID        int    `json:"uid"`
	Instance   string `json:"instance"`
	DataRoot   string `json:"data_root"`
	CoreHash   string `json:"core_hash"`
	HelperHash string `json:"helper_hash"`
}

func validID(uid, instance string) error {
	n, err := strconv.ParseUint(uid, 10, 31)
	if err != nil || n == 0 || strconv.FormatUint(n, 10) != uid || !regexp.MustCompile(`^[a-f0-9]{16}$`).MatchString(instance) {
		return fmt.Errorf("invalid user or installation identifier")
	}
	return nil
}

func (m Manifest) key() string    { return strconv.Itoa(m.UID) + "." + m.Instance }
func (m Manifest) dir() string    { return installRoot + "/" + m.key() }
func (m Manifest) label() string  { return "com.cheezy.tun." + m.key() }
func (m Manifest) plist() string  { return "/Library/LaunchDaemons/" + m.label() + ".plist" }
func (m Manifest) socket() string { return m.dir() + "/control.sock" }

func launchPlist(m Manifest) string {
	// Identifiers are validated before reaching here; no user-controlled paths in XML.
	return fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>%s</string>
<key>ProgramArguments</key><array><string>%s/cheezy-helper</string><string>--serve</string></array>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><true/>
<key>ThrottleInterval</key><integer>5</integer>
<key>ExitTimeOut</key><integer>15</integer>
<key>Umask</key><integer>18</integer>
<key>ProcessType</key><string>Interactive</string>
<key>StandardErrorPath</key><string>%s/helper.log</string>
</dict></plist>
`, m.label(), m.dir(), m.dir())
}

// Constrain the privileged core's file access, including config-driven downloads
// and controller APIs. Seatbelt checks resolved targets, so symlinks cannot
// redirect writes out of the protected runtime directory. This is a
// filesystem/exec boundary, not an App Sandbox entitlement or network sandbox.
func sandboxProfile(m Manifest) string {
	q := strconv.Quote
	var b strings.Builder
	b.WriteString("(version 1)\n(allow default)\n(deny file-read-data)\n(deny file-write*)\n(deny process-exec)\n(deny signal)\n(allow signal (target self))\n")
	for _, dir := range []string{"/System", "/usr/lib", "/usr/share", "/private/var/db/dyld", m.DataRoot, m.dir()} {
		fmt.Fprintf(&b, "(allow file-read-data (subpath %s))\n", q(dir))
	}
	for _, file := range []string{"/private/etc/hosts", "/private/etc/resolv.conf", "/private/var/run/resolv.conf", "/private/etc/localtime", "/Library/Keychains/System.keychain", "/dev/null", "/dev/random", "/dev/urandom", "/usr/bin/dscacheutil"} {
		fmt.Fprintf(&b, "(allow file-read-data (literal %s))\n", q(file))
	}
	fmt.Fprintf(&b, "(allow file-write* (subpath %s) (literal \"/dev/null\"))\n", q(path.Join(m.dir(), "runtime")))
	fmt.Fprintf(&b, "(allow process-exec (literal %s) (literal \"/usr/bin/dscacheutil\"))\n", q(m.dir()+"/mihomo"))
	return b.String()
}

type startRequest struct {
	CoreHash string `json:"core_hash"`
}

func decodeStart(r io.Reader, hash string) error {
	var p startRequest
	d := json.NewDecoder(r)
	d.DisallowUnknownFields()
	if err := d.Decode(&p); err != nil {
		return err
	}
	if err := d.Decode(new(any)); err != io.EOF {
		return fmt.Errorf("expected one JSON object")
	}
	if p.CoreHash != hash {
		return fmt.Errorf("installed core differs from the app; repair the TUN service")
	}
	return nil
}

func handler(m Manifest, status func() any, start func() error, stop func(), heartbeat func()) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/ping", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.WriteHeader(405)
			return
		}
		_ = json.NewEncoder(w).Encode(status())
	})
	mux.HandleFunc("/start", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(405)
			return
		}
		if err := decodeStart(http.MaxBytesReader(w, r.Body, 1024), m.CoreHash); err != nil {
			http.Error(w, err.Error(), 400)
			return
		}
		if err := start(); err != nil {
			http.Error(w, err.Error(), 500)
		}
	})
	mux.HandleFunc("/stop", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(405)
			return
		}
		stop()
	})
	mux.HandleFunc("/heartbeat", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(405)
			return
		}
		heartbeat()
	})
	return mux
}
