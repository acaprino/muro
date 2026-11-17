@echo off
rem Muro: build the optimized portable Muro desktop (Muro.exe, private Python and factory, Git, curl,
rem muroctl and mukade) in .\release, install into D:\Software\Muro, clean what the build staged.
rem Needs Rust with the Windows build tools, Python 3.11+, network access and WebView2.
rem
rem   build-release.bat                   build, .\release, install, clean
rem   build-release.bat --no-install      stop at .\release
rem   build-release.bat --target <dir>    install folder (default D:\Software\Muro)
rem   build-release.bat --ci              npm ci even when node_modules is already there
rem   build-release.bat --jobs N          parallel Rust compilations (CARGO_BUILD_JOBS)
rem
rem The same script, with the same steps and options, is in Shinatama, Mukade, Xiox, Muro, Ethel and
rem Qemille: only the PROJECT parts (the settings below and the subroutines at the end) differ.
rem   1. tools, version, npm dependencies in NPM_DIR (npm ci only when node_modules is missing, or --ci)
rem   2. build                                                          PROJECT :build
rem   3. .\release made from nothing: the programs and their files      PROJECT :assemble
rem   4. install: .\release is copied over D:\Software\Muro, made if missing. What only the
rem      install holds (data, mukade-data, webview ...) stays as it is; nothing is backed up.
rem      release\installer\, where there is one, holds installers to hand out: it is not installed.
rem      While a program of the install folder is running, it waits for it to close.
rem   5. clean: what the build staged is removed, on success and on failure. PROJECT :clean_project
rem      Cargo's target\ stays (the build cache: the next build is incremental), node_modules stays.
rem
rem Errors always leave through a label: with setlocal on, "exit /b 1" inside a parenthesized
rem block returns 0 to whoever ran the script.

setlocal EnableExtensions
set "ROOT=%~dp0"
set "SELF=%~nx0"
set "RELEASE=%ROOT%release"
cd /d "%ROOT%" || goto :fail

rem ==== PROJECT: settings ========================================================================
set "APP=Muro"
rem The program that must be in .\release once it is assembled.
set "APP_EXE=Muro.exe"
rem Tools beyond cargo, node, npm and git.
set "TOOLS=python curl.exe powershell"
rem Parallel Rust jobs when neither CARGO_BUILD_JOBS nor --jobs is given (empty: cargo decides).
set "DEFAULT_JOBS="
rem The folder (relative to the repo) with package.json and node_modules.
set "NPM_DIR=."
rem ===============================================================================================

set "INSTALL=D:\Software\%APP%"
set "DO_INSTALL=1"
set "NPM_CI=0"

:args
if "%~1"=="" goto :args_done
if /i "%~1"=="--no-install" (set "DO_INSTALL=0" & shift & goto :args)
if /i "%~1"=="--ci" (set "NPM_CI=1" & shift & goto :args)
if /i "%~1"=="--target" goto :arg_target
if /i "%~1"=="--jobs" goto :arg_jobs
goto :usage
:arg_target
if "%~2"=="" goto :usage
set "INSTALL=%~f2"
shift & shift & goto :args
:arg_jobs
if "%~2"=="" goto :usage
set "CARGO_BUILD_JOBS=%~2"
shift & shift & goto :args
:args_done
if "%INSTALL:~-1%"=="\" set "INSTALL=%INSTALL:~0,-1%"
if not defined CARGO_BUILD_JOBS if defined DEFAULT_JOBS set "CARGO_BUILD_JOBS=%DEFAULT_JOBS%"

rem --- 1. Tools and dependencies -----------------------------------------------------------------
echo.
echo [1/5] Tools and dependencies
for %%T in (cargo node npm git %TOOLS%) do (
  where %%T >nul 2>nul || (echo [ERROR] %%T not found in PATH. & goto :fail)
)
set "VERSION=?"
for /f "usebackq delims=" %%V in (`node -p "require('./%NPM_DIR:\=/%/package.json').version"`) do set "VERSION=%%V"
set "COMMIT=?"
for /f "usebackq delims=" %%C in (`git rev-parse --short HEAD`) do set "COMMIT=%%C"
set "DIRTY="
git diff --quiet HEAD -- 2>nul || set "DIRTY=, uncommitted changes"
echo     %APP% %VERSION%, commit %COMMIT%%DIRTY%
if defined CARGO_BUILD_JOBS echo     %CARGO_BUILD_JOBS% parallel Rust jobs
if "%DO_INSTALL%"=="1" echo     install into %INSTALL%
if not "%DO_INSTALL%"=="1" echo     no install: .\release only

if "%NPM_CI%"=="1" goto :npm_ci
if exist "%NPM_DIR%\node_modules\.package-lock.json" goto :npm_done
:npm_ci
pushd "%NPM_DIR%" || goto :fail
call npm ci
set "RC=%ERRORLEVEL%"
popd
if not "%RC%"=="0" goto :fail
:npm_done

rem --- 2. Build ----------------------------------------------------------------------------------
echo.
echo [2/5] Build
call :build
if errorlevel 1 goto :fail

rem --- 3. Release folder -------------------------------------------------------------------------
echo.
echo [3/5] %RELEASE%
if exist "%RELEASE%\" rmdir /s /q "%RELEASE%"
if exist "%RELEASE%\" goto :release_busy
call :assemble
if errorlevel 1 goto :fail
if not exist "%RELEASE%\%APP_EXE%" goto :release_missing

rem --- 4. Install --------------------------------------------------------------------------------
echo.
if "%DO_INSTALL%"=="1" goto :do_install
echo [4/5] Install skipped ^(--no-install^)
goto :installed
:do_install
echo [4/5] Install into %INSTALL%
call :install
if errorlevel 1 goto :fail
:installed

rem --- 5. Clean ----------------------------------------------------------------------------------
echo.
echo [5/5] Clean
call :clean_project

echo.
echo === Done: %APP% %VERSION% (%COMMIT%%DIRTY%)
echo     release    %RELEASE%
if "%DO_INSTALL%"=="1" echo     installed  %INSTALL%\%APP_EXE%
call :pause_if_clicked
endlocal
exit /b 0

rem --- Common subroutines ------------------------------------------------------------------------

:install
if not exist "%INSTALL%\" mkdir "%INSTALL%" || goto :sub_fail
set "SHOWN="
:install_wait
set "RUNNING=0"
for /f "usebackq delims=" %%N in (`powershell -NoProfile -NonInteractive -Command "$d = [IO.Path]::GetFullPath('%INSTALL%') + '\'; @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith($d, [StringComparison]::OrdinalIgnoreCase) }).Count"`) do set "RUNNING=%%N"
if "%RUNNING%"=="0" goto :install_copy
if not defined SHOWN echo     %APP% is running from %INSTALL%: close it, the install goes on by itself.
set "SHOWN=1"
ping -n 4 127.0.0.1 >nul
goto :install_wait
:install_copy
robocopy "%RELEASE%" "%INSTALL%" /E /XD "%RELEASE%\installer" /R:10 /W:2 /NFL /NDL /NJH /NP
if errorlevel 8 (echo [ERROR] copy into %INSTALL% failed: a file may still be in use. & goto :sub_fail)
exit /b 0

:pause_if_clicked
rem Started with a double-click from Explorer: keep the window open to read the result.
echo %CMDCMDLINE% | "%SystemRoot%\System32\find.exe" /i "%SELF%" >nul && pause
exit /b 0

:sub_fail
exit /b 1

:release_busy
echo [ERROR] %RELEASE% could not be removed: a file in it is in use.
goto :fail

:release_missing
echo [ERROR] %RELEASE%\%APP_EXE% was not produced.
goto :fail

:usage
echo [ERROR] invalid arguments: %*
echo Usage: %SELF% [--no-install] [--target ^<folder^>] [--ci] [--jobs N]
call :pause_if_clicked
endlocal
exit /b 1

:fail
echo.
echo [ERROR] %APP% build-release stopped: read the error above.
call :clean_project
call :pause_if_clicked
endlocal
exit /b 1

rem ==== PROJECT: build, release folder, clean ===================================================
rem Each subroutine returns 0 when done; errors go to :sub_fail. The working folder is the repo.

:build
set "STAGING=%ROOT%.scratch\release"
set "MUKADE_REV="
for /f %%r in ('python -c "import tomllib;print(tomllib.load(open(r'crates/muro-desktop-runtime/Cargo.toml','rb'))['dependencies']['mukade']['rev'])"') do set "MUKADE_REV=%%r"
if not defined MUKADE_REV (echo [ERROR] Mukade revision not read from crates\muro-desktop-runtime\Cargo.toml. & goto :sub_fail)
if exist "%STAGING%\" rmdir /s /q "%STAGING%"

echo     private Python and the current factory
python scripts\desktop_resources.py --out "%STAGING%\resources" || goto :sub_fail
rem Tauri's build checks that its resource folder exists; the package uses the fresh copy above.
if not exist "apps\desktop\src-tauri\resources\" xcopy /e /i /q "%STAGING%\resources" "apps\desktop\src-tauri\resources" >nul || goto :sub_fail

echo     muroctl.exe, mukade.exe and Muro.exe ^(release^)
call npm run desktop:build || goto :sub_fail

echo     Git and curl
python scripts\desktop_tools.py --out "%STAGING%\tools" || goto :sub_fail
copy /y "target\release\muroctl.exe" "%STAGING%\tools\" >nul || goto :sub_fail
copy /y "target\release\mukade.exe" "%STAGING%\tools\" >nul || goto :sub_fail

echo     Mukade license at the pinned revision %MUKADE_REV%
curl.exe -fsSL -o "%STAGING%\Mukade-LICENSE.txt" https://raw.githubusercontent.com/acaprino/mukade/%MUKADE_REV%/LICENSE || goto :sub_fail
exit /b 0

:assemble
rem desktop_package.py refuses an existing folder: the common step 3 has just removed .\release.
python scripts\desktop_package.py --exe target\release\muro-desktop.exe --resources "%STAGING%\resources" --tools "%STAGING%\tools" --mukade-license "%STAGING%\Mukade-LICENSE.txt" --out "%RELEASE%" || goto :sub_fail
exit /b 0

:clean_project
rem The staging of this build (.scratch\release) and the timestamped stagings and outputs of the
rem former script (.scratch\release-*, dist\Muro-portable-*). The rest of .scratch is not touched.
for /d %%D in ("%ROOT%.scratch\release" "%ROOT%.scratch\release-*" "%ROOT%dist\Muro-portable-*") do if exist "%%~D\" rmdir /s /q "%%~D"
if exist "%ROOT%dist\" rmdir "%ROOT%dist" 2>nul
exit /b 0
