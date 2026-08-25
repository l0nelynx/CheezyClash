package main

//#include "bridge.h"
import "C"

import (
	"context"
	"io"
	"sync"
	"sync/atomic"
	"unsafe"

	"golang.org/x/sync/semaphore"

	"cheezy/native/app"
	"cheezy/native/tun"
)

var rTunLock sync.Mutex
var rTun *remoteTun

type remoteTun struct {
	closer   io.Closer
	callback unsafe.Pointer

	closed atomic.Bool
	limit  *semaphore.Weighted
}

func (t *remoteTun) markSocket(fd int) bool {
	_ = t.limit.Acquire(context.Background(), 1)
	defer t.limit.Release(1)

	if t.closed.Load() {
		return false
	}

	return C.mark_socket(t.callback, C.int(fd)) != 0
}

func (t *remoteTun) querySocketUid(protocol int, source, target string) int {
	_ = t.limit.Acquire(context.Background(), 1)
	defer t.limit.Release(1)

	if t.closed.Load() {
		return -1
	}

	return int(C.query_socket_uid(t.callback, C.int(protocol), C.CString(source), C.CString(target)))
}

func (t *remoteTun) close() {
	if !t.closed.CompareAndSwap(false, true) {
		return
	}

	// Stop publishing callbacks before tearing the listener down. Calls already
	// in flight keep their semaphore permit and the JNI object remains alive
	// until they return; newly arriving calls observe closed=true and fail fast.
	app.ApplyTunContext(nil, nil)

	// Closing the listener closes the TUN fd. This must happen before waiting for
	// cellular Network.bindSocket/protect callbacks, otherwise one stuck Binder
	// call can keep Android's VPN interface alive indefinitely.
	if t.closer != nil {
		_ = t.closer.Close()
	}

	_ = t.limit.Acquire(context.Background(), 4)
	defer t.limit.Release(4)

	C.release_object(t.callback)
}

//export startTun
func startTun(fd C.int, stack, gateway, portal, dns C.c_string, callback unsafe.Pointer) C.int {
	rTunLock.Lock()
	defer rTunLock.Unlock()

	if rTun != nil {
		rTun.close()
		rTun = nil
	}

	f := int(fd)
	s := C.GoString(stack)
	g := C.GoString(gateway)
	p := C.GoString(portal)
	d := C.GoString(dns)

	remote := &remoteTun{callback: callback, limit: semaphore.NewWeighted(4)}

	app.ApplyTunContext(remote.markSocket, remote.querySocketUid)

	closer, err := tun.Start(f, s, g, p, d)
	if err != nil {
		remote.close()

		return 1
	}

	remote.closer = closer

	rTun = remote

	return 0
}

//export stopTun
func stopTun() {
	rTunLock.Lock()
	defer rTunLock.Unlock()

	if rTun != nil {
		rTun.close()
		rTun = nil
	}
}
