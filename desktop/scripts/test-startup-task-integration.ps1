$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\..\build\startup-task.ps1"

# Register one temporary task pointing to a nonexistent, unique test executable.
# It is never run. Do not alter installed apps, their tasks or registry entries.
$identity = 'com.cheezy.freedom.desktop'
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$directory = Join-Path ([IO.Path]::GetTempPath()) ('cheezy-startup-test-' + [Guid]::NewGuid().ToString('N'))
$executable = Join-Path $directory ("User's & " + [char]0x044F + '\fixture.exe')
$service = New-StartupTaskService
$folder = $service.GetFolder('\')
$name = Get-StartupTaskName $identity $sid $executable
if (Get-ManagedStartupTask $folder $name) { throw 'Unexpected test task already exists.' }
$key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Software\Microsoft\Windows\CurrentVersion\Run')
$before = if ($key) { $key.GetValue($identity) } else { $null }
if ($key) { $key.Dispose() }
try {
    Set-StartupTask $service $executable $identity 'Cheezy startup test (never run)' $sid $true
    $registered = Get-ManagedStartupTask $folder $name
    if (-not $registered -or -not (Test-StartupTaskSettings $registered.Definition $sid)) { throw 'Task readback failed.' }
    $xml = $registered.Xml
    Set-StartupTask $service $executable $identity 'Cheezy startup test (never run)' $sid $true
    if ((Get-ManagedStartupTask $folder $name).Xml -cne $xml) { throw 'Task was rewritten on repeat startup.' }
    Remove-StartupTasksForExecutable $executable
    if (Get-ManagedStartupTask $folder $name) { throw 'Uninstaller task cleanup failed.' }
    Set-StartupTask $service $executable $identity 'Cheezy startup test (never run)' $sid $true
    Set-StartupTask $service $executable $identity 'Cheezy startup test (never run)' $sid $false
    if (Get-ManagedStartupTask $folder $name) { throw 'Task was not removed.' }
    Write-Output 'Real Windows Scheduler roundtrip passed: ordinary user registration, immediate interactive logon, readback, idempotency, uninstall cleanup, disable. Test task was never run and was removed.'
} catch {
    $failed = Get-ManagedStartupTask $folder $name
    if ($failed) {
        $d = $failed.Definition
        Write-Output ([pscustomobject]@{Enabled=$failed.Enabled;Owner=(Test-StartupTaskOwner $d "CheezyStartup/v1/$identity" $executable);Settings=(Test-StartupTaskSettings $d $sid);PrincipalIsSid=($d.Principal.UserId -eq $sid);LogonType=$d.Principal.LogonType;RunLevel=$d.Principal.RunLevel;Triggers=$d.Triggers.Count;TriggerIsSid=($d.Triggers.Item(1).UserId -eq $sid);TriggerEnabled=$d.Triggers.Item(1).Enabled;Delay=$d.Triggers.Item(1).Delay;TimeLimit=$d.Settings.ExecutionTimeLimit;Priority=$d.Settings.Priority;Instances=$d.Settings.MultipleInstances} | ConvertTo-Json -Compress)
    }
    throw
} finally {
    $remaining = Get-ManagedStartupTask $folder $name
    if ($remaining -and (Test-StartupTaskOwner $remaining.Definition "CheezyStartup/v1/$identity" $executable)) { $folder.DeleteTask($name, 0) }
    $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Software\Microsoft\Windows\CurrentVersion\Run')
    $after = if ($key) { $key.GetValue($identity) } else { $null }
    if ($key) { $key.Dispose() }
    if ($after -cne $before) { throw 'Installed application Run entry changed unexpectedly.' }
}
