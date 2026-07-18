//go:build windows

package main

import (
	"log"

	"golang.org/x/sys/windows/svc"
)

const serviceName = "CheezyHelperService"

type cheezyService struct{}

func (m *cheezyService) Execute(_ []string, r <-chan svc.ChangeRequest, changes chan<- svc.Status) (bool, uint32) {
	changes <- svc.Status{State: svc.StartPending}
	go func() {
		if err := runHTTP(); err != nil {
			log.Printf("http error: %v", err)
		}
	}()
	changes <- svc.Status{State: svc.Running, Accepts: svc.AcceptStop | svc.AcceptShutdown}
	for c := range r {
		switch c.Cmd {
		case svc.Interrogate:
			changes <- c.CurrentStatus
		case svc.Stop, svc.Shutdown:
			stopChild()
			changes <- svc.Status{State: svc.StopPending}
			return false, 0
		}
	}
	return false, 0
}

func main() {
	isService, err := svc.IsWindowsService()
	if err != nil {
		log.Fatal(err)
	}
	if isService {
		if err := svc.Run(serviceName, &cheezyService{}); err != nil {
			log.Fatal(err)
		}
		return
	}
	// Interactive / CI: run HTTP API in foreground
	if err := runHTTP(); err != nil {
		log.Fatal(err)
	}
}
