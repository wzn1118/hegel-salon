$ErrorActionPreference = "Stop"

$script:ProjectRoot = Split-Path -Path (Split-Path -Parent $PSScriptRoot) -Parent
$script:RuntimeDir = Join-Path $script:ProjectRoot "local-resources\launcher\runtime"
$script:LogsDir = Join-Path $script:ProjectRoot "local-resources\launcher\logs"
$script:StatePath = Join-Path $script:RuntimeDir "launcher-state.json"
$script:ServerStdOutPath = Join-Path $script:LogsDir "server.stdout.log"
$script:ServerStdErrPath = Join-Path $script:LogsDir "server.stderr.log"
$script:TunnelStdOutPath = Join-Path $script:LogsDir "tunnel.stdout.log"
$script:TunnelStdErrPath = Join-Path $script:LogsDir "tunnel.stderr.log"
$script:DefaultPort = 3087
$script:NamedTunnelPort = 3087
$script:DefaultPublicHost = "127.0.0.1"
$script:NamedTunnelConfigPath = Join-Path $script:ProjectRoot "deploy\cloudflared\hegelsalon.config.yml"
$script:NamedTunnelPublicUrl = "https://www.hegelsalon.com"
$script:LegacyPortableDataDir = Join-Path (Split-Path -Parent $script:ProjectRoot) "hegel-salon-portable-full\data"

function Ensure-LauncherDirectories {
  foreach ($dir in @($script:RuntimeDir, $script:LogsDir)) {
    if (-not (Test-Path $dir)) {
      New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
  }
}

function Resolve-CloudflaredPath {
  if ($env:CLOUDFLARED_PATH -and (Test-Path $env:CLOUDFLARED_PATH)) {
    return $env:CLOUDFLARED_PATH
  }

  foreach ($candidate in @(
    "C:\Program Files (x86)\cloudflared\cloudflared.exe",
    "C:\Program Files\cloudflared\cloudflared.exe"
  )) {
    if (Test-Path $candidate) {
      return $candidate
    }
  }

  $command = Get-Command cloudflared -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  return $null
}

function Wait-ForProcessExitById([int]$ProcessId, [int]$Attempts = 40) {
  if ($ProcessId -le 0) {
    return $true
  }

  for ($i = 0; $i -lt $Attempts; $i++) {
    try {
      $null = Get-Process -Id $ProcessId -ErrorAction Stop
      Start-Sleep -Milliseconds 250
    } catch {
      return $true
    }
  }

  return $false
}

function Reset-LogFile([string]$Path, [int]$Attempts = 20) {
  if (-not (Test-Path $Path)) {
    return $true
  }

  for ($i = 0; $i -lt $Attempts; $i++) {
    try {
      Remove-Item -LiteralPath $Path -Force -ErrorAction Stop
      return $true
    } catch {
      Start-Sleep -Milliseconds 250
    }
  }

  try {
    Clear-Content -LiteralPath $Path -ErrorAction Stop
    return $true
  } catch {
  }

  return (-not (Test-Path $Path))
}

function Get-LogOffsets([string[]]$Paths) {
  $offsets = @{}
  foreach ($path in $Paths) {
    if (Test-Path $path) {
      try {
        $offsets[$path] = (Get-Item -LiteralPath $path -ErrorAction Stop).Length
      } catch {
        $offsets[$path] = 0
      }
    } else {
      $offsets[$path] = 0
    }
  }
  return $offsets
}

function ConvertTo-LauncherStateValue($Value) {
  if ($null -eq $Value) {
    return $null
  }

  if ($Value -is [System.Management.Automation.PSCustomObject]) {
    $result = [ordered]@{}
    foreach ($property in $Value.PSObject.Properties) {
      $result[$property.Name] = ConvertTo-LauncherStateValue $property.Value
    }
    return $result
  }

  if ($Value -is [System.Collections.IDictionary]) {
    $result = [ordered]@{}
    foreach ($key in $Value.Keys) {
      $result[[string]$key] = ConvertTo-LauncherStateValue $Value[$key]
    }
    return $result
  }

  if (($Value -is [System.Collections.IEnumerable]) -and -not ($Value -is [string])) {
    $items = @()
    foreach ($item in $Value) {
      $items += ,(ConvertTo-LauncherStateValue $item)
    }
    return $items
  }

  return $Value
}

function Read-State {
  Ensure-LauncherDirectories
  if (-not (Test-Path $script:StatePath)) {
    return [ordered]@{}
  }
  try {
    $state = Get-Content $script:StatePath -Raw | ConvertFrom-Json
    $normalized = ConvertTo-LauncherStateValue $state
    if ($normalized -is [System.Collections.IDictionary]) {
      return $normalized
    }
    return [ordered]@{}
  } catch {
    return [ordered]@{}
  }
}

function Test-StateKey($State, [string]$Key) {
  return $null -ne $State -and $null -ne $State[$Key]
}

function Write-State($State) {
  Ensure-LauncherDirectories
  ($State | ConvertTo-Json -Depth 8) | Set-Content -Path $script:StatePath -Encoding UTF8
}

function Remove-State {
  if (Test-Path $script:StatePath) {
    Remove-Item -LiteralPath $script:StatePath -Force
  }
}

function Get-ProcessCommandLine([int]$ProcessId) {
  if ($ProcessId -le 0) {
    return ""
  }

  try {
    return [string](Get-CimInstance Win32_Process -Filter ("ProcessId = {0}" -f $ProcessId) -ErrorAction Stop).CommandLine
  } catch {
    return ""
  }
}

function Test-IsLauncherServerProcess([int]$ProcessId) {
  $commandLine = Get-ProcessCommandLine -ProcessId $ProcessId
  if (-not $commandLine) {
    return $false
  }

  return $commandLine -like "*src/server.mjs*" -or $commandLine -like "*src\server.mjs*"
}

function Get-ServerProcess {
  $state = Read-State
  $port = if (Test-StateKey $state "port") { [int]$state.port } else { $script:DefaultPort }
  $processId = 0
  $candidate = $null
  if (Test-StateKey $state "serverPid") {
    $processId = [int]$state.serverPid
  }
  if ($processId -gt 0) {
    try {
      $proc = Get-Process -Id $processId -ErrorAction Stop
      if (
        ($proc.ProcessName -like "node*") -and
        (Test-ProcessListeningOnPort -ProcessId $proc.Id -Port $port) -and
        (Test-IsLauncherServerProcess -ProcessId $proc.Id)
      ) {
        $candidate = $proc
      }
    } catch {
    }
  }

  if (-not $candidate) {
    $candidate = Find-ServerNodeProcess -Port $port
  }

  if ($candidate -and (Test-ServerReady -Port $port)) {
    return $candidate
  }

  return $null
}

function Find-ServerNodeProcess([int]$Port = $script:DefaultPort) {
  try {
    $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop |
      Select-Object -First 1
    if ($listener -and $listener.OwningProcess) {
      $proc = Get-Process -Id ([int]$listener.OwningProcess) -ErrorAction Stop
      if (($proc.ProcessName -like "node*") -and (Test-IsLauncherServerProcess -ProcessId $proc.Id)) {
        return $proc
      }
    }
  } catch {
  }

  Get-CimInstance Win32_Process -Filter "name = 'node.exe'" |
    Where-Object { $_.CommandLine -like "*src/server.mjs*" -or $_.CommandLine -like "*src\\server.mjs*" } |
    Select-Object -First 1 |
    ForEach-Object {
      try {
        Get-Process -Id $_.ProcessId -ErrorAction Stop
      } catch {
      }
    }
}

function Test-ProcessListeningOnPort([int]$ProcessId, [int]$Port) {
  if ($ProcessId -le 0 -or $Port -le 0) {
    return $false
  }

  try {
    $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop |
      Where-Object { [int]$_.OwningProcess -eq $ProcessId } |
      Select-Object -First 1
    return [bool]$listener
  } catch {
    return $false
  }
}

function Get-NamedTunnelConfig {
  if (-not (Test-Path $script:NamedTunnelConfigPath)) {
    return $null
  }

  $raw = Get-Content $script:NamedTunnelConfigPath -Raw -ErrorAction SilentlyContinue
  if (-not $raw) {
    return $null
  }

  $tunnelId = ""
  $credentialsFile = ""
  $hostnames = @()
  foreach ($line in ($raw -split "`r?`n")) {
    if ($line -match '^\s*tunnel:\s*(.+?)\s*$') {
      $tunnelId = $matches[1].Trim()
      continue
    }
    if ($line -match '^\s*credentials-file:\s*(.+?)\s*$') {
      $credentialsFile = $matches[1].Trim()
      continue
    }
    if ($line -match '^\s*-\s*hostname:\s*(.+?)\s*$') {
      $hostnames += $matches[1].Trim()
    }
  }

  if (-not $tunnelId -or -not $credentialsFile) {
    return $null
  }

  return [pscustomobject]@{
    path = $script:NamedTunnelConfigPath
    tunnelId = $tunnelId
    credentialsFile = $credentialsFile
    hostnames = $hostnames
  }
}

function Test-NamedTunnelReady {
  $config = Get-NamedTunnelConfig
  if (-not $config) {
    return $false
  }

  if ($config.tunnelId -match 'REPLACE_WITH_' -or $config.credentialsFile -match 'REPLACE_WITH_') {
    return $false
  }

  return (Test-Path $config.credentialsFile)
}

function Get-PrimaryNamedTunnelPublicUrl {
  $config = Get-NamedTunnelConfig
  if (-not $config) {
    return $null
  }

  foreach ($hostname in $config.hostnames) {
    if ($hostname -like "www.*") {
      return "https://$hostname"
    }
  }

  if ($config.hostnames.Count -gt 0) {
    return "https://$($config.hostnames[0])"
  }

  return $script:NamedTunnelPublicUrl
}

function Resolve-PreferredDataDir {
  if (Test-Path $script:LegacyPortableDataDir) {
    return $script:LegacyPortableDataDir
  }

  return (Join-Path $script:ProjectRoot "data")
}

function Get-TunnelProcess {
  $state = Read-State
  $processId = 0
  if (Test-StateKey $state "tunnelPid") {
    $processId = [int]$state.tunnelPid
  }
  if ($processId -gt 0) {
    try {
      return Get-Process -Id $processId -ErrorAction Stop
    } catch {
    }
  }

  $namedTunnel = Get-NamedTunnelProcess
  if ($namedTunnel) {
    return $namedTunnel
  }

  return Get-QuickTunnelProcess
}

function Get-QuickTunnelProcess {
  $state = Read-State
  $port = if (Test-StateKey $state "port") { [int]$state.port } else { $script:DefaultPort }
  Get-CimInstance Win32_Process -Filter "name = 'cloudflared.exe'" |
    Where-Object { $_.CommandLine -like "*tunnel --url http://127.0.0.1:$port*" } |
    Select-Object -First 1 |
    ForEach-Object {
      try {
        Get-Process -Id $_.ProcessId -ErrorAction Stop
      } catch {
      }
    }
}

function Test-TcpPortOpen([int]$Port) {
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $asyncResult = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
    if (-not $asyncResult.AsyncWaitHandle.WaitOne(1500, $false)) {
      return $false
    }

    $client.EndConnect($asyncResult)
    return $true
  } catch {
    return $false
  } finally {
    try {
      $client.Close()
    } catch {
    }
  }
}

function Read-LauncherResponseText($Response) {
  if (-not $Response) {
    return ""
  }

  $stream = $null
  $reader = $null
  try {
    $stream = $Response.GetResponseStream()
    if (-not $stream) {
      return ""
    }

    $reader = New-Object System.IO.StreamReader($stream)
    return $reader.ReadToEnd()
  } catch {
    return ""
  } finally {
    if ($reader) {
      try {
        $reader.Close()
      } catch {
      }
    } elseif ($stream) {
      try {
        $stream.Close()
      } catch {
      }
    }
  }
}

function Test-SessionEndpointUrl([string]$Url, [int]$TimeoutMs = 2500) {
  if ([string]::IsNullOrWhiteSpace($Url)) {
    return $false
  }

  $response = $null
  try {
    $request = [System.Net.HttpWebRequest]::Create($Url)
    $request.Method = "GET"
    $request.AllowAutoRedirect = $false
    $request.Timeout = $TimeoutMs
    $request.ReadWriteTimeout = $TimeoutMs
    $request.UserAgent = "HegelLauncher/1.0"
    $response = [System.Net.HttpWebResponse]$request.GetResponse()
  } catch [System.Net.WebException] {
    if (-not $_.Exception.Response) {
      return $false
    }
    $response = [System.Net.HttpWebResponse]$_.Exception.Response
  } catch {
    return $false
  }

  try {
    $contentType = [string]$response.ContentType
    if ($contentType -notmatch "application/json") {
      return $false
    }

    $body = Read-LauncherResponseText $response
    return ($body -match '"authEnabled"\s*:') -and ($body -match '"user"\s*:')
  } finally {
    if ($response) {
      try {
        $response.Close()
      } catch {
      }
    }
  }
}

function Test-ServerReady([int]$Port) {
  return Test-SessionEndpointUrl -Url ("http://127.0.0.1:{0}/api/auth/session" -f $Port)
}

function Wait-ForServer([int]$Port, [int]$Attempts = 180) {
  for ($i = 0; $i -lt $Attempts; $i++) {
    if (Test-ServerReady -Port $Port) {
      return $true
    }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

function Test-PublicUrlReady([string]$PublicUrl) {
  if ([string]::IsNullOrWhiteSpace($PublicUrl)) {
    return $false
  }

  $normalized = [string]$PublicUrl
  return Test-SessionEndpointUrl -Url ($normalized.TrimEnd("/") + "/api/auth/session")
}

function Wait-ForPublicUrl([string]$PublicUrl, [int]$Attempts = 60) {
  for ($i = 0; $i -lt $Attempts; $i++) {
    if (Test-PublicUrlReady -PublicUrl $PublicUrl) {
      return $true
    }
    Start-Sleep -Milliseconds 500
  }

  return $false
}

function Ensure-ApiConfigFile {
  $configPath = Join-Path $script:ProjectRoot "config\api.json"
  $examplePath = Join-Path $script:ProjectRoot "config\api.example.json"
  if ((-not (Test-Path $configPath)) -and (Test-Path $examplePath)) {
    Copy-Item -LiteralPath $examplePath -Destination $configPath -Force
  }
}

function Ensure-ApiConfigKeyFile {
  param(
    [string]$DataDir,
    [string]$FallbackValue = ""
  )

  if ([string]::IsNullOrWhiteSpace($DataDir)) {
    return
  }

  $authDir = Join-Path $DataDir "auth"
  $keyPath = Join-Path $authDir "api-config.key"
  if (Test-Path $keyPath) {
    return
  }

  New-Item -ItemType Directory -Path $authDir -Force | Out-Null
  $seed = if ([string]::IsNullOrWhiteSpace($FallbackValue)) {
    New-RandomSecret 32
  } else {
    [string]$FallbackValue
  }
  Set-Content -Path $keyPath -Value $seed -Encoding UTF8
}

function New-RandomSecret([int]$Bytes = 32) {
  $buffer = New-Object byte[] $Bytes
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($buffer)
  } finally {
    $rng.Dispose()
  }
  return [Convert]::ToBase64String($buffer).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

function ConvertTo-PowerShellSingleQuotedLiteral([string]$Value) {
  return "'" + ([string]$Value -replace "'", "''") + "'"
}

function New-LauncherAdminConfig {
  $stamp = Get-Date -Format "yyyyMMddHHmmss"
  return [ordered]@{
    account = "admin"
    email = "admin-$stamp@local.hegel"
    password = New-RandomSecret 18
    masterKey = New-RandomSecret 32
  }
}

function Get-OrCreate-AdminConfig {
  $state = Read-State
  if (
    (Test-StateKey $state "admin") -and
    $state.admin -is [System.Collections.IDictionary] -and
    $state.admin.account -and
    $state.admin.email -and
    $state.admin.password -and
    $state.admin.masterKey
  ) {
    return $state.admin
  }

  $admin = New-LauncherAdminConfig
  $state.admin = $admin
  Write-State $state
  return $admin
}

function Start-LocalServer {
  param(
    [int]$Port = $script:DefaultPort,
    [switch]$EnablePublicMode,
    [string]$PublicBaseUrl = "",
    [string]$DataDir = ""
  )

  Ensure-LauncherDirectories
  Ensure-ApiConfigFile

  $existing = Get-ServerProcess
  $state = Read-State
  $requestedPublicMode = [bool]$EnablePublicMode
  $previousPort = if (Test-StateKey $state "port") { [int]$state.port } else { $script:DefaultPort }
  $previousPublicBaseUrl = if (Test-StateKey $state "publicBaseUrl") { [string]$state.publicBaseUrl } else { "" }
  $previousDataDir = if (Test-StateKey $state "dataDir") { [string]$state.dataDir } else { "" }
  $resolvedDataDir = if ([string]::IsNullOrWhiteSpace($DataDir)) { Resolve-PreferredDataDir } else { [string]$DataDir }
  $needsRestartForPublicMode = $requestedPublicMode -and (-not [bool]$state.publicMode)
  $needsRestartForPort = $existing -and ($previousPort -ne $Port)
  $desiredPublicBaseUrl = [string]$PublicBaseUrl
  $desiredDataDir = [string]$resolvedDataDir
  $needsRestartForPublicBaseUrl = $existing -and $requestedPublicMode -and ($previousPublicBaseUrl -ne $desiredPublicBaseUrl)
  $needsRestartForDataDir = $existing -and ($previousDataDir -ne $desiredDataDir)
  $state.port = $Port
  $state.localUrl = "http://127.0.0.1:$Port/"
  $state.publicMode = $requestedPublicMode
  if ($requestedPublicMode -and (-not [string]::IsNullOrWhiteSpace($desiredPublicBaseUrl))) {
    $state.publicBaseUrl = $desiredPublicBaseUrl
  } else {
    $state.Remove("publicBaseUrl")
  }
  if (-not [string]::IsNullOrWhiteSpace($desiredDataDir)) {
    $state.dataDir = $desiredDataDir
  } else {
    $state.Remove("dataDir")
  }

  if ($requestedPublicMode) {
    $admin = Get-OrCreate-AdminConfig
    $state.admin = $admin
  }

  if ($existing -and ($needsRestartForPublicMode -or $needsRestartForPort -or $needsRestartForPublicBaseUrl -or $needsRestartForDataDir)) {
    try {
      Stop-Process -Id $existing.Id -Force -ErrorAction Stop
      [void](Wait-ForProcessExitById -ProcessId $existing.Id)
      Start-Sleep -Milliseconds 800
    } catch {
    }
    $existing = $null
  }

  if (-not $existing) {
    $staleServer = Find-ServerNodeProcess -Port $Port
    if ($staleServer) {
      try {
        Stop-Process -Id $staleServer.Id -Force -ErrorAction Stop
        [void](Wait-ForProcessExitById -ProcessId $staleServer.Id)
        Start-Sleep -Milliseconds 500
      } catch {
      }
    }
  }

  if ($existing) {
    $state.serverPid = $existing.Id
    Write-State $state
    return $state
  }

  foreach ($logPath in @($script:ServerStdOutPath, $script:ServerStdErrPath)) {
    Reset-LogFile -Path $logPath
  }

  $environment = @{
    PORT = [string]$Port
  }

  if ([string]::IsNullOrWhiteSpace($desiredDataDir) -eq $false) {
    $environment["HEGEL_DATA_DIR"] = $desiredDataDir
  }

  if ($requestedPublicMode) {
    $admin = Get-OrCreate-AdminConfig
    Ensure-ApiConfigKeyFile -DataDir $desiredDataDir -FallbackValue ([string]$admin.masterKey)
    $environment["HEGEL_ENABLE_AUTH"] = "1"
    $environment["HEGEL_ADMIN_ACCOUNT"] = [string]$admin.account
    $environment["HEGEL_ADMIN_EMAIL"] = [string]$admin.email
    $environment["HEGEL_ADMIN_PASSWORD"] = [string]$admin.password
    $environment["HEGEL_BOOTSTRAP_ADMIN_FORCE_SYNC"] = "1"
    $environment["HEGEL_ADMIN_REMOTE_ALLOWED"] = "0"
    $environment["HEGEL_ADMIN_ALLOWED_IPS"] = "127.0.0.1,::1"
    $environment["HEGEL_ADMIN_2FA_DISABLED"] = "1"
    $environment["HEGEL_UPLOAD_SCAN_MODE"] = "best-effort"
    $environment["HEGEL_TRUST_PROXY"] = "1"
    if ([string]::IsNullOrWhiteSpace($PublicBaseUrl) -eq $false) {
      $environment["HEGEL_PUBLIC_BASE_URL"] = [string]$PublicBaseUrl
      $environment["HEGEL_FORCE_SECURE_COOKIES"] = "1"
      $environment["HEGEL_ALLOWED_ORIGINS"] = [string]$PublicBaseUrl
    }
  }

  $previousEnvironment = @{}
  foreach ($key in $environment.Keys) {
    $previousEnvironment[$key] = [Environment]::GetEnvironmentVariable($key, "Process")
    [Environment]::SetEnvironmentVariable($key, [string]$environment[$key], "Process")
  }

  try {
    $process = Start-Process `
      -FilePath "node.exe" `
      -ArgumentList @("src/server.mjs") `
      -WorkingDirectory $script:ProjectRoot `
      -RedirectStandardOutput $script:ServerStdOutPath `
      -RedirectStandardError $script:ServerStdErrPath `
      -WindowStyle Hidden `
      -PassThru
  } finally {
    foreach ($key in $environment.Keys) {
      [Environment]::SetEnvironmentVariable($key, $previousEnvironment[$key], "Process")
    }
  }

  if (-not (Wait-ForServer -Port $Port)) {
    try {
      Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    } catch {
    }
    throw "Hegel Salon did not become ready on port $Port."
  }

  $nodeProcess = $null
  for ($i = 0; $i -lt 20; $i++) {
    $nodeProcess = Find-ServerNodeProcess
    if ($nodeProcess) {
      break
    }
    Start-Sleep -Milliseconds 250
  }

  $state.serverPid = if ($nodeProcess) { $nodeProcess.Id } else { $process.Id }
  $state.serverStartedAt = (Get-Date).ToString("s")
  Write-State $state
  return $state
}

function Stop-LocalServer {
  $processesById = @{}
  foreach ($proc in @((Get-ServerProcess), (Find-ServerNodeProcess))) {
    if ($proc -and (-not $processesById.ContainsKey([string]$proc.Id))) {
      $processesById[[string]$proc.Id] = $proc
    }
  }

  foreach ($proc in $processesById.Values) {
    try {
      Stop-Process -Id $proc.Id -Force -ErrorAction Stop
      [void](Wait-ForProcessExitById -ProcessId $proc.Id)
    } catch {
    }
  }
  $state = Read-State
  $state.Remove("serverPid")
  $state.Remove("serverStartedAt")
  $state.Remove("publicUrl")
  $state.Remove("publicStartedAt")
  $state.Remove("tunnelPid")
  $state.Remove("publicMode")
  $state.Remove("publicBaseUrl")
  $state.Remove("dataDir")
  Write-State $state

  $postStop = Get-ServerProcess
  if (-not $postStop) {
    $state = Read-State
    $state.Remove("serverPid")
    $state.Remove("serverStartedAt")
    Write-State $state
  }
}

function Stop-PublicTunnel {
  $processesById = @{}
  foreach ($proc in @((Get-TunnelProcess), (Get-NamedTunnelProcess), (Get-QuickTunnelProcess))) {
    if ($proc -and (-not $processesById.ContainsKey([string]$proc.Id))) {
      $processesById[[string]$proc.Id] = $proc
    }
  }

  foreach ($proc in $processesById.Values) {
    try {
      Stop-Process -Id $proc.Id -Force -ErrorAction Stop
      [void](Wait-ForProcessExitById -ProcessId $proc.Id)
    } catch {
    }
  }

  $state = Read-State
  $state.Remove("tunnelPid")
  $state.Remove("publicUrl")
  $state.Remove("publicStartedAt")
  Write-State $state

  $postStop = Get-TunnelProcess
  if (-not $postStop) {
    $state = Read-State
    $state.Remove("tunnelPid")
    $state.Remove("publicUrl")
    $state.Remove("publicStartedAt")
    Write-State $state
  }
}

function Get-NamedTunnelProcess {
  $config = Get-NamedTunnelConfig
  if (-not $config) {
    return $null
  }

  Get-CimInstance Win32_Process -Filter "name = 'cloudflared.exe'" |
    Where-Object {
      $_.CommandLine -like "*tunnel*" -and
      $_.CommandLine -like "*--config*" -and
      $_.CommandLine -like "*$($config.path)*"
    } |
    Select-Object -First 1 |
    ForEach-Object {
      try {
        Get-Process -Id $_.ProcessId -ErrorAction Stop
      } catch {
      }
    }
}

function Wait-ForNamedTunnelConnection([int]$ProcessId, [string[]]$Paths, [int]$Attempts = 80) {
  if ($ProcessId -le 0) {
    return $false
  }

  for ($i = 0; $i -lt $Attempts; $i++) {
    try {
      $null = Get-Process -Id $ProcessId -ErrorAction Stop
    } catch {
      return $false
    }

    foreach ($path in $Paths) {
      if (-not (Test-Path $path)) {
        continue
      }

      $content = Get-Content $path -Raw -ErrorAction SilentlyContinue
      if ($content -match "Registered tunnel connection") {
        return $true
      }
    }

    Start-Sleep -Milliseconds 500
  }

  return $false
}

function Start-NamedPublicTunnel {
  param(
    [string]$DataDir = ""
  )

  $config = Get-NamedTunnelConfig
  if (-not $config) {
    throw "Named tunnel config is missing at $($script:NamedTunnelConfigPath)."
  }
  if (-not (Test-NamedTunnelReady)) {
    throw "Named tunnel config is not ready. Check tunnel ID and credentials file in $($script:NamedTunnelConfigPath)."
  }
  $cloudflaredPath = Resolve-CloudflaredPath
  if (-not $cloudflaredPath) {
    throw "cloudflared was not found. Set CLOUDFLARED_PATH or install cloudflared on PATH."
  }

  $publicUrl = Get-PrimaryNamedTunnelPublicUrl
  $port = $script:NamedTunnelPort
  $resolvedDataDir = if ([string]::IsNullOrWhiteSpace($DataDir)) { Resolve-PreferredDataDir } else { [string]$DataDir }
  $state = Start-LocalServer -Port $port -EnablePublicMode -PublicBaseUrl $publicUrl -DataDir $resolvedDataDir

  $existingTunnel = Get-NamedTunnelProcess
  if ($existingTunnel) {
    if (Wait-ForPublicUrl -PublicUrl $publicUrl -Attempts 10) {
      $state = Read-State
      $state.tunnelPid = $existingTunnel.Id
      $state.publicUrl = $publicUrl
      $state.publicStartedAt = (Get-Date).ToString("s")
      $state.publicMode = $true
      Write-State $state
      return $state
    }

    try {
      Stop-Process -Id $existingTunnel.Id -Force -ErrorAction Stop
      [void](Wait-ForProcessExitById -ProcessId $existingTunnel.Id)
      Start-Sleep -Milliseconds 500
    } catch {
    }
  }

  foreach ($logPath in @($script:TunnelStdOutPath, $script:TunnelStdErrPath)) {
    Reset-LogFile -Path $logPath | Out-Null
  }

  $process = Start-Process `
    -FilePath $cloudflaredPath `
    -ArgumentList @("tunnel", "--config", $config.path, "run") `
    -WorkingDirectory $script:ProjectRoot `
    -RedirectStandardOutput $script:TunnelStdOutPath `
    -RedirectStandardError $script:TunnelStdErrPath `
    -WindowStyle Hidden `
    -PassThru

  $logPaths = @($script:TunnelStdErrPath, $script:TunnelStdOutPath)
  if (-not (Wait-ForNamedTunnelConnection -ProcessId $process.Id -Paths $logPaths)) {
    try {
      $null = Get-Process -Id $process.Id -ErrorAction Stop
      throw "Named tunnel did not finish connecting to Cloudflare. Check $($script:TunnelStdErrPath)."
    } catch {
      throw "Named tunnel exited before Cloudflare finished connecting. Check $($script:TunnelStdErrPath)."
    }
  }

  if (-not (Wait-ForPublicUrl -PublicUrl $publicUrl -Attempts 24)) {
    try {
      Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    } catch {
    }
    throw "Named tunnel connected, but $publicUrl did not become reachable. Check $($script:TunnelStdErrPath)."
  }

  $state = Read-State
  $state.tunnelPid = $process.Id
  $state.publicUrl = $publicUrl
  $state.publicStartedAt = (Get-Date).ToString("s")
  $state.publicMode = $true
  Write-State $state
  return $state
}

function Read-FirstPublicUrlFromLogs([string[]]$Paths, $Offsets = $null, [int]$Attempts = 80) {
  for ($i = 0; $i -lt $Attempts; $i++) {
    foreach ($path in $Paths) {
      if (Test-Path $path) {
        $content = Get-Content $path -Raw -ErrorAction SilentlyContinue
        if (-not $content) {
          continue
        }

        $startIndex = 0
        if ($Offsets -and $Offsets.ContainsKey($path)) {
          $startIndex = [Math]::Min([int]$Offsets[$path], $content.Length)
        }

        $delta = $content.Substring($startIndex)
        $matches = [regex]::Matches($delta, 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com')
        if ($matches.Count -gt 0) {
          return $matches[$matches.Count - 1].Value
        }
      }
    }
    Start-Sleep -Milliseconds 500
  }
  return $null
}

function Read-LatestPublicUrlFromLogs([string[]]$Paths) {
  foreach ($path in $Paths) {
    if (-not (Test-Path $path)) {
      continue
    }

    $content = Get-Content $path -Raw -ErrorAction SilentlyContinue
    if (-not $content) {
      continue
    }

    $matches = [regex]::Matches($content, 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com')
    if ($matches.Count -gt 0) {
      return $matches[$matches.Count - 1].Value
    }
  }

  return $null
}

function Start-PublicTunnel {
  param(
    [int]$Port = $script:DefaultPort,
    [string]$DataDir = ""
  )

  if (Test-NamedTunnelReady) {
    return Start-NamedPublicTunnel -DataDir $DataDir
  }

  $cloudflaredPath = Resolve-CloudflaredPath
  if (-not $cloudflaredPath) {
    throw "cloudflared was not found. Set CLOUDFLARED_PATH or install cloudflared on PATH."
  }

  $state = Start-LocalServer -Port $Port -EnablePublicMode -DataDir $DataDir

  $existingTunnel = Get-TunnelProcess
  if ($existingTunnel) {
    $existingPublicUrl = if ($state.publicUrl) {
      [string]$state.publicUrl
    } else {
      Read-LatestPublicUrlFromLogs -Paths @($script:TunnelStdErrPath, $script:TunnelStdOutPath)
    }

    if ($existingPublicUrl -and (Wait-ForPublicUrl -PublicUrl $existingPublicUrl -Attempts 10)) {
      $state.publicUrl = $existingPublicUrl
      Write-State $state
      return $state
    }

    try {
      Stop-Process -Id $existingTunnel.Id -Force -ErrorAction Stop
      [void](Wait-ForProcessExitById -ProcessId $existingTunnel.Id)
      Start-Sleep -Milliseconds 500
    } catch {
    }
  }

  $state = Read-State
  if ($state.publicUrl) {
    $state.Remove("publicUrl")
    $state.Remove("publicStartedAt")
    Write-State $state
  }

  $logPaths = @($script:TunnelStdErrPath, $script:TunnelStdOutPath)
  $logOffsets = Get-LogOffsets -Paths $logPaths
  foreach ($logPath in @($script:TunnelStdOutPath, $script:TunnelStdErrPath)) {
    if (Reset-LogFile -Path $logPath) {
      $logOffsets[$logPath] = 0
    }
  }

  $process = Start-Process `
    -FilePath $cloudflaredPath `
    -ArgumentList "tunnel --url http://127.0.0.1:$Port --no-autoupdate" `
    -WorkingDirectory $script:ProjectRoot `
    -RedirectStandardOutput $script:TunnelStdOutPath `
    -RedirectStandardError $script:TunnelStdErrPath `
    -WindowStyle Hidden `
    -PassThru

  $publicUrl = Read-FirstPublicUrlFromLogs -Paths $logPaths -Offsets $logOffsets
  if (-not $publicUrl) {
    $publicUrl = Read-LatestPublicUrlFromLogs -Paths $logPaths
  }
  if (-not $publicUrl) {
    try {
      Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    } catch {
    }
    throw "cloudflared started, but no public URL was detected."
  }

  if (-not (Wait-ForPublicUrl -PublicUrl $publicUrl -Attempts 24)) {
    try {
      Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    } catch {
    }
    throw "cloudflared exposed $publicUrl, but it did not become reachable."
  }

  $state = Read-State
  $state.tunnelPid = $process.Id
  $state.publicUrl = $publicUrl
  $state.publicStartedAt = (Get-Date).ToString("s")
  Write-State $state
  return $state
}

function Stop-AllLauncherProcesses {
  Stop-PublicTunnel
  Stop-LocalServer
}

function Get-LauncherStatus {
  $state = Read-State
  $server = Get-ServerProcess
  $tunnel = Get-TunnelProcess
  $namedTunnel = Get-NamedTunnelProcess
  $namedConfig = Get-NamedTunnelConfig
  $port = if ($state.port) { [int]$state.port } else { $script:DefaultPort }
  $serverHealthy = [bool]$server
  $publicCandidateUrl = $null
  if ($tunnel) {
    if ($namedTunnel -and $tunnel.Id -eq $namedTunnel.Id) {
      $publicCandidateUrl = Get-PrimaryNamedTunnelPublicUrl
    } elseif ($state.publicUrl) {
      $publicCandidateUrl = [string]$state.publicUrl
    } else {
      $publicCandidateUrl = Read-LatestPublicUrlFromLogs -Paths @($script:TunnelStdErrPath, $script:TunnelStdOutPath)
    }
  }
  $publicHealthy = [bool]$tunnel -and $serverHealthy -and (Test-PublicUrlReady -PublicUrl $publicCandidateUrl)
  $status = [ordered]@{
    projectRoot = $script:ProjectRoot
    port = $port
    localUrl = if ($state.localUrl) { $state.localUrl } else { "http://127.0.0.1:$port/" }
    serverRunning = $serverHealthy
    serverPid = if ($server) { $server.Id } else { $null }
    publicMode = [bool]$state.publicMode
    dataDir = if ($state.dataDir) { [string]$state.dataDir } else { Resolve-PreferredDataDir }
    publicRunning = $publicHealthy
    publicBaseUrl = if ($state.publicBaseUrl) { [string]$state.publicBaseUrl } else { $null }
    publicUrl = if ($tunnel) { $publicCandidateUrl } else { $null }
    tunnelPid = if ($tunnel) { $tunnel.Id } else { $null }
    namedTunnelReady = Test-NamedTunnelReady
    namedTunnelConfigPath = if ($namedConfig) { $namedConfig.path } else { $script:NamedTunnelConfigPath }
    namedTunnelId = if ($namedConfig) { $namedConfig.tunnelId } else { $null }
    namedTunnelHostnames = if ($namedConfig) { $namedConfig.hostnames } else { @() }
    admin = if ($state.admin) {
      [pscustomobject]@{
        account = [string]$state.admin.account
        email = [string]$state.admin.email
        password = [string]$state.admin.password
        masterKey = [string]$state.admin.masterKey
      }
    } else {
      $null
    }
    serverLog = $script:ServerStdOutPath
    serverErrorLog = $script:ServerStdErrPath
    tunnelLog = $script:TunnelStdErrPath
    apiConfigPath = Join-Path $script:ProjectRoot "config\api.json"
  }
  return [pscustomobject]$status
}
