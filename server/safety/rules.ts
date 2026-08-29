/**
 * Dangerous action and command pattern rules for JARVIS Safety Layer.
 *
 * Two categories of checks:
 *   1. Shell command allowlist / blocklist patterns
 *   2. Prompt-injection patterns (for user inputs before they reach the LLM)
 *
 * Rules err on the side of flagging: false positives just trigger a
 * confirmation prompt; false negatives can be catastrophic.
 */

// ─── Dangerous shell command patterns ─────────────────────────────────────────

export const DANGEROUS_SHELL_PATTERNS: RegExp[] = [
  // ── Destructive file operations ──
  /rmdir\s+.*\/s/i,
  /del\s+.*\/f/i,
  /remove-item\s+.*-recurse/i,
  /remove-item\s+.*-r\b/i,
  /ri\s+/i,                                // PS alias for Remove-Item -Recurse -Force
  /format\s+[a-z]:/i,
  /diskpart/i,
  /rd\s+\/s/i,                             // Windows rmdir /s
  /erase\s+.*\/[sq]/i,
  /shred\s+/i,
  /mkfs\./i,
  /dd\s+if=.*of=\/dev/i,

  // ── System control ──
  /reg\s+delete/i,
  /reg\s+add/i,
  /stop-computer/i,
  /restart-computer/i,
  /shutdown/i,
  /logoff/i,
  /taskkill\s+.*explorer/i,
  /taskkill\s+.*\/f\s+.*svchost/i,
  /taskkill\s+.*\/f\s+.*lsass/i,
  /netsh\s+interface.*disable/i,
  /netsh\s+advfirewall.*disable/i,
  /bcdedit/i,
  /bootrec/i,
  /sfc\s+\/scannow/i,

  // ── Privilege escalation / credential theft ──
  /runas\s+/i,
  /net\s+user\s+.*\/add/i,
  /net\s+localgroup\s+.*\/add/i,
  /net\s+accounts/i,
  /mimikatz/i,
  /lazagne/i,
  /Get-Credential/i,
  /GetPassword/i,
  /Export-PfxCertificate/i,
  /Get-VaultCredential/i,
  /copy-item\s+.*\.ssh/i,
  /cat\s+.*id_rsa/i,
  /type\s+.*\.ssh\\id_/i,

  // ── PowerShell remote / download cradles ──
  /Invoke-Expression/i,
  /\bIEX\b/i,
  /Invoke-Command\b/i,
  /New-Object\s+Net\.WebClient/i,
  /DownloadString/i,
  /DownloadFile/i,
  /DownloadData/i,
  /Net\.HttpClient/i,
  /Start-BitsTransfer/i,
  /bitsadmin\s+\/transfer/i,
  /certutil\s+.*-urlcache/i,
  /certutil\s+.*-decode/i,
  /wget\s+http/i,
  /curl\s+http/i,                          // exfil risk; flag for confirmation
  /frombase64string/i,
  /ToBase64String/i,

  // ── Persistence / autorun ──
  /New-Service\b/i,
  /sc\s+create/i,
  /schtasks\s+\/create/i,
  /New-ScheduledTask/i,
  /Set-ItemProperty.*CurrentVersion\\Run/i,
  /Set-ItemProperty.*CurrentVersion\\RunOnce/i,
  /Add-Content.*Startup/i,
  /\.bashrc/i,
  /crontab\s+-/i,

  // ── Database destruction ──
  /drop\s+database/i,
  /drop\s+table/i,
  /truncate/i,
  /delete\s+from\s+\w+\s*;?\s*$/im,         // unconstrained DELETE
  /mysqladmin\s+drop/i,

  // ── Network exposure ──
  /netsh\s+portproxy/i,
  /Add-NetFirewallRule/i,
  /New-NetFirewallRule/i,

  // ── Anti-forensics / log tampering ──
  /Clear-EventLog/i,
  /wevtutil\s+cl/i,
  /vssadmin\s+delete\s+shadows/i,
  /wmic\s+shadowcopy\s+delete/i,

  // ── Code execution from string (injection) ──
  /\beval\s*\(/i,
  /\bexec\s*\(/i,
  /os\.system\s*\(/i,
  /child_process\.exec\s*\(/i,
  /shell_exec\s*\(/i,
];

// ─── Path-traversal patterns ─────────────────────────────────────────────────

export const PATH_TRAVERSAL_PATTERNS: RegExp[] = [
  /\.\.[\/\\]/,                            // ../ or ..\
  /%2e%2e%2f/i,                            // URL-encoded ../
  /%2e%2e%5c/i,                            // URL-encoded ..\
  /\.\.%2f/i,
  /\.\.%5c/i,
  /%252e%252e%252f/i,                      // double-encoded
];

// ─── Sensitive system paths that must never be read/written/deleted ──────────
// Even with path-traversal blocked, an absolute path can target these directly.

export const FORBIDDEN_PATHS: RegExp[] = [
  /[\\/]Windows[\\/]System32[\\/]config[\\/]/i,
  /[\\/]Windows[\\/]System32[\\/]drivers[\\/]/i,
  /[\\/]Windows[\\/]System32[\\/]ntds\.dit/i,
  /[\\/]Boot[\\/]/i,
  /[\\/]EFI[\\/]Microsoft[\\/]Boot[\\/]/i,
  /[\\/]\.ssh[\\/]id_/i,
  /[\\/]\.gnupg[\\/]/i,
  /[\\/]AppData[\\/]Roaming[\\/]Microsoft[\\/]Credentials/i,
  /[\\/]etc[\\/]shadow/i,
  /[\\/]etc[\\/]passwd/i,
  /[\\/]etc[\\/]sudoers/i,
];

// ─── Prompt-injection patterns (catch before they reach the LLM) ─────────────
// Detects attempts to override system instructions, exfiltrate secrets, or
// steer the model into bypassing safety.

export const PROMPT_INJECTION_PATTERNS: RegExp[] = [
  // Classic instruction override
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?)/i,
  /disregard\s+(all\s+)?(previous|prior|above)/i,
  /forget\s+(everything|all)\s+(you|previous)/i,
  /you\s+are\s+now\s+/i,
  /system\s*:\s*you\s+are/i,
  /new\s+instructions?\s*:/i,
  /override\s+(safety|restrictions|rules)/i,

  // Secret exfiltration attempts
  /reveal\s+(the\s+)?(system\s+)?prompt/i,
  /show\s+(me\s+)?(the\s+)?(api[_\s-]?key|secret|password|token)/i,
  /print\s+(the\s+)?environment/i,
  /read\s+\.env\b/i,
  /cat\s+\.env/i,
  /type\s+\.env/i,
  /get[-_]?content\s+\.env/i,
  /echo\s+\$ELEVENLABS/i,

  // Jailbreak / roleplay attacks
  /DAN\s+mode/i,
  /developer\s+mode/i,
  /jailbreak/i,
  /bypass\s+(safety|filter|restriction)/i,

  // Tool-call smuggling
  /<tool_call>.*rm\s+-rf/i,
  /<tool_call>.*format/i,
  /<tool_call>.*shutdown/i,
];

// ─── Evaluators ──────────────────────────────────────────────────────────────

export interface DangerCheckResult {
  isDangerous: boolean;
  reason?: string;
}

export function isDangerousCommand(command: string): DangerCheckResult {
  if (typeof command !== 'string' || !command) {
    return { isDangerous: true, reason: 'Empty or invalid command.' };
  }

  for (const pattern of DANGEROUS_SHELL_PATTERNS) {
    if (pattern.test(command)) {
      return {
        isDangerous: true,
        reason: `Command matches critical security rule: ${pattern.toString()}`,
      };
    }
  }
  return { isDangerous: false };
}

export function isPathTraversal(input: string): boolean {
  if (typeof input !== 'string') return false;
  return PATH_TRAVERSAL_PATTERNS.some(p => p.test(input));
}

export function isForbiddenPath(input: string): DangerCheckResult {
  if (typeof input !== 'string') return { isDangerous: false };
  for (const pattern of FORBIDDEN_PATHS) {
    if (pattern.test(input)) {
      return {
        isDangerous: true,
        reason: `Path matches protected system location: ${pattern.toString()}`,
      };
    }
  }
  return { isDangerous: false };
}

export function detectPromptInjection(input: string): DangerCheckResult {
  if (typeof input !== 'string' || !input) return { isDangerous: false };
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(input)) {
      return {
        isDangerous: true,
        reason: `Input contains potential prompt-injection pattern: ${pattern.toString()}`,
      };
    }
  }
  return { isDangerous: false };
}
