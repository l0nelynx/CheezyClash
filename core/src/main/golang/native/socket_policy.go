package main

//#include "bridge.h"
import "C"

import (
	"context"
	"sync"
	"unsafe"

	"golang.org/x/sync/semaphore"

	"cheezy/native/app"
	"cheezy/native/delegate"
)

var socketPolicyLock sync.Mutex
var activeSocketPolicy *remoteSocketPolicy

type remoteSocketPolicy struct {
	callback unsafe.Pointer
	limit    *semaphore.Weighted
	closed   bool
}

func (p *remoteSocketPolicy) markSocket(fd int) bool {
	_ = p.limit.Acquire(context.Background(), 1)
	defer p.limit.Release(1)
	if p.closed {
		return false
	}
	return C.mark_socket(p.callback, C.int(fd)) != 0
}

func (p *remoteSocketPolicy) querySocketUid(protocol int, source, target string) int {
	_ = p.limit.Acquire(context.Background(), 1)
	defer p.limit.Release(1)
	if p.closed {
		return -1
	}
	return int(C.query_socket_uid(p.callback, C.int(protocol), C.CString(source), C.CString(target)))
}

func (p *remoteSocketPolicy) close() {
	_ = p.limit.Acquire(context.Background(), 4)
	defer p.limit.Release(4)
	if p.closed {
		return
	}
	p.closed = true
	C.release_object(p.callback)
}

//export installSocketPolicy
func installSocketPolicy(callback unsafe.Pointer, tcpOnly C.int) {
	socketPolicyLock.Lock()
	defer socketPolicyLock.Unlock()
	if activeSocketPolicy != nil {
		activeSocketPolicy.close()
	}
	policy := &remoteSocketPolicy{callback: callback, limit: semaphore.NewWeighted(4)}
	activeSocketPolicy = policy
	delegate.SetTCPOnly(tcpOnly != 0)
	app.ApplyTunContext(policy.markSocket, policy.querySocketUid)
}

//export clearSocketPolicy
func clearSocketPolicy() {
	socketPolicyLock.Lock()
	defer socketPolicyLock.Unlock()
	if activeSocketPolicy != nil {
		activeSocketPolicy.close()
		activeSocketPolicy = nil
	}
	delegate.SetTCPOnly(false)
	app.ApplyTunContext(nil, nil)
}
