param(
  [string]$JdkPath = '',
  [string]$SdkPath = '',
  [string]$Architectures = 'arm64-v8a,armeabi-v7a',
  # Signs with the private upload key and also builds the .aab that Google Play requires.
  [switch]$Release
)
$ErrorActionPreference = 'Stop'
$projectPath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (!$JdkPath) {
  $localJdkPath = Join-Path $projectPath 'artifacts\android-tooling\jdk17\jdk-17.0.20.1+1'
  $JdkPath = if (Test-Path -LiteralPath (Join-Path $localJdkPath 'bin\java.exe')) { $localJdkPath } else { 'C:\Program Files\Android\Android Studio\jbr' }
}
if (!$SdkPath) {
  $localSdkPath = Join-Path $projectPath 'artifacts\android-sdk'
  $SdkPath = if (Test-Path -LiteralPath (Join-Path $localSdkPath 'platforms\android-36\android.jar')) { $localSdkPath } else { "$env:LOCALAPPDATA\Android\Sdk" }
}
if (!(Test-Path -LiteralPath (Join-Path $JdkPath 'bin\java.exe'))) { throw 'JDK no encontrado. Indica -JdkPath.' }
if (!(Test-Path -LiteralPath $SdkPath)) { throw 'Android SDK no encontrado. Indica -SdkPath.' }
if ($SdkPath -match '\s') { throw 'La ruta del Android SDK debe estar libre de espacios para conservar el nombre clang++.exe al enlazar C++. Indica -SdkPath con una copia local del SDK.' }
if (!(Test-Path -LiteralPath (Join-Path $projectPath 'android\gradlew.bat'))) { throw 'Primero ejecuta npx expo prebuild --platform android --no-install.' }
$expoConfig = (Get-Content -LiteralPath (Join-Path $projectPath 'app.json') -Raw | ConvertFrom-Json).expo
$nativeConfig = Get-Content -LiteralPath (Join-Path $projectPath 'android\app\build.gradle') -Raw
foreach ($field in @('applicationId', 'namespace')) {
  $fieldPattern = '(?m)^\s*' + $field + '\s+["'']([^"'']+)["'']'
  if ($nativeConfig -notmatch $fieldPattern -or $matches[1] -ne $expoConfig.android.package) {
    throw 'El proyecto Android no coincide con app.json. Ejecuta npx expo prebuild --platform android --no-install antes de compilar.'
  }
}
$env:JAVA_HOME = $JdkPath
$env:ANDROID_HOME = $SdkPath
$bundledNodePath = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin'
if (Test-Path -LiteralPath (Join-Path $bundledNodePath 'node.exe')) { $env:PATH = $bundledNodePath + ';' + $env:PATH }
$env:PATH = (Join-Path $JdkPath 'bin') + ';' + $env:PATH
$env:NODE_ENV = 'production'
$env:EXPO_OFFLINE = '1'
$env:CI = '1'
$socketPath = Join-Path $projectPath 'artifacts\java-sockets'
New-Item -ItemType Directory -Path $socketPath -Force | Out-Null
# A workspace path avoids Windows packaged-app redirection of Java's socket files.
$socketOption = '"-Djdk.net.unixdomain.tmpdir=' + $socketPath + '"'
$env:JAVA_TOOL_OPTIONS = (@($env:JAVA_TOOL_OPTIONS, $socketOption) | Where-Object { $_ }) -join ' '
$signing = @()
if ($Release) {
  # credentials/ is ignored by Git. The template's debug.keystore is public, so anything signed
  # with it could be replaced on a phone by an APK anyone can build.
  $keyConfigPath = Join-Path $projectPath 'credentials\android-release.properties'
  if (!(Test-Path -LiteralPath $keyConfigPath)) { throw 'Falta credentials\android-release.properties (storeFile, storePassword, keyAlias, keyPassword).' }
  $key = @{}
  foreach ($line in Get-Content -LiteralPath $keyConfigPath) { if ($line -match '^\s*([A-Za-z]+)\s*=\s*(.*)$') { $key[$matches[1]] = $matches[2].Trim() } }
  $storeFile = Join-Path $projectPath $key.storeFile
  if (!(Test-Path -LiteralPath $storeFile)) { throw "No existe el almacén de claves $storeFile." }
  $signing = @("-Pandroid.injected.signing.store.file=$storeFile", "-Pandroid.injected.signing.store.password=$($key.storePassword)", "-Pandroid.injected.signing.key.alias=$($key.keyAlias)", "-Pandroid.injected.signing.key.password=$($key.keyPassword)")
}
$outputPath = Join-Path $projectPath 'artifacts\releases'
New-Item -ItemType Directory -Path $outputPath -Force | Out-Null
Push-Location (Join-Path $projectPath 'android')
try {
  $tasks = if ($Release) { @(':app:assembleRelease', ':app:bundleRelease') } else { @(':app:assembleRelease') }
  & .\gradlew.bat @tasks "-PreactNativeArchitectures=$Architectures" '-Pandroid.builder.sdkDownload=false' @signing --no-daemon --console=plain --max-workers=4
  if ($LASTEXITCODE -ne 0) { throw "Gradle terminó con código $LASTEXITCODE" }
  $version = (Get-Content -LiteralPath (Join-Path $projectPath 'app.json') -Raw | ConvertFrom-Json).expo.version
  $suffix = if ($Release) { '' } else { '-preview' }
  $outputs = @(@{ From = 'app\build\outputs\apk\release\app-release.apk'; To = "KarmaHouse-$version$suffix.apk" })
  if ($Release) { $outputs += @{ From = 'app\build\outputs\bundle\release\app-release.aab'; To = "KarmaHouse-$version.aab" } }
  foreach ($output in $outputs) {
    $path = Join-Path $outputPath $output.To
    Copy-Item -LiteralPath $output.From -Destination $path -Force
    $hash = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
    "$hash  $($output.To)" | Set-Content -LiteralPath "$path.sha256" -Encoding ascii
    Write-Output "$($output.To): $path"
    Write-Output "SHA-256: $hash"
  }
} finally { Pop-Location }
