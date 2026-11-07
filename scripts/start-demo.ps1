# KeepHard demo launcher: starts the backend detached, waits for /health, prints what to load.
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root 'backend'
$log = Join-Path $env:TEMP 'keephard-backend.log'
$port = 8787

Write-Host "== KeepHard demo start ==" -ForegroundColor Cyan

# 1. kill stale listeners on the port
$pids = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
foreach ($p in $pids) { if ($p -gt 0) { Write-Host "Killing stale process $p on :$port"; Stop-Process -Id $p -Force -ErrorAction SilentlyContinue } }
Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -match 'tsx' -and $_.CommandLine -match 'server\.ts' } |
  ForEach-Object { Write-Host "Killing stale tsx server $($_.ProcessId)"; Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Milliseconds 700

# 2. deps
if (-not (Test-Path (Join-Path $backend 'node_modules'))) {
  Write-Host "Installing backend dependencies..." -ForegroundColor Yellow
  Push-Location $backend; npm install; Pop-Location
}

# 3. start detached, minimized, logging to %TEMP%
if (Test-Path $log) { Remove-Item $log -Force -ErrorAction SilentlyContinue }
Start-Process -FilePath 'cmd.exe' -ArgumentList "/c npm start > `"$log`" 2>&1" -WorkingDirectory $backend -WindowStyle Minimized

# 4. wait for /health
$ok = $false
for ($i = 0; $i -lt 45; $i++) {
  try { $r = Invoke-RestMethod -Uri "http://localhost:$port/health" -TimeoutSec 2; if ($r.ok) { $ok = $true; break } } catch {}
  Start-Sleep -Seconds 1
}
if (-not $ok) {
  Write-Host "FAILED: backend did not answer on :$port. Log: $log" -ForegroundColor Red
  if (Test-Path $log) { Get-Content $log -Tail 20 }
  exit 1
}

# 5. env key presence (names only, never values)
$envFile = Join-Path $root '.env'
$present = @{}
if (Test-Path $envFile) {
  foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*([A-Z0-9_]+)\s*=\s*(\S.*?)\s*$') { $present[$Matches[1]] = $true }
  }
} else { Write-Host "No .env at $envFile" -ForegroundColor Red }
Write-Host ""
Write-Host "Env keys (.env):"
foreach ($k in 'ELEVENLABS_API_KEY','ELEVENLABS_AGENT_ID','ELEVENLABS_VOICE_ID','ANTHROPIC_API_KEY','FIRECRAWL_API_KEY') {
  if ($present[$k]) { Write-Host "  [set]     $k" -ForegroundColor Green } else { Write-Host "  [MISSING] $k" -ForegroundColor Yellow }
}

$ext = Join-Path $root 'extension\.output\chrome-mv3'
Write-Host ""
Write-Host "READY" -ForegroundColor Green
Write-Host "Backend: http://localhost:$port  (log: $log)"
Write-Host "Load unpacked extension from: $ext"
if (-not (Test-Path (Join-Path $ext 'manifest.json'))) { Write-Host "  (not built: cd extension; npm run build)" -ForegroundColor Red }
Write-Host "Demo pages:"
Write-Host "  https://www.amazon.co.uk/dp/B0DBBBN8YP   (Brooks Glycerin 22)"
Write-Host "  https://www.amazon.co.uk/dp/B0DPHTGD5C   (Nike Revolution 8)"
Write-Host "  https://www.amazon.co.uk/dp/B08KKVTB76   (PUMA Viz Runner)"
Write-Host "  http://127.0.0.1:5173  (mock shop, run: cd extension; npm run shop)"
Write-Host "Next: node scripts\demo-check.mjs"
