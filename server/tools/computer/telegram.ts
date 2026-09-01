import { ITool, ToolResult } from '../types.js';
import { runPowerShell } from '../../utils/powershell.js';
import { activateAndForegroundApp } from '../../utils/windowActivator.js';

function escapePowerShellLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

export const telegramSendMessageTool: ITool = {
  name: 'computer.telegram_send_message',
  category: 'computer',
  description: 'Brings Telegram to the foreground (including restoring from tray), finds a contact or Saved Messages (Избранное), opens the chat, and sends a message.',
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
      // 1. Bring Telegram window to foreground layer (from Tray or Disk)
      const activation = await activateAndForegroundApp('telegram');
      if (!activation.success) {
        return {
          success: false,
          error: `Не удалось вывести Telegram на передний план: ${activation.error || activation.message}`,
          data: activation.diagnostics,
        };
      }

      // Small stabilization delay for UI render
      await new Promise(r => setTimeout(r, 600));

      // 2. PowerShell script: focus Telegram, search chat and send message
      const chatLiteral = escapePowerShellLiteral(chat);
      const messageLiteral = escapePowerShellLiteral(message);
      const targetPid = activation.diagnostics?.pid || 0;

      const script = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class WinTelegram {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);
    
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

$wshell = New-Object -ComObject WScript.Shell
$pidNum = ${targetPid}

if ($pidNum -gt 0) {
    $wshell.AppActivate($pidNum) | Out-Null
    Start-Sleep -Milliseconds 250
}

# Clear search / unselect
$wshell.SendKeys('{ESC}')
Start-Sleep -Milliseconds 200

# Open Search (Ctrl+K or Ctrl+F)
$wshell.SendKeys('^k')
Start-Sleep -Milliseconds 400

# Paste chat name
Set-Clipboard -Value '${chatLiteral}'
$wshell.SendKeys('^v')
Start-Sleep -Milliseconds 1000

# Select first chat
$wshell.SendKeys('~')
Start-Sleep -Milliseconds 600

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
        data: activation.diagnostics,
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Не удалось выполнить действие в Telegram: ${err.message || String(err)}`,
      };
    }
  },
};
