import { ITool, ToolResult } from '../types.js';
import { runPowerShell } from '../../utils/powershell.js';

export const keyboardTypeTool: ITool = {
  name: 'computer.type',
  category: 'computer',
  description: 'Types or pastes text directly into the currently focused window or field (supports Russian, English, multi-line, emojis, and symbols).',
  parameters: [
    { name: 'text', type: 'string', description: 'The text string to type/paste', required: true },
    { name: 'pressEnter', type: 'boolean', description: 'Whether to press Enter after typing to send or submit', required: false },
  ],
  dangerLevel: 'moderate',
  async execute(params: { text: string; pressEnter?: boolean }): Promise<ToolResult> {
    try {
      const script = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class WinKbPaste {
    [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);
    public const byte VK_CONTROL = 0x11;
    public const byte VK_V = 0x56;
    public const byte VK_RETURN = 0x0D;
    public const uint KEYEVENTF_KEYUP = 0x0002;
    public static void Paste(bool pressEnter) {
        keybd_event(VK_CONTROL, 0, 0, 0);
        System.Threading.Thread.Sleep(40);
        keybd_event(VK_V, 0, 0, 0);
        System.Threading.Thread.Sleep(40);
        keybd_event(VK_V, 0, KEYEVENTF_KEYUP, 0);
        keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, 0);
        if (pressEnter) {
            System.Threading.Thread.Sleep(250);
            keybd_event(VK_RETURN, 0, 0, 0);
            System.Threading.Thread.Sleep(40);
            keybd_event(VK_RETURN, 0, KEYEVENTF_KEYUP, 0);
        }
    }
}
"@ -ErrorAction SilentlyContinue

Set-Clipboard -Value @'
${params.text}
'@
Start-Sleep -Milliseconds 120
[WinKbPaste]::Paste(${params.pressEnter ? '$true' : '$false'})
`;
      await runPowerShell(script);
      return { success: true, message: `Успешно напечатан текст: "${params.text}"${params.pressEnter ? ' [нажат Enter]' : ''}` };
    } catch (err: any) {
      return { success: false, error: `Failed to type text: ${err.message}` };
    }
  },
};

export const keyboardKeyTool: ITool = {
  name: 'computer.key',
  category: 'computer',
  description: 'Presses special keys or key combinations (e.g. "Enter", "Escape", "Tab", "ctrl+f", "ctrl+k", "ctrl+c", "ctrl+v", "alt+tab", "backspace").',
  parameters: [
    {
      name: 'key',
      type: 'string',
      description: 'The key or combination to press. Examples: "Enter", "Escape", "Tab", "ctrl+f", "ctrl+k", "ctrl+v", "ctrl+a", "backspace", "Space"',
      required: true,
    },
  ],
  dangerLevel: 'moderate',
  async execute(params: { key: string }): Promise<ToolResult> {
    const rawKey = params.key.toLowerCase().trim();

    try {
      let sendKeysCode = '';

      // Common shortcuts mapping for WScript.Shell SendKeys
      if (rawKey.includes('+')) {
        const parts = rawKey.split('+').map(p => p.trim());
        let prefix = '';
        let mainKey = '';

        for (const p of parts) {
          if (p === 'ctrl' || p === 'control') prefix += '^';
          else if (p === 'alt') prefix += '%';
          else if (p === 'shift') prefix += '+';
          else mainKey = p;
        }

        if (mainKey === 'tab') sendKeysCode = `${prefix}{TAB}`;
        else if (mainKey === 'enter' || mainKey === 'return') sendKeysCode = `${prefix}~`;
        else if (mainKey === 'esc' || mainKey === 'escape') sendKeysCode = `${prefix}{ESC}`;
        else if (mainKey.startsWith('f') && !isNaN(Number(mainKey.slice(1)))) sendKeysCode = `${prefix}{${mainKey.toUpperCase()}}`;
        else sendKeysCode = `${prefix}${mainKey}`;
      } else {
        const map: Record<string, string> = {
          enter: '~',
          return: '~',
          escape: '{ESC}',
          esc: '{ESC}',
          tab: '{TAB}',
          space: ' ',
          backspace: '{BACKSPACE}',
          delete: '{DELETE}',
          del: '{DELETE}',
          up: '{UP}',
          down: '{DOWN}',
          left: '{LEFT}',
          right: '{RIGHT}',
          home: '{HOME}',
          end: '{END}',
          pageup: '{PGUP}',
          pagedown: '{PGDN}',
          f5: '{F5}',
          f11: '{F11}',
          f12: '{F12}',
        };
        sendKeysCode = map[rawKey] || `{${rawKey.toUpperCase()}}`;
      }

      const script = `
$wshell = New-Object -ComObject WScript.Shell
$wshell.SendKeys('${sendKeysCode}')
    Start-Sleep -Milliseconds 400
`;
      await runPowerShell(script);
      return { success: true, message: `Нажата клавиша: ${params.key}` };
    } catch (err: any) {
      return { success: false, error: `Failed to press key: ${err.message}` };
    }
  },
};
