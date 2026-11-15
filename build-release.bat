@echo off
rem Build the optimized portable Muro desktop into a fresh dist\Muro-portable-<timestamp> folder.
rem Requires Node/npm, Rust with the Windows build tools, Python 3.11+, network access and WebView2.
setlocal
cd /d "%~dp0"

for /f %%t in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set STAMP=%%t
set BUILD=.scratch\release-%STAMP%
set OUT=dist\Muro-portable-%STAMP%
for /f %%r in ('python -c "import tomllib;print(tomllib.load(open(r'crates/muro-desktop-runtime/Cargo.toml','rb'))['dependencies']['mukade']['rev'])"') do set MUKADE_REV=%%r
if not defined MUKADE_REV goto :fail

echo [1/6] Installing locked npm dependencies
call npm ci || goto :fail

echo [2/6] Staging private Python and the current factory
python scripts\desktop_resources.py --out %BUILD%\resources || goto :fail
rem Tauri's build checks that its resource folder exists; the package uses the fresh copy above.
if not exist apps\desktop\src-tauri\resources xcopy /e /i /q %BUILD%\resources apps\desktop\src-tauri\resources >nul || goto :fail

echo [3/6] Building release muroctl, mukade and Muro.exe
call npm run desktop:build || goto :fail

echo [4/6] Staging Git and curl
python scripts\desktop_tools.py --out %BUILD%\tools || goto :fail
copy /y target\release\muroctl.exe %BUILD%\tools\ >nul || goto :fail
copy /y target\release\mukade.exe %BUILD%\tools\ >nul || goto :fail

echo [5/6] Fetching the Mukade license at pinned revision %MUKADE_REV%
curl.exe -fsSL -o %BUILD%\Mukade-LICENSE.txt https://raw.githubusercontent.com/acaprino/mukade/%MUKADE_REV%/LICENSE || goto :fail

echo [6/6] Packaging
python scripts\desktop_package.py --exe target\release\muro-desktop.exe --resources %BUILD%\resources --tools %BUILD%\tools --mukade-license %BUILD%\Mukade-LICENSE.txt --out %OUT% || goto :fail

echo.
echo Done: %OUT%\Muro.exe
exit /b 0

:fail
echo.
echo Build failed. Partial files are in %BUILD%
exit /b 1
