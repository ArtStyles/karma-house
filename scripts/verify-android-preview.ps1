param(
  [Parameter(Mandatory = $true)]
  [string]$ApkPath,
  [string]$SdkPath = "$env:LOCALAPPDATA\Android\Sdk",
  [string]$BuildToolsVersion = '36.1.0',
  [string]$JdkPath = 'C:\Program Files\Android\Android Studio\jbr',
  [string]$ExpectedVersion = '',
  [string]$ExpectedPackage = '',
  [Nullable[int]]$ExpectedVersionCode = $null,
  [string]$ExpectedCertificateSha256 = ''
)

$ErrorActionPreference = 'Stop'
$projectPath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$expoConfig = (Get-Content -LiteralPath (Join-Path $projectPath 'app.json') -Raw | ConvertFrom-Json).expo
if (!$ExpectedVersion) { $ExpectedVersion = $expoConfig.version }
if (!$ExpectedPackage) { $ExpectedPackage = $expoConfig.android.package }
if ($null -eq $ExpectedVersionCode) { $ExpectedVersionCode = $expoConfig.android.versionCode }
if ($null -eq $ExpectedVersionCode -or $ExpectedVersionCode -lt 1) { throw 'Indica un ExpectedVersionCode positivo o configúralo en app.json.' }
if ($ExpectedCertificateSha256) {
  $ExpectedCertificateSha256 = $ExpectedCertificateSha256.Trim().Replace(':', '').ToLowerInvariant()
  if ($ExpectedCertificateSha256 -notmatch '^[0-9a-f]{64}$') { throw 'ExpectedCertificateSha256 debe contener una huella SHA-256 válida.' }
}
$resolvedApkPath = (Resolve-Path -LiteralPath $ApkPath).Path
$apkFile = Get-Item -LiteralPath $resolvedApkPath
if ($apkFile.PSIsContainer -or $apkFile.Extension -ne '.apk') { throw 'Indica un archivo APK existente.' }
$buildToolsPath = Join-Path $SdkPath "build-tools\$BuildToolsVersion"
$aaptPath = Join-Path $buildToolsPath 'aapt.exe'
$apksignerPath = Join-Path $buildToolsPath 'apksigner.bat'
$zipalignPath = Join-Path $buildToolsPath 'zipalign.exe'
foreach ($toolPath in @($aaptPath, $apksignerPath, (Join-Path $JdkPath 'bin\java.exe'))) {
  if (!(Test-Path -LiteralPath $toolPath -PathType Leaf)) { throw "Herramienta requerida no encontrada: $toolPath" }
}

function Read-LocalConfiguration([string]$Path) {
  if (!(Test-Path -LiteralPath $Path -PathType Leaf)) { throw 'Falta un archivo local de configuración necesario para verificar el APK.' }
  $configuration = @{}
  foreach ($line in [System.IO.File]::ReadAllLines($Path)) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$') {
      $value = $matches[2].Trim()
      if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
        $value = $value.Substring(1, $value.Length - 2)
      }
      $configuration[$matches[1]] = $value
    }
  }
  return $configuration
}

function Test-PrivateCredentialText([string]$Text) {
  # Also recognize UTF-16 ASCII markers and JSON serialized inside a JS string.
  $normalizedText = $Text.Replace([string][char]0, '') -replace '\\+"', '"'
  return ($normalizedText -match '-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----' -or
    $normalizedText -match '"type"\s*:\s*"service_account"')
}

$publicConfiguration = Read-LocalConfiguration (Join-Path $projectPath '.env.local')
$privateConfiguration = Read-LocalConfiguration (Join-Path $projectPath 'infra\.env.local')
$publicNames = @('EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
$privateNames = @('SUPABASE_SECRET_KEY', 'SUPABASE_DB_PASSWORD', 'KARMAHOUSE_ADMIN_EMAIL')
foreach ($name in $publicNames) {
  if ([string]::IsNullOrWhiteSpace($publicConfiguration[$name])) { throw "Falta la configuración pública requerida: $name" }
}
foreach ($name in $privateNames) {
  if ([string]::IsNullOrWhiteSpace($privateConfiguration[$name])) { throw "Falta el valor privado de referencia para la comprobación: $name" }
}

$previousJavaHome = $env:JAVA_HOME
try {
  $env:JAVA_HOME = $JdkPath
  $signatureOutput = @(& $apksignerPath verify --verbose --print-certs $resolvedApkPath 2>&1)
  if ($LASTEXITCODE -ne 0) { throw 'apksigner rechazó la firma del APK.' }
  $signatureText = $signatureOutput -join "`n"
  if ($signatureText -notmatch '(?m)^Verified using v2 scheme.*:\s*true\s*$') { throw 'El APK no tiene una firma v2 válida.' }
  if ($ExpectedCertificateSha256) {
    $certificateMatches = [regex]::Matches($signatureText, '(?m)^Signer #[0-9]+ certificate SHA-256 digest:\s*([0-9a-fA-F]{64})\s*$')
    if ($certificateMatches.Count -ne 1 -or $certificateMatches[0].Groups[1].Value.ToLowerInvariant() -ne $ExpectedCertificateSha256) {
      throw 'El certificado de firma no coincide con la huella SHA-256 esperada.'
    }
  }

  $badgingOutput = @(& $aaptPath dump badging $resolvedApkPath 2>&1)
  if ($LASTEXITCODE -ne 0) { throw 'aapt no pudo leer los metadatos del APK.' }
  $badging = $badgingOutput -join "`n"
  if ($badging -notmatch "(?m)^package: name='([^']+)'\s+versionCode='([0-9]+)'\s+versionName='([^']+)'") { throw 'No se pudo leer el identificador del APK.' }
  $packageName = $matches[1]
  $versionCode = $matches[2]
  $versionName = $matches[3]
  if ($packageName -ne $ExpectedPackage) { throw "El identificador del APK no coincide con $ExpectedPackage." }
  if ($versionName -ne $ExpectedVersion) { throw "La versión del APK no coincide con $ExpectedVersion." }
  if ([int]$versionCode -ne $ExpectedVersionCode) { throw "El versionCode no coincide con $ExpectedVersionCode." }
  if ($badging -notmatch "(?m)^sdkVersion:'24'\s*$") { throw 'El APK no declara Android API 24 como versión mínima.' }
  if ($badging -match '(?m)^application-debuggable(?:\s|$)') { throw 'El APK está marcado como depurable.' }

  $zipAlignmentChecked = $false
  if (Test-Path -LiteralPath $zipalignPath -PathType Leaf) {
    $null = & $zipalignPath -c -P 16 4 $resolvedApkPath 2>&1
    if ($LASTEXITCODE -ne 0) { throw 'zipalign rechazó la alineación ZIP del APK para páginas de 16 KB.' }
    $zipAlignmentChecked = $true
  }

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  if (-not ('KarmaHouse.ApkByteScan' -as [type])) {
    Add-Type -TypeDefinition @'
namespace KarmaHouse {
  public static class ApkByteScan {
    public static bool Contains(byte[] source, byte[] pattern) {
      if (pattern.Length == 0) return false;
      int end = source.Length - pattern.Length;
      for (int start = 0; start <= end; start++) {
        if (source[start] != pattern[0]) continue;
        int offset = 1;
        while (offset < pattern.Length && source[start + offset] == pattern[offset]) offset++;
        if (offset == pattern.Length) return true;
      }
      return false;
    }
  }
}
'@
  }
  $privatePatterns = foreach ($name in $privateNames) {
    foreach ($encoding in @([System.Text.Encoding]::UTF8, [System.Text.Encoding]::Unicode, [System.Text.Encoding]::BigEndianUnicode)) {
      [PSCustomObject]@{ Name = $name; Bytes = $encoding.GetBytes($privateConfiguration[$name]) }
    }
  }
  $archive = [System.IO.Compression.ZipFile]::OpenRead($resolvedApkPath)
  try {
    $bundles = @($archive.Entries | Where-Object FullName -eq 'assets/index.android.bundle')
    if ($bundles.Count -ne 1 -or $bundles[0].Length -lt 100000) { throw 'Falta un bundle JavaScript/Hermes completo dentro del APK.' }
    $bundleBytes = $bundles[0].Length
    $abis = @($archive.Entries | ForEach-Object { if ($_.FullName -match '^lib/([^/]+)/[^/]+\.so$') { $matches[1] } } | Sort-Object -Unique)
    foreach ($requiredAbi in @('arm64-v8a', 'armeabi-v7a')) {
      if ($abis -notcontains $requiredAbi) { throw "Faltan bibliotecas nativas para $requiredAbi." }
    }
    $entryCount = 0
    foreach ($entry in $archive.Entries) {
      if ($entry.FullName.EndsWith('/')) { continue }
      $stream = $entry.Open()
      $buffer = New-Object System.IO.MemoryStream
      try {
        $stream.CopyTo($buffer)
        $bytes = $buffer.ToArray()
        foreach ($pattern in $privatePatterns) {
          if ([KarmaHouse.ApkByteScan]::Contains($bytes, $pattern.Bytes)) {
            throw "El APK contiene un valor privado ($($pattern.Name)); no debe distribuirse."
          }
        }
        if ($entry.FullName -match '(?i)\.(bundle|js|json|txt|xml|pem|key|p8|env|ya?ml|html|css|properties)$|(^|/)\.env($|\.)') {
          if (Test-PrivateCredentialText ([System.Text.Encoding]::UTF8.GetString($bytes))) {
            throw 'El APK contiene un marcador de clave privada o de credencial de servicio; no debe distribuirse.'
          }
        }
        if ($entry.FullName -eq 'assets/index.android.bundle') {
          foreach ($name in $publicNames) {
            if (-not [KarmaHouse.ApkByteScan]::Contains($bytes, [System.Text.Encoding]::UTF8.GetBytes($publicConfiguration[$name]))) {
              throw "El bundle no contiene la configuración pública requerida: $name"
            }
          }
        }
        $entryCount++
      } finally {
        $buffer.Dispose()
        $stream.Dispose()
      }
    }
  } finally { $archive.Dispose() }

  $sha256 = (Get-FileHash -LiteralPath $resolvedApkPath -Algorithm SHA256).Hash.ToLowerInvariant()
  Write-Output 'Verificación del APK aprobada.'
  Write-Output "Archivo: $resolvedApkPath"
  Write-Output "Paquete: $packageName; versión: $versionName ($versionCode); minSdk: 24; depurable: no"
  Write-Output "Arquitecturas: $($abis -join ', '); bundle: $bundleBytes bytes"
  Write-Output "Configuración pública incluida; $entryCount entradas descomprimidas sin valores privados."
  Write-Output 'Bundle y archivos de texto sin marcadores PEM privados ni credenciales JSON de servicio.'
  if ($zipAlignmentChecked) {
    Write-Output 'Alineación ZIP para páginas de 16 KB verificada; no evalúa la alineación ELF de las bibliotecas nativas.'
  } else {
    Write-Output 'Alineación ZIP no comprobada: zipalign no está disponible en el SDK indicado.'
  }
  Write-Output "Tamaño: $($apkFile.Length) bytes ($([Math]::Round($apkFile.Length / 1MB, 2)) MiB)"
  Write-Output "SHA-256: $sha256"
  $signatureOutput | Where-Object { $_ -match '^Verified using v[1-4] scheme.*:\s*true\s*$|^Signer #[0-9]+ certificate SHA-256 digest:' } | ForEach-Object { Write-Output $_ }
} finally {
  $env:JAVA_HOME = $previousJavaHome
}
