param(
  [string]$Target = "E:\hegel-salon-github-release"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

if (Test-Path $Target) {
  Remove-Item -LiteralPath $Target -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $Target | Out-Null

$fileList = @(
  ".gitignore",
  "LICENSE",
  "README.md",
  "PRODUCT.md",
  "CONTRIBUTING.md",
  "ARCHITECTURE.md",
  "README-portable.md",
  "package.json",
  "package-lock.json",
  "launch-hegel-salon.cmd",
  "launch-hegel-salon.ps1",
  "start-hegel-salon.cmd",
  "stop-hegel-salon.cmd",
  "stop-hegel-salon.ps1",
  "configure-api.cmd"
)

foreach ($relative in $fileList) {
  $source = Join-Path $root $relative
  if (Test-Path $source) {
    Copy-Item -LiteralPath $source -Destination (Join-Path $Target $relative) -Force
  }
}

$dirCopies = @(
  @{ Source = "public"; Target = "public"; ExcludeDirs = @(); ExcludeFiles = @() },
  @{ Source = "src"; Target = "src"; ExcludeDirs = @(); ExcludeFiles = @() },
  @{ Source = "config"; Target = "config"; ExcludeDirs = @(); ExcludeFiles = @("api.local.json") },
  @{ Source = "training"; Target = "training"; ExcludeDirs = @(); ExcludeFiles = @() },
  @{ Source = "data\research"; Target = "data\research"; ExcludeDirs = @(); ExcludeFiles = @("*.log", "hegel-argument-*", "hegel-quote-*", "distill-v*.md", "round-*.md", "system-prompt.txt") },
  @{ Source = "data\corpus\generated"; Target = "data\corpus\generated"; ExcludeDirs = @(); ExcludeFiles = @("*.log") },
  @{ Source = "data\corpus\texts"; Target = "data\corpus\texts"; ExcludeDirs = @(); ExcludeFiles = @() },
  @{ Source = "data\corpus\chinese"; Target = "data\corpus\chinese"; ExcludeDirs = @("generated-texts", "texts"); ExcludeFiles = @("*.log") },
  @{ Source = "android-app"; Target = "android-app"; ExcludeDirs = @(".local-android", ".playwright-cli", "node_modules", ".gradle", "build"); ExcludeFiles = @("Hegel-Salon-Android-debug.apk", "local.properties") }
)

foreach ($job in $dirCopies) {
  $source = Join-Path $root $job.Source
  if (-not (Test-Path $source)) {
    continue
  }

  $dest = Join-Path $Target $job.Target
  New-Item -ItemType Directory -Force -Path $dest | Out-Null

  $robocopyArgs = @(
    $source,
    $dest,
    "/E",
    "/NFL",
    "/NDL",
    "/NJH",
    "/NJS",
    "/NP"
  )

  if ($job.ExcludeDirs.Count) {
    $robocopyArgs += "/XD"
    $robocopyArgs += $job.ExcludeDirs
  }

  if ($job.ExcludeFiles.Count) {
    $robocopyArgs += "/XF"
    $robocopyArgs += $job.ExcludeFiles
  }

  & robocopy @robocopyArgs | Out-Null
}

$emptyDirs = @(
  "tmp",
  "data\logs",
  "data\uploads"
)

foreach ($relative in $emptyDirs) {
  $dir = Join-Path $Target $relative
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $gitkeep = Join-Path $dir ".gitkeep"
  if (-not (Test-Path $gitkeep)) {
    Set-Content -LiteralPath $gitkeep -Value "" -Encoding utf8
  }
}

$androidLocalProps = Join-Path $Target "android-app\android\local.properties"
if (Test-Path $androidLocalProps) {
  Remove-Item -LiteralPath $androidLocalProps -Force
}

$androidBuildArtifacts = @(
  "android-app\android\.gradle",
  "android-app\android\build",
  "android-app\android\app\build"
)

foreach ($relative in $androidBuildArtifacts) {
  $path = Join-Path $Target $relative
  if (Test-Path $path) {
    Remove-Item -LiteralPath $path -Recurse -Force
  }
}

Write-Output "GitHub release export created at: $Target"
