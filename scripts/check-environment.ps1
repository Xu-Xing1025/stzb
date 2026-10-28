$ErrorActionPreference = 'Stop'

function Show-Tool {
    param([string]$Label, [string]$Command, [string[]]$VersionArgs)
    $toolCommand = Get-Command $Command -ErrorAction SilentlyContinue
    if (-not $toolCommand) {
        Write-Output "$Label : NOT FOUND"
        return
    }
    if ($Command -eq 'python' -and $toolCommand.Source -like '*\Microsoft\WindowsApps\*') {
        Write-Output "$Label : WINDOWS APP ALIAS ONLY; usable Python not verified"
        return
    }
    Write-Output "$Label path: $($toolCommand.Source)"
    try {
        & $toolCommand.Source @VersionArgs
        if ($LASTEXITCODE -ne 0) { Write-Output "$Label : version check failed" }
    } catch {
        Write-Output "$Label : version check failed: $($_.Exception.Message)"
    }
}

Write-Output 'STZB local development environment (read-only check)'
Show-Tool -Label 'Node.js' -Command 'node' -VersionArgs @('--version')
Show-Tool -Label 'npm' -Command 'npm.cmd' -VersionArgs @('--version')
Show-Tool -Label 'Git' -Command 'git' -VersionArgs @('--version')
Show-Tool -Label 'Python' -Command 'python' -VersionArgs @('--version')
Show-Tool -Label 'Python launcher' -Command 'py' -VersionArgs @('--version')
Show-Tool -Label 'ADB on PATH' -Command 'adb' -VersionArgs @('version')
Write-Output 'MuMu may bundle ADB outside PATH. Set its real path in config/local.json.'
Write-Output 'This script does not install software, connect a device, or operate the game.'
