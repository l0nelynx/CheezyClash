package main

//#include "bridge.h"
import "C"

import (
	"strings"
	"time"
	"unsafe"

	"github.com/metacubex/mihomo/log"
)

type message struct {
	Level   string `json:"level"`
	Message string `json:"message"`
	Time    int64  `json:"time"`
}

const expectedControllerClose = "External controller serve error: http: Server closed"

func effectiveLogLevel(event log.Event) log.LogLevel {
	if event.LogLevel == log.ERROR && strings.TrimSpace(event.Payload) == expectedControllerClose {
		return log.DEBUG
	}
	return event.LogLevel
}

func init() {
	go func() {
		sub := log.Subscribe()
		defer log.UnSubscribe(sub)

		for msg := range sub {
			cPayload := C.CString(msg.Payload)
			level := effectiveLogLevel(msg)

			switch level {
			case log.INFO:
				C.log_info(cPayload)
			case log.ERROR:
				C.log_error(cPayload)
			case log.WARNING:
				C.log_warn(cPayload)
			case log.DEBUG:
				C.log_debug(cPayload)
			case log.SILENT:
				C.log_verbose(cPayload)
			}
		}
	}()
}

//export subscribeLogcat
func subscribeLogcat(remote unsafe.Pointer) {
	go func(remote unsafe.Pointer) {
		sub := log.Subscribe()
		defer log.UnSubscribe(sub)

		for msg := range sub {
			level := effectiveLogLevel(msg)
			if level < log.Level() && !strings.HasPrefix(msg.Payload, "[APP]") {
				continue
			}

			rMsg := &message{
				Level:   level.String(),
				Message: msg.Payload,
				Time:    time.Now().UnixNano() / 1000 / 1000,
			}

			if C.logcat_received(remote, marshalJson(rMsg)) != 0 {
				C.release_object(remote)

				log.Debugln("Logcat subscriber closed")

				break
			}
		}
	}(remote)

	log.Infoln("[APP] Logcat level: %s", log.Level().String())
}
