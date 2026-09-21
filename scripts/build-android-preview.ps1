param(
  [string]$JdkPath = '',
  [string]$SdkPath = '',
  [string]$Architectures = 'arm64-v8a,armeabi-v7a'
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
$outputPath = Join-Path $projectPath 'artifacts\releases'
New-Item -ItemType Directory -Path $outputPath -Force | Out-Null
Push-Location (Join-Path $projectPath 'android')
try {
  & .\gradlew.bat :app:assembleRelease "-PreactNativeArchitectures=$Architectures" '-Pandroid.builder.sdkDownload=false' --no-daemon --console=plain --max-workers=4
  if ($LASTEXITCODE -ne 0) { throw "Gradle terminó con código $LASTEXITCODE" }
  $version = (Get-Content -LiteralPath (Join-Path $projectPath 'app.json') -Raw | ConvertFrom-Json).expo.version
  $apkPath = Join-Path $outputPath "KarmaHouse-$version-preview.apk"
  Copy-Item -LiteralPath 'app\build\outputs\apk\release\app-release.apk' -Destination $apkPath -Force
  $hash = (Get-FileHash -LiteralPath $apkPath -Algorithm SHA256).Hash.ToLowerInvariant()
  "$hash  $([System.IO.Path]::GetFileName($apkPath))" | Set-Content -LiteralPath "$apkPath.sha256" -Encoding ascii
  Write-Output "APK de prueba: $apkPath"
  Write-Output "SHA-256: $hash"
} finally { Pop-Location }
