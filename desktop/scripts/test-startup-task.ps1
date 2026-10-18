$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\..\build\startup-task.ps1"
function Assert-True($Value, $Message) { if (-not $Value) { throw $Message } }

# No real tasks, registry entries, services or processes are changed.
$script:tasks = @{}
$script:legacy = @{}
$script:events = [Collections.Generic.List[string]]::new()
$script:failRegistration = $false
$script:badReadback = $false
$script:denyRead = $false
function New-TestCollection {
    $collection = [pscustomobject]@{ Entries = [Collections.Generic.List[object]]::new() }
    $collection | Add-Member ScriptProperty Count { $this.Entries.Count }
    $collection | Add-Member ScriptMethod Item { param($Index); return $this.Entries[$Index - 1] }
    $collection | Add-Member ScriptMethod Create {
        param($Type)
        $entry = [pscustomobject]@{Type=$Type;UserId='';Enabled=$true;Delay='';Path='';Arguments='';WorkingDirectory=''}
        $this.Entries.Add($entry)
        return $entry
    }
    return $collection
}
function New-TestDefinition {
    return [pscustomobject]@{
        RegistrationInfo = [pscustomobject]@{Source='';Description=''}
        Principal = [pscustomobject]@{UserId='';LogonType=0;RunLevel=1}
        Settings = [pscustomobject]@{Enabled=$false;StartWhenAvailable=$false;DisallowStartIfOnBatteries=$true;StopIfGoingOnBatteries=$true;RunOnlyIfIdle=$true;RunOnlyIfNetworkAvailable=$true;ExecutionTimeLimit='PT72H';MultipleInstances=0;Priority=7}
        Triggers = New-TestCollection
        Actions = New-TestCollection
    }
}
$folder = [pscustomobject]@{}
$folder | Add-Member ScriptMethod GetTask {
    param($Name)
    if ($script:denyRead) { throw [UnauthorizedAccessException]::new('Access denied') }
    if (-not $script:tasks.ContainsKey($Name)) { throw [Runtime.InteropServices.COMException]::new('Not found', -2147024894) }
    return $script:tasks[$Name]
}
$folder | Add-Member ScriptMethod RegisterTaskDefinition {
    param($Name, $Definition, $Flags, $UserSid, $Password, $LogonType)
    if ($script:failRegistration) { throw 'Registration failed' }
    Assert-True ($Flags -eq 6 -and $LogonType -eq 3 -and $null -eq $Password) 'Interactive user, no stored credentials'
    Assert-True ($Definition.Principal.RunLevel -eq 0) 'Never elevate the GUI'
    $script:events.Add('register')
    if ($script:badReadback) { $Definition.Settings.RunOnlyIfNetworkAvailable = $true }
    $script:tasks[$Name] = [pscustomobject]@{Name=$Name;Enabled=$true;Definition=$Definition}
}
$folder | Add-Member ScriptMethod DeleteTask { param($Name, $Flags); $script:events.Add('delete');$script:tasks.Remove($Name) }
$folder | Add-Member ScriptMethod GetTasks { param($Flags); return @($script:tasks.Values) }
$service = [pscustomobject]@{Folder=$folder}
$service | Add-Member ScriptMethod GetFolder { param($Path);return $this.Folder }
$service | Add-Member ScriptMethod NewTask { param($Flags);return New-TestDefinition }
function New-StartupTaskService { return $service }
function Open-LegacyStartupKey {
    $key = [pscustomobject]@{}
    $key | Add-Member ScriptMethod GetValue { param($Name); return $script:legacy[$Name] }
    $key | Add-Member ScriptMethod DeleteValue { param($Name, $Throw);$script:events.Add('migrate-run');$script:legacy.Remove($Name) }
    $key | Add-Member ScriptMethod Dispose { }
    return $key
}
$identity = 'com.cheezy.freedom.desktop'
$sid = 'S-1-5-21-111-222-333-1001'
$exe = 'C:\Apps\User''s VPN $test & юникод\CheezyClash.exe'
$name = Get-StartupTaskName $identity $sid $exe
$script:legacy[$identity] = '"' + $exe + '" --hidden'
Set-StartupTask $service $exe $identity 'CheezyClash' $sid $true
Assert-True (($script:events -join ',') -eq 'register,migrate-run') 'Verify a new task before removing legacy Run'
$definition = $script:tasks[$name].Definition
Assert-True (Test-StartupTaskSettings $definition $sid) 'Immediate logon, normal priority, no idle/network/battery/time restrictions'
Assert-True ($definition.Actions.Item(1).Path -ceq $exe) 'Preserve literal executable path'
Assert-True ($definition.Actions.Item(1).WorkingDirectory -ceq [IO.Path]::GetDirectoryName($exe)) 'Use the executable directory'
$script:events.Clear()
Set-StartupTask $service $exe $identity 'CheezyClash' $sid $true
Assert-True ($script:events.Count -eq 0) 'Repeated launch must not rewrite an already correct task'
Assert-True ((Get-StartupTaskName $identity $sid $exe.ToUpperInvariant()) -ceq $name) 'Task name is insensitive to path casing'
Assert-True ((Get-StartupTaskName $identity 'S-1-5-21-111-222-333-1002' $exe) -cne $name) 'Separate users'
Assert-True ((Get-StartupTaskName 'com.cheezy.vpn.desktop' $sid $exe) -cne $name) 'Separate products'
Assert-True ((Get-StartupTaskName $identity $sid 'C:\Other\CheezyClash.exe') -cne $name) 'Separate installations'

$script:legacy[$identity] = '"C:\Other\CheezyClash.exe" --hidden'
Set-StartupTask $service $exe $identity 'CheezyClash' $sid $false
Assert-True ($script:tasks.Count -eq 0 -and $script:legacy.ContainsKey($identity)) 'Disable only owned task; retain another installation Run'
$script:legacy[$identity] = '"' + $exe + '" --hidden'
$script:events.Clear();$script:failRegistration=$true
$rejected=$false
try { Set-StartupTask $service $exe $identity 'CheezyClash' $sid $true } catch { $rejected=$true }
Assert-True ($rejected -and $script:legacy.ContainsKey($identity) -and $script:events.Count -eq 0) 'Failed migration preserves working Run'
$script:failRegistration=$false;$script:badReadback=$true
$rejected=$false
try { Set-StartupTask $service $exe $identity 'CheezyClash' $sid $true } catch { $rejected=$true }
Assert-True ($rejected -and $script:legacy.ContainsKey($identity)) 'Failed verification preserves Run'
$script:badReadback=$false
Set-StartupTask $service $exe $identity 'CheezyClash' $sid $true

$script:events.Clear()
$definition=$script:tasks[$name].Definition
$definition.RegistrationInfo.Source='Another application'
$rejected=$false
try { Set-StartupTask $service $exe $identity 'CheezyClash' $sid $false } catch { $rejected=$true }
Assert-True ($rejected -and $script:events.Count -eq 0) 'Foreign task is not overwritten or removed'
$definition.RegistrationInfo.Source="CheezyStartup/v1/$identity"
$script:denyRead=$true
$rejected=$false
try { Set-StartupTask $service $exe $identity 'CheezyClash' $sid $true } catch { $rejected=$true }
Assert-True ($rejected -and $script:events.Count -eq 0) 'Access denied is not task absence'
$script:denyRead=$false

# Uninstaller finds tasks owned by this executable for every user, and no others.
Set-StartupTask $service 'C:\Other\CheezyClash.exe' $identity 'CheezyClash' $sid $true
Set-StartupTask $service $exe $identity 'CheezyClash' 'S-1-5-21-111-222-333-1002' $true
$script:events.Clear()
Remove-StartupTasksForExecutable $exe
Assert-True ($script:tasks.Count -eq 1 -and ($script:events -join ',') -eq 'delete,delete') 'Remove all owned user tasks, preserve other executable'
Write-Output 'Startup scheduler tests passed: logon settings, literal paths, idempotency, migration, failures, user/product/install isolation and uninstall cleanup (OS mutations mocked)'
