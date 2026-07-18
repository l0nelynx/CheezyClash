# Optional: allow mihomo through Windows Firewall (needed for system/mixed TUN stacks).
# Run elevated once after install.
$core = Join-Path $PSScriptRoot "..\resources\core\mihomo.exe"
if (-not (Test-Path $core)) {
  Write-Error "mihomo.exe not found at $core — run npm run fetch-core first"
  exit 1
}
New-NetFirewallRule -DisplayName "CheezyClash mihomo" -Direction Inbound -Program $core -Action Allow -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName "CheezyClash mihomo out" -Direction Outbound -Program $core -Action Allow -ErrorAction SilentlyContinue
Write-Host "Firewall rules applied for $core"
