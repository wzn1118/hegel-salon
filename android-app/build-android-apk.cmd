@echo off
setlocal

set "ROOT=%~dp0"
set "JAVA_HOME=%ROOT%.local-android\jdk\jdk-21.0.10+7"
set "ANDROID_HOME=%ROOT%.local-android\sdk"
set "ANDROID_SDK_ROOT=%ANDROID_HOME%"
set "PATH=%JAVA_HOME%\bin;%ANDROID_HOME%\platform-tools;%PATH%"

pushd "%ROOT%android"
call gradlew.bat assembleDebug
set "EXIT_CODE=%ERRORLEVEL%"
popd

if not "%EXIT_CODE%"=="0" (
  echo APK build failed with exit code %EXIT_CODE%.
  exit /b %EXIT_CODE%
)

echo.
echo APK ready:
echo %ROOT%android\app\build\outputs\apk\debug\app-debug.apk
exit /b 0
