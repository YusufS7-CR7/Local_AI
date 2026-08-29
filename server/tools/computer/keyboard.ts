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
Set-Clipboard -Value @'
${params.text}
'@
Start-Sleep -Milliseconds 120
$wshell = New-Object -ComObject WScript.Shell
$wshell.SendKeys('^v')
Start-Sleep -Milliseconds 180
${params.pressEnter ? "$wshell.SendKeys('~')" : ''}
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
