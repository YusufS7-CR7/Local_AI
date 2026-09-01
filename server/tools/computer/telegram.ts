import { ITool, ToolResult } from '../types.js';
import { runPowerShell } from '../../utils/powershell.js';
import { resolveAppPath } from './app.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';

const execAsync = promisify(exec);

function escapePowerShellLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

export const telegramSendMessageTool: ITool = {
  name: 'computer.telegram_send_message',
  category: 'computer',
  description: 'Brings Telegram to the foreground, finds a contact or Saved Messages (Избранное), opens the chat, and sends a message.',
  parameters: [
    { name: 'chat', type: 'string', description: 'Chat name, username, or "Избранное" / "Saved Messages"', required: true },
    { name: 'message', type: 'string', description: 'Message text to send', required: true },
  ],
  dangerLevel: 'moderate',
  async execute(params: { chat: string; message: string }): Promise<ToolResult> {
    const chat = params.chat.trim();
    const message = params.message.trim();
    if (!chat || !message) {
      return { success: false, error: 'Имя чата и текст сообщения не могут быть пустыми.' };
    }

    try {
      // 1. Resolve exact Telegram executable path on disk
      const { targetPath } = resolveAppPath('telegram');

      // 2. Launch / Restore Telegram from tray
      if (targetPath && fs.existsSync(targetPath)) {
        await execAsync(`cmd.exe /c start "" "${targetPath}"`);
      } else {
        await execAsync(`cmd.exe /c start tg://`);
      }

      // 3. PowerShell script: Wait for window, force foreground, search chat and send message
      const chatLiteral = escapePowerShellLiteral(chat);
      const messageLiteral = escapePowerShellLiteral(message);

      const script = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class WinTelegram {
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")]
    public static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);
    
    public static void Activate(IntPtr hWnd) {
        if (hWnd == IntPtr.Zero) return;
        if (IsIconic(hWnd)) {
            ShowWindowAsync(hWnd, 9); // SW_RESTORE
        } else {
            ShowWindowAsync(hWnd, 5); // SW_SHOW
        }
        keybd_event(0x12, 0, 0, 0); // ALT key down
        SetForegroundWindow(hWnd);
        keybd_event(0x12, 0, 2, 0); // ALT key up
    }
}
"@ -ErrorAction SilentlyContinue

$foundProc = $null
for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 250
    $proc = Get-Process -ErrorAction SilentlyContinue | Where-Object { 
        $_.ProcessName -like "*telegram*" -and $_.MainWindowHandle -ne 0 
    } | Select-Object -First 1
    if ($proc) {
        $foundProc = $proc
        break
    }
}

if (-not $foundProc) {
    throw 'Окно Telegram не появилось на экране (проверьте, установлен ли Telegram Desktop).'
}

# Bring Telegram window to foreground
[WinTelegram]::Activate($foundProc.MainWindowHandle)
Start-Sleep -Milliseconds 600

$wshell = New-Object -ComObject WScript.Shell
$wshell.AppActivate($foundProc.Id) | Out-Null
Start-Sleep -Milliseconds 300

# Clear search / unselect
$wshell.SendKeys('{ESC}')
Start-Sleep -Milliseconds 200

# Open Search (Ctrl+K or Ctrl+F)
$wshell.SendKeys('^k')
Start-Sleep -Milliseconds 500

# Paste chat name
Set-Clipboard -Value '${chatLiteral}'
$wshell.SendKeys('^v')
Start-Sleep -Milliseconds 1200

# Select first chat
$wshell.SendKeys('~')
Start-Sleep -Milliseconds 800

# Escape out of search box into message input
$wshell.SendKeys('{ESC}')
Start-Sleep -Milliseconds 250

# Paste message
Set-Clipboard -Value @'
${messageLiteral}
'@
$wshell.SendKeys('^v')
Start-Sleep -Milliseconds 300

# Send message
$wshell.SendKeys('~')
Start-Sleep -Milliseconds 400
`;

      await runPowerShell(script);

      return {
        success: true,
        message: `В Telegram открыт чат «${chat}» и отправлено сообщение.`,
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Не удалось выполнить действие в Telegram: ${err.message || String(err)}`,
      };
    }
  },
};
