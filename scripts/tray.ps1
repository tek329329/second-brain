# Runs the Life OS server hidden and shows a tray icon (Open / Restart / Quit).
Add-Type -AssemblyName System.Windows.Forms, System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$port = if ($env:PORT) { $env:PORT } else { '4317' }
$url = "http://127.0.0.1:$port"
$node = (Get-Command node -ErrorAction Stop).Source

$mutex = New-Object System.Threading.Mutex($false, 'Local\LifeOSTray')
if (-not $mutex.WaitOne(0)) { exit }

$script:server = $null

function Get-PortPid {
  $c = Get-NetTCPConnection -LocalPort ([int]$port) -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($c) { $c.OwningProcess } else { $null }
}

function Stop-Server {
  $procId = Get-PortPid
  if ($procId) { Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue }
  $script:server = $null
}

function Start-Server {
  if (Get-PortPid) { return }
  $script:server = Start-Process -FilePath $node -ArgumentList 'server/start.mjs' `
    -WorkingDirectory $root -WindowStyle Hidden -PassThru
}

Start-Server

$tray = New-Object System.Windows.Forms.NotifyIcon
$tray.Icon = [System.Drawing.SystemIcons]::Application
$tray.Text = 'Life OS'
$menu = New-Object System.Windows.Forms.ContextMenuStrip
$menu.Items.Add('Open Life OS').add_Click({ Start-Process $url }) | Out-Null
$menu.Items.Add('Restart server').add_Click({ Stop-Server; Start-Sleep -Milliseconds 500; Start-Server }) | Out-Null
$menu.Items.Add('Quit').add_Click({
    Stop-Server
    $tray.Visible = $false
    [System.Windows.Forms.Application]::Exit()
  }) | Out-Null
$tray.ContextMenuStrip = $menu
$tray.add_DoubleClick({ Start-Process $url })
$tray.Visible = $true

[System.Windows.Forms.Application]::Run()
$tray.Dispose()
$mutex.ReleaseMutex()
