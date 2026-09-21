package linuxhelper

import "fmt"

const installRoot = "/usr/local/libexec/cheezyclash"

func unitName(uid string) string   { return "cheezyclash-helper-" + uid }
func installDir(uid string) string { return installRoot + "/" + uid }

func units(uid string) (string, string) {
	name := unitName(uid)
	socket := fmt.Sprintf(`[Unit]
Description=CheezyClash TUN socket for user %s

[Socket]
ListenStream=/run/%s.sock
SocketUser=%s
SocketMode=0600
RemoveOnStop=yes

[Install]
WantedBy=sockets.target
`, uid, name, uid)
	service := fmt.Sprintf(`[Unit]
Description=CheezyClash TUN helper for user %s
Requires=%s.socket
After=%s.socket network.target

[Service]
Type=simple
User=%s
ExecStart=%s/cheezy-helper --serve
Environment=PATH=/usr/sbin:/usr/bin:/sbin:/bin
AmbientCapabilities=CAP_NET_ADMIN CAP_NET_RAW CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_ADMIN CAP_NET_RAW CAP_NET_BIND_SERVICE
NoNewPrivileges=yes
ProtectSystem=full
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
RestrictSUIDSGID=yes
LockPersonality=yes
RestrictRealtime=yes
UMask=0077
KillMode=mixed
TimeoutStopSec=15
Restart=on-failure
RestartSec=2
`, uid, name, name, uid, installDir(uid))
	return socket, service
}
