# Fotografa il sito con Edge "invisibile" (serve per controllare le grafiche su varie misure di schermo).
# Uso: powershell -File strumenti\foto-pagina.ps1 -w 390 -h 844 -mobile -name prova -out cartella [-url ...] [-js "codice", "codice"...]
# Per ogni -js esegue il codice nella pagina, aspetta -jsWait secondi e salva nome-N.png; senza -js salva nome.png.
param([int]$w = 1440, [int]$h = 860, [string]$name = 'shot', [string]$url = 'http://localhost:5191/', [double]$wait = 4,
      [string[]]$js = @(), [double]$jsWait = 1.5, [switch]$mobile, [switch]$reduce, [switch]$transparent, [string]$out = '')
$ErrorActionPreference = 'Stop'
if (-not $out) { $out = Join-Path $env:TEMP 'foto-pagina' }
New-Item -ItemType Directory -Force $out | Out-Null
$edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"; if (-not (Test-Path $edge)) { $edge = "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe" }
$port = Get-Random -Minimum 9300 -Maximum 9800
$prof = Join-Path $env:TEMP "cdp-prof-$port"
$p = Start-Process $edge -ArgumentList "--headless=new","--remote-debugging-port=$port","--user-data-dir=$prof","--hide-scrollbars","--window-size=$w,$h","about:blank" -PassThru
try {
  $tab = $null
  for ($i = 0; $i -lt 40 -and -not $tab; $i++) { Start-Sleep -Milliseconds 250; try { $tab = (Invoke-RestMethod "http://127.0.0.1:$port/json") | Where-Object { $_.type -eq 'page' } | Select-Object -First 1 } catch {} }
  $ws = New-Object System.Net.WebSockets.ClientWebSocket
  $ws.Options.KeepAliveInterval = [TimeSpan]::Zero
  $ws.ConnectAsync([Uri]$tab.webSocketDebuggerUrl, [Threading.CancellationToken]::None).Wait()
  $script:id = 0
  function Send($method, $params) {
    $script:id++; $myId = $script:id
    $msg = @{ id = $myId; method = $method; params = $params } | ConvertTo-Json -Depth 10 -Compress
    $b = [Text.Encoding]::UTF8.GetBytes($msg)
    $ws.SendAsync((New-Object ArraySegment[byte] -ArgumentList (,$b)), 'Text', $true, [Threading.CancellationToken]::None).Wait()
    while ($true) {
      $ms = New-Object IO.MemoryStream; $buf = New-Object byte[] 1048576
      do { $seg = New-Object ArraySegment[byte] -ArgumentList (,$buf); $r = $ws.ReceiveAsync($seg, [Threading.CancellationToken]::None).Result; $ms.Write($buf, 0, $r.Count) } while (-not $r.EndOfMessage)
      $o = [Text.Encoding]::UTF8.GetString($ms.ToArray()) | ConvertFrom-Json
      if ($o.id -eq $myId) { return $o }
    }
  }
  Send 'Emulation.setDeviceMetricsOverride' @{ width = $w; height = $h; deviceScaleFactor = 1; mobile = [bool]$mobile } | Out-Null
  if ($mobile) { Send 'Emulation.setTouchEmulationEnabled' @{ enabled = $true; maxTouchPoints = 5 } | Out-Null }
  if ($transparent) { Send 'Emulation.setDefaultBackgroundColorOverride' @{ color = @{ r = 0; g = 0; b = 0; a = 0 } } | Out-Null }
  if ($reduce) { Send 'Emulation.setEmulatedMedia' @{ features = @(@{ name = 'prefers-reduced-motion'; value = 'reduce' }) } | Out-Null }
  Send 'Network.enable' @{} | Out-Null
  Send 'Network.setCacheDisabled' @{ cacheDisabled = $true } | Out-Null
  Send 'Page.navigate' @{ url = $url } | Out-Null
  Start-Sleep -Milliseconds ([int]($wait * 1000))
  $k = 0
  foreach ($j in $js) {
    $k++
    $res = Send 'Runtime.evaluate' @{ expression = $j; awaitPromise = $true; returnByValue = $true }
    if ($res.result.result.value -ne $null) { "js$k => " + ($res.result.result.value | ConvertTo-Json -Compress -Depth 6) }
    if ($res.result.exceptionDetails) { "js$k ERRORE: " + $res.result.exceptionDetails.exception.description }
    Start-Sleep -Milliseconds ([int]($jsWait * 1000))
    $shot = Send 'Page.captureScreenshot' @{ format = 'png' }
    [IO.File]::WriteAllBytes((Join-Path $out "$name-$k.png"), [Convert]::FromBase64String($shot.result.data))
  }
  if ($js.Count -eq 0) {
    $shot = Send 'Page.captureScreenshot' @{ format = 'png' }
    [IO.File]::WriteAllBytes((Join-Path $out "$name.png"), [Convert]::FromBase64String($shot.result.data))
  }
  'fatto'
} finally {
  Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
  Get-Process msedge -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*cdp-prof-$port*" } | Stop-Process -Force -ErrorAction SilentlyContinue
}
