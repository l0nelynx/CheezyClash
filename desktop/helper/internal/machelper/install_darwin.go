package machelper

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"golang.org/x/sys/unix"
)

func fileHash(p string) (string, error) {
	f, err := os.Open(p)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err = io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

func trustedPath(p string) error {
	// Darwin's /var is a system symlink; validate the resolved path and ancestors.
	resolved, err := filepath.EvalSymlinks(p)
	if err != nil {
		return err
	}
	for {
		st, err := os.Stat(resolved)
		if err != nil {
			return err
		}
		if st.Sys().(*syscall.Stat_t).Uid != 0 || st.Mode().Perm()&0o022 != 0 {
			return fmt.Errorf("unsafe system path ownership or permissions: %s", resolved)
		}
		if resolved == "/" {
			return nil
		}
		resolved = filepath.Dir(resolved)
	}
}

func systemDir(p string) error {
	if _, err := os.Lstat(p); os.IsNotExist(err) {
		if err := trustedPath(filepath.Dir(p)); err != nil {
			return err
		}
		if err := os.Mkdir(p, 0o755); err != nil {
			return err
		}
	}
	// Never accept an existing redirect at an application-owned system path.
	st, err := os.Lstat(p)
	if err != nil {
		return err
	}
	if !st.IsDir() {
		return fmt.Errorf("expected a system directory: %s", p)
	}
	return trustedPath(p)
}

func writeAtomic(p string, src io.Reader, mode os.FileMode) error {
	f, err := os.CreateTemp(filepath.Dir(p), ".install-")
	if err != nil {
		return err
	}
	defer os.Remove(f.Name())
	defer f.Close()
	if _, err := io.Copy(f, src); err != nil {
		return err
	}
	if err := f.Chmod(mode); err != nil {
		return err
	}
	if err := f.Sync(); err != nil {
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}
	return os.Rename(f.Name(), p)
}

func copyBinary(src, dst, expected string) error {
	f, err := os.Open(src)
	if err != nil {
		return err
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		return err
	}
	if !st.Mode().IsRegular() {
		return fmt.Errorf("expected a regular executable")
	}
	if err := writeAtomic(dst, f, 0o755); err != nil {
		return err
	}
	actual, err := fileHash(dst)
	if err != nil {
		return err
	}
	if len(expected) != 64 || actual != expected {
		return fmt.Errorf("executable changed during setup; try again")
	}
	return nil
}

func launchctl(args ...string) error {
	cmd := exec.Command("/bin/launchctl", args...)
	cmd.Env = []string{"PATH=/usr/bin:/bin:/usr/sbin:/sbin"}
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("launchctl %s: %s: %w", strings.Join(args, " "), strings.TrimSpace(string(out)), err)
	}
	return nil
}

func installerLock() (*os.File, error) {
	if err := trustedPath("/var/run"); err != nil {
		return nil, err
	}
	fd, err := unix.Open("/var/run/com.cheezy.tun.install.lock", unix.O_CREAT|unix.O_RDWR|unix.O_NOFOLLOW|unix.O_CLOEXEC, 0o600)
	if err != nil {
		return nil, err
	}
	f := os.NewFile(uintptr(fd), "installer-lock")
	if err := unix.Flock(fd, unix.LOCK_EX|unix.LOCK_NB); err != nil {
		f.Close()
		return nil, fmt.Errorf("another service setup is running")
	}
	return f, nil
}

func readManifest(dir string) (Manifest, error) {
	var m Manifest
	if err := trustedPath(dir + "/manifest.json"); err != nil {
		return m, err
	}
	b, err := os.ReadFile(dir + "/manifest.json")
	if err != nil {
		return m, err
	}
	if err := json.Unmarshal(b, &m); err != nil {
		return m, err
	}
	if err := validID(strconv.Itoa(m.UID), m.Instance); err != nil {
		return m, err
	}
	if m.dir() != dir {
		return m, fmt.Errorf("installation identity mismatch")
	}
	return m, nil
}

func install(args []string) error {
	// UID INSTANCE DATA_ROOT CORE CORE_HASH HELPER_HASH
	if os.Geteuid() != 0 {
		return fmt.Errorf("administrator authorization required")
	}
	if err := validID(args[0], args[1]); err != nil {
		return err
	}
	uid, _ := strconv.Atoi(args[0])
	u, err := user.LookupId(args[0])
	if err != nil {
		return err
	}
	data, err := filepath.EvalSymlinks(args[2])
	if err != nil {
		return err
	}
	home, err := filepath.EvalSymlinks(u.HomeDir)
	if err != nil {
		return err
	}
	// Pin this instance to the requesting user's application storage, not arbitrary
	// filesystem paths. In particular, never give a client a writable sandbox at /.
	prefix := filepath.Join(home, "Library", "Application Support") + "/"
	if !strings.HasPrefix(data, prefix) || filepath.Base(data) != "cheezy" || strings.ContainsAny(data, "\x00\r\n") {
		return fmt.Errorf("application data must be in the user's Library/Application Support")
	}
	st, err := os.Stat(data)
	if err != nil {
		return err
	}
	if !st.IsDir() || int(st.Sys().(*syscall.Stat_t).Uid) != uid {
		return fmt.Errorf("application data must belong to the requesting user")
	}
	m := Manifest{UID: uid, Instance: args[1], DataRoot: data, CoreHash: args[4], HelperHash: args[5]}
	instanceHash := sha256.Sum256([]byte(data))
	if hex.EncodeToString(instanceHash[:])[:16] != m.Instance {
		return fmt.Errorf("installation identifier must match application storage")
	}
	lock, err := installerLock()
	if err != nil {
		return err
	}
	defer lock.Close()
	for _, dir := range []string{"/Library/PrivilegedHelperTools", installRoot, m.dir(), "/Library/LaunchDaemons"} {
		if err := systemDir(dir); err != nil {
			return err
		}
	}
	if _, err := os.Lstat(m.dir() + "/manifest.json"); err == nil {
		old, err := readManifest(m.dir())
		if err != nil {
			return err
		}
		if old.DataRoot != data {
			return fmt.Errorf("another installation owns this service")
		}
	}
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	if err := copyBinary(exe, m.dir()+"/cheezy-helper.next", m.HelperHash); err != nil {
		return err
	}
	if err := copyBinary(args[3], m.dir()+"/mihomo.next", m.CoreHash); err != nil {
		return err
	}
	// Validate the configuration before touching an existing service.
	plist := launchPlist(m)
	if err := writeAtomic(m.dir()+"/service.next.plist", strings.NewReader(plist), 0o644); err != nil {
		return err
	}
	if out, err := exec.Command("/usr/bin/plutil", "-lint", m.dir()+"/service.next.plist").CombinedOutput(); err != nil {
		return fmt.Errorf("invalid service: %s: %w", out, err)
	}
	if err := unload(m); err != nil {
		return err
	}
	for _, name := range []string{"cheezy-helper", "mihomo"} {
		if err := os.Rename(m.dir()+"/"+name+".next", m.dir()+"/"+name); err != nil {
			return err
		}
	}
	b, _ := json.Marshal(m)
	if err := writeAtomic(m.dir()+"/manifest.json", strings.NewReader(string(b)), 0o644); err != nil {
		return err
	}
	if err := writeAtomic(m.plist(), strings.NewReader(plist), 0o644); err != nil {
		return err
	}
	_ = os.Remove(m.dir() + "/service.next.plist")
	if err := launchctl("enable", "system/"+m.label()); err != nil {
		return err
	}
	return launchctl("bootstrap", "system", m.plist())
}

func unload(m Manifest) error {
	if err := launchctl("print", "system/"+m.label()); err != nil {
		return nil
	}
	if err := launchctl("bootout", "system/"+m.label()); err != nil {
		return err
	}
	for i := 0; i < 60; i++ {
		if err := launchctl("print", "system/"+m.label()); err != nil {
			return nil
		}
		time.Sleep(250 * time.Millisecond)
	}
	return fmt.Errorf("service did not stop; files were not replaced")
}

func uninstall(uid, instance string) error {
	if os.Geteuid() != 0 {
		return fmt.Errorf("administrator authorization required")
	}
	if err := validID(uid, instance); err != nil {
		return err
	}
	n, _ := strconv.Atoi(uid)
	m := Manifest{UID: n, Instance: instance}
	lock, err := installerLock()
	if err != nil {
		return err
	}
	defer lock.Close()
	if _, err := os.Lstat(m.dir()); os.IsNotExist(err) {
		return nil
	}
	if err := trustedPath(m.dir()); err != nil {
		return err
	}
	// A failed first installation may have staged files but no manifest yet.
	if _, err := os.Lstat(m.dir() + "/manifest.json"); err == nil {
		if _, err := readManifest(m.dir()); err != nil {
			return err
		}
	} else if !os.IsNotExist(err) {
		return err
	}
	if err := trustedPath("/Library/LaunchDaemons"); err != nil {
		return err
	}
	if err := unload(m); err != nil {
		return err
	}
	// Only known files; never recursively delete user-provided paths.
	runtime := m.dir() + "/runtime"
	if _, err := os.Lstat(runtime); err == nil {
		if err := trustedPath(runtime); err != nil {
			return err
		}
		st, err := os.Lstat(runtime)
		if err != nil || !st.IsDir() {
			return fmt.Errorf("invalid runtime directory")
		}
		if err := os.RemoveAll(runtime); err != nil {
			return err
		}
	}
	for _, p := range []string{m.plist(), m.socket(), m.dir() + "/cheezy-helper", m.dir() + "/mihomo", m.dir() + "/manifest.json", m.dir() + "/cheezy-helper.next", m.dir() + "/mihomo.next", m.dir() + "/service.next.plist", m.dir() + "/helper.log"} {
		if err := os.Remove(p); err != nil && !os.IsNotExist(err) {
			return err
		}
	}
	return os.Remove(m.dir())
}
