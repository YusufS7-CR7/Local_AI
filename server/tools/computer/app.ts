import { ITool, ToolResult } from '../types.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runPowerShell } from '../../utils/powershell.js';
import { cleanSearchQuery } from '../../utils/queryCleaner.js';

const execAsync = promisify(exec);

const home = os.homedir();
const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
const programData = process.env.ProgramData || 'C:\\ProgramData';
const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

// Common aliases in English, Russian, and transliteration
const APP_ALIASES: Record<string, string> = {
  // Telegram
  telegram: 'telegram',
  tg: 'telegram',
  тг: 'telegram',
  телега: 'telegram',
  телеграм: 'telegram',
  телеграмм: 'telegram',
  'telegram desktop': 'telegram',

  // Browsers
  chrome: 'chrome',
  'google chrome': 'chrome',
  google_chrome: 'chrome',
  browser: 'chrome',
  хром: 'chrome',
  гугл: 'chrome',
  браузер: 'chrome',
  гуглхром: 'chrome',
  'гугл хром': 'chrome',
  вкладка: 'chrome',
  вкладку: 'chrome',
  вкладки: 'chrome',
  edge: 'edge',
  msedge: 'edge',
  эдж: 'edge',
  yandex: 'yandex',
  яндекс: 'yandex',
  'яндекс браузер': 'yandex',

  // Dev & Creative
  vscode: 'code',
  code: 'code',
  'vs code': 'code',
  'visual studio code': 'code',
  вскод: 'code',
  код: 'code',
  discord: 'discord',
  дискорд: 'discord',
  дс: 'discord',
  capcut: 'capcut',
  капкут: 'capcut',
  капкат: 'capcut',
  steam: 'steam',
  стим: 'steam',
  spotify: 'spotify',
  спотифай: 'spotify',
  obs: 'obs',
  обс: 'obs',
  figma: 'figma',
  фигма: 'figma',
  photoshop: 'photoshop',
  фотошоп: 'photoshop',
  word: 'winword',
  ворд: 'winword',
  excel: 'excel',
  эксель: 'excel',

  // System Utilities
  notepad: 'notepad',
  блокнот: 'notepad',
  заметки: 'notepad',
  calc: 'calc',
  calculator: 'calc',
  калькулятор: 'calc',
  explorer: 'explorer',
  files: 'explorer',
  проводник: 'explorer',
  папка: 'explorer',
  файлы: 'explorer',
  terminal: 'terminal',
  терминал: 'terminal',
  консоль: 'terminal',
  powershell: 'powershell',
  cmd: 'cmd',
};

// Known exact application paths on Windows
const HARDCODED_CANDIDATES: Record<string, string[]> = {
  telegram: [
    path.join(appData, 'Telegram Desktop', 'Telegram.exe'),
    path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Telegram Desktop', 'Telegram.lnk'),
    path.join(localAppData, 'Programs', 'Telegram Desktop', 'Telegram.exe'),
    path.join(programFiles, 'Telegram Desktop', 'Telegram.exe'),
  ],
  chrome: [
    path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(programData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Google Chrome.lnk'),
  ],
  code: [
    path.join(localAppData, 'Programs', 'Microsoft VS Code', 'Code.exe'),
    path.join(programFiles, 'Microsoft VS Code', 'Code.exe'),
    path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Visual Studio Code', 'Visual Studio Code.lnk'),
  ],
  discord: [
    path.join(localAppData, 'Discord', 'Update.exe'),
    path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Discord.lnk'),
    path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Discord Inc', 'Discord.lnk'),
  ],
  edge: [
    path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ],
  notepad: ['notepad.exe'],
  calc: ['calc.exe'],
  explorer: ['explorer.exe'],
  terminal: ['wt.exe', 'powershell.exe', 'cmd.exe'],
};

// Discovered PC Application Cache
let appCache: Map<string, string> | null = null;
let lastCacheScanTime = 0;

function scanSystemShortcuts(): Map<string, string> {
  const now = Date.now();
  if (appCache && now - lastCacheScanTime < 60000) {
    return appCache;
  }

  const map = new Map<string, string>();

  // High-priority directories where Windows applications and shortcuts live
  const searchDirs = [
    path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    path.join(programData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    path.join(home, 'Desktop'),
    'C:\\Users\\Public\\Desktop',
    path.join(localAppData, 'Programs'),
    path.join(appData, 'Telegram Desktop'),
  ];

  function scanFolder(dir: string, depth = 0) {
    if (depth > 3 || !fs.existsSync(dir)) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          // Avoid slow or huge folders
          if (entry.name !== 'node_modules' && entry.name !== '.git') {
            scanFolder(fullPath, depth + 1);
          }
        } else {
          const ext = path.extname(entry.name).toLowerCase();
          if (ext === '.lnk' || ext === '.exe') {
            const base = path.basename(entry.name, ext).toLowerCase().trim();
            // Don't index uninstaller links
            if (!base.includes('uninstall') && !map.has(base)) {
              map.set(base, fullPath);
            }
          }
        }
      }
    } catch {}
  }

  for (const dir of searchDirs) {
    scanFolder(dir, 0);
  }

  appCache = map;
  lastCacheScanTime = now;
  return map;
}

/**
 * Resolves any application query to an executable or shortcut path on user's PC.
 */
export function resolveAppPath(appName: string): { key: string; targetPath: string | null; isRunning?: boolean } {
  const normalized = appName.toLowerCase().trim();
  const canonicalKey = APP_ALIASES[normalized] || normalized;

  // 1. Check Hardcoded high-priority paths
  const hardcoded = HARDCODED_CANDIDATES[canonicalKey];
  if (hardcoded) {
    for (const c of hardcoded) {
      if (path.isAbsolute(c) && fs.existsSync(c)) {
        return { key: canonicalKey, targetPath: c };
      }
    }
  }

  // 2. Search Dynamic System Index (Start Menu, Desktop, AppData)
  const systemMap = scanSystemShortcuts();
  if (systemMap.has(canonicalKey)) {
    return { key: canonicalKey, targetPath: systemMap.get(canonicalKey)! };
  }
  if (systemMap.has(normalized)) {
    return { key: canonicalKey, targetPath: systemMap.get(normalized)! };
  }

  // 3. Partial / Fuzzy search in discovered apps
  for (const [name, p] of systemMap.entries()) {
    if (name.includes(canonicalKey) || canonicalKey.includes(name) || name.includes(normalized)) {
      return { key: canonicalKey, targetPath: p };
    }
  }

  // 4. Default fallback: use canonical key as executable name
  return { key: canonicalKey, targetPath: null };
}

/**
 * Brings an existing running process window to the foreground or starts it cleanly.
 */
/**
 * Launches an application via Windows Shell and brings its window to the foreground.
 */
async function launchOrFocus(targetPath: string | null, fallbackKey: string, args: string = ''): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    // 1. Launch / Restore application via Windows ShellExecute
    if (targetPath && fs.existsSync(targetPath)) {
      await execAsync(`cmd.exe /c start "" "${targetPath}" ${args ? `"${args}"` : ''}`);
    } else {
      if (fallbackKey === 'calc') {
        await execAsync(`cmd.exe /c start calculator:`);
      } else {
        await execAsync(`cmd.exe /c start ${fallbackKey} ${args ? `"${args}"` : ''}`);
      }
    }

    // 2. Poll and bring window to front using Win32 API
    const processSearchKey = fallbackKey.replace(/\.exe$/i, '');
    const focusScript = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class WinUtil {
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
        keybd_event(0x12, 0, 0, 0);
        SetForegroundWindow(hWnd);
        keybd_event(0x12, 0, 2, 0);
    }
}
"@ -ErrorAction SilentlyContinue

for ($i = 0; $i -lt 10; $i++) {
    Start-Sleep -Milliseconds 250
    $proc = Get-Process -ErrorAction SilentlyContinue | Where-Object { 
        ($_.ProcessName -like "*${processSearchKey}*" -or $_.MainWindowTitle -like "*${processSearchKey}*") -and $_.MainWindowHandle -ne 0 
    } | Select-Object -First 1
    if ($proc) {
        [WinUtil]::Activate($proc.MainWindowHandle)
        break
    }
}
`;
    await runPowerShell(focusScript).catch(() => {});

    return {
      success: true,
      message: `Приложение «${fallbackKey}» запущено и выведено на передний план.`,
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Ошибка при запуске «${fallbackKey}»: ${err.message}`,
    };
  }
}

export const openAppTool: ITool = {
  name: 'computer.open_app',
  category: 'computer',
  description: 'Launches or switches to any desktop application on the PC (e.g. Telegram, Chrome, VS Code, Discord, Steam, CapCut, Notepad, Calculator, Explorer, etc.) or opens URLs.',
  parameters: [
    {
      name: 'appName',
      type: 'string',
      description: 'Name of the application (e.g. "telegram", "chrome", "discord", "code", "notepad", "capcut", "steam") or website URL',
      required: true,
    },
    {
      name: 'args',
      type: 'string',
      description: 'Optional argument, search query, or URL (e.g. "https://google.com" or "search query")',
      required: false,
    },
  ],
  dangerLevel: 'moderate',
  async execute(params: { appName: string; args?: string }): Promise<ToolResult> {
    const rawName = params.appName.trim();
    const { key, targetPath } = resolveAppPath(rawName);
    const argList = params.args ? params.args.trim() : '';

    // ── 1. Specialized Handler: Web Browsers & URLs ──
    const isBrowser = key === 'chrome' || key === 'edge' || key === 'yandex' ||
                      rawName.toLowerCase().includes('хром') ||
                      rawName.toLowerCase().includes('браузер') ||
                      rawName.toLowerCase().includes('вкладк');

    if (isBrowser) {
      let targetUrl = argList;

      if (!targetUrl) {
        targetUrl = 'https://www.google.com';
      } else if (targetUrl.startsWith('http://') || targetUrl.startsWith('https://')) {
        if (targetUrl.includes('?q=') || targetUrl.includes('&q=')) {
          const parts = targetUrl.split(/(?=[?&]q=)/);
          const base = parts[0];
          const queryPart = parts[1] || '';
          const rawQuery = decodeURIComponent(queryPart.replace(/^[?&]q=/, '').replace(/\+/g, ' '));
          const clean = cleanSearchQuery(rawQuery);
          targetUrl = `${base}?q=${encodeURIComponent(clean)}`;
        }
      } else if (/^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(\/.*)?$/.test(targetUrl)) {
        targetUrl = `https://${targetUrl}`;
      } else {
        const clean = cleanSearchQuery(targetUrl);
        targetUrl = `https://www.google.com/search?q=${encodeURIComponent(clean)}`;
      }

      try {
        if (targetPath && fs.existsSync(targetPath)) {
          await execAsync(`cmd.exe /c start "" "${targetPath}" "${targetUrl}"`);
        } else {
          await execAsync(`cmd.exe /c start "" "${targetUrl}"`);
        }

        return {
          success: true,
          message: `Открыт браузер с адресом: ${targetUrl}`,
        };
      } catch (err: any) {
        return {
          success: false,
          error: `Ошибка открытия браузера: ${err.message}`,
        };
      }
    }

    // ── 2. Universal Application Launcher & Window Activator ──
    const result = await launchOrFocus(targetPath, key, argList);
    return result;
  },
};

// Critical Windows processes that must never be killed
const PROTECTED_PROCESSES = new Set([
  'csrss', 'lsass', 'lsaiso', 'services', 'smss', 'wininit', 'winlogon',
  'svchost', 'explorer', 'dwm', 'system', 'ntoskrnl', 'audiodg',
  'powershell', 'powershell_ise', 'cmd', 'taskmgr',
]);

export const closeAppTool: ITool = {
  name: 'computer.close_app',
  category: 'computer',
  description: 'Closes a running desktop application by process name or window title. Refuses to terminate protected system processes.',
  parameters: [
    {
      name: 'appName',
      type: 'string',
      description: 'Name of the process or window to terminate (e.g. "chrome", "notepad", "telegram", "discord")',
      required: true,
    },
    {
      name: 'force',
      type: 'boolean',
      description: 'Whether to force kill immediately (-Force)',
      required: false,
    },
  ],
  dangerLevel: 'moderate',
  async execute(params: { appName: string; force?: boolean }): Promise<ToolResult> {
    const rawName = params.appName.toLowerCase().trim();
    const { key } = resolveAppPath(rawName);

    // Sanitize the resolved key — strip any non-alphanumeric chars to prevent
    // shell injection through the `taskkill /IM` argument
    const safeKey = key.replace(/[^a-z0-9_-]/gi, '');
    if (!safeKey) {
      return { success: false, error: 'Invalid application name after sanitization' };
    }

    // Refuse to kill protected system processes
    if (PROTECTED_PROCESSES.has(safeKey.toLowerCase())) {
      return {
        success: false,
        error: `Refusing to terminate protected process "${safeKey}". This is a critical Windows process.`,
      };
    }

    try {
      const forceFlag = params.force ? '/F' : '';
      await execAsync(`cmd.exe /c taskkill /IM ${safeKey}.exe ${forceFlag}`.trim());
      return {
        success: true,
        message: `Приложение ${params.appName} успешно закрыто.`,
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Не удалось закрыть "${params.appName}": ${err.message}`,
      };
    }
  },
};
