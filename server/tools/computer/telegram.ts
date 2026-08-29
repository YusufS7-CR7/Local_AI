import { ITool, ToolResult } from '../types.js';
import { runPowerShell } from '../../utils/powershell.js';

function escapePowerShellLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

export const telegramSendMessageTool: ITool = {
  name: 'computer.telegram_send_message',
  category: 'computer',
  description: 'Opens Telegram, searches for a chat by name, opens it, and sends a message.',
  parameters: [
    { name: 'chat', type: 'string', description: 'Chat name, username, or contact to find', required: true },
    { name: 'message', type: 'string', description: 'Message to send to the chat', required: true },
  ],
  dangerLevel: 'moderate',
  async execute(params: { chat: string; message: string }): Promise<ToolResult> {
    const chat = params.chat.trim();
    const message = params.message.trim();
    if (!chat || !message) {
      return { success: false, error: 'Имя чата и сообщение не должны быть пустыми.' };
    }

    try {
      const chatLiteral = escapePowerShellLiteral(chat);
      const messageLiteral = escapePowerShellLiteral(message);
      const script = `
$proc = Get-Process -ErrorAction SilentlyContinue | Where-Object {
  $_.ProcessName -like '*telegram*' -and $_.MainWindowHandle -ne 0
} | Select-Object -First 1
if (-not $proc) {
  Start-Process 'telegram'
  Start-Sleep -Seconds 3
  $proc = Get-Process -ErrorAction SilentlyContinue | Where-Object {
    $_.ProcessName -like '*telegram*' -and $_.MainWindowHandle -ne 0
  } | Select-Object -First 1
}
if (-not $proc) { throw 'Окно Telegram не найдено.' }
$wshell = New-Object -ComObject WScript.Shell
$wshell.AppActivate($proc.Id) | Out-Null
Start-Sleep -Milliseconds 1200
$wshell.SendKeys('{ESC}')
Start-Sleep -Milliseconds 250
$wshell.SendKeys('^k')
Start-Sleep -Milliseconds 700
Set-Clipboard -Value '${chatLiteral}'
$wshell.SendKeys('^v')
Start-Sleep -Milliseconds 1800
$wshell.SendKeys('~')
Start-Sleep -Milliseconds 1400
$wshell.SendKeys('{ESC}')
Start-Sleep -Milliseconds 350
Set-Clipboard -Value @'
${messageLiteral}
'@
$wshell.SendKeys('^v')
Start-Sleep -Milliseconds 350
$wshell.SendKeys('~')
Start-Sleep -Milliseconds 700
`;
      await runPowerShell(script);
      return {
        success: true,
        message: `В Telegram открыт чат «${chat}» и отправлено сообщение.`,
      };
    } catch (err: any) {
      return { success: false, error: `Не удалось отправить сообщение в Telegram: ${err.message}` };
    }
  },
};
