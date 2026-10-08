param(
  [Parameter(Mandatory = $true)]
  [string]$ApkPath,
  [string]$SdkPath = '',
  [string]$JdkPath = '',
  [string]$BuildToolsVersion = '36.0.0',
  [string]$PrivateConfigurationPath = ''
)

$ErrorActionPreference = 'Stop'
$projectPath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$expoConfig = (Get-Content -LiteralPath (Join-Path $projectPath 'app.json') -Raw | ConvertFrom-Json).expo
if ($expoConfig.version -notmatch '^\d+\.\d+\.\d+$') { throw 'La versión de distribución debe tener el formato x.y.z.' }
if (!$SdkPath) {
  $localSdk = Join-Path $projectPath 'artifacts\android-sdk'
  $SdkPath = if (Test-Path -LiteralPath $localSdk) { $localSdk } else { "$env:LOCALAPPDATA\Android\Sdk" }
}
if (!$JdkPath) {
  $localJdk = Join-Path $projectPath 'artifacts\android-tooling\jdk17\jdk-17.0.20.1+1'
  $JdkPath = if (Test-Path -LiteralPath $localJdk) { $localJdk } else { 'C:\Program Files\Android\Android Studio\jbr' }
}

# This public fingerprint is independent of the supplied APK and the local key
# store. A valid signature from the template's debug key must never pass here.
$releaseCertificate = '1752d33a3fb6e45fada4e6adbbec99af851d9ae6716a73770c382c79d3356ac6'
$source = (Resolve-Path -LiteralPath $ApkPath).Path
$hashBefore = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant()
$verification = @(& (Join-Path $PSScriptRoot 'verify-android-preview.ps1') `
  -ApkPath $source -SdkPath $SdkPath -JdkPath $JdkPath -BuildToolsVersion $BuildToolsVersion `
  -ExpectedVersion $expoConfig.version -ExpectedVersionCode $expoConfig.android.versionCode `
  -ExpectedPackage $expoConfig.android.package -ExpectedCertificateSha256 $releaseCertificate `
  -PrivateConfigurationPath $PrivateConfigurationPath)
$hashAfter = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant()
if ($hashBefore -ne $hashAfter) { throw 'El APK cambió durante la verificación.' }

$output = Join-Path $projectPath "artifacts\distribution\$($expoConfig.version)"
if (Test-Path -LiteralPath $output) { throw "Ya existe el paquete preparado: $output. Conserva o mueve esa entrega antes de preparar otra." }
New-Item -ItemType Directory -Path $output | Out-Null
$publicApk = Join-Path $output 'KarmaHouse.apk'
Copy-Item -LiteralPath $source -Destination $publicApk
if ((Get-FileHash -LiteralPath $publicApk -Algorithm SHA256).Hash.ToLowerInvariant() -ne $hashAfter) {
  throw 'La copia de distribución no coincide con el APK verificado; no la publiques.'
}
"$hashAfter  KarmaHouse.apk" | Set-Content -LiteralPath (Join-Path $output 'KarmaHouse.apk.sha256') -Encoding ascii
Copy-Item -LiteralPath (Join-Path $projectPath 'docs\android-installation.txt') -Destination (Join-Path $output 'INSTALACION.txt')
$verification | Set-Content -LiteralPath (Join-Path $output 'VERIFICACION-local.txt') -Encoding utf8
@"
KarmaHouse $($expoConfig.version) para Android

Descarga directa desde la web oficial. Android 7 o posterior.
Paquete: $($expoConfig.android.package)
VersionCode: $($expoConfig.android.versionCode)
SHA-256 de KarmaHouse.apk: $hashAfter
SHA-256 del certificado: $releaseCertificate

Incluye espacios de inmobiliarias: registro y revisión, equipos, cartera compartida,
conversaciones, propuestas, agenda, seguimiento y confirmación de cierres.
La aprobación de cada inmobiliaria y su sello de verificación son decisiones separadas.
Los cierres conservan el historial y terminan los compromisos comerciales afectados.
Incluye avisos de inmobiliarias y consulta autorizada del historial con el módulo apagado.
El APK conserva el certificado de las versiones anteriores.
Android puede solicitar autorización para instalar desde el navegador y un
análisis de Play Protect. Mantén Play Protect activado. Esta entrega no implica
una aprobación de Google ni garantiza la ausencia de avisos.

Archivos públicos: KarmaHouse.apk, KarmaHouse.apk.sha256, INSTALACION.txt.
VERIFICACION-local.txt es evidencia local; no hace falta publicarlo.
"@ | Set-Content -LiteralPath (Join-Path $output 'NOTAS-RELEASE.txt') -Encoding utf8
$verification | ForEach-Object { Write-Output $_ }
Write-Output "Entrega preparada: $output"
