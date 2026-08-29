import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Executes a PowerShell script safely using UTF-16LE Base64 encoded command.
 * Completely eliminates any quote escaping, newline, or special character corruption.
 */
export async function runPowerShell(script: string, timeoutMs: number = 15000): Promise<{ stdout: string; stderr: string }> {
  // Prepend preference variables to suppress unwanted progress and stream noise
  const fullScript = `
$ProgressPreference = 'SilentlyContinue'
$ErrorActionPreference = 'SilentlyContinue'
${script}
`;

  // Convert script to UTF-16LE Buffer and encode to Base64
  const buffer = Buffer.from(fullScript, 'utf16le');
  const base64 = buffer.toString('base64');

  return execAsync(`powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${base64}`, {
    timeout: timeoutMs,
    maxBuffer: 10 * 1024 * 1024,
  });
}
