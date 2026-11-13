# Prepara icone e versioni leggere delle foto per i telefoni.
# Uso (dalla cartella del sito): powershell -File strumenti\immagini.ps1 [-icone cartella-con-fav256.png-app512.png-og.png]
# Le foto "-640" si rigenerano da sole a partire dagli originali in assets/ (non toccati).
param([string]$icone = '')
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$assets = Join-Path $root 'assets'
$jpg = [Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }

function Resize([Drawing.Image]$src, [int]$w, [int]$h) {
  $bmp = New-Object Drawing.Bitmap $w, $h
  $g = [Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = 'HighQualityBicubic'; $g.SmoothingMode = 'HighQuality'; $g.PixelOffsetMode = 'HighQuality'; $g.CompositingQuality = 'HighQuality'
  $g.DrawImage($src, 0, 0, $w, $h); $g.Dispose(); return $bmp
}
function SaveJpg([Drawing.Image]$img, [string]$path, [int]$q) {
  $p = New-Object Drawing.Imaging.EncoderParameters 1
  $p.Param[0] = New-Object Drawing.Imaging.EncoderParameter ([Drawing.Imaging.Encoder]::Quality), ([long]$q)
  $img.Save($path, $jpg, $p)
}

# --- foto per i telefoni: larghe 640 px ---
foreach ($n in 'mounir-emilio', 'mounir-palco', 'chi-siamo-postazioni', 'chi-siamo-salone', 'risultato-1', 'risultato-2', 'risultato-3', 'risultato-4', 'risultato-5', 'risultato-6') {
  $f = Join-Path $assets "$n.jpg"
  if (-not (Test-Path $f)) { continue }
  $src = [Drawing.Image]::FromFile($f)
  if ($src.Width -gt 700) {
    $h = [int][Math]::Round($src.Height * 640 / $src.Width)
    $b = Resize $src 640 $h
    SaveJpg $b (Join-Path $assets "$n-640.jpg") 80
    $b.Dispose()
    "{0}: {1}x{2} -> 640x{3}" -f $n, $src.Width, $src.Height, $h
  } else { "{0}: {1}x{2}, abbastanza piccola" -f $n, $src.Width, $src.Height }
  $src.Dispose()
}

# --- icone (dalle immagini fotografate con il browser) ---
if ($icone) {
  $app = [Drawing.Image]::FromFile((Join-Path $icone 'app512.png'))
  $app.Save((Join-Path $root 'icon-512.png'), [Drawing.Imaging.ImageFormat]::Png)
  foreach ($s in @(@(192, 'icon-192.png'), @(180, 'apple-touch-icon.png'))) {
    $b = Resize $app $s[0] $s[0]; $b.Save((Join-Path $root $s[1]), [Drawing.Imaging.ImageFormat]::Png); $b.Dispose()
  }
  $app.Dispose()

  $og = [Drawing.Image]::FromFile((Join-Path $icone 'og.png'))
  SaveJpg $og (Join-Path $assets 'anteprima-social.jpg') 86
  $og.Dispose()

  # favicon.ico con dentro 16, 32 e 48 px (per i browser che non leggono favicon.svg)
  $fav = [Drawing.Image]::FromFile((Join-Path $icone 'fav256.png'))
  $pngs = foreach ($s in 16, 32, 48) {
    $b = Resize $fav $s $s; $ms = New-Object IO.MemoryStream; $b.Save($ms, [Drawing.Imaging.ImageFormat]::Png); $b.Dispose()
    , @($s, $ms.ToArray())
  }
  $fav.Dispose()
  $out = New-Object IO.MemoryStream; $wr = New-Object IO.BinaryWriter $out
  $wr.Write([uint16]0); $wr.Write([uint16]1); $wr.Write([uint16]$pngs.Count)
  $offset = 6 + 16 * $pngs.Count
  foreach ($p in $pngs) {
    $wr.Write([byte]$p[0]); $wr.Write([byte]$p[0]); $wr.Write([byte]0); $wr.Write([byte]0)
    $wr.Write([uint16]1); $wr.Write([uint16]32); $wr.Write([uint32]$p[1].Length); $wr.Write([uint32]$offset)
    $offset += $p[1].Length
  }
  foreach ($p in $pngs) { $wr.Write([byte[]]$p[1]) }
  [IO.File]::WriteAllBytes((Join-Path $root 'favicon.ico'), $out.ToArray())
  'icone pronte'
}
