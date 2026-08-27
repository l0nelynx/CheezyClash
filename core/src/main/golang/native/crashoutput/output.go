// Package crashoutput configures a separate, process-lifetime Go crash stream.
// It does not recover panics or replace any signal handlers.
package crashoutput

import (
	"os"
	"runtime/debug"
	"sync"
)

var mu sync.Mutex

// Configure borrows file. SetCrashOutput duplicates the descriptor before return.
// A nil file disables the additional output, not the runtime's stderr traceback.
func Configure(file *os.File) error {
	mu.Lock()
	defer mu.Unlock()
	return debug.SetCrashOutput(file, debug.CrashOptions{})
}
