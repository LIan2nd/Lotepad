param(
  [Parameter(Mandatory=$true)][int]$AppProcessId,
  [string]$FilePath,
  [switch]$Cancel,
  [switch]$CloseApp,
  [string]$Capture
)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class LotepadNativeTestWindow {
  public delegate bool Callback(IntPtr handle, IntPtr parameter);
  [DllImport("user32.dll")] public static extern bool EnumWindows(Callback callback, IntPtr parameter);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr parent, Callback callback, IntPtr parameter);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr handle, out uint process);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr handle, StringBuilder buffer, int size);
  [DllImport("user32.dll")] public static extern int GetDlgCtrlID(IntPtr handle);
  [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr handle);
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int left,top,right,bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr handle, out Rect rect);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr handle, IntPtr device, uint flags);
  [DllImport("user32.dll", SetLastError=true)] public static extern bool PostMessage(IntPtr handle, uint message, IntPtr wparam, IntPtr lparam);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr SendMessage(IntPtr handle, uint message, IntPtr wparam, string text);
  [DllImport("user32.dll", CharSet=CharSet.Unicode, EntryPoint="SendMessageW")] static extern IntPtr ReadMessage(IntPtr handle, uint message, IntPtr wparam, StringBuilder text);
  public static string Text(IntPtr handle) { var text=new StringBuilder(32768);ReadMessage(handle,13,new IntPtr(32768),text);return text.ToString(); }
  public static string ClassName(IntPtr handle) { var text=new StringBuilder(256); GetClassName(handle,text,256); return text.ToString(); }
  public static IntPtr[] Windows(int process) {
    var handles=new List<IntPtr>(); EnumWindows((handle,parameter)=>{uint pid;GetWindowThreadProcessId(handle,out pid);if(pid==process)handles.Add(handle);return true;},IntPtr.Zero);return handles.ToArray();
  }
  public static IntPtr[] Children(IntPtr parent) {
    var handles=new List<IntPtr>();EnumChildWindows(parent,(handle,parameter)=>{handles.Add(handle);return true;},IntPtr.Zero);return handles.ToArray();
  }
}
'@
if ($Capture) {
  Add-Type -AssemblyName System.Drawing
  $handle = [System.Diagnostics.Process]::GetProcessById($AppProcessId).MainWindowHandle
  $rectangle = New-Object LotepadNativeTestWindow+Rect
  [void][LotepadNativeTestWindow]::GetWindowRect($handle, [ref]$rectangle)
  $bitmap = New-Object System.Drawing.Bitmap(($rectangle.right-$rectangle.left),($rectangle.bottom-$rectangle.top))
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $device = $graphics.GetHdc()
  [void][LotepadNativeTestWindow]::PrintWindow($handle,$device,2)
  $graphics.ReleaseHdc($device)
  $bitmap.Save($Capture,[System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose(); $bitmap.Dispose()
  exit 0
}
if ($CloseApp) {
  $handle = [System.Diagnostics.Process]::GetProcessById($AppProcessId).MainWindowHandle
  if ($handle -eq [IntPtr]::Zero) { throw 'Lotepad test window was not found.' }
  if (-not [LotepadNativeTestWindow]::PostMessage($handle, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)) { throw 'Native close request failed.' }
  exit 0
}
$deadline = [DateTime]::UtcNow.AddSeconds(20)
do {
  foreach ($window in [LotepadNativeTestWindow]::Windows($AppProcessId)) {
    if ([LotepadNativeTestWindow]::ClassName($window) -ne '#32770') { continue }
    $controls = [LotepadNativeTestWindow]::Children($window)
    $button = $controls | Where-Object { [LotepadNativeTestWindow]::GetDlgCtrlID($_) -eq $(if ($Cancel) { 2 } else { 1 }) } | Select-Object -First 1
    if (-not $button) { continue }
    if (-not $Cancel) {
      $keyboard = New-Object -ComObject WScript.Shell
      if (-not $keyboard.AppActivate($AppProcessId)) { continue }
      Start-Sleep -Milliseconds 300
      $keyboard.SendKeys('%n')
      Start-Sleep -Milliseconds 100
      $escapedPath = [regex]::Replace($FilePath, '[+^%~(){}\[\]]', { param($match) '{' + $match.Value + '}' })
      $keyboard.SendKeys($escapedPath)
      Start-Sleep -Milliseconds 200
      $keyboard.SendKeys('{ENTER}')
    } else {
      [void][LotepadNativeTestWindow]::PostMessage($button, 0x00F5, [IntPtr]::Zero, [IntPtr]::Zero)
    }
    Write-Output 'Native file dialog handled.'
    exit 0
  }
  Start-Sleep -Milliseconds 200
} while ([DateTime]::UtcNow -lt $deadline)
$details = $controls | ForEach-Object { [PSCustomObject]@{ Class=[LotepadNativeTestWindow]::ClassName($_); Id=[LotepadNativeTestWindow]::GetDlgCtrlID($_); Parent=[LotepadNativeTestWindow]::GetDlgCtrlID([LotepadNativeTestWindow]::GetParent($_)); Text=$(if ([LotepadNativeTestWindow]::ClassName($_) -eq 'Edit') { [LotepadNativeTestWindow]::Text($_) } else { '' }) } }
throw "The Lotepad native file dialog controls were unavailable: $($details | ConvertTo-Json -Compress)"
