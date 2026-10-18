// Presentation and test data only. Never loaded by the production preload.
const startedAt = Date.now()
const rows = [
  ['chrome.exe', 'www.youtube.com', '142.250.185.206', 'TCP', 'DomainSuffix', 'youtube.com', ['NL · Amsterdam', 'Auto', 'Streaming'], 920000, 12400, 342],
  ['chrome.exe', 'i.ytimg.com', '142.250.184.150', 'TCP', 'RuleSet', 'YouTube', ['NL · Amsterdam', 'Auto', 'Streaming'], 54000, 1800, 96],
  ['chrome.exe', 'github.com', '140.82.121.3', 'TCP', 'DomainSuffix', 'github.com', ['DE · Frankfurt', 'Development'], 32400, 6500, 74],
  ['Discord.exe', 'gateway.discord.gg', '162.159.134.234', 'TCP', 'ProcessName', 'Discord.exe', ['FI · Helsinki', 'Communication'], 8200, 4200, 1234],
  ['Discord.exe', 'rotterdam.discord.media', '162.159.138.232', 'UDP', 'ProcessName', 'Discord.exe', ['FI · Helsinki', 'Communication'], 48000, 28600, 620],
  ['steam.exe', 'cdn.akamai.steamstatic.com', '23.44.18.74', 'TCP', 'RuleSet', 'Steam', ['DE · Frankfurt', 'Downloads'], 4200000, 62000, 128],
  ['svchost.exe', 'dns.google', '8.8.8.8', 'UDP', 'GeoIP', 'google', ['DIRECT'], 1200, 640, 16],
  ['', '', '2001:db8::42', 'TCP', 'Match', '', ['DIRECT'], 0, 0, 14],
]
exports.snapshot = () => {
  const now = Date.now()
  const elapsed = (now - startedAt) / 1000
  return {
    sampledAt: now,
    connections: rows.map(([process, host, destinationIP, network, rule, rulePayload, chains, down, up, age], index) => ({
      id: `connection-${index}`,
      metadata: {process, processPath: process ? `C:\\Apps\\${process}` : '', host, destinationIP, destinationPort: index === 6 ? '53' : '443', sourceIP:'192.168.1.12', sourcePort:String(51000 + index), network, type:'Mixed'},
      rule, rulePayload, chains,
      start: new Date(startedAt - age * 1000).toISOString(),
      download: Math.floor(down * (age + elapsed)), upload: Math.floor(up * (age + elapsed)),
    })),
  }
}
