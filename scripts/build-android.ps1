param(
    [switch]$Release
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$AndroidRoot = Join-Path $Root "android-app"
# Prefer the project's own Gradle wrapper (pinned to the version the Android
# plugin requires -- currently 8.9 in gradle/wrapper/gradle-wrapper.properties).
$Gradle = Join-Path $AndroidRoot "gradlew.bat"
$AndroidStudioJava = "C:\Program Files\Android\Android Studio\jbr"

if (-not (Test-Path $Gradle)) {
    throw "Gradle wrapper not found at $Gradle"
}
if (-not (Test-Path $AndroidStudioJava)) {
    throw "Android Studio JDK is not installed at $AndroidStudioJava"
}

$env:JAVA_HOME = $AndroidStudioJava
$env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA "Android\Sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:ANDROID_USER_HOME = Join-Path $AndroidRoot ".android-home"
$BuildRoot = Join-Path $AndroidRoot (".tmp-gradle-build\cli-" + $PID)
$env:RESTROSUITE_ANDROID_BUILD_ROOT = $BuildRoot
$Variant = if ($Release) { "release" } else { "debug" }
$Task = if ($Release) { "assembleRelease" } else { "assembleDebug" }

Push-Location $AndroidRoot
try {
    & $Gradle --no-daemon $Task
    if ($LASTEXITCODE -ne 0) {
        throw "Android build failed with exit code $LASTEXITCODE"
    }

    $Apk = Join-Path $BuildRoot ("_app\outputs\apk\" + $Variant + "\app-" + $Variant + ".apk")
    if (-not (Test-Path $Apk)) {
        throw "Android build completed but APK was not found at $Apk"
    }

    $BuildFile = Get-Content (Join-Path $AndroidRoot "app\build.gradle") -Raw
    $VersionMatch = [regex]::Match($BuildFile, 'versionName\s+"([^"]+)"')
    if (-not $VersionMatch.Success) {
        throw "Could not read versionName from app/build.gradle"
    }

    $Dist = Join-Path $AndroidRoot "dist"
    New-Item -ItemType Directory -Path $Dist -Force | Out-Null
    $Destination = Join-Path $Dist ("RestroSuite-POS-" + $VersionMatch.Groups[1].Value + "-" + $Variant + ".apk")
    Copy-Item -LiteralPath $Apk -Destination $Destination -Force
    Write-Host "Android APK ready: $Destination"
} finally {
    Pop-Location
    Remove-Item Env:RESTROSUITE_ANDROID_BUILD_ROOT -ErrorAction SilentlyContinue
}
