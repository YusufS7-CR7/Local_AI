/**
 * Path validation utilities for filesystem tools.
 * Blocks path traversal and access to sensitive system locations.
 */
import path from 'path';
import { isPathTraversal, isForbiddenPath } from '../safety/rules.js';

export interface PathCheckResult {
  ok: boolean;
  resolved?: string;
  reason?: string;
}

/**
 * Resolves and validates a filesystem path.
 * Returns the absolute path on success, or an error reason on failure.
 *
 * Note: this is a defense-in-depth check. The safety manager also inspects
 * path inputs before tool execution; this catches anything that slips past.
 */
export function validatePath(input: string, options?: {
  mustExist?: boolean;
  allowedRoots?: string[];
}): PathCheckResult {
  if (typeof input !== 'string' || !input.trim()) {
    return { ok: false, reason: 'Path must be a non-empty string' };
  }

  // Block traversal sequences (raw or encoded)
  if (isPathTraversal(input)) {
    return { ok: false, reason: `Path traversal sequence detected in "${input}"` };
  }

  // Block known sensitive paths
  const forbidden = isForbiddenPath(input);
  if (forbidden.isDangerous) {
    return { ok: false, reason: forbidden.reason || 'Path targets a protected system location' };
  }

  const resolved = path.resolve(input);

  // Optional: restrict to allowed roots
  if (options?.allowedRoots && options.allowedRoots.length > 0) {
    const inAllowed = options.allowedRoots.some(root => {
      const rootResolved = path.resolve(root);
      const rel = path.relative(rootResolved, resolved);
      return !rel.startsWith('..') && !path.isAbsolute(rel);
    });
    if (!inAllowed) {
      return {
        ok: false,
        reason: `Path "${resolved}" is outside the allowed roots: ${options.allowedRoots.join(', ')}`,
      };
    }
  }

  return { ok: true, resolved };
}
