import { runPowerShell } from './powershell.js';
import { resolveAppPath } from '../tools/computer/app.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';

const execAsync = promisify(exec);

export interface WindowActivationResult {
  success: boolean;
  message: string;
  error?: string;
  diagnostics?: {
    pid?: number;
    processName?: string;
    hwnd?: string;
    windowTitle?: string;
    wasInTray?: boolean;
    allFoundPids?: number[];
    windowsCount?: number;
    rawLog?: string;
  };
}

/**
 * Robustly brings any application to the foreground first layer (Topmost),
 * restoring it from System Tray, minimized state, or launching it if not running.
 */
export async function activateAndForegroundApp(
  appNameOrQuery: string,
  args: string = ''
): Promise<WindowActivationResult> {
  const { key, targetPath } = resolveAppPath(appNameOrQuery);
  const processSearchKey = key.replace(/\.exe$/i, '').toLowerCase();

  // 1. Launch / Wake up application via Windows Shell
  if (targetPath && fs.existsSync(targetPath)) {
    try {
      await execAsync(`cmd.exe /c start "" "${targetPath}" ${args ? `"${args}"` : ''}`);
    } catch {}
  } else if (key === 'telegram') {
    try {
      await execAsync(`cmd.exe /c start tg://`);
    } catch {}
  } else if (key === 'calc') {
    try {
      await execAsync(`cmd.exe /c start calculator:`);
    } catch {}
  } else {
    try {
      await execAsync(`cmd.exe /c start ${key} ${args ? `"${args}"` : ''}`);
    } catch {}
  }

  // 2. PowerShell Win32 deep restoration script
  const script = `
Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public class AdvancedWindowManager {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll")] public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
    [DllImport("user32.dll")] public static extern bool AllowSetForegroundWindow(int dwProcessId);
    [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);

    public const int SW_SHOWNORMAL = 1;
    public const int SW_SHOW = 5;
    public const int SW_RESTORE = 9;
    public const uint SWP_NOSIZE = 0x0001;
    public const uint SWP_NOMOVE = 0x0002;
    public const uint SWP_SHOWWINDOW = 0x0040;
    public static readonly IntPtr HWND_TOPMOST = new IntPtr(-1);
    public static readonly IntPtr HWND_NOTOPMOST = new IntPtr(-2);
    public static readonly IntPtr HWND_TOP = new IntPtr(0);

    public class WinInfo {
        public IntPtr Hwnd;
        public int Pid;
        public string Title;
        public string ClassName;
        public bool Visible;
        public bool Iconic;
    }

    public static List<WinInfo> FindWindows(string processNamePattern, int[] pids) {
        var pidSet = new HashSet<int>(pids ?? new int[0]);
        var results = new List<WinInfo>();
        EnumWindows((hWnd, lParam) => {
            uint procId;
            GetWindowThreadProcessId(hWnd, out procId);
            int pid = (int)procId;
            if (pidSet.Contains(pid)) {
                var sbTitle = new StringBuilder(512);
                GetWindowText(hWnd, sbTitle, 512);
                var sbClass = new StringBuilder(256);
                GetClassName(hWnd, sbClass, 256);
                results.Add(new WinInfo {
                    Hwnd = hWnd,
                    Pid = pid,
                    Title = sbTitle.ToString(),
                    ClassName = sbClass.ToString(),
                    Visible = IsWindowVisible(hWnd),
                    Iconic = IsIconic(hWnd)
                });
            }
            return true;
        }, IntPtr.Zero);
        return results;
    }

    public static bool ForceForeground(IntPtr hWnd, int targetPid) {
        if (hWnd == IntPtr.Zero) return false;

        AllowSetForegroundWindow(targetPid);
        AllowSetForegroundWindow(-1);

        IntPtr fgWnd = GetForegroundWindow();
        uint fgPid;
        uint fgThread = GetWindowThreadProcessId(fgWnd, out fgPid);
        uint curThread = GetCurrentThreadId();
        uint targetThread = GetWindowThreadProcessId(hWnd, out fgPid);

        if (fgThread != curThread) AttachThreadInput(curThread, fgThread, true);
        if (targetThread != curThread) AttachThreadInput(curThread, targetThread, true);

        // Restore window from iconic/tray state
        ShowWindowAsync(hWnd, SW_RESTORE);
        ShowWindow(hWnd, SW_SHOW);
        ShowWindow(hWnd, SW_SHOWNORMAL);

        // Press and release ALT key to bypass OS foreground restriction
        keybd_event(0x12, 0, 0, 0); // VK_MENU down
        keybd_event(0x12, 0, 2, 0); // VK_MENU up

        BringWindowToTop(hWnd);
        SetForegroundWindow(hWnd);

        // Topmost pulse to bring window to the absolute first layer
        SetWindowPos(hWnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE);
        SetWindowPos(hWnd, HWND_NOTOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);
        SetWindowPos(hWnd, HWND_TOP, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);

        SetForegroundWindow(hWnd);

        if (fgThread != curThread) AttachThreadInput(curThread, fgThread, false);
        if (targetThread != curThread) AttachThreadInput(curThread, targetThread, false);

        return true;
    }
}
"@ -ErrorAction SilentlyContinue

$searchKey = "${processSearchKey}"
$found = $false
$resultData = @{
    success = $false
    pid = 0
    processName = ""
    hwnd = ""
    windowTitle = ""
    wasInTray = $false
    allPids = @()
    windowsCount = 0
    log = ""
}

for ($attempt = 0; $attempt -lt 15; $attempt++) {
    Start-Sleep -Milliseconds 200

    $procs = Get-Process -ErrorAction SilentlyContinue | Where-Object {
        $_.ProcessName -like "*$searchKey*" -or $_.MainWindowTitle -like "*$searchKey*"
    }

    if (-not $procs) {
        continue
    }

    $intPids = @($procs | ForEach-Object { [int]$_.Id })
    $resultData.allPids = $intPids

    $allWindows = [AdvancedWindowManager]::FindWindows($searchKey, [int[]]$intPids)
    $resultData.windowsCount = $allWindows.Count

    if ($allWindows.Count -gt 0) {
        # Select best candidate window (prefer titled and visible or main UI classes)
        $bestWin = $allWindows | Where-Object { 
            $_.Title -and $_.Title.Trim() -ne '' -and $_.ClassName -notlike "*Message*" -and $_.ClassName -notlike "*Worker*" 
        } | Select-Object -First 1

        if (-not $bestWin) {
            $bestWin = $allWindows | Where-Object { 
                $_.ClassName -like "*Qt*" -or $_.ClassName -like "*Window*" -or $_.ClassName -eq "QWidget" -or $_.ClassName -like "*Chrome*" 
            } | Select-Object -First 1
        }

        if (-not $bestWin) {
            $bestWin = $allWindows[0]
        }

        if ($bestWin) {
            $wasInTray = (-not $bestWin.Visible) -or ($bestWin.Title.Trim() -eq "")
            $resultData.wasInTray = $wasInTray

            [AdvancedWindowManager]::ForceForeground($bestWin.Hwnd, $bestWin.Pid)

            # Additional Shell Activation
            $wshell = New-Object -ComObject WScript.Shell
            $wshell.AppActivate($bestWin.Pid) | Out-Null

            $resultData.success = $true
            $resultData.pid = $bestWin.Pid
            $resultData.processName = $searchKey
            $resultData.hwnd = $bestWin.Hwnd.ToString()
            $resultData.windowTitle = $bestWin.Title
            $resultData.log = "Found HWND $($bestWin.Hwnd) (Class: $($bestWin.ClassName), Title: '$($bestWin.Title)', WasInTray: $wasInTray)"
            $found = $true
            break
        }
    } else {
        # Fallback to standard MainWindowHandle if available
        $p = $procs | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
        if ($p) {
            [AdvancedWindowManager]::ForceForeground($p.MainWindowHandle, [int]$p.Id)
            $wshell = New-Object -ComObject WScript.Shell
            $wshell.AppActivate([int]$p.Id) | Out-Null

            $resultData.success = $true
            $resultData.pid = $p.Id
            $resultData.processName = $p.ProcessName
            $resultData.hwnd = $p.MainWindowHandle.ToString()
            $resultData.windowTitle = $p.MainWindowTitle
            $resultData.log = "Fallback to MainWindowHandle $($p.MainWindowHandle)"
            $found = $true
            break
        }
    }
}

$resultData | ConvertTo-Json -Compress
`;

  try {
    const { stdout } = await runPowerShell(script, 10000);
    const parsed = JSON.parse(stdout.trim() || '{}');

    if (parsed.success) {
      return {
        success: true,
        message: `Приложение «${key}» успешно выведено на передний план${parsed.wasInTray ? ' (восстановлено из системного трея)' : ''}.`,
        diagnostics: {
          pid: parsed.pid,
          processName: parsed.processName,
          hwnd: parsed.hwnd,
          windowTitle: parsed.windowTitle,
          wasInTray: parsed.wasInTray,
          allFoundPids: parsed.allPids,
          windowsCount: parsed.windowsCount,
          rawLog: parsed.log,
        },
      };
    }

    return {
      success: false,
      message: `Не удалось обнаружить активное окно для «${key}».`,
      error: `Окно приложения «${key}» не появилось на экране после попытки запуска.`,
      diagnostics: {
        processName: key,
        allFoundPids: parsed.allPids || [],
        windowsCount: parsed.windowsCount || 0,
        rawLog: parsed.log || 'No windows enumerated for target process.',
      },
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Ошибка при активации окна «${key}»: ${err.message}`,
      error: err.message,
      diagnostics: {
        processName: key,
        rawLog: err.stack || String(err),
      },
    };
  }
}
