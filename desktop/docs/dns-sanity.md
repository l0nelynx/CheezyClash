# B5 — DNS sanity checklist (desktop TUN / proxy)

When TUN is enabled, rebuilt `config.yaml` forces:

- `dns.enable: true`
- `enhanced-mode: fake-ip` (if unset)
- `fake-ip-range: 198.18.0.1/16` (if unset)
- nameservers `8.8.8.8` / `1.1.1.1` if missing
- TUN `dns-hijack: [any:53, tcp://any:53]`

## Manual checks

1. **Proxy mode:** browser via system proxy; DNS should resolve normally through OS or fake-ip depending on stack.
2. **TUN mode (Windows helper):** open TUN, visit IP-leak sites; confirm DNS not bypassing (strict-route helps on Windows multi-homed DNS).
3. **Iface change:** switch Wi‑Fi / Ethernet while connected — mihomo `DefaultInterfaceMonitor` should recover; if not, Disconnect/Connect.
4. **Quirks (wiki):** macOS/Windows cannot hijack DNS aimed at the local network; Android Private DNS N/A on desktop.
5. **strict-route vs VirtualBox/Hyper-V:** if VMs break, toggle strict-route off in a future UI advanced flag (currently always on when TUN enabled).

Automated smoke (`npm run smoke`) verifies controller + mixed-port listen only.
