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
function Set-Service { $script:events.Add('configure') }
function New-Service { $script:events.Add('create') }
function Invoke-CimMethod { $script:events.Add('delete'); [pscustomobject]@{ ReturnValue = 0 } }
function Test-Path { $true }

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
Assert-True (($script:events -join ',') -eq 'stop,wait:Stopped,configure') 'Upgrade stops and configures service without recreating it'
Remove-InstallerHelper $paths[2]
Assert-True ($script:events[-1] -eq 'delete') 'Actual uninstall removes only owned helper'

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
