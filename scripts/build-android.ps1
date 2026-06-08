$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$AndroidRoot = Join-Path $Root "android-app"
$Gradle = Join-Path $env:USERPROFILE ".gradle\wrapper\dists\gradle-8.4-bin\1w5dpkrfk8irigvoxmyhowfim\gradle-8.4\bin\gradle.bat"
$AndroidStudioJava = "C:\Program Files\Android\Android Studio\jbr"

if (-not (Test-Path $Gradle)) {
    throw "Gradle 8.4 is not installed at $Gradle"
}
if (-not (Test-Path $AndroidStudioJava)) {
    throw "Android Studio JDK is not installed at $AndroidStudioJava"
}

$env:JAVA_HOME = $AndroidStudioJava
$env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA "Android\Sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:ANDROID_USER_HOME = Join-Path $Root ".tmp-android-home"
$env:GRADLE_USER_HOME = Join-Path $AndroidRoot ".gradle"

New-Item -ItemType Directory -Force -Path $env:ANDROID_USER_HOME | Out-Null
New-Item -ItemType Directory -Force -Path $env:GRADLE_USER_HOME | Out-Null

$TempBuildDirInit = Join-Path $AndroidRoot "gradle-temp-build-dir.gradle"

Push-Location $AndroidRoot
try {
    & $Gradle --no-daemon --init-script $TempBuildDirInit assembleDebug
    if ($LASTEXITCODE -ne 0) {
        throw "Android build failed with exit code $LASTEXITCODE"
    }
} finally {
    Pop-Location
}
