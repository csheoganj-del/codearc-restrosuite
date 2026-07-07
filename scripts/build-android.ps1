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

Push-Location $AndroidRoot
try {
    & $Gradle --no-daemon assembleDebug
    if ($LASTEXITCODE -ne 0) {
        throw "Android build failed with exit code $LASTEXITCODE"
    }
} finally {
    Pop-Location
}
