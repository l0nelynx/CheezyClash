param(
    [Alias('Executable')][string]$StartupExecutable,
    [Alias('AppId')][string]$StartupAppId,
    [Alias('ProductName')][string]$StartupProductName = 'CheezyClash',
    [Alias('Action')][ValidateSet('Enable', 'Disable')][string]$StartupAction
)

# Task Scheduler COM avoids passwords, elevation and shell command-line quoting.
# Dot-sourcing loads functions only (installer cleanup and isolated tests).
function New-StartupTaskService {
    $service = New-Object -ComObject 'Schedule.Service'
    $service.Connect()
    return $service
}

function Get-StartupExecutable {
    param([string]$Path)
    if (-not [IO.Path]::IsPathRooted($Path) -or [IO.Path]::GetExtension($Path) -ine '.exe') {
        throw 'An absolute application executable is required.'
    }
    return [IO.Path]::GetFullPath($Path)
}

function Get-StartupTaskName {
    param([string]$Identity, [string]$UserSid, [string]$Path)
    $hash = [Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [Text.Encoding]::UTF8.GetBytes($Path.ToLowerInvariant())
        $suffix = ([BitConverter]::ToString($hash.ComputeHash($bytes))).Replace('-', '').Substring(0, 16)
    } finally { $hash.Dispose() }
    return "$Identity.startup.$UserSid.$suffix"
}

function Get-ManagedStartupTask {
    param($Folder, [string]$Name)
    try { return $Folder.GetTask($Name) } catch {
        # Access denied / a broken scheduler must not be mistaken for absence.
        $exception = $_.Exception
        while ($exception) {
            if ($exception.HResult -in @(-2147024894, -2147216625)) { return $null }
            $exception = $exception.InnerException
        }
        throw
    }
}

function Test-StartupTaskOwner {
    param($Definition, [string]$Source, [string]$Path)
    if ($Definition.RegistrationInfo.Source -cne $Source -or $Definition.Actions.Count -ne 1) { return $false }
    $action = $Definition.Actions.Item(1)
    return $action.Type -eq 0 -and $action.Path -ieq $Path -and $action.Arguments -ceq '--hidden'
}

function Test-StartupUser {
    param([string]$Account, [string]$UserSid)
    if ($Account -ieq $UserSid) { return $true }
    if (-not $Account) { return $false }
    try {
        $resolved = [Security.Principal.NTAccount]::new($Account).Translate([Security.Principal.SecurityIdentifier])
        return $resolved.Value -ieq $UserSid
    } catch { return $false }
}

function Test-StartupTaskSettings {
    param($Definition, [string]$UserSid)
    $settings = $Definition.Settings
    if (-not $settings.Enabled -or -not (Test-StartupUser $Definition.Principal.UserId $UserSid) -or
        $Definition.Principal.LogonType -ne 3 -or $Definition.Principal.RunLevel -ne 0 -or
        $Definition.Triggers.Count -ne 1 -or $settings.DisallowStartIfOnBatteries -or
        $settings.StopIfGoingOnBatteries -or $settings.RunOnlyIfIdle -or
        $settings.RunOnlyIfNetworkAvailable -or $settings.ExecutionTimeLimit -ne 'PT0S' -or
        $settings.MultipleInstances -ne 2 -or $settings.Priority -ne 6) { return $false }
    $trigger = $Definition.Triggers.Item(1)
    return $trigger.Type -eq 9 -and $trigger.Enabled -and (Test-StartupUser $trigger.UserId $UserSid) -and
        $trigger.Delay -in @($null, '', 'PT0S')
}

function Open-LegacyStartupKey {
    return [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Software\Microsoft\Windows\CurrentVersion\Run', $true)
}

function Remove-LegacyStartupEntry {
    param([string]$Identity, [string]$Path)
    $key = Open-LegacyStartupKey
    if (-not $key) { return }
    try {
        # Never delete another installation's Run entry with the same app ID.
        if ($key.GetValue($Identity) -ieq ('"' + $Path + '" --hidden')) { $key.DeleteValue($Identity, $false) }
    } finally { $key.Dispose() }
}

function Set-StartupTask {
    param($Service, [string]$Path, [string]$Identity, [string]$DisplayName, [string]$UserSid, [bool]$Enabled)
    if ($Identity -notin @('com.cheezy.freedom.desktop', 'com.cheezy.vpn.desktop') -or $UserSid -notmatch '^S-1-\d+(-\d+)+$') {
        throw 'Invalid startup identity.'
    }
    $Path = Get-StartupExecutable $Path
    $source = "CheezyStartup/v1/$Identity"
    $name = Get-StartupTaskName $Identity $UserSid $Path
    $folder = $Service.GetFolder('\')
    $existing = Get-ManagedStartupTask $folder $name
    if ($existing -and -not (Test-StartupTaskOwner $existing.Definition $source $Path)) {
        throw 'Startup task belongs to another application; left unchanged.'
    }
    if (-not $Enabled) {
        if ($existing) { $folder.DeleteTask($name, 0) }
        if (Get-ManagedStartupTask $folder $name) { throw 'Startup task was not removed.' }
        Remove-LegacyStartupEntry $Identity $Path
        return
    }
    if (-not $existing -or -not $existing.Enabled -or -not (Test-StartupTaskSettings $existing.Definition $UserSid)) {
        $definition = $Service.NewTask(0)
        $definition.RegistrationInfo.Source = $source
        $definition.RegistrationInfo.Description = "Start $DisplayName when this user signs in."
        $definition.Principal.UserId = $UserSid
        $definition.Principal.LogonType = 3 # TASK_LOGON_INTERACTIVE_TOKEN: no stored password
        $definition.Principal.RunLevel = 0 # TASK_RUNLEVEL_LUA: ordinary user rights
        $settings = $definition.Settings
        $settings.Enabled = $true
        $settings.StartWhenAvailable = $true
        $settings.DisallowStartIfOnBatteries = $false
        $settings.StopIfGoingOnBatteries = $false
        $settings.RunOnlyIfIdle = $false
        $settings.RunOnlyIfNetworkAvailable = $false
        $settings.ExecutionTimeLimit = 'PT0S' # Never stop a long-running VPN after the default 72 hours.
        $settings.MultipleInstances = 2 # Ignore a repeated scheduler launch.
        $settings.Priority = 6 # Normal process priority, not the scheduler's default below-normal.
        $trigger = $definition.Triggers.Create(9) # TASK_TRIGGER_LOGON
        $trigger.UserId = $UserSid
        $trigger.Enabled = $true
        $trigger.Delay = 'PT0S'
        $action = $definition.Actions.Create(0)
        $action.Path = $Path
        $action.Arguments = '--hidden'
        $action.WorkingDirectory = [IO.Path]::GetDirectoryName($Path)
        $folder.RegisterTaskDefinition($name, $definition, 6, $UserSid, $null, 3) | Out-Null
    }
    $registered = Get-ManagedStartupTask $folder $name
    if (-not $registered -or -not $registered.Enabled -or
        -not (Test-StartupTaskOwner $registered.Definition $source $Path) -or
        -not (Test-StartupTaskSettings $registered.Definition $UserSid)) {
        throw 'Windows did not apply the startup task.'
    }
    # Migrate only after registration AND readback verification have succeeded.
    Remove-LegacyStartupEntry $Identity $Path
}

function Remove-StartupTasksForExecutable {
    param([string]$Path)
    $Path = Get-StartupExecutable $Path
    $service = New-StartupTaskService
    $folder = $service.GetFolder('\')
    foreach ($task in @($folder.GetTasks(1))) {
        $definition = $task.Definition
        $source = $definition.RegistrationInfo.Source
        if ($source -notin @('CheezyStartup/v1/com.cheezy.freedom.desktop', 'CheezyStartup/v1/com.cheezy.vpn.desktop')) { continue }
        if (Test-StartupTaskOwner $definition $source $Path) { $folder.DeleteTask($task.Name, 0) }
    }
}

if ($MyInvocation.InvocationName -ne '.') {
    $ErrorActionPreference = 'Stop'
    try {
        if ($StartupAction -notin @('Enable', 'Disable')) { throw 'Startup action is required.' }
        $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
        Set-StartupTask (New-StartupTaskService) $StartupExecutable $StartupAppId $StartupProductName $sid ($StartupAction -eq 'Enable')
        exit 0
    } catch {
        Write-Error "Could not apply launch at startup: $($_.Exception.Message)"
        exit 1
    }
}
