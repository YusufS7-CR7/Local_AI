import { ITool, ToolResult } from '../types.js';
import { runPowerShell } from '../../utils/powershell.js';
import { activateAndForegroundApp } from '../../utils/windowActivator.js';

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
  description: 'Brings an application window to the foreground by its title or process name, restoring it from tray if needed.',
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
    const activation = await activateAndForegroundApp(params.query);
    if (activation.success) {
      return {
        success: true,
        message: activation.message,
        data: activation.diagnostics,
      };
    }
    return {
      success: false,
      error: activation.error || activation.message,
      data: activation.diagnostics,
    };
  },
};

