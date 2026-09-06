$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\..\build\installer-processes.ps1"

function Assert-True($Value, $Message) {
    if (-not $Value) { throw $Message }
}

$paths = @(Get-InstallerPaths "C:\Apps\User's VPN" 'CheezyVPN.exe')
Assert-True ($paths.Count -eq 3) 'Only three known executable paths may be stopped'
Assert-True (Test-InstallerProcessPath "c:\apps\USER'S VPN\CheezyVPN.exe" $paths) 'Case-insensitive exact path'
Assert-True (-not (Test-InstallerProcessPath "C:\Apps\User's VPN-copy\CheezyVPN.exe" $paths)) 'Sibling install must be untouched'
Assert-True (-not (Test-InstallerProcessPath "C:\Apps\User's VPN\other.exe" $paths)) 'Unrelated executable must be untouched'
Assert-True (-not (Test-InstallerProcessPath '' $paths)) 'Unknown process path is not an owned process'
Assert-True (Test-InstallerServicePath ('"' + $paths[2] + '" --service') $paths[2]) 'Quoted helper path'
Assert-True (Test-InstallerServicePath $paths[2] $paths[2]) 'Legacy unquoted helper path'
Assert-True (-not (Test-InstallerServicePath '"C:\Other\CheezyHelperService.exe"' $paths[2])) 'Other service must be untouched'
foreach ($badPath in @('C:\', 'relative\folder')) {
    $rejected = $false
    try { Get-InstallerPaths $badPath 'CheezyClash.exe' | Out-Null } catch { $rejected = $true }
    Assert-True $rejected 'Broad/relative path must be rejected'
}
$rejected = $false
try { Get-InstallerPaths 'C:\Apps\Cheezy' '..\Other.exe' | Out-Null } catch { $rejected = $true }
Assert-True $rejected 'Executable path traversal must be rejected'

$originalProcessQuery = ${function:Get-InstallerProcesses}

# All OS-mutating boundaries are mocked. Never stop an actual app/service.
$script:service = $null
$script:events = [Collections.Generic.List[string]]::new()
function Get-InstallerService { $script:service }
function Get-InstallerProcesses { @() }
function Get-Service {
    $controller = [pscustomobject]@{ Status = 'Running' }
    $controller | Add-Member ScriptMethod Stop { $script:events.Add('stop'); $this.Status = 'Stopped' }
    $controller | Add-Member ScriptMethod WaitForStatus { param($Status, $Timeout) $script:events.Add("wait:$Status") }
    $controller
}
function Stop-Process { throw 'Test attempted to stop a real process' }
function Set-Service { param($Name, $StartupType, $ErrorAction); Assert-True ($StartupType -eq 'Manual') 'Demand start required'; $script:events.Add('configure') }
function New-Service { param($Name, $BinaryPathName, $DisplayName, $StartupType, $ErrorAction); Assert-True ($StartupType -eq 'Manual') 'New service uses demand start'; $script:events.Add('create') }
function Invoke-CimMethod { $script:events.Add('delete'); [pscustomobject]@{ ReturnValue = 0 } }
function Test-Path { $true }
$script:acl = 'D:(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BA)(A;;CCLCSWLOCRRC;;;IU)'
function Invoke-HelperSc {
    param([string[]]$Arguments)
    if ($Arguments[0] -eq 'sdshow') { return $script:acl }
    if ($Arguments[0] -eq 'sdset') { $script:acl = $Arguments[2]; $script:events.Add('acl'); return }
    throw 'Unexpected service command'
}


Stop-InstallerProcesses $paths
Assert-True ($script:events.Count -eq 0) 'Fresh install needs no stop'
$script:service = [pscustomobject]@{ PathName = '"C:\Other\CheezyHelperService.exe"' }
Stop-InstallerProcesses $paths
Install-InstallerHelper $paths[2] 'CheezyVPN' | Out-Null
Remove-InstallerHelper $paths[2]
Assert-True ($script:events.Count -eq 0) 'Must not stop, hijack or delete another installation service'

$script:service = [pscustomobject]@{ PathName = '"' + $paths[2] + '"' }
Stop-InstallerProcesses $paths
Install-InstallerHelper $paths[2] 'CheezyVPN'
Assert-True (($script:events -join ',') -eq 'stop,wait:Stopped,configure,acl') 'Upgrade stops and configures service without recreating it'
Assert-True (Test-HelperControl) 'Interactive users can start and stop after setup'
Assert-True ($script:acl.Contains('(A;;RPWP;;;IU)')) 'Grant only start and stop'
Assert-True ($script:acl.Contains('(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BA)')) 'Preserve admin ACL'
$script:events.Clear()
Install-InstallerHelper $paths[2] 'CheezyVPN'
Assert-True (($script:events -join ',') -eq 'configure') 'Repeated setup must not grow ACL'
Remove-InstallerHelper $paths[2]
Assert-True ($script:events[-1] -eq 'delete') 'Actual uninstall removes only owned helper'

# Lifecycle and migration: no real ServiceController is ever opened.
$script:service = [pscustomobject]@{ PathName = '"' + $paths[2] + '"'; StartMode = 'Manual' }
$script:state = 'Stopped'
function Get-Service {
    $controller = [pscustomobject]@{ Status = $script:state }
    $controller | Add-Member ScriptMethod Start { $script:events.Add('start'); $this.Status = 'Running'; $script:state = 'Running' }
    $controller | Add-Member ScriptMethod Stop { $script:events.Add('stop'); $this.Status = 'Stopped'; $script:state = 'Stopped' }
    $controller | Add-Member ScriptMethod WaitForStatus { param($Status, $Timeout) $script:events.Add("wait:$Status") }
    $controller
}
$script:events.Clear()
Start-OwnedHelper $paths[2]
Stop-OwnedHelper $paths[2]
Start-OwnedHelper $paths[2]
Assert-True (($script:events -join ',') -eq 'start,wait:Running,stop,wait:Stopped,start,wait:Running') 'Start, exit, restart uses service control'
$script:state = 'StopPending'
$script:events.Clear()
Stop-OwnedHelper $paths[2]
Assert-True (($script:events -join ',') -eq 'wait:Stopped') 'Concurrent app exit and installer stop must share the pending stop'
$script:service.StartMode = 'Auto'
$script:events.Clear()
$rejected = $false
try { Start-OwnedHelper $paths[2] } catch { $rejected = $true }
Assert-True ($rejected -and $script:events.Count -eq 0) 'Old automatic service requires migration'
$script:service.PathName = 'C:\Other\CheezyHelperService.exe'
$rejected = $false
try { Start-OwnedHelper $paths[2] } catch { $rejected = $true }
Stop-OwnedHelper $paths[2]
Assert-True ($rejected -and $script:events.Count -eq 0) 'Foreign service is neither started nor stopped'
$script:service.PathName = $paths[2]
function Get-Service { throw 'Access is denied' }
$rejected = $false
try { Stop-InstallerProcesses $paths } catch { $rejected = $true }
Assert-True $rejected 'Denied service stop must abort before replacing files'

$script:service = $null
$script:processQueries = 0
function Get-InstallerProcesses {
    $script:processQueries++
    if ($script:processQueries -eq 1) { [pscustomobject]@{ ProcessId = 123 } }
}
function Get-Process {
    $processFixture = [pscustomobject]@{ Path = $paths[0] }
    $processFixture | Add-Member ScriptMethod WaitForExit { param($Timeout) $script:events.Add('exited'); $true }
    $processFixture
}
function Stop-Process { param($InputObject, [switch]$Force, $ErrorAction) $script:events.Add('kill') }
$script:events.Clear()
Stop-InstallerProcesses $paths
Assert-True (($script:events -join ',') -eq 'kill,exited') 'Owned running app must exit before replacement'

$script:processQueries = 0
function Get-Process { [pscustomobject]@{ Path = 'C:\Other\CheezyVPN.exe' } }
$script:events.Clear()
$rejected = $false
try { Stop-InstallerProcesses $paths } catch { $rejected = $true }
Assert-True ($rejected -and $script:events.Count -eq 0) 'Reused/uninspectable PID must not be killed'

function Get-InstallerProcesses { throw 'enumeration denied' }
$rejected = $false
try { Stop-InstallerProcesses $paths } catch { $rejected = $true }
Assert-True $rejected 'Enumeration errors must abort replacement'
Write-Output 'Installer process/service isolation tests: OK (mocked, no installed app touched)'

# An inaccessible elevated executable is unknown, not absent.
function Get-CimInstance { [pscustomobject]@{ Name = 'CheezyHelperService.exe'; ExecutablePath = $null; ProcessId = 42 } }
$rejected = $false
try { & $originalProcessQuery $paths } catch { $rejected = $true }
Assert-True $rejected 'An uninspectable helper must block file replacement'
function Get-CimInstance { [pscustomobject]@{ Name = 'CheezyHelperService.exe'; ExecutablePath = 'C:\Other\CheezyHelperService.exe'; ProcessId = 42 } }
Assert-True (@(& $originalProcessQuery $paths).Count -eq 0) 'An identifiable foreign process is preserved'
