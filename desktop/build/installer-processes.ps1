param(
    [string]$InstallDir,
    [string]$AppExecutable,
    [ValidateSet('Stop', 'InstallHelper', 'RemoveHelper')][string]$Action,
    [string]$ProductName = 'CheezyClash'
)

# Invoked with -File, not interpolated PowerShell code: spaces, apostrophes and
# non-ASCII installation paths must remain literal. Dot-sourcing is for tests.
function Get-InstallerPaths {
    param([string]$Directory, [string]$Executable)
    if (-not [IO.Path]::IsPathRooted($Directory) -or
        $Executable -notmatch '^[^\\/:*?"<>|]+\.exe$') {
        throw 'Invalid installation path or executable name.'
    }
    $targetDirectory = [IO.Path]::GetFullPath($Directory).TrimEnd('\')
    if ($targetDirectory -eq [IO.Path]::GetPathRoot($targetDirectory).TrimEnd('\') -or
        $targetDirectory -eq $env:USERPROFILE -or $targetDirectory -eq $env:WINDIR -or
        $targetDirectory -eq $env:ProgramFiles -or $targetDirectory -eq ${env:ProgramFiles(x86)}) {
        throw 'Refusing a broad installation directory.'
    }
    @(
        (Join-Path $targetDirectory $Executable)
        (Join-Path $targetDirectory 'resources\core\mihomo.exe')
        (Join-Path $targetDirectory 'resources\helper\CheezyHelperService.exe')
    )
}

function Test-InstallerProcessPath {
    param([string]$Path, [string[]]$AllowedPaths)
    if (-not $Path) { return $false }
    $candidatePath = [IO.Path]::GetFullPath($Path)
    # Exact paths, never prefix matching or taskkill /IM (another installed or
    # portable copy may have the same executable name).
    return $AllowedPaths -contains $candidatePath
}

function Test-InstallerServicePath {
    param([string]$CommandLine, [string]$HelperPath)
    if ($CommandLine -match '^\s*"([^"]+)"' -or
        $CommandLine -match '^\s*(.+?\.exe)(?:\s|$)') {
        return Test-InstallerProcessPath $Matches[1] @($HelperPath)
    }
    return $false
}

function Get-InstallerService {
    Get-CimInstance Win32_Service -Filter "Name='CheezyHelperService'" -ErrorAction Stop
}

function Get-InstallerProcesses {
    param([string[]]$AllowedPaths)
    # Failure to enumerate is not proof that files are safe to overwrite.
    @(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object {
        Test-InstallerProcessPath $_.ExecutablePath $AllowedPaths
    })
}

function Stop-InstallerProcesses {
    param([string[]]$AllowedPaths)
    $helperService = Get-InstallerService
    if ($helperService -and (Test-InstallerServicePath $helperService.PathName $AllowedPaths[2])) {
        # The service's normal Stop handler releases its core first. No deletion
        # on upgrade, no service-recovery restart racing with file replacement.
        $controller = Get-Service -Name CheezyHelperService -ErrorAction Stop
        if ($controller.Status -ne 'Stopped') {
            $controller.Stop()
            $controller.WaitForStatus('Stopped', [TimeSpan]::FromSeconds(8))
        }
    }

    foreach ($entry in @(Get-InstallerProcesses $AllowedPaths)) {
        $runningProcess = Get-Process -Id $entry.ProcessId -ErrorAction SilentlyContinue
        if (-not $runningProcess) { continue }
        # Revalidate the PID immediately before termination; no name-only kill.
        if (-not (Test-InstallerProcessPath $runningProcess.Path $AllowedPaths)) {
            throw 'Process identity changed or cannot be inspected.'
        }
        Stop-Process -InputObject $runningProcess -Force -ErrorAction Stop
        if (-not $runningProcess.WaitForExit(5000)) { throw 'Process did not exit.' }
    }
    if (@(Get-InstallerProcesses $AllowedPaths).Count -ne 0) {
        throw 'An application process restarted; installation has been stopped.'
    }
}

function Install-InstallerHelper {
    param([string]$HelperPath, [string]$DisplayProductName)
    if (-not (Test-Path -LiteralPath $HelperPath -PathType Leaf)) { return }
    $helperService = Get-InstallerService
    if ($helperService) {
        if (-not (Test-InstallerServicePath $helperService.PathName $HelperPath)) {
            # CheezyVPN and CheezyClash currently share a service name. Do not
            # silently hijack a service registered to another installation.
            Write-Output 'Helper belongs to another installation; left unchanged.'
            return
        }
        Set-Service -Name CheezyHelperService -StartupType Automatic -ErrorAction Stop
    } else {
        New-Service -Name CheezyHelperService -BinaryPathName ('"' + $HelperPath + '"') `
            -DisplayName "$DisplayProductName Helper" -StartupType Automatic -ErrorAction Stop | Out-Null
    }
    $controller = Get-Service -Name CheezyHelperService -ErrorAction Stop
    if ($controller.Status -ne 'Running') {
        $controller.Start()
        $controller.WaitForStatus('Running', [TimeSpan]::FromSeconds(8))
    }
}

function Remove-InstallerHelper {
    param([string]$HelperPath)
    $helperService = Get-InstallerService
    if ($helperService -and (Test-InstallerServicePath $helperService.PathName $HelperPath)) {
        $result = Invoke-CimMethod -InputObject $helperService -MethodName Delete -ErrorAction Stop
        if ($result.ReturnValue -ne 0) { throw 'Cannot remove helper service.' }
    }
}

if ($MyInvocation.InvocationName -ne '.') {
    $ErrorActionPreference = 'Stop'
    try {
        $allowedPaths = @(Get-InstallerPaths $InstallDir $AppExecutable)
        switch ($Action) {
            'Stop' { Stop-InstallerProcesses $allowedPaths }
            'InstallHelper' { Install-InstallerHelper $allowedPaths[2] $ProductName }
            'RemoveHelper' { Remove-InstallerHelper $allowedPaths[2] }
            default { throw 'Installer action is required.' }
        }
        exit 0
    } catch {
        Write-Output "Installer preparation failed: $($_.Exception.Message)"
        exit 1
    }
}
