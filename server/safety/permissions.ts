import { ITool } from '../tools/types.js';
import {
  isDangerousCommand,
  isPathTraversal,
  isForbiddenPath,
  detectPromptInjection,
} from './rules.js';

export interface ConfirmationRequest {
  id: string;
  toolName: string;
  parameters: Record<string, any>;
  reason: string;
  timestamp: number;
}

export type ConfirmationCallback = (requestId: string, approved: boolean) => void;

class SafetyManager {
  private pendingRequests = new Map<string, {
    request: ConfirmationRequest;
    resolve: (approved: boolean) => void;
  }>();

  private broadcaster: ((message: any) => void) | null = null;

  // Tracks recent action timestamps for per-tool rate limiting
  private recentActions: Map<string, number[]> = new Map();

  public setBroadcaster(fn: (message: any) => void): void {
    this.broadcaster = fn;
  }

  /**
   * Checks incoming user prompts for injection attempts BEFORE they reach the LLM.
   * Returns { allowed: false } to reject outright; otherwise returns { allowed: true }.
   */
  public validateUserInput(input: string): { allowed: boolean; reason?: string } {
    const check = detectPromptInjection(input);
    if (check.isDangerous) {
      return { allowed: false, reason: check.reason };
    }
    return { allowed: true };
  }

  /**
   * Per-tool rate limit. Default: max 20 invocations per tool per 60s.
   */
  private isRateLimited(toolName: string, maxPerWindow = 20, windowMs = 60_000): boolean {
    const now = Date.now();
    const timestamps = this.recentActions.get(toolName) || [];
    const recent = timestamps.filter(t => now - t < windowMs);
    if (recent.length >= maxPerWindow) {
      this.recentActions.set(toolName, recent);
      return true;
    }
    recent.push(now);
    this.recentActions.set(toolName, recent);
    return false;
  }

  /**
   * Evaluates if a tool invocation requires explicit user confirmation.
   * Checks: tool danger level, command patterns, path traversal, forbidden paths,
   * and per-tool rate limiting.
   */
  public requiresConfirmation(tool: ITool, params: Record<string, any>): { required: boolean; reason?: string } {
    // 1. Per-tool rate limit
    if (this.isRateLimited(tool.name)) {
      return {
        required: true,
        reason: `Tool "${tool.name}" has been invoked too frequently. Confirm to continue.`,
      };
    }

    // 2. Tool-level danger level
    if (tool.dangerLevel === 'dangerous') {
      return {
        required: true,
        reason: `Tool "${tool.name}" is marked as high-risk/dangerous.`,
      };
    }

    // 3. Shell command danger detection
    if (tool.name === 'computer.execute' && params.command) {
      const check = isDangerousCommand(params.command);
      if (check.isDangerous) {
        return { required: true, reason: check.reason };
      }
    }

    // 4. Filesystem path checks (read, write, delete, open)
    if (tool.category === 'filesystem') {
      const pathFields = ['filePath', 'path', 'targetPath', 'dirPath', 'directory'];
      for (const field of pathFields) {
        const value = params[field];
        if (typeof value === 'string') {
          if (isPathTraversal(value)) {
            return {
              required: true,
              reason: `Path "${value}" contains traversal sequences (../). Confirm to proceed.`,
            };
          }
          const forbidden = isForbiddenPath(value);
          if (forbidden.isDangerous) {
            return { required: true, reason: forbidden.reason };
          }
        }
      }
    }

    // 5. Delete always requires confirmation (even if path checks pass)
    if (tool.name === 'filesystem.delete') {
      return {
        required: true,
        reason: `Deleting file/folder at "${params.targetPath}".`,
      };
    }

    return { required: false };
  }

  /**
   * Requests user confirmation through WebSocket UI.
   */
  public requestApproval(tool: ITool, params: Record<string, any>, reason: string): Promise<boolean> {
    const id = `perm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const request: ConfirmationRequest = {
      id,
      toolName: tool.name,
      parameters: params,
      reason,
      timestamp: Date.now(),
    };

    return new Promise((resolve) => {
      this.pendingRequests.set(id, { request, resolve });

      // Notify frontend
      if (this.broadcaster) {
        this.broadcaster({
          type: 'CONFIRMATION_REQUIRED',
          payload: request,
        });
      } else {
        console.warn(`[SafetyManager] No UI connected to approve request ${id}. Rejecting by default.`);
        resolve(false);
      }

      // Auto-expire after 5 minutes if user never responds
      setTimeout(() => {
        const pending = this.pendingRequests.get(id);
        if (pending) {
          console.warn(`[SafetyManager] Approval request ${id} expired without user response.`);
          pending.resolve(false);
          this.pendingRequests.delete(id);
        }
      }, 5 * 60 * 1000);
    });
  }

  /**
   * Handles user response from frontend.
   */
  public handleUserResponse(requestId: string, approved: boolean): boolean {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) return false;

    pending.resolve(approved);
    this.pendingRequests.delete(requestId);
    return true;
  }

  public getPendingRequests(): ConfirmationRequest[] {
    return Array.from(this.pendingRequests.values()).map(p => p.request);
  }
}

export const safetyManager = new SafetyManager();
