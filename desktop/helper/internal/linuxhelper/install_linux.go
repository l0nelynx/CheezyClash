package linuxhelper

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"strconv"
	"strings"

	"golang.org/x/sys/unix"
)

func checkInstaller(uid string) error {
	n, err := strconv.ParseUint(uid, 10, 32)
	if err != nil || n == 0 || strconv.FormatUint(n, 10) != uid {
		return fmt.Errorf("a non-root numeric UID is required")
	}
	if os.Geteuid() != 0 {
		return fmt.Errorf("installation requires host administrator authorization")
	}
	for _, key := range []string{"PKEXEC_UID", "SUDO_UID"} {
		if caller := os.Getenv(key); caller != "" && caller != "0" && caller != uid {
			return fmt.Errorf("UID must match the authorizing user")
		}
	}
	if _, err := user.LookupId(uid); err != nil {
		return err
	}
	if _, err := os.Stat("/run/systemd/system"); err != nil {
		return fmt.Errorf("a systemd host is required")
	}
	if _, err := os.Stat("/run/.containerenv"); err == nil {
		return fmt.Errorf("install on the host, outside Distrobox")
	}
	if _, err := os.Stat("/.dockerenv"); err == nil {
		return fmt.Errorf("install on the host, outside the container")
	}
	if os.Getenv("container") != "" {
		return fmt.Errorf("install on the host, outside the container")
	}
	return nil
}

func systemctl(args ...string) error {
	cmd := exec.Command("/usr/bin/systemctl", args...)
	cmd.Env = []string{"PATH=/usr/sbin:/usr/bin:/sbin:/bin"}
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("systemctl %s: %s: %w", strings.Join(args, " "), strings.TrimSpace(string(out)), err)
	}
	return nil
}

func installerLock() (*os.File, error) {
	// /run is root-owned; never follow a user-created lock symlink.
	fd, err := unix.Open("/run/cheezyclash-install.lock", unix.O_CREAT|unix.O_RDWR|unix.O_NOFOLLOW|unix.O_CLOEXEC, 0o600)
	if err != nil {
		return nil, err
	}
	f := os.NewFile(uintptr(fd), "install-lock")
	if err := unix.Flock(fd, unix.LOCK_EX|unix.LOCK_NB); err != nil {
		f.Close()
		return nil, fmt.Errorf("another helper installation is running")
	}
	return f, nil
}

func writeAtomic(path string, r io.Reader, mode os.FileMode) error {
	f, err := os.CreateTemp(filepath.Dir(path), ".cheezy-install-")
	if err != nil {
		return err
	}
	defer os.Remove(f.Name())
	defer f.Close()
	if _, err := io.Copy(f, r); err != nil {
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
	return os.Rename(f.Name(), path)
}

func copyBinary(source, target string) error {
	f, err := os.Open(source)
	if err != nil {
		return err
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		return err
	}
	if !st.Mode().IsRegular() {
		return fmt.Errorf("binary must be a regular file")
	}
	return writeAtomic(target, f, 0o755)
}

func install(uid, core string) error {
	if err := checkInstaller(uid); err != nil {
		return err
	}
	lock, err := installerLock()
	if err != nil {
		return err
	}
	defer lock.Close()
	// Check before mkdir too: do not traverse an attacker-controlled ancestor.
	for _, dir := range []string{"/usr/local", "/usr/local/libexec", installRoot, installDir(uid)} {
		if _, err := os.Lstat(dir); os.IsNotExist(err) {
			if err := trustedPath(filepath.Dir(dir)); err != nil {
				return err
			}
			if err := os.Mkdir(dir, 0o755); err != nil {
				return err
			}
		}
		if err := trustedPath(dir); err != nil {
			return err
		}
	}
	if err := trustedPath("/etc/systemd/system"); err != nil {
		return err
	}
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	// Stage both binaries before stopping a working installation.
	dir := installDir(uid)
	if err := copyBinary(exe, dir+"/cheezy-helper.next"); err != nil {
		return err
	}
	if err := copyBinary(core, dir+"/mihomo.next"); err != nil {
		return err
	}
	name := unitName(uid)
	if _, err := os.Stat("/etc/systemd/system/" + name + ".socket"); err == nil {
		if err := systemctl("stop", name+".socket", name+".service"); err != nil {
			return err
		}
	}
	for _, binary := range []string{"cheezy-helper", "mihomo"} {
		if err := os.Rename(dir+"/"+binary+".next", dir+"/"+binary); err != nil {
			return err
		}
	}
	socket, service := units(uid)
	for suffix, content := range map[string]string{".socket": socket, ".service": service} {
		if err := writeAtomic("/etc/systemd/system/"+name+suffix, strings.NewReader(content), 0o644); err != nil {
			return err
		}
	}
	// Keep SELinux enabled and use the distribution's file contexts when available.
	for _, restorecon := range []string{"/usr/sbin/restorecon", "/sbin/restorecon"} {
		if _, err := os.Stat(restorecon); err != nil {
			continue
		}
		cmd := exec.Command(restorecon, "-RF", dir, "/etc/systemd/system/"+name+".socket", "/etc/systemd/system/"+name+".service")
		if out, err := cmd.CombinedOutput(); err != nil {
			return fmt.Errorf("restorecon: %s: %w", out, err)
		}
		break
	}
	if err := systemctl("daemon-reload"); err != nil {
		return err
	}
	if err := systemctl("enable", "--now", name+".socket"); err != nil {
		return err
	}
	return systemctl("restart", name+".service")
}

func uninstall(uid string) error {
	if err := checkInstaller(uid); err != nil {
		return err
	}
	lock, err := installerLock()
	if err != nil {
		return err
	}
	defer lock.Close()
	name := unitName(uid)
	if err := trustedPath(installDir(uid)); err != nil {
		return err
	}
	if err := trustedPath("/etc/systemd/system"); err != nil {
		return err
	}
	if err := systemctl("disable", "--now", name+".socket"); err != nil {
		return err
	}
	if err := systemctl("stop", name+".service"); err != nil {
		return err
	}
	for _, path := range []string{
		"/etc/systemd/system/" + name + ".socket", "/etc/systemd/system/" + name + ".service",
		installDir(uid) + "/cheezy-helper", installDir(uid) + "/mihomo",
		installDir(uid) + "/cheezy-helper.next", installDir(uid) + "/mihomo.next",
	} {
		if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
			return err
		}
	}
	if err := os.Remove(installDir(uid)); err != nil {
		return err
	}
	return systemctl("daemon-reload")
}
