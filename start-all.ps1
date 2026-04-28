param(
    [switch]$WithDocker,
    [switch]$SkipDocker,
    [switch]$SkipMigrate,
    [switch]$NoCelery
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Backend = Join-Path $Root "backend"
$EnvFile = Join-Path $Root ".env"
$DefaultBackendPort = 8000
$DefaultFrontendPort = 5173

function Test-Command {
    param([Parameter(Mandatory = $true)][string]$Name)
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Get-DotEnvValue {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [string]$DefaultValue
    )

    if (-not (Test-Path -LiteralPath $EnvFile)) {
        return $DefaultValue
    }

    $Pattern = "^\s*$([regex]::Escape($Name))\s*=\s*(.+?)\s*$"
    $Match = Get-Content -LiteralPath $EnvFile | Where-Object { $_ -match $Pattern } | Select-Object -First 1
    if (-not $Match) {
        return $DefaultValue
    }

    $Value = ($Match -replace $Pattern, '$1').Trim()
    return $Value.Trim("'`"")
}

function Stop-PortOwner {
    param([Parameter(Mandatory = $true)][int]$Port)

    $Deadline = (Get-Date).AddSeconds(20)
    while ((Get-Date) -lt $Deadline) {
        $Connections = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
        if ($Connections.Count -eq 0) {
            Write-Host "Port $Port is now free."
            return
        }

        $ProcessIds = @(
            $Connections |
                Select-Object -ExpandProperty OwningProcess -Unique |
                Where-Object { $_ -and $_ -ne 0 -and $_ -ne 4 -and $_ -ne $PID }
        )

        if ($ProcessIds.Count -eq 0) {
            Write-Host "Port $Port is occupied, but no stoppable owner process was found."
            return
        }

        foreach ($ProcessId in $ProcessIds) {
            $Process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
            if (-not $Process) {
                continue
            }

            Write-Host "Stopping process $($Process.ProcessName) ($ProcessId) using port $Port..."
            Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
        }

        Start-Sleep -Milliseconds 500
    }

    $Remaining = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
    foreach ($Connection in $Remaining) {
        $Process = Get-Process -Id $Connection.OwningProcess -ErrorAction SilentlyContinue
        if ($Process) {
            Write-Host "Still occupied by $($Process.ProcessName) ($($Process.Id))."
        }
    }
    throw "Port $Port is still occupied after stopping owner process."
}

function Wait-Port {
    param(
        [Parameter(Mandatory = $true)][string]$HostName,
        [Parameter(Mandatory = $true)][int]$Port,
        [int]$TimeoutSeconds = 45
    )

    $Deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $Deadline) {
        $Client = [System.Net.Sockets.TcpClient]::new()
        try {
            $AsyncResult = $Client.BeginConnect($HostName, $Port, $null, $null)
            if ($AsyncResult.AsyncWaitHandle.WaitOne(1000, $false)) {
                $Client.EndConnect($AsyncResult)
                return
            }
        }
        catch {
        }
        finally {
            $Client.Close()
        }

        Start-Sleep -Seconds 1
    }

    throw "Timed out waiting for $HostName`:$Port"
}

function Invoke-BackendCommand {
    param([Parameter(Mandatory = $true)][string]$Command)

    Push-Location $Backend
    try {
        if (Test-Command "poetry") {
            powershell -NoProfile -ExecutionPolicy Bypass -Command "poetry run $Command"
        }
        else {
            powershell -NoProfile -ExecutionPolicy Bypass -Command $Command
        }
    }
    finally {
        Pop-Location
    }
}

function Start-ServiceWindow {
    param(
        [Parameter(Mandatory = $true)][string]$Title,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory,
        [Parameter(Mandatory = $true)][string]$Command
    )

    $EscapedTitle = $Title.Replace("'", "''")
    $EscapedWorkingDirectory = $WorkingDirectory.Replace("'", "''")
    $EscapedCommand = $Command.Replace("'", "''")
    $Script = "& { `$Host.UI.RawUI.WindowTitle = '$EscapedTitle'; Set-Location -LiteralPath '$EscapedWorkingDirectory'; $EscapedCommand }"

    Start-Process powershell -ArgumentList @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-NoExit",
        "-Command", $Script
    )
}

Write-Host "EACY all-in-one startup"
Write-Host "Root: $Root"

$BackendPortValue = Get-DotEnvValue -Name "APP_PORT" -DefaultValue $DefaultBackendPort
$BackendPort = [int]$BackendPortValue
$FrontendPort = $DefaultFrontendPort

Write-Host "Cleaning app ports before startup..."
Stop-PortOwner -Port $BackendPort
Stop-PortOwner -Port $FrontendPort

if ($WithDocker -and -not $SkipDocker) {
    $ComposeFile = Join-Path $Backend "docker\docker-compose.yml"

    if (Test-Command "docker") {
        Write-Host "Starting MySQL and Redis..."
        docker compose -f $ComposeFile up -d
    }
    elseif (Test-Command "docker-compose") {
        Write-Host "Starting MySQL and Redis..."
        docker-compose -f $ComposeFile up -d
    }
    else {
        throw "Docker Compose command not found. Install/start Docker Desktop, or run with -SkipDocker if MySQL and Redis are already running."
    }

    Write-Host "Waiting for MySQL and Redis..."
    Wait-Port -HostName "127.0.0.1" -Port 3306
    Wait-Port -HostName "127.0.0.1" -Port 6379
}
else {
    Write-Host "Skipping Docker startup. Expecting MySQL and Redis to be available already."
}

if (-not $SkipMigrate) {
    Write-Host "Applying database migrations..."
    Invoke-BackendCommand "alembic upgrade head"
}

Write-Host "Opening backend API window..."
Start-ServiceWindow `
    -Title "EACY Backend API" `
    -WorkingDirectory $Backend `
    -Command "$(if (Test-Command 'poetry') { 'poetry run ' })python main.py --env local"

if (-not $NoCelery) {
    Write-Host "Opening Celery worker window..."
    Start-ServiceWindow `
        -Title "EACY Celery Worker" `
        -WorkingDirectory $Backend `
        -Command "$(if (Test-Command 'poetry') { 'poetry run ' })celery -A app.workers.celery_app.celery_app worker -Q ocr,metadata,extraction --loglevel=info --pool=solo"
}

Write-Host "Opening frontend window..."
Start-ServiceWindow `
    -Title "EACY Frontend" `
    -WorkingDirectory $Root `
    -Command "npm run dev"

Write-Host ""
Write-Host "Started. Frontend is usually http://localhost:5173 and backend is usually http://localhost:8000"
Write-Host "Use Ctrl+C in each service window to stop it. Use 'docker compose -f backend/docker/docker-compose.yml down' to stop MySQL/Redis."
