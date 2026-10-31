#Requires -Version 5.1
<#
    Mirage one-command installer for Windows.

    Checks Git and Node 22+, clones (or updates) the repo, installs it,
    turns on the `bro` command and starts Mirage.

    It never installs Git, Node or anything else for you. If something is
    missing it tells you where to get it and stops.

    Usage:
      irm https://raw.githubusercontent.com/ADT1123/Mirage-by-BBC/main/scripts/install.ps1 | iex

    With options (save it first, then run it):
      powershell -ExecutionPolicy Bypass -File .\install.ps1 -Dir D:\Apps\Mirage-by-BBC
      powershell -ExecutionPolicy Bypass -File .\install.ps1 -NoStart
#>

param(
    [string] $Dir,
    [switch] $NoStart
)

$ErrorActionPreference = 'Stop'

$RepoUrl  = 'https://github.com/ADT1123/Mirage-by-BBC.git'
$RepoName = 'Mirage-by-BBC'
$MinNode  = 22

# Thrown by Stop-With and swallowed at the bottom. We can't use `exit` here:
# when this script is piped into `iex`, `exit` closes the whole PowerShell
# window and the person never gets to read the message.
$StopToken = 'mirage-install-stopped'

# ---------------------------------------------------------------- output ----

function Write-Step {
    param([string] $Message)
    Write-Host ''
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Note {
    param([string] $Message)
    Write-Host "    $Message"
}

function Write-Warn {
    param([string] $Message)
    Write-Host "    $Message" -ForegroundColor Yellow
}

function Stop-With {
    param([string[]] $Lines)
    Write-Host ''
    Write-Host '----------------------------------------------------------------' -ForegroundColor Red
    foreach ($line in $Lines) {
        Write-Host $line -ForegroundColor Red
    }
    Write-Host '----------------------------------------------------------------' -ForegroundColor Red
    Write-Host ''
    throw 'mirage-install-stopped'
}

function Stop-IfFailed {
    param([string[]] $Lines)
    if ($LASTEXITCODE -ne 0) {
        Stop-With $Lines
    }
}

# ----------------------------------------------------------------- work -----

function Install-Mirage {
    param(
        [string] $Dir,
        [switch] $NoStart
    )

    Write-Host ''
    Write-Host 'Mirage installer' -ForegroundColor Cyan
    Write-Host 'A live wallpaper you can actually use.'

    # ----------------------------------------------------- prerequisites ----

    Write-Step 'Checking what you already have'

    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        Stop-With @(
            'Git is not installed, so Mirage cannot be downloaded or updated.',
            '',
            'Get it from  https://git-scm.com/downloads',
            'Run the installer and keep the default options.',
            '',
            'Then close PowerShell, open a new window, and run this command again.'
        )
    }
    Write-Note "Git found: $(git --version)"

    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Stop-With @(
            'Node.js is not installed. Mirage needs Node 22 or newer.',
            '',
            'Get it from  https://nodejs.org',
            'Download the Windows LTS installer and keep the default options.',
            '',
            'Then close PowerShell, open a new window, and run this command again.'
        )
    }

    $NodeVersion = (node --version | Select-Object -First 1)
    $NodeMajor = 0
    if ($NodeVersion -match '^v?(\d+)') {
        $NodeMajor = [int] $Matches[1]
    }

    if ($NodeMajor -lt $MinNode) {
        Stop-With @(
            "Node.js $NodeVersion is too old. Mirage needs $MinNode or newer.",
            '',
            'Get the current LTS from  https://nodejs.org',
            'Install it over your old version and keep the default options.',
            '',
            'Then close PowerShell, open a new window, and run this command again.'
        )
    }
    Write-Note "Node.js found: $NodeVersion"

    # npm.cmd is used in preference to npm.ps1 because it is not blocked by
    # PowerShell's execution policy, the usual "npm.ps1 cannot be loaded" error.
    $Npm = $null
    if (Get-Command npm.cmd -ErrorAction SilentlyContinue) {
        $Npm = 'npm.cmd'
    }
    elseif (Get-Command npm -ErrorAction SilentlyContinue) {
        $Npm = 'npm'
    }

    if (-not $Npm) {
        Stop-With @(
            'npm is missing. It normally comes with Node.js.',
            '',
            'Reinstall Node.js from  https://nodejs.org  with the default options,',
            'then close PowerShell, open a new window, and run this command again.'
        )
    }
    Write-Note "npm found: $(& $Npm --version)"

    # -------------------------------------------------------- the folder ----

    if ([string]::IsNullOrWhiteSpace($Dir)) {
        $Dir = Join-Path $env:USERPROFILE $RepoName
    }

    Write-Step "Putting Mirage in  $Dir"

    $IsMirageClone = $false
    if (Test-Path (Join-Path $Dir '.git')) {
        $Origin = (& git -C $Dir config --get remote.origin.url)
        if ($LASTEXITCODE -eq 0) {
            if ($Origin -like "*$RepoName*") {
                $IsMirageClone = $true
            }
        }
    }

    if ($IsMirageClone) {
        Write-Note 'That folder is already a Mirage clone, so it gets updated instead of downloaded again.'
        & git -C $Dir pull --ff-only
        Stop-IfFailed @(
            'Could not update the copy that is already there (git pull --ff-only failed).',
            '',
            'Most likely you have your own changes in that folder.',
            "Open it, sort them out, then run this again:  $Dir",
            'Or install somewhere else with  -Dir <another folder>'
        )
    }
    else {
        if (Test-Path $Dir) {
            $Existing = @(Get-ChildItem -Force -Path $Dir -ErrorAction SilentlyContinue)
            if ($Existing.Count -gt 0) {
                Stop-With @(
                    "$Dir already exists and is not a Mirage clone.",
                    '',
                    'Rename or move that folder, or install somewhere else:',
                    '  -Dir <another folder>'
                )
            }
        }

        $Parent = Split-Path -Parent $Dir
        if ($Parent) {
            if (-not (Test-Path $Parent)) {
                New-Item -ItemType Directory -Path $Parent -Force | Out-Null
            }
        }

        Write-Note 'Downloading Mirage with Git.'
        & git clone $RepoUrl $Dir
        Stop-IfFailed @(
            'The download failed (git clone).',
            '',
            'Check your internet connection and that you can reach github.com,',
            'then run this command again.'
        )
    }

    # --------------------------------------------------------- the parts ----

    Push-Location $Dir
    try {
        Write-Step 'Installing the parts Mirage needs (npm install)'
        Write-Note 'This downloads Electron and the rest. The first time it takes a few minutes.'
        & $Npm install
        Stop-IfFailed @(
            'npm install failed.',
            '',
            'Scroll up for the reason. The usual ones are no internet, a company',
            'proxy, or not enough disk space. Mirage needs about 1 GB.',
            '',
            "You can retry it yourself:  cd $Dir   then  npm install"
        )

        # ----------------------------------------------- the bro command ----

        Write-Step 'Turning on the  bro  command (npm link)'
        & $Npm link
        if ($LASTEXITCODE -ne 0) {
            Write-Host ''
            Write-Warn 'npm link failed, so the  bro  command is not available yet.'
            Write-Warn 'Mirage itself is fine. Two ways around it:'
            Write-Warn "  - run commands from the folder:  cd $Dir   then  npm run cli -- status"
            Write-Warn "  - or try the link again later:   cd $Dir   then  npm link"
        }
        else {
            Write-Note 'Done. The  bro  command works in any new PowerShell window.'
        }

        # ------------------------------------------------------ start it ----

        if ($NoStart) {
            Write-Step 'Not starting Mirage, because -NoStart was used'
            Write-Note "Start it yourself with:  cd $Dir   then  npm start"
        }
        else {
            Write-Step 'Starting Mirage'
            & node cli/main.mjs start
            Stop-IfFailed @(
                'Mirage did not start.',
                '',
                "The log says why:  $(Join-Path $env:USERPROFILE '.mirage\app.log')",
                "Try again with:  cd $Dir   then  npm start",
                '',
                'More fixes: https://github.com/ADT1123/Mirage-by-BBC/blob/main/docs/SETUP-WINDOWS.md#troubleshooting'
            )
        }
    }
    finally {
        Pop-Location
    }

    # ----------------------------------------------------------- summary ----

    Write-Host ''
    Write-Host 'All set.' -ForegroundColor Green
    Write-Host ''
    Write-Host '  Alt+W         edit mode: drag, resize and restyle widgets'
    Write-Host '  Ctrl+Space    Spotlight: apps, files, settings, math, web, AI'
    Write-Host '  bro help      every other command'
    Write-Host ''
    Write-Host "  Mirage lives in    $Dir"
    Write-Host "  Settings live in   $(Join-Path $env:USERPROFILE '.mirage')"
    Write-Host ''
    Write-Host '  bro autostart on   start Mirage when you sign in'
    Write-Host '  bro stop           bring your normal wallpaper back'
    Write-Host ''
    Write-Host '  Guide: https://github.com/ADT1123/Mirage-by-BBC/blob/main/docs/SETUP-WINDOWS.md'
    Write-Host ''
}

# ----------------------------------------------------------------- run ------

try {
    Install-Mirage -Dir $Dir -NoStart:$NoStart
}
catch {
    if ($_.Exception.Message -ne $StopToken) {
        Write-Host ''
        Write-Host '----------------------------------------------------------------' -ForegroundColor Red
        Write-Host 'The installer hit a problem it did not expect:' -ForegroundColor Red
        Write-Host "  $($_.Exception.Message)" -ForegroundColor Red
        Write-Host ''
        Write-Host 'Setup guide: https://github.com/ADT1123/Mirage-by-BBC/blob/main/docs/SETUP-WINDOWS.md' -ForegroundColor Red
        Write-Host '----------------------------------------------------------------' -ForegroundColor Red
        Write-Host ''
    }
    # Only `exit` when run as a .ps1 file. Under `irm ... | iex` it would close
    # the person's PowerShell window before they could read anything.
    if ($PSCommandPath) {
        exit 1
    }
}
