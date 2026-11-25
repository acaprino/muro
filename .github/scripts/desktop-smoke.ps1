# The built Muro on a real window and a real WebView2, on a runner of GitHub (the job `program` of tests.yml): the window,
# its commands, the notification area, the second start, the end, the kept place and theme. Never on a person's machine:
# it writes a policy of WebView2, starts Muro and kills it.
#   -Exe   Muro.exe in its portable folder      -Data  a new data folder of this run      -Out  where the pictures go
param([string]$Exe, [string]$Data, [string]$Out)
$ErrorActionPreference = 'Stop'
if (-not $env:GITHUB_ACTIONS) { throw 'only on a runner of GitHub' }
$Exe = [IO.Path]::GetFullPath($Exe); $Data = [IO.Path]::GetFullPath($Data); $Out = [IO.Path]::GetFullPath($Out)
if (Test-Path $Data) { throw "$Data must be a new folder" }
New-Item -ItemType Directory -Force $Out | Out-Null
$Folder = Split-Path $Exe
$Port = 9333
Add-Type -TypeDefinition @'
using System; using System.Collections.Generic; using System.Runtime.InteropServices; using System.Text;
public static class W {
  public delegate bool Visit(IntPtr h, IntPtr l);
  [StructLayout(LayoutKind.Sequential)] public struct R { public int L, T, Rr, B; }
  [StructLayout(LayoutKind.Sequential)] public struct P { public int X, Y; }
  [DllImport("user32.dll")] public static extern bool EnumWindows(Visit v, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr h, Visit v, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h, ref P p);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassNameW(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int w, int hh, uint f);
  [DllImport("user32.dll")] public static extern bool PostMessageW(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern IntPtr SendMessageW(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern int GetMenuItemCount(IntPtr m);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetMenuStringW(IntPtr m, uint i, StringBuilder s, int n, uint f);
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr c);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int a, out int v, int n);
  static string Name(IntPtr h, bool cls) { var s = new StringBuilder(400); if (cls) GetClassNameW(h, s, 400); else GetWindowTextW(h, s, 400); return s.ToString(); }
  // handle|title|x,y,width,height of the first window of `pid` with that class.
  public static string Find(uint pid, string cls, bool visible) {
    string found = null;
    EnumWindows((h, l) => { uint p; GetWindowThreadProcessId(h, out p);
      if (p == pid && Name(h, true) == cls && (!visible || IsWindowVisible(h))) { R r; GetWindowRect(h, out r); found = h.ToInt64() + "|" + Name(h, false) + "|" + r.L + "," + r.T + "," + (r.Rr - r.L) + "," + (r.B - r.T); return false; }
      return true; }, IntPtr.Zero);
    return found; }
  // Every window of `pid` a person could see: class and title. Two helpers of the libraries count as visible and are not seen.
  public static string[] Seen(uint pid) {
    var all = new List<string>();
    EnumWindows((h, l) => { uint p; GetWindowThreadProcessId(h, out p); R r; GetWindowRect(h, out r);
      if (p == pid && IsWindowVisible(h) && r.Rr > r.L && r.B > r.T && Name(h, true) != "tray_icon_app" && Name(h, true) != "Tao Thread Event Target") all.Add(Name(h, true) + " '" + Name(h, false) + "'"); return true; }, IntPtr.Zero);
    return all.ToArray(); }
  public static string Child(IntPtr parent, string cls) {
    string found = null;
    EnumChildWindows(parent, (h, l) => { if (Name(h, true) == cls) { R r; GetWindowRect(h, out r); P o = new P(); ClientToScreen(parent, ref o); found = (r.L - o.X) + "," + (r.T - o.Y) + "," + (r.Rr - r.L) + "," + (r.B - r.T); return false; } return true; }, IntPtr.Zero);
    return found; }
  public static int Attribute(IntPtr h, int a) { int v; return DwmGetWindowAttribute(h, a, out v, 4) == 0 ? v : -1; }
  // The text of each item of the open menu (MN_GETHMENU), in order.
  public static string[] Menu(IntPtr window) {
    var all = new List<string>(); IntPtr m = SendMessageW(window, 0x01E1, IntPtr.Zero, IntPtr.Zero);
    for (int i = 0; i < GetMenuItemCount(m); i++) { var s = new StringBuilder(200); GetMenuStringW(m, (uint)i, s, 200, 0x400); all.Add(s.ToString()); }
    return all.ToArray(); }
}
'@
$null = [W]::SetProcessDpiAwarenessContext([IntPtr](-4))
$script:bad = 0
$script:muro = $null
function Say($ok, $what) { if ($ok) { Write-Host "PASS  $what" } else { Write-Host "FAIL  $what"; $script:bad++ } }
function Wait-For([scriptblock]$done, [int]$seconds, [int]$every = 100) {
  $end = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $end) { $value = & $done; if ($value) { return $value }; Start-Sleep -Milliseconds $every }
  return $null
}
function Main { [W]::Find([uint32]$script:muro.Id, 'Tauri Window', $true) }
function Made { [W]::Find([uint32]$script:muro.Id, 'Tauri Window', $false) }
function Handle { [IntPtr][int64]("$(Made)".Split('|')[0]) }
function Place { "$(Made)".Split('|')[2] }
function Frame { [W]::Attribute((Handle), 20) }
function Now { [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }
function Kept([string]$file) { Get-Content (Join-Path $Data $file) -Raw -ErrorAction SilentlyContinue }
function Ask([string]$action) {
  $said = node "$PSScriptRoot/desktop-smoke-page.mjs" $Port $action @args
  if ($LASTEXITCODE) { Say $false "the page did not answer to $action"; return $null }
  if ($said) { @($said)[-1] | ConvertFrom-Json }
}
function Screen-Shot([string]$name) {
  Add-Type -AssemblyName System.Drawing, System.Windows.Forms
  $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  $bitmap = New-Object System.Drawing.Bitmap $b.Width, $b.Height
  [System.Drawing.Graphics]::FromImage($bitmap).CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
  $bitmap.Save("$Out/$name.png")
}
# The processes of this run: the programs of the portable folder, and the engine of the data folder.
function Mine {
  Get-CimInstance Win32_Process | Where-Object {
    ($_.ExecutablePath -and $_.ExecutablePath.StartsWith($Folder, 'OrdinalIgnoreCase')) -or
    ($_.Name -eq 'msedgewebview2.exe' -and "$($_.CommandLine)".Contains($Data, 'OrdinalIgnoreCase'))
  }
}
function Engine { Mine | Where-Object { $_.Name -eq 'msedgewebview2.exe' -and $_.CommandLine -notmatch '--type=' } }
function Start-Muro([string[]]$Arguments) {
  $more = if ($Arguments) { @{ ArgumentList = $Arguments } } else { @{} }
  $p = Start-Process $Exe -PassThru @more; $null = $p.Handle
  $p
}
# A copy that finds one running: it must end, with code 0.
function Start-Second([string[]]$Arguments) {
  $p = Start-Muro $Arguments
  $null = $p.WaitForExit(15000)
  Say ($p.HasExited -and $p.ExitCode -eq 0) "the second copy ($Arguments) ends (code $(if ($p.HasExited) { $p.ExitCode }))"
  if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force }
}
# No window of Muro is seen for so many seconds.
function Stays-Hidden([int]$seconds) {
  $seen = Wait-For { [W]::Seen([uint32]$script:muro.Id) } $seconds 30
  if ($seen) { Write-Host "      seen: $seen" }
  (-not $seen) -and (-not $script:muro.HasExited)
}
function Hide-It { $null = Ask 'close'; [bool](Wait-For { -not (Main) } 8) }
function Ended([string]$how) {
  $null = $script:muro.WaitForExit(80000)
  Say ($script:muro.HasExited -and $script:muro.ExitCode -eq 0) "$how ends Muro (code $(if ($script:muro.HasExited) { $script:muro.ExitCode }))"
  $gone = Wait-For { -not (Mine) } 15 300
  Say $gone "no process is left$(if (-not $gone) { ': ' + ((Mine | ForEach-Object Name) -join ', ') })"
  if (-not $gone) { Mine | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } }
}

# The program is not changed for this: the engine is told to open its port by the policy of the machine (the runner is
# elevated, and an elevated program does not take it from its environment).
$policy = 'HKLM:\SOFTWARE\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments'
New-Item -Path $policy -Force | Out-Null
New-ItemProperty -Path $policy -Name (Split-Path $Exe -Leaf) -Value "--remote-debugging-port=$Port" -Force | Out-Null
$env:MURO_DATA_DIR = $Data
$env:MURO_AUTOSTART_NAME = "MuroSmoke$PID"
$run = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$screen = Get-CimInstance Win32_VideoController | Select-Object -First 1
Write-Host "screen $($screen.CurrentHorizontalResolution)x$($screen.CurrentVerticalResolution), Windows $((Get-CimInstance Win32_OperatingSystem).Version), explorer $(@(Get-Process explorer -ErrorAction SilentlyContinue).Count)"

try {
  Write-Host '--- started in the background, on a new data folder'
  $script:muro = Start-Muro '--background'
  Say ([bool](Wait-For { Made } 40 20)) 'the window is made'
  Say (Stays-Hidden 8) 'it shows nothing'
  Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'" | Where-Object { $_.CommandLine -notmatch '--type=' } | ForEach-Object { Write-Host "      engine: $($_.CommandLine)" }
  Say ([bool](Engine)) 'the engine runs on the data folder of Muro'
  $page = Ask 'read'
  if (-not $page) { exit 1 }
  foreach ($name in 'kept_theme', 'set_theme', 'caption', 'ready') {
    $call = $page.ipc | Where-Object { $_.call -eq "plugin:imago-shell|$name" } | Select-Object -First 1
    Say ($call -and $call.status -eq 200) "$name answered: $($call | ConvertTo-Json -Compress)"
  }
  $asked = @($page.ipc | Where-Object { $_.call -eq 'request' })
  Say ($asked.Count -and -not ($asked | Where-Object { $_.status -ne 200 })) "the page's requests answered ($($asked.Count))"
  $failed = @($page.ipc | Where-Object { $_.status -ne 200 })
  Say (-not $failed) "no call failed $(if ($failed) { $failed | ConvertTo-Json -Compress })"
  $status = Ask 'request' 'status'
  Say ($null -ne $status.revision -and $status.settings.close_to_tray -eq $true) "status: revision $($status.revision), close_to_tray $($status.settings.close_to_tray)"
  $refused = Ask 'refused'
  Say ($refused -and -not ($refused.PSObject.Properties | Where-Object Value -ne 'refused')) "what the page may not call: $($refused | ConvertTo-Json -Compress)"
  Say (Test-Path (Join-Path $Data 'registry.json')) 'the registry is in the data folder'

  Write-Host '--- the second start'
  $null = Ask 'listen'
  Start-Second '--background'
  Say (Stays-Hidden 3) 'one in the background shows nothing'
  Start-Second
  Say ([bool](Wait-For { Main } 5)) "one the person makes shows the window: $(Main)"
  $woke = Ask 'read'
  Say ($woke.shown -eq 1) "the page is told once that it is shown ($($woke.shown))"
  Say ($woke.scheme -eq 'dark' -and (Frame) -eq 1 -and (Kept 'window-theme') -eq 'dark') "nothing kept: dark (page $($woke.scheme), frame $(Frame), kept $(Kept 'window-theme'))"
  Say ([W]::Attribute((Handle), 38) -ne 3) "no acrylic behind it (backdrop $([W]::Attribute((Handle), 38)))"
  $overlay = [W]::Child((Handle), 'ImagoMaximizeOverlay')
  $o = "$overlay".Split(',') | ForEach-Object { [int]$_ }
  Say ($o.Count -eq 4 -and $o[0] -eq $woke.button.x -and $o[2] -eq $woke.button.width) "caption: the overlay ($overlay) lies over the maximize button ($($woke.button | ConvertTo-Json -Compress))"
  Screen-Shot 'dark'

  Write-Host '--- hidden in the notification area, and back'
  Say (Hide-It) 'the close button hides the window'
  Say (Stays-Hidden 3) 'Muro goes on, hidden'
  Start-Second
  Say ([bool](Wait-For { Main } 5)) 'a second start shows it'
  Say ((Ask 'read').shown -eq 2) 'the page is told again'

  Write-Host '--- light, and a place of its own; the engine lost while hidden'
  $light = Ask 'theme' 'light'
  Say ($light.scheme -eq 'light' -and (Frame) -eq 0 -and (Kept 'window-theme') -eq 'light') "light: page $($light.scheme), frame $(Frame), kept $(Kept 'window-theme')"
  Screen-Shot 'light'
  $null = [W]::SetWindowPos((Handle), [IntPtr]::Zero, 37, 23, 900, 620, 0x14)
  Start-Sleep 1
  $place = Place
  Write-Host "      moved to $place"
  Say (Hide-It) 'hidden'
  $old = "$(Made)".Split('|')[0]
  Engine | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  $rebuilt = Wait-For { $m = Made; if ($m -and $m.Split('|')[0] -ne $old) { $m } } 30
  Say ([bool]$rebuilt) "the window is built again: $rebuilt"
  Say (Stays-Hidden 5) 'and stays hidden'
  Start-Second
  Say ([bool](Wait-For { Main } 5)) 'a second start shows it'
  $after = Ask 'read'
  Say ($after.scheme -eq 'light' -and (Frame) -eq 0 -and (Place) -eq $place) "in its theme and its place: $($after.scheme), frame $(Frame), $(Place)"

  Write-Host '--- Quit, in the menu of the notification area, with the window hidden'
  Say (Hide-It) 'hidden'
  # What Windows sends to the icon's window when its icon is clicked with the right button.
  $tray = [IntPtr][int64]("$([W]::Find([uint32]$script:muro.Id, 'tray_icon_app', $false))".Split('|')[0])
  $null = [W]::PostMessageW($tray, 6002, [IntPtr]::Zero, [IntPtr]0x205)
  $menu = Wait-For { [W]::Find([uint32]$script:muro.Id, '#32768', $true) } 8
  $menu = [IntPtr][int64]$(if ($menu) { $menu.Split('|')[0] } else { 0 })
  $items = @(if ($menu -ne 0) { [W]::Menu($menu) })
  Screen-Shot 'tray'
  Say ($items.Count -eq 6 -and $items[1] -eq 'Open Muro' -and $items[2] -eq 'Sync now' -and $items[5] -eq 'Quit Muro') "the menu: $($items -join ' / ')"
  # Up to the last item, and Enter.
  foreach ($key in 0x26, 0x0D) { $null = [W]::PostMessageW($menu, 0x100, [IntPtr]$key, [IntPtr]::Zero); Start-Sleep -Milliseconds 500 }
  Ended 'Quit'
  $json = Kept 'window.json' | ConvertFrom-Json
  $p = $place.Split(',') | ForEach-Object { [int]$_ }
  Say ($json.x -eq $p[0] -and $json.y -eq $p[1] -and -not $json.maximized) "the place is kept: $(Kept 'window.json')"

  Write-Host '--- the next start'
  $script:muro = Start-Muro
  $made = Wait-For { if (Made) { Now } } 40 10
  $hidden = -not (Main)
  $shown = Wait-For { if (Main) { Now } } 10 10
  $frame = Frame
  Say ($hidden -and $shown) "made hidden, shown $($shown - $made) ms later"
  Say ($frame -eq 0) "the kept theme is the first frame's (frame $frame)"
  Say ((Place) -eq $place) "the kept place: $(Place)"
  $next = Ask 'read'
  $ready = $next.ipc | Where-Object { $_.call -eq 'plugin:imago-shell|ready' } | Select-Object -First 1
  Say ($ready -and $shown -ge ($next.timeOrigin + $ready.start - 60)) "not shown before the page had drawn (ready sent $([Math]::Round($next.timeOrigin + $ready.start - $made)) ms after the window was made)"
  Say ($next.scheme -eq 'light') "the page is $($next.scheme)"
  Screen-Shot 'next'

  Write-Host '--- start with Windows'
  $on = Ask 'request' 'set_autostart' '{"enabled":true}'
  $value = (Get-ItemProperty $run -ErrorAction SilentlyContinue).$($env:MURO_AUTOSTART_NAME)
  Say ($on.enabled -and $on.current -and $value -eq "`"$Exe`" --background") "on: $value"
  $off = Ask 'request' 'set_autostart' '{"enabled":false}'
  Say ($off -and -not $off.enabled -and -not (Get-ItemProperty $run).$($env:MURO_AUTOSTART_NAME)) 'off'

  Write-Host '--- a close that ends Muro'
  $settings = Ask 'settings' '{"close_to_tray":false}'
  Say ($settings.close_to_tray -eq $false) 'close_to_tray is off'
  $null = Ask 'close'
  Ended 'the close button, with close_to_tray off,'
} finally {
  if ($script:bad) { Screen-Shot 'end' }
  Mine | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Remove-Item $policy -Force -Recurse -ErrorAction SilentlyContinue
  Remove-ItemProperty $run -Name $env:MURO_AUTOSTART_NAME -ErrorAction SilentlyContinue
  Write-Host "failures: $script:bad"
}
exit $script:bad
