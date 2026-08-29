import { describe, it, expect } from 'vitest';
import { validatePath } from '../utils/pathGuard.js';
import { validateString, rateLimit } from '../utils/apiGuard.js';

describe('Path Guard Utilities', () => {
  it('should validate and resolve clean paths', () => {
    const res = validatePath('package.json');
    expect(res.ok).toBe(true);
    expect(res.resolved).toBeDefined();
  });

  it('should reject empty or non-string paths', () => {
    expect(validatePath('').ok).toBe(false);
    expect(validatePath('   ').ok).toBe(false);
    // @ts-expect-error test non-string
    expect(validatePath(null).ok).toBe(false);
  });

  it('should reject path traversal sequences', () => {
    const res = validatePath('../../../sensitive.txt');
    expect(res.ok).toBe(false);
    expect(res.reason).toContain('Path traversal');
  });

  it('should reject forbidden system paths', () => {
    const res = validatePath('C:\\Windows\\System32\\config\\SAM');
    expect(res.ok).toBe(false);
    expect(res.reason).toBeDefined();
  });

  it('should enforce allowedRoots if specified', () => {
    const allowed = ['C:\\Users\\user\\Desktop\\local_AI_agent'];
    const inside = validatePath('C:\\Users\\user\\Desktop\\local_AI_agent\\src\\App.tsx', { allowedRoots: allowed });
    expect(inside.ok).toBe(true);

    const outside = validatePath('C:\\Windows\\notepad.exe', { allowedRoots: allowed });
    expect(outside.ok).toBe(false);
    expect(outside.reason).toContain('outside the allowed roots');
  });
});

describe('API Guard Utilities', () => {
  it('should validate required strings', () => {
    const valid = validateString('Hello JARVIS', 'prompt', { required: true });
    expect(valid.ok).toBe(true);
    expect(valid.value).toBe('Hello JARVIS');

    const empty = validateString('', 'prompt', { required: true });
    expect(empty.ok).toBe(false);
    expect(empty.error).toContain('prompt is required');
  });

  it('should enforce min and max length constraints', () => {
    const tooShort = validateString('hi', 'prompt', { minLength: 5 });
    expect(tooShort.ok).toBe(false);
    expect(tooShort.error).toContain('at least 5 characters');

    const tooLong = validateString('abcdefghij', 'code', { maxLength: 5 });
    expect(tooLong.ok).toBe(false);
    expect(tooLong.error).toContain('exceeds maximum length');
  });

  it('should enforce sliding window rate limiting', () => {
    const key = 'test-ip-key';
    const limit = 3;
    const windowMs = 5000;

    expect(rateLimit(key, limit, windowMs).ok).toBe(true);
    expect(rateLimit(key, limit, windowMs).ok).toBe(true);
    expect(rateLimit(key, limit, windowMs).ok).toBe(true);

    // 4th request exceeds limit of 3
    const exceeded = rateLimit(key, limit, windowMs);
    expect(exceeded.ok).toBe(false);
    expect(exceeded.retryAfterMs).toBeGreaterThan(0);
  });
});
