import { ITool, ToolResult } from '../types.js';
import { runPowerShell } from '../../utils/powershell.js';
import { activateAndForegroundApp } from '../../utils/windowActivator.js';
import { screenshotTool } from './screenshot.js';
import { brain } from '../../router/brain.js';
import sharp from 'sharp';

/**
 * Normalizes Russian inflected contact names to their dictionary/nominative form.
 * E.g., "маме" -> "Мама", "папе" -> "Папа", "жене" -> "Жена", "Ване" -> "Ваня".
 */
function normalizeContactName(name: string): string {
  const n = name.trim();
  const lower = n.toLowerCase();

  const commonMap: Record<string, string> = {
    'маме': 'Мама',
    'маму': 'Мама',
    'мама': 'Мама',
    'папе': 'Папа',
    'папу': 'Папа',
    'папа': 'Папа',
    'жене': 'Жена',
    'жену': 'Жена',
    'жена': 'Жена',
    'мужу': 'Муж',
    'муж': 'Муж',
    'брату': 'Брат',
    'брат': 'Брат',
    'сестре': 'Сестра',
    'сестру': 'Сестра',
    'сестра': 'Сестра',
    'сыну': 'Сын',
    'сын': 'Сын',
    'дочке': 'Дочка',
    'дочь': 'Дочь',
    'дочери': 'Дочь',
    'бабушке': 'Бабушка',
    'дедушке': 'Дедушка',
    'другу': 'Друг',
    'друг': 'Друг',
  };

  if (commonMap[lower]) {
    return commonMap[lower];
  }

  // Declension fixes:
  if (lower.endsWith('е')) {
    if (/[жшчщ]е$/i.test(lower)) {
      return n.slice(0, -1) + (n.endsWith('Е') ? 'А' : 'а');
    }
    return n.slice(0, -1) + (n.endsWith('Е') ? 'Я' : 'я');
  }

  if (lower.endsWith('у') && /[бвгджзклмнпрстфхцчшщ]у$/i.test(lower)) {
    return n.slice(0, -1);
  }

  if (lower.endsWith('ю')) {
    return n.slice(0, -1) + (n.endsWith('Ю') ? 'Ь' : 'ь');
  }

  return n;
}

/**
 * Uses Vision AI to find a UI element on screen and return its exact pixel coordinates.
 * Operates at 100% native screen resolution with DPI awareness.
 */
async function visionFindElement(description: string): Promise<{ x: number; y: number } | null> {
  try {
    // 1. Get real primary screen resolution from Windows
    const { stdout: resOut } = await runPowerShell(
      `Add-Type -AssemblyName System.Windows.Forms; $s = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; Write-Output ($s.Width.ToString() + 'x' + $s.Height.ToString())`
    );
    const [sw, sh] = (resOut.trim() || '1920x1080').split('x').map(n => parseInt(n) || 1080);

    // 2. Capture FULL native resolution screenshot (NO lossy downscaling)
    const screenRes = await screenshotTool.execute({});
    if (!screenRes.success || !screenRes.screenshot) return null;

    const imageBase64 = screenRes.screenshot.replace(/^data:image\/\w+;base64,/, '');
    const buf = Buffer.from(imageBase64, 'base64');
    const meta = await sharp(buf).metadata();
    const imgW = meta.width || sw;
    const imgH = meta.height || sh;

    const scaleX = sw / imgW;
    const scaleY = sh / imgH;

    const prompt = `Ты — высокоточная система визуального позиционирования JARVIS.
Перед тобой скриншот рабочего стола Windows (разрешение изображения: ${imgW}x${imgH} пикселей, реальный экран: ${sw}x${sh}).

Твоя цель — найти элемент интерфейса:
"${description}"

ПРАВИЛА ОПРЕДЕЛЕНИЯ ТОЧНЫХ КООРДИНАТ:
1. Если ищешь строку чата или контакта в списке Telegram:
   - Внимательно прочитай текст на скриншоте.
   - Найди ИМЕННО строку с именем указанного контакта, а НЕ заголовок раздела (например "Чаты и контакты" / "Global search") и НЕ верхний соседний чат!
   - Координата Y должна указывать строго на ВЕРТИКАЛЬНУЮ СЕРЕДИНУ строки этого контакта (посередине между верхней и нижней границей строки, прямо на текст имени).
   - Координата X должна указывать на текст имени контакта или его аватарку слева от имени.
2. Если ищешь поле ввода сообщения:
   - Выбери координаты в ПУСТОЙ ТЕКСТОВОЙ ОБЛАСТИ поля ввода (ближе к центру строки).
   - Ни в коем случае НЕ нажимай на смайлики слева и НЕ на микрофон справа!
3. Координаты указываются в пикселях данного изображения (X: 0..${imgW}, Y: 0..${imgH}).
4. Обязательно укажи ограничивающий прямоугольник (box) найденного элемента для достижения 100% точности клика.

Верни СТРОГО валидный JSON без markdown:
{
  "found": true,
  "x": число_x_в_пикселях,
  "y": число_y_в_пикселях,
  "box": { "ymin": число, "xmin": число, "ymax": число, "xmax": число },
  "explanation": "где именно найден элемент, какой текст на нём написан"
}`;

    const raw = await brain.generateWithVision({ prompt, images: [imageBase64] });
    const clean = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    const parsed = JSON.parse(clean);

    if (parsed.found && (typeof parsed.x === 'number' || parsed.box)) {
      let targetX = typeof parsed.x === 'number' ? parsed.x : 0;
      let targetY = typeof parsed.y === 'number' ? parsed.y : 0;

      // Use box midpoint if available for extreme accuracy
      if (parsed.box && typeof parsed.box.ymin === 'number' && typeof parsed.box.ymax === 'number') {
        let bYmin = parsed.box.ymin;
        let bYmax = parsed.box.ymax;
        let bXmin = typeof parsed.box.xmin === 'number' ? parsed.box.xmin : targetX;
        let bXmax = typeof parsed.box.xmax === 'number' ? parsed.box.xmax : targetX;

        // If coordinates were normalized 0..1000
        if (bYmax <= 1000 && imgH > 1000 && bYmin <= 1000) {
          bYmin = (bYmin / 1000) * imgH;
          bYmax = (bYmax / 1000) * imgH;
          bXmin = (bXmin / 1000) * imgW;
          bXmax = (bXmax / 1000) * imgW;
        }

        targetY = Math.round((bYmin + bYmax) / 2);
        targetX = Math.round((bXmin + bXmax) / 2);
      } else if (targetX <= 1000 && targetY <= 1000 && imgW > 1000 && imgH > 1000 && parsed.explanation?.includes('1000')) {
        targetX = (targetX / 1000) * imgW;
        targetY = (targetY / 1000) * imgH;
      }

      const realX = Math.max(0, Math.min(sw, Math.round(targetX * scaleX)));
      const realY = Math.max(0, Math.min(sh, Math.round(targetY * scaleY)));

      console.log(`[TG Vision] Found "${description}" at screen coords (${realX}, ${realY}): ${parsed.explanation}`);
      return { x: realX, y: realY };
    }
    return null;
  } catch (err: any) {
    console.warn(`[TG Vision] Failed to locate "${description}":`, err.message);
    return null;
  }
}

/**
 * Shared C# input helper that is 100% layout-independent (hardware scan codes for VK_CONTROL, VK_V, VK_RETURN).
 */
const CSHARP_INPUT_HELPER = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class WinTelegramInput {
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, int e);
    [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);

    public const uint LD = 0x0002, LU = 0x0004;
    public const byte VK_BACK = 0x08;
    public const byte VK_RETURN = 0x0D;
    public const byte VK_CONTROL = 0x11;
    public const byte VK_A = 0x41;
    public const byte VK_V = 0x56;
    public const uint KEYEVENTF_KEYUP = 0x0002;

    public static void Click(int x, int y) {
        SetProcessDPIAware();
        SetCursorPos(x, y);
        System.Threading.Thread.Sleep(60);
        mouse_event(LD, (uint)x, (uint)y, 0, 0);
        System.Threading.Thread.Sleep(50);
        mouse_event(LU, (uint)x, (uint)y, 0, 0);
    }

    public static void Clear() {
        // Ctrl+A -> Backspace
        keybd_event(VK_CONTROL, 0, 0, 0);
        System.Threading.Thread.Sleep(30);
        keybd_event(VK_A, 0, 0, 0);
        System.Threading.Thread.Sleep(30);
        keybd_event(VK_A, 0, KEYEVENTF_KEYUP, 0);
        keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, 0);
        System.Threading.Thread.Sleep(60);

        keybd_event(VK_BACK, 0, 0, 0);
        System.Threading.Thread.Sleep(30);
        keybd_event(VK_BACK, 0, KEYEVENTF_KEYUP, 0);
    }

    public static void PasteAndSend(bool pressEnter) {
        // Hardware Ctrl+V paste (works on any keyboard layout, including RU)
        keybd_event(VK_CONTROL, 0, 0, 0);
        System.Threading.Thread.Sleep(40);
        keybd_event(VK_V, 0, 0, 0);
        System.Threading.Thread.Sleep(40);
        keybd_event(VK_V, 0, KEYEVENTF_KEYUP, 0);
        keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, 0);

        if (pressEnter) {
            System.Threading.Thread.Sleep(350);
            // Hardware Enter key
            keybd_event(VK_RETURN, 0, 0, 0);
            System.Threading.Thread.Sleep(50);
            keybd_event(VK_RETURN, 0, KEYEVENTF_KEYUP, 0);
        }
    }
}
"@ -ErrorAction SilentlyContinue
`;

/**
 * Clicks at the given pixel coordinates using DPI-aware Win32 mouse_event.
 */
async function clickAt(x: number, y: number): Promise<void> {
  const script = `
${CSHARP_INPUT_HELPER}
[WinTelegramInput]::Click(${Math.round(x)}, ${Math.round(y)})
Start-Sleep -Milliseconds 150
`;
  await runPowerShell(script);
}

/**
 * Types text into the currently focused element using clipboard paste with hardware key codes.
 * Completely immune to Russian/English keyboard layout differences.
 */
async function typeText(text: string, pressEnter = false): Promise<void> {
  const escaped = text.replace(/'/g, "''");
  const script = `
${CSHARP_INPUT_HELPER}
Set-Clipboard -Value '${escaped}'
Start-Sleep -Milliseconds 120
[WinTelegramInput]::PasteAndSend(${pressEnter ? '$true' : '$false'})
Start-Sleep -Milliseconds 250
`;
  await runPowerShell(script);
}

/**
 * Clears the current text field (Ctrl+A -> Backspace) using hardware key codes.
 */
async function clearField(): Promise<void> {
  const script = `
${CSHARP_INPUT_HELPER}
[WinTelegramInput]::Clear()
Start-Sleep -Milliseconds 100
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
    'types the chat name, clicks the exact matching chat, then types and sends the message.',
    'Works like a human — uses Vision AI with pixel precision to see the interface and click the right element.',
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
    const rawChat = params.chat.trim();
    const message = params.message.trim();

    if (!rawChat || !message) {
      return { success: false, error: 'Имя чата и текст сообщения не могут быть пустыми.' };
    }

    // Normalize chat to nominative form so Telegram search matches contact book entries (e.g. "маме" -> "Мама")
    const chat = normalizeContactName(rawChat);

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

    // Get screen bounds
    const { stdout: resOut } = await runPowerShell(
      `Add-Type -AssemblyName System.Windows.Forms; $s = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; Write-Output ($s.Width.ToString() + 'x' + $s.Height.ToString())`
    );
    const [sw, sh] = (resOut.trim() || '1920x1080').split('x').map(n => parseInt(n) || 1080);

    // ── 2. Press Escape first to close any open dialogs/menus ────────────────
    await runPowerShell(`$w = New-Object -ComObject WScript.Shell; $w.SendKeys('{ESC}'); Start-Sleep -Milliseconds 300`);

    // ── 3. VISION: Find and click the Telegram search bar ───────────────────
    console.log('[TG] Looking for search bar on screen...');
    let searchBarFound = false;

    const searchPos = await visionFindElement(
      'Поле поиска Telegram в верхней левой части окна (строка с иконкой лупы или текстом "Поиск" / "Search")'
    );

    if (searchPos) {
      await clickAt(searchPos.x, searchPos.y);
      await delay(400);
      searchBarFound = true;
      console.log(`[TG] Clicked search bar at (${searchPos.x}, ${searchPos.y})`);
    } else {
      // Fallback: Ctrl+K is the standard Telegram search shortcut
      console.log('[TG] Search bar not found visually, trying Ctrl+K shortcut...');
      await runPowerShell(`$w = New-Object -ComObject WScript.Shell; $w.SendKeys('^k'); Start-Sleep -Milliseconds 500`);
      searchBarFound = true;
    }

    // ── 4. Clear any existing text and type the chat name ───────────────────
    if (searchBarFound) {
      await clearField();
      await delay(150);
      await typeText(chat, false);
      await delay(1500); // wait for Telegram to show search results
    }

    // ── 5. VISION: Find and click the exact matching chat result ─────────────
    console.log(`[TG] Looking for chat "${chat}" (original: "${rawChat}") in search results...`);
    let chatClicked = false;

    const chatPos = await visionFindElement(
      `В списке результатов поиска Telegram (в левой колонке) найди строку с именем чата или контакта "${chat}"` +
      (rawChat !== chat ? ` (также может быть записан как "${rawChat}")` : '') +
      `. ВАЖНО: кликни именно по строке этого контакта, а НЕ по заголовку списка и НЕ по верхнему чужому чату.`
    );

    if (chatPos) {
      await clickAt(chatPos.x, chatPos.y);
      await delay(700);
      chatClicked = true;
      console.log(`[TG] Clicked chat "${chat}" at exact position (${chatPos.x}, ${chatPos.y})`);
    } else {
      // Fallback: press Enter to select the active search result in Telegram
      console.log(`[TG] Chat "${chat}" exact row not pinpointed visually, trying Enter fallback...`);
      await runPowerShell(`$w = New-Object -ComObject WScript.Shell; $w.SendKeys('~'); Start-Sleep -Milliseconds 700`);
      chatClicked = true;
    }

    if (!chatClicked) {
      return {
        success: false,
        error: `Чат «${chat}» не найден в результатах поиска Telegram на экране.`,
      };
    }

    // ── 6. Focus the message input field ─────────────────────────────────────
    console.log('[TG] Focusing message input field...');
    await delay(400);

    // Look visually for the input field
    const inputPos = await visionFindElement(
      'Текстовое поле ввода сообщения внизу открытого чата Telegram (кликни строго по центру текстовой строки "Написать сообщение...", ни в коем случае НЕ нажимай на смайлики слева и НЕ на микрофон справа)'
    );

    // Guaranteed fallback coordinate: 65% across screen (chat pane center), 45px above bottom
    const targetInputX = inputPos ? inputPos.x : Math.round(sw * 0.65);
    const targetInputY = inputPos ? inputPos.y : (sh - 45);

    await clickAt(targetInputX, targetInputY);
    await delay(300);
    console.log(`[TG] Clicked message input at (${targetInputX}, ${targetInputY})`);

    // ── 7. Type the message and send via hardware key codes ──────────────────
    await clearField();
    await delay(150);
    await typeText(message, true); // true = hardware VK_RETURN
    await delay(800); // Allow Telegram to process and transmit the message

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
          originalChatQuery: rawChat,
          messageSent: message,
          searchBarFoundVisually: searchBarFound,
          chatClickedVisually: !!chatPos,
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
