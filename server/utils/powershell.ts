import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

/**
 * Executes a PowerShell script reliably using temporary .ps1 script file execution.
 * Completely immune to command-line length limits (Windows 8191 char limit),
 * quote escaping bugs, stdin pipe buffering, and character encoding corruption.
 */
export async function runPowerShell(script: string, timeoutMs: number = 15000): Promise<{ stdout: string; stderr: string }> {
  const tempScriptPath = path.join(os.tmpdir(), `jarvis_ps_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.ps1`);
  
  const fullScript = `
$ProgressPreference = 'SilentlyContinue'
$ErrorActionPreference = 'SilentlyContinue'
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
${script}
`;

  try {
    // Write UTF-8 with BOM or UTF-8
    await fs.promises.writeFile(tempScriptPath, '\ufeff' + fullScript, 'utf8');

    const result = await execAsync(`powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${tempScriptPath}"`, {
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
    });

    return {
      stdout: result.stdout || '',
      stderr: result.stderr || '',
    };
  } finally {
    fs.promises.unlink(tempScriptPath).catch(() => {});
  }
}
