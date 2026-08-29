import { ITool, ToolResult } from '../types.js';
import { runPowerShell } from '../../utils/powershell.js';

export const listWindowsTool: ITool = {
  name: 'computer.list_windows',
  category: 'computer',
  description: 'Lists all currently open application windows with their titles and process names.',
  parameters: [],
  dangerLevel: 'safe',
  async execute(): Promise<ToolResult> {
    try {
      const script = `
        $titled = Get-Process | Where-Object { $_.MainWindowTitle -and $_.MainWindowTitle.Trim() -ne '' } | Select-Object Id, ProcessName, MainWindowTitle
        
        if (-not $titled) {
          $userApps = Get-Process | Where-Object { 
            $_.ProcessName -notmatch '^(svchost|csrss|smss|services|lsass|wininit|winlogon|fontdrvhost|dwm|RuntimeBroker|SearchHost|System|Idle|Registry)' 
          } | Select-Object -First 15 Id, ProcessName, @{Name='MainWindowTitle'; Expression={$_.ProcessName}}
          $userApps | ConvertTo-Json -Compress
        } else {
          $titled | ConvertTo-Json -Compress
        }
      `;
      const { stdout } = await runPowerShell(script);
      const parsed = JSON.parse(stdout.trim() || '[]');
      const windows = Array.isArray(parsed) ? parsed : [parsed];

      const formatted = windows.map((w: any) => ({
        id: w.Id,
        name: w.ProcessName,
        title: w.MainWindowTitle || w.ProcessName,
      }));

      return {
        success: true,
        data: formatted,
        message: `Found ${formatted.length} active application(s):\n${formatted.map((f: any) => `• [${f.name}] ${f.title}`).join('\n')}`,
      };
    } catch (err: any) {
      return { success: false, error: `Failed to list windows: ${err.message}` };
    }
  },
};

export const switchWindowTool: ITool = {
  name: 'computer.switch_window',
  category: 'computer',
  description: 'Brings an application window to the foreground by its title or process name.',
  parameters: [
    {
      name: 'query',
      type: 'string',
      description: 'Window title or process name to search and focus (e.g. "Chrome", "Telegram", "Code", "Visual Studio Code")',
      required: true,
    },
  ],
  dangerLevel: 'safe',
  async execute(params: { query: string }): Promise<ToolResult> {
    try {
      const script = `
        Add-Type -TypeDefinition @"
        using System;
        using System.Runtime.InteropServices;
        public class WinFocus {
            [DllImport("user32.dll")]
            public static extern bool SetForegroundWindow(IntPtr hWnd);
            [DllImport("user32.dll")]
            public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
        }
"@
        $target = Get-Process | Where-Object { 
            ($_.MainWindowTitle -like '*${params.query}*' -or $_.ProcessName -like '*${params.query}*') -and $_.MainWindowHandle -ne 0 
        } | Select-Object -First 1

        if ($target) {
            [WinFocus]::ShowWindow($target.MainWindowHandle, 9)
            [WinFocus]::SetForegroundWindow($target.MainWindowHandle)
            Write-Output "Focused: $($target.MainWindowTitle) ($($target.ProcessName))"
        } else {
            Write-Error "Window matching '${params.query}' not found."
        }
      `;
      const { stdout } = await runPowerShell(script);
      return {
        success: true,
        message: stdout.trim() || `Switched to window: ${params.query}`,
      };
    } catch (err: any) {
      return { success: false, error: `Failed to switch window: ${err.message}` };
    }
  },
};
