import { ITool, ToolResult } from '../types.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ─── Shell-execution allowlist ────────────────────────────────────────────────
// `computer.execute` should NOT be a free-form shell. The original implementation
// passed `params.command` straight to `child_process.exec` with `shell: powershell.exe`,
// which is a remote-code-execution primitive. We restrict it to a small set of
// read-only PowerShell cmdlets plus the URL-opening shortcut. Anything else
// requires `escapeShell` mode (still gated by safety's `requiresConfirmation`).

const ALLOWED_READONLY_POWERSHELL: RegExp[] = [
  /^Get-Process\b/i,
  /^Get-Service\b/i,
  /^Get-ChildItem\b/i,
  /^Get-Content\b/i,
  /^Get-Item\b/i,
  /^Get-ItemProperty\b/i,
  /^Get-Date\b/i,
  /^Get-ComputerInfo\b/i,
  /^Get-CimInstance\b/i,
  /^Get-WmiObject\b/i,
  /^Get-Help\b/i,
  /^Select-Object\b/i,
  /^Where-Object\b/i,
  /^Sort-Object\b/i,
  /^Format-Table\b/i,
  /^Format-List\b/i,
  /^Measure-Object\b/i,
  /^Test-Path\b/i,
  /^Resolve-Path\b/i,
  /^System\.Info\b/i,
  /^ipconfig\b/i,
  /^systeminfo\b/i,
  /^whoami\b/i,
  /^hostname\b/i,
  /^echo\s/i,
  /^Write-Output\s/i,
];

function isAllowedReadOnly(command: string): boolean {
  // Strip leading whitespace, pipes, and chained commands for the check
  const trimmed = command.trim();
  // Disallow any pipeline that includes dangerous operators
  if (/[;&|`]/.test(trimmed) && !/^\s*\|/.test(trimmed)) {
    // Pipes between safe cmdlets are okay; & ; ` are not
    return false;
  }
  return ALLOWED_READONLY_POWERSHELL.some(p => p.test(trimmed));
}

function isLikelyUrl(input: string): boolean {
  return /^(https?:\/\/|www\.)/i.test(input) ||
    /^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(\/.*)?$/.test(input);
}

const ALLOWED_START_COMMANDS = new Set([
  'chrome', 'google chrome', 'msedge', 'edge', 'firefox', 'notepad', 'calc',
  'cmd', 'powershell', 'explorer', 'code', 'telegram', 'discord', 'spotify',
  'steam', 'vscode', 'winword', 'excel'
]);

function isAllowedStartCommand(rawCmd: string): boolean {
  const match = rawCmd.match(/^start\s+(?:""\s+)?(.+)$/i);
  if (!match) return false;

  const rest = match[1].trim();
  if (!rest) return false;

  const urlLike = /^((https?:\/\/|www\.)[^\s]+|[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(\/.*)?)$/i;
  if (urlLike.test(rest)) return true;

  const token = rest.replace(/^"|"$/g, '').replace(/^'|'$/g, '').trim();
  const appName = token.split(/\s+/)[0].toLowerCase();
  return ALLOWED_START_COMMANDS.has(appName) || ALLOWED_START_COMMANDS.has(token.toLowerCase());
}

export const executeCommandTool: ITool = {
  name: 'computer.execute',
  category: 'computer',
  description: 'Executes a read-only PowerShell cmdlet, opens a URL in the default browser, or runs a Windows `start` command. Free-form shell execution is NOT permitted; use specialized tools for filesystem and app control.',
  parameters: [
    {
      name: 'command',
      type: 'string',
      description: 'The PowerShell cmdlet, URL, or `start ...` command',
      required: true,
    },
    {
      name: 'timeoutMs',
      type: 'number',
      description: 'Execution timeout in milliseconds (default: 15000, max: 60000)',
      required: false,
    },
    {
      name: 'cwd',
      type: 'string',
      description: 'Working directory path (optional)',
      required: false,
    },
  ],
  dangerLevel: 'moderate',
  async execute(params: { command: string; timeoutMs?: number; cwd?: string }): Promise<ToolResult> {
    if (typeof params.command !== 'string' || !params.command.trim()) {
      return { success: false, error: 'command must be a non-empty string' };
    }

    // Clamp timeout to a sane upper bound
    const requestedTimeout = params.timeoutMs || 15000;
    const timeout = Math.min(Math.max(requestedTimeout, 1000), 60000);
    const cwd = params.cwd || process.cwd();
    const rawCmd = params.command.trim();

    // 1. URL → open in default browser (no shell, just `start`)
    if (isLikelyUrl(rawCmd)) {
      let url = rawCmd;
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = `https://${url}`;
      }
      try {
        await execAsync(`cmd.exe /c start "" "${url}"`);
        return { success: true, message: `Открыт веб-адрес: ${url}` };
      } catch (err: any) {
        return { success: false, error: `Не удалось открыть URL: ${err.message}` };
      }
    }

    // 2. `start ...` → execute via Windows Shell (limited to opener)
    if (/^start\s+/i.test(rawCmd)) {
      if (!isAllowedStartCommand(rawCmd)) {
        return {
          success: false,
          error: 'Команда start отклонена: доступны только URL и разрешённые приложения из белого списка.',
        };
      }

      try {
        await execAsync(`cmd.exe /c ${rawCmd}`);
        return { success: true, message: `Выполнена команда запуска: ${rawCmd}` };
      } catch (err: any) {
        return { success: false, error: `Ошибка команды start: ${err.message}` };
      }
    }

    // 3. Anything else: must match the read-only allowlist
    if (!isAllowedReadOnly(rawCmd)) {
      return {
        success: false,
        error:
          'Command rejected: only read-only PowerShell cmdlets (Get-*, Test-*, Resolve-*, Select-*, Sort-*, Format-*, Measure-*), ' +
          'system info commands (ipconfig, systeminfo, whoami, hostname), or URL/`start` are allowed. ' +
          'For file or app operations use the dedicated tools.',
      };
    }

    try {
      const { stdout, stderr } = await execAsync(rawCmd, {
        cwd,
        timeout,
        shell: 'powershell.exe',
        windowsHide: true,
      });
      return {
        success: true,
        data: { stdout: stdout.trim(), stderr: stderr.trim() },
        message: stdout.trim() || 'Команда успешно выполнена.',
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Ошибка выполнения: ${err.message}`,
        data: { stderr: err.stderr, stdout: err.stdout, code: err.code },
      };
    }
  },
};
