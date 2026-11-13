# Genera la sagoma della ragazza (per i riflessi di luce dietro di lei) per le due foto della hero.
# Uso (da PowerShell, nella cartella del sito):
#   powershell -ExecutionPolicy Bypass -File strumenti\genera-sagoma.ps1
# Poi controlla strumenti\controllo\sagoma-*.png (bianco = ragazza, i riflessi vanno solo sul nero).
param([int]$Allarga = 8, [int]$Sfuma = 3)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$site = Split-Path -Parent $here
$out  = Join-Path $here 'controllo'
New-Item -ItemType Directory -Force $out | Out-Null
Add-Type -AssemblyName PresentationCore, WindowsBase, System.Drawing
Add-Type -TypeDefinition ([IO.File]::ReadAllText((Join-Path $here 'Sagoma.cs'), (New-Object System.Text.UTF8Encoding($false)))) -ReferencedAssemblies System.Drawing

function ToPng($foto, $png) {
  $fs  = [IO.File]::OpenRead($foto)
  $dec = [System.Windows.Media.Imaging.BitmapDecoder]::Create($fs, 'None', 'OnLoad')
  $enc = New-Object System.Windows.Media.Imaging.PngBitmapEncoder
  $enc.Frames.Add([System.Windows.Media.Imaging.BitmapFrame]::Create($dec.Frames[0]))
  $o = [IO.File]::Create($png); $enc.Save($o); $o.Close(); $fs.Close()
}

# foto, file di uscita, soglia (differenza dal colore di fondo)
$lavori = @(
  @('assets\hero-capelli.webp',       'assets\hero-capelli-sagoma.png',       20),
  @('assets\hero-capelli-notte.webp', 'assets\hero-capelli-notte-sagoma.png', 24)
)
foreach ($l in $lavori) {
  $png = Join-Path $out 'sagoma-foto.png'
  ToPng (Join-Path $site $l[0]) $png
  $dest = Join-Path $site $l[1]
  $info = [Sagoma]::Run($png, $dest, $l[2], $Allarga, $Sfuma)
  Copy-Item $dest (Join-Path $out ('sagoma-' + (Split-Path -Leaf $l[1])))
  Write-Host "$($l[1]): $info"
}
Remove-Item (Join-Path $out 'sagoma-foto.png') -ErrorAction SilentlyContinue
Write-Host "Fatto. Controlla le sagome in $out, poi ricarica il sito."
