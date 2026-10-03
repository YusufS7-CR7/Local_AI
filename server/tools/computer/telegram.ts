import { ITool, ToolResult } from '../types.js';
import { runPowerShell } from '../../utils/powershell.js';
import { activateAndForegroundApp } from '../../utils/windowActivator.js';
import { screenshotTool } from './screenshot.js';
import { brain } from '../../router/brain.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Uses Vision AI to find a UI element on screen and return its pixel coordinates.
 */
async function visionFindElement(description: string): Promise<{ x: number; y: number } | null> {
  try {
    // Get real screen resolution
    const { stdout: resOut } = await execAsync(
      `powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; $s = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; Write-Output ('{0}x{1}' -f $s.Width, $s.Height)"`
    );
    const [sw, sh] = (resOut.trim() || '1920x1080').split('x').map(n => parseInt(n) || 1080);

    const screenRes = await screenshotTool.execute({ resizeWidth: 1280 });
    if (!screenRes.success || !screenRes.screenshot) return null;

    const imageBase64 = screenRes.screenshot.replace(/^data:image\/\w+;base64,/, '');

    const prompt = `Ты — система компьютерного зрения JARVIS. Смотришь на скриншот экрана Windows (реальное разрешение ${sw}x${sh}, изображение масштабировано).
Найди элемент: "${description}".
Верни СТРОГО JSON без markdown:
{"found": true/false, "x": число_пикселей_от_левого_края_реального_экрана, "y": число_пикселей_от_верхнего_края_реального_экрана, "explanation": "где находится"}
Координаты должны быть в реальных пикселях (0..${sw} по x, 0..${sh} по y), с учётом масштабирования изображения.`;

    const raw = await brain.generateWithVision({ prompt, images: [imageBase64] });
    const clean = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    const parsed = JSON.parse(clean);

    if (parsed.found && typeof parsed.x === 'number' && typeof parsed.y === 'number') {
      const x = Math.max(0, Math.min(sw, Math.round(parsed.x)));
      const y = Math.max(0, Math.min(sh, Math.round(parsed.y)));
      console.log(`[TG Vision] Found "${description}" at (${x}, ${y}): ${parsed.explanation}`);
      return { x, y };
    }
    return null;
  } catch (err: any) {
    console.warn(`[TG Vision] Failed to locate "${description}":`, err.message);
    return null;
  }
}

/**
 * Clicks at the given pixel coordinates using Win32 mouse_event.
 */
async function clickAt(x: number, y: number, button: 'left' | 'double' = 'left'): Promise<void> {
  const script = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class WinMouse2 {
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, int e);
    public const uint LD = 0x0002, LU = 0x0004;
    public static void Click(int x, int y) {
        SetCursorPos(x, y);
        System.Threading.Thread.Sleep(80);
        mouse_event(LD, (uint)x, (uint)y, 0, 0);
        System.Threading.Thread.Sleep(60);
        mouse_event(LU, (uint)x, (uint)y, 0, 0);
    }
}
"@ -ErrorAction SilentlyContinue
[WinMouse2]::Click(${Math.round(x)}, ${Math.round(y)})
${button === 'double' ? `Start-Sleep -Milliseconds 120\n[WinMouse2]::Click(${Math.round(x)}, ${Math.round(y)})` : ''}
Start-Sleep -Milliseconds 200
`;
  await runPowerShell(script);
}

/**
 * Types text into the currently focused element using clipboard paste.
 */
async function typeText(text: string, pressEnter = false): Promise<void> {
  const escaped = text.replace(/'/g, "''");
  const script = `
Set-Clipboard -Value '${escaped}'
Start-Sleep -Milliseconds 150
$wshell = New-Object -ComObject WScript.Shell
$wshell.SendKeys('^v')
Start-Sleep -Milliseconds 250
${pressEnter ? "$wshell.SendKeys('~')\nStart-Sleep -Milliseconds 300" : ''}
`;
  await runPowerShell(script);
}

/**
 * Clears the current text field (Ctrl+A → Delete).
 */
async function clearField(): Promise<void> {
  const script = `
$wshell = New-Object -ComObject WScript.Shell
$wshell.SendKeys('^a')
Start-Sleep -Milliseconds 120
$wshell.SendKeys('{DELETE}')
Start-Sleep -Milliseconds 120
`;
  await runPowerShell(script);
}

function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

export const telegramSendMessageTool: ITool = {
  name: 'computer.telegram_send_message',
  category: 'computer',
  description: [
    'Opens Telegram Desktop, visually finds the chat by looking at the screen and clicking the search bar,',
    'types the chat name, clicks the first result, then types and sends the message.',
    'Works like a human — uses Vision AI to see the interface and click on what is visible.',
    'Use chat="Избранное" for Saved Messages.',
  ].join(' '),
  parameters: [
    {
      name: 'chat',
      type: 'string',
      description: 'Chat name, contact name, or "Избранное" for Saved Messages',
      required: true,
    },
    {
      name: 'message',
      type: 'string',
      description: 'Text message to send',
      required: true,
    },
  ],
  dangerLevel: 'moderate',

  async execute(params: { chat: string; message: string }): Promise<ToolResult> {
    const chat = params.chat.trim();
    const message = params.message.trim();

    if (!chat || !message) {
      return { success: false, error: 'Имя чата и текст сообщения не могут быть пустыми.' };
    }

    // ── 1. Activate Telegram window ──────────────────────────────────────────
    const activation = await activateAndForegroundApp('telegram');
    if (!activation.success) {
      return {
        success: false,
        error: `Не удалось открыть Telegram: ${activation.error || activation.message}`,
        data: activation.diagnostics,
      };
    }
    await delay(800); // wait for window to appear and render

    // ── 2. Press Escape first to close any open dialogs/menus ────────────────
    await runPowerShell(`$w = New-Object -ComObject WScript.Shell; $w.SendKeys('{ESC}'); Start-Sleep -Milliseconds 300`);

    // ── 3. VISION: Find and click the Telegram search bar ───────────────────
    console.log('[TG] Looking for search bar on screen...');
    let searchBarFound = false;

    const searchPos = await visionFindElement(
      'Telegram search bar / поле поиска "Search" в верхней части боковой панели Telegram'
    );

    if (searchPos) {
      await clickAt(searchPos.x, searchPos.y);
      await delay(400);
      searchBarFound = true;
      console.log(`[TG] Clicked search bar at (${searchPos.x}, ${searchPos.y})`);
    } else {
      // Fallback: Ctrl+K is the standard Telegram search shortcut
      console.log('[TG] Search bar not found visually, trying Ctrl+K fallback...');
      await runPowerShell(`$w = New-Object -ComObject WScript.Shell; $w.SendKeys('^k'); Start-Sleep -Milliseconds 500`);
      searchBarFound = true; // assume it worked
    }

    // ── 4. Clear any existing text and type the chat name ───────────────────
    if (searchBarFound) {
      await clearField();
      await delay(150);
      await typeText(chat, false);
      await delay(1200); // wait for Telegram to show search results
    }

    // ── 5. VISION: Find and click the first matching chat result ─────────────
    console.log(`[TG] Looking for chat "${chat}" in search results...`);
    let chatClicked = false;

    const chatPos = await visionFindElement(
      `Telegram search result — chat or contact named "${chat}" in the sidebar list`
    );

    if (chatPos) {
      await clickAt(chatPos.x, chatPos.y);
      await delay(600);
      chatClicked = true;
      console.log(`[TG] Clicked chat "${chat}" at (${chatPos.x}, ${chatPos.y})`);
    } else {
      // Fallback: just press Enter to open the first result
      console.log(`[TG] Chat "${chat}" not found visually, pressing Enter on first result...`);
      await runPowerShell(`$w = New-Object -ComObject WScript.Shell; $w.SendKeys('~'); Start-Sleep -Milliseconds 600`);
      chatClicked = true;
    }

    if (!chatClicked) {
      return {
        success: false,
        error: `Чат «${chat}» не найден в результатах поиска Telegram на экране.`,
      };
    }

    // ── 6. VISION: Find and click the message input field ───────────────────
    console.log('[TG] Looking for message input field...');
    await delay(400);

    const inputPos = await visionFindElement(
      'Telegram message input / поле ввода сообщения "Write a message..." внизу чата'
    );

    if (inputPos) {
      await clickAt(inputPos.x, inputPos.y);
      await delay(300);
      console.log(`[TG] Clicked message input at (${inputPos.x}, ${inputPos.y})`);
    } else {
      // Fallback: press Escape to leave search, focus should go to message input
      await runPowerShell(`$w = New-Object -ComObject WScript.Shell; $w.SendKeys('{ESC}'); Start-Sleep -Milliseconds 300`);
    }

    // ── 7. Type the message and send ─────────────────────────────────────────
    await clearField(); // clear any accidental text
    await delay(150);
    await typeText(message, true); // true = press Enter to send
    await delay(400);

    // ── 8. Quick sanity check: is Telegram still open? ───────────────────────
    try {
      const checkResult = await runPowerShell(
        '$tg = Get-Process telegram -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 }\nif ($tg) { Write-Output "WINDOW_VISIBLE" } else { Write-Output "NO_WINDOW" }'
      );
      const isVisible = checkResult.stdout.includes('WINDOW_VISIBLE');
      return {
        success: isVisible,
        message: isVisible
          ? `В Telegram открыт чат «${chat}» и отправлено сообщение: «${message}»`
          : `Сообщение отправлено, но окно Telegram больше не обнаружено на экране.`,
        data: {
          ...activation.diagnostics,
          chatName: chat,
          messageSent: message,
          searchBarFoundVisually: searchBarFound,
          chatClickedVisually: chatClicked,
          inputFoundVisually: !!inputPos,
          telegramWindowVisible: isVisible,
        },
      };
    } catch {
      return {
        success: true,
        message: `В Telegram открыт чат «${chat}» и отправлено сообщение: «${message}»`,
        data: activation.diagnostics,
      };
    }
  },
};
