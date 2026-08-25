package tunnel

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/metacubex/mihomo/adapter/outboundgroup"
	"github.com/metacubex/mihomo/common/utils"
	"github.com/metacubex/mihomo/log"
	"github.com/metacubex/mihomo/tunnel"
)

const (
	healthCheckTimeout    = 5 * time.Second
	healthCheckAllTimeout = 7 * time.Second
)

func findProxyGroup(name string) (outboundgroup.ProxyGroup, error) {
	p := tunnel.Proxies()[name]
	if p == nil {
		return nil, fmt.Errorf("health check group %q: not found", name)
	}

	g, ok := p.Adapter().(outboundgroup.ProxyGroup)
	if !ok {
		return nil, fmt.Errorf("health check group %q: invalid type %s", name, p.Type().String())
	}
	return g, nil
}

func healthCheckParameters(g outboundgroup.ProxyGroup) (string, utils.IntRanges[uint16], error) {
	testURL, expectedStatus, err := groupTestMetadata(g)
	if err != nil {
		return "", nil, err
	}
	ranges, err := utils.NewUnsignedRanges[uint16](expectedStatus)
	if err != nil {
		return "", nil, fmt.Errorf("parse health check expected status %q: %w", expectedStatus, err)
	}
	return testURL, ranges, nil
}

func healthCheckGroup(ctx context.Context, name string) error {
	g, err := findProxyGroup(name)
	if err != nil {
		return err
	}
	testURL, expectedStatus, err := healthCheckParameters(g)
	if err != nil {
		return fmt.Errorf("health check group %q: %w", name, err)
	}

	_, testErr := g.URLTest(ctx, testURL, expectedStatus)
	if testErr != nil {
		// URLTest records a zero-delay history for timeouts. The operation still
		// completed successfully from the API's point of view, so let the UI read
		// and render that history instead of treating it as a transport failure.
		log.Debugln("Health check group `%s` completed with test errors: %s", name, testErr)
	}
	return nil
}

func HealthCheckGroup(name string) error {
	ctx, cancel := context.WithTimeout(context.Background(), healthCheckTimeout)
	defer cancel()
	return healthCheckGroup(ctx, name)
}

func HealthCheckProxy(groupName, proxyName string) error {
	g, err := findProxyGroup(groupName)
	if err != nil {
		return err
	}
	testURL, expectedStatus, err := healthCheckParameters(g)
	if err != nil {
		return fmt.Errorf("health check proxy %q in group %q: %w", proxyName, groupName, err)
	}

	target, found := findNamed(g.Proxies(), proxyName)
	if !found {
		return fmt.Errorf("health check proxy %q: not a member of group %q", proxyName, groupName)
	}

	ctx, cancel := context.WithTimeout(context.Background(), healthCheckTimeout)
	defer cancel()
	if _, testErr := target.URLTest(ctx, testURL, expectedStatus); testErr != nil {
		log.Debugln("Health check proxy `%s` in group `%s` completed with test error: %s", proxyName, groupName, testErr)
	}
	return nil
}

func HealthCheckAll() error {
	groups := QueryProxyGroupNames(false)
	if len(groups) == 0 {
		return fmt.Errorf("health check all: no proxy groups")
	}

	ctx, cancel := context.WithTimeout(context.Background(), healthCheckAllTimeout)
	defer cancel()
	runGroupHealthChecks(groups, func(name string) {
		if err := healthCheckGroup(ctx, name); err != nil {
			log.Warnln("Request health check for group `%s`: %s", name, err)
		}
	})
	return nil
}

func findNamed[T interface{ Name() string }](items []T, name string) (T, bool) {
	for _, item := range items {
		if item.Name() == name {
			return item, true
		}
	}
	var zero T
	return zero, false
}

func runGroupHealthChecks(groups []string, check func(string)) {
	var wg sync.WaitGroup
	for _, name := range groups {
		name := name
		wg.Add(1)
		go func() {
			defer wg.Done()
			check(name)
		}()
	}
	wg.Wait()
}
