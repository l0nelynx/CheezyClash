package crashoutput

import (
	"bytes"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"testing"
)

func TestCrashOutputSubprocess(t *testing.T) {
	if mode := os.Getenv("CHEEZY_CRASH_TEST"); mode != "" {
		f, err := os.Create(os.Getenv("CHEEZY_CRASH_FILE"))
		if err != nil {
			panic(err)
		}
		if err := Configure(f); err != nil {
			panic(err)
		}
		// Runtime must own its duplicate even after the caller closes its FD.
		if err := f.Close(); err != nil {
			panic(err)
		}
		if mode == "disabled" {
			if err := Configure(nil); err != nil {
				panic(err)
			}
		}
		if mode == "fatal" {
			var mutex sync.Mutex
			mutex.Unlock() // runtime fatal, cannot be caught with recover
		}
		panic("PRIVATE_PANIC_TEXT")
	}
	for _, mode := range []string{"panic", "fatal", "disabled"} {
		t.Run(mode, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "crash.log")
			cmd := exec.Command(os.Args[0], "-test.run=^TestCrashOutputSubprocess$")
			cmd.Env = append(os.Environ(), "CHEEZY_CRASH_TEST="+mode, "CHEEZY_CRASH_FILE="+path)
			stderr, err := cmd.CombinedOutput()
			if err == nil {
				t.Fatal("child survived an unhandled fatal error")
			}
			data, err := os.ReadFile(path)
			if err != nil {
				t.Fatal(err)
			}
			if mode == "disabled" {
				if len(data) != 0 {
					t.Fatal("disabled output still wrote a dump")
				}
			} else if !bytes.Contains(data, []byte("output_test.go:")) {
				t.Fatalf("missing source frame: %s", data)
			}
			if !bytes.Contains(stderr, []byte("output_test.go:")) {
				t.Fatal("default stderr output was suppressed")
			}
		})
	}
}
