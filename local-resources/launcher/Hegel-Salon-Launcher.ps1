Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$controllerPath = Join-Path $PSScriptRoot "launcher-controller.ps1"
. $controllerPath

[System.Windows.Forms.Application]::EnableVisualStyles()

$form = New-Object System.Windows.Forms.Form
$form.Text = "Hegel Salon Launcher"
$form.StartPosition = "CenterScreen"
$form.Size = New-Object System.Drawing.Size(720, 520)
$form.MinimumSize = New-Object System.Drawing.Size(720, 520)
$form.BackColor = [System.Drawing.Color]::FromArgb(22, 24, 28)
$form.ForeColor = [System.Drawing.Color]::White

$title = New-Object System.Windows.Forms.Label
$title.Text = "Hegel Salon"
$title.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 19)
$title.Location = New-Object System.Drawing.Point(24, 18)
$title.AutoSize = $true
$form.Controls.Add($title)

$subtitle = New-Object System.Windows.Forms.Label
$subtitle.Text = "One-click desktop launcher with optional temporary public sharing."
$subtitle.Font = New-Object System.Drawing.Font("Segoe UI", 10)
$subtitle.Location = New-Object System.Drawing.Point(26, 54)
$subtitle.AutoSize = $true
$subtitle.ForeColor = [System.Drawing.Color]::FromArgb(210, 215, 220)
$form.Controls.Add($subtitle)

$statusPanel = New-Object System.Windows.Forms.Panel
$statusPanel.Location = New-Object System.Drawing.Point(24, 88)
$statusPanel.Size = New-Object System.Drawing.Size(655, 120)
$statusPanel.BackColor = [System.Drawing.Color]::FromArgb(33, 37, 43)
$form.Controls.Add($statusPanel)

$statusLabel = New-Object System.Windows.Forms.Label
$statusLabel.Location = New-Object System.Drawing.Point(16, 16)
$statusLabel.Size = New-Object System.Drawing.Size(610, 86)
$statusLabel.Font = New-Object System.Drawing.Font("Consolas", 10)
$statusLabel.ForeColor = [System.Drawing.Color]::FromArgb(235, 235, 235)
$statusPanel.Controls.Add($statusLabel)

$buttons = @()

function New-ActionButton([string]$Text, [int]$X, [int]$Y, [scriptblock]$Handler, [string]$BackColorHex = "#D8A13B") {
  $button = New-Object System.Windows.Forms.Button
  $button.Text = $Text
  $button.Location = New-Object System.Drawing.Point($X, $Y)
  $button.Size = New-Object System.Drawing.Size(200, 42)
  $button.FlatStyle = "Flat"
  $button.FlatAppearance.BorderSize = 0
  $button.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 10)
  $button.BackColor = [System.Drawing.ColorTranslator]::FromHtml($BackColorHex)
  $button.ForeColor = [System.Drawing.Color]::Black
  $button.Add_Click($Handler)
  $form.Controls.Add($button)
  $script:buttons += $button
  return $button
}

$infoBox = New-Object System.Windows.Forms.TextBox
$infoBox.Location = New-Object System.Drawing.Point(24, 278)
$infoBox.Size = New-Object System.Drawing.Size(655, 176)
$infoBox.Multiline = $true
$infoBox.ScrollBars = "Vertical"
$infoBox.ReadOnly = $true
$infoBox.Font = New-Object System.Drawing.Font("Consolas", 10)
$infoBox.BackColor = [System.Drawing.Color]::FromArgb(17, 19, 23)
$infoBox.ForeColor = [System.Drawing.Color]::FromArgb(239, 239, 239)
$form.Controls.Add($infoBox)

$hint = New-Object System.Windows.Forms.Label
$hint.Text = "Public mode turns auth on and creates a locally saved admin account."
$hint.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$hint.Location = New-Object System.Drawing.Point(24, 245)
$hint.AutoSize = $true
$hint.ForeColor = [System.Drawing.Color]::FromArgb(184, 190, 198)
$form.Controls.Add($hint)

function Set-Busy([bool]$Busy) {
  foreach ($button in $script:buttons) {
    $button.Enabled = -not $Busy
  }
  [System.Windows.Forms.Application]::DoEvents()
}

function Format-StatusText($status) {
  $lines = @()
  $localState = "stopped"
  if ($status.serverRunning) {
    $localState = "running"
  }
  $lines += ("Local  : {0}" -f $localState)
  $lines += ("URL    : {0}" -f $status.localUrl)
  $publicState = "stopped"
  if ($status.publicRunning) {
    $publicState = "running"
  }
  $lines += ("Public : {0}" -f $publicState)
  if ($status.publicUrl) {
    $lines += ("Share  : {0}" -f $status.publicUrl)
  }
  if ($status.serverPid) {
    $lines += ("PID    : {0}" -f $status.serverPid)
  }
  $statusLabel.Text = ($lines -join [Environment]::NewLine)
}

function Format-InfoText($status) {
  $lines = @()
  $lines += "Project root"
  $lines += $status.projectRoot
  $lines += ""
  $lines += "API config"
  $lines += $status.apiConfigPath
  $lines += ""
  if ($status.admin) {
    $lines += "Public login"
    $lines += ("account  : {0}" -f $status.admin.account)
    $lines += ("email    : {0}" -f $status.admin.email)
    $lines += ("password : {0}" -f $status.admin.password)
    $lines += ""
  } else {
    $lines += "Public login"
    $lines += "Not created yet. It will be generated after you start public sharing."
    $lines += ""
  }
  $lines += "Logs"
  $lines += ("server   : {0}" -f $status.serverLog)
  $lines += ("tunnel   : {0}" -f $status.tunnelLog)
  $infoBox.Text = ($lines -join [Environment]::NewLine)
}

function Refresh-LauncherUi {
  $status = Get-LauncherStatus
  Format-StatusText $status
  Format-InfoText $status
}

function Show-LauncherError([string]$Message) {
  [System.Windows.Forms.MessageBox]::Show($Message, "Hegel Salon Launcher", "OK", "Error") | Out-Null
}

New-ActionButton "Start local" 24 216 {
  Set-Busy $true
  try {
    Start-LocalServer | Out-Null
    Refresh-LauncherUi
  } catch {
    Show-LauncherError $_.Exception.Message
  } finally {
    Set-Busy $false
  }
} | Out-Null

New-ActionButton "Start public share" 239 216 {
  Set-Busy $true
  try {
    Start-PublicTunnel | Out-Null
    Refresh-LauncherUi
    $status = Get-LauncherStatus
    if ($status.publicUrl) {
      [System.Windows.Forms.MessageBox]::Show(
        ("Public URL:`n`n{0}`n`nLogin account:`n{1}`nPassword:`n{2}" -f $status.publicUrl, $status.admin.account, $status.admin.password),
        "Hegel Salon Launcher",
        "OK",
        "Information"
      ) | Out-Null
    }
  } catch {
    Show-LauncherError $_.Exception.Message
  } finally {
    Set-Busy $false
  }
} | Out-Null

New-ActionButton "Open local page" 454 216 {
  $status = Get-LauncherStatus
  Start-Process $status.localUrl
} | Out-Null

New-ActionButton "Open public page" 24 460 {
  $status = Get-LauncherStatus
  if ($status.publicUrl) {
    Start-Process $status.publicUrl
  } else {
    Show-LauncherError "The public URL is not running yet."
  }
} "#8AB4F8" | Out-Null

New-ActionButton "Open API config" 239 460 {
  $status = Get-LauncherStatus
  if (-not (Test-Path $status.apiConfigPath)) {
    Ensure-ApiConfigFile
  }
  Start-Process notepad.exe $status.apiConfigPath
} "#8AB4F8" | Out-Null

New-ActionButton "Stop all" 454 460 {
  Set-Busy $true
  try {
    Stop-AllLauncherProcesses
    Refresh-LauncherUi
  } catch {
    Show-LauncherError $_.Exception.Message
  } finally {
    Set-Busy $false
  }
} "#D46A6A" | Out-Null

$form.Add_Shown({
    Refresh-LauncherUi
  })

$form.Add_FormClosing({
    Refresh-LauncherUi
  })

[void]$form.ShowDialog()
