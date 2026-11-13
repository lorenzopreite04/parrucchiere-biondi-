# Rigenera maschera dei capelli, mappa di movimento e immagine nascosta (balayage) da una foto.
# Uso (da PowerShell, nella cartella del sito):
#   powershell -ExecutionPolicy Bypass -File strumenti\genera-maschera.ps1 -Foto assets\hero-capelli.webp
#
# ATTENZIONE: le zone corrette a mano (spalle, mani, forbici, ciocca) sono coordinate di QUESTA foto
# (1280x720) e stanno in strumenti\HairMask.cs. Con una foto diversa vanno ridisegnate, poi si controllano
# le immagini in strumenti\controllo\ (verde = capelli, rosso = si muove, viola = bloccato).
#
# Versione notte (capelli chiari su sfondo nero):
#   powershell -ExecutionPolicy Bypass -File strumenti\genera-maschera.ps1 -Foto assets\hero-capelli-notte.webp -Notte
param([Parameter(Mandatory = $true)][string]$Foto, [switch]$Notte)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$site = Split-Path -Parent $here
$out  = Join-Path $here 'controllo'
New-Item -ItemType Directory -Force $out | Out-Null

# 1) converte la foto (webp/jpg/png) in PNG
Add-Type -AssemblyName PresentationCore, WindowsBase
$fs  = [IO.File]::OpenRead((Resolve-Path $Foto))
$dec = [System.Windows.Media.Imaging.BitmapDecoder]::Create($fs, 'None', 'OnLoad')
$enc = New-Object System.Windows.Media.Imaging.PngBitmapEncoder
$enc.Frames.Add([System.Windows.Media.Imaging.BitmapFrame]::Create($dec.Frames[0]))
$png = Join-Path $out 'foto.png'
$o = [IO.File]::Create($png); $enc.Save($o); $o.Close(); $fs.Close()

$utf8 = New-Object System.Text.UTF8Encoding($false)
if ($Notte) {
  # maschera + mappa di movimento (versione notte), poi mappa compressa 640x360 per il sito
  Add-Type -TypeDefinition ([IO.File]::ReadAllText((Join-Path $here 'HairMaskNotte.cs'), $utf8)) -ReferencedAssemblies System.Drawing
  [HairMaskNotte]::Run($png, $out) | Out-Null
  Add-Type -AssemblyName System.Drawing
  $mob = New-Object System.Drawing.Bitmap (Join-Path $out '3_mobility.png')
  $small = New-Object System.Drawing.Bitmap 640, 360, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($small); $g.InterpolationMode = 'HighQualityBicubic'; $g.DrawImage($mob, 0, 0, 640, 360); $g.Dispose()
  $jpg = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
  $p = New-Object System.Drawing.Imaging.EncoderParameters 1
  $p.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 92L
  $small.Save((Join-Path $site 'assets\hero-capelli-notte-mappa.jpg'), $jpg, $p); $small.Dispose(); $mob.Dispose()
  Write-Host "Fatto (notte). Controlla le immagini in $out, poi ricarica il sito."
  return
}

# 2) maschera + mappa di movimento + immagini di controllo
Add-Type -TypeDefinition ([IO.File]::ReadAllText((Join-Path $here 'HairMask.cs'), $utf8)) -ReferencedAssemblies System.Drawing
[HairMask]::Run($png, $out) | Out-Null

# 3) immagine nascosta (balayage) + mappa compressa per il sito
Add-Type -TypeDefinition (Get-Content (Join-Path $here 'Balayage.cs') -Raw) -ReferencedAssemblies System.Drawing
[Balayage]::Run($png, (Join-Path $out '2_mask_hair.png'), (Join-Path $out '3_mobility.png'), (Join-Path $site 'assets')) | Out-Null

Write-Host "Fatto. Controlla le immagini in $out, poi ricarica il sito."
