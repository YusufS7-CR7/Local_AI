/**
 * Unified Tool Interface for JARVIS Computer Use Agent.
 */

export type DangerLevel = 'safe' | 'moderate' | 'dangerous';

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required?: boolean;
  enum?: string[];
  default?: any;
}

export interface ToolResult {
  success: boolean;
  data?: any;
  screenshot?: string; // Base64 PNG
  error?: string;
  requiresConfirmation?: boolean;
  message?: string;
}

export interface ToolExecutionContext {
  sessionId?: string;
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
}

export interface ITool {
  name: string;
  category: 'computer' | 'browser' | 'filesystem' | 'system';
  description: string;
  parameters: ToolParameter[];
  dangerLevel: DangerLevel;
  execute(params: Record<string, any>, context?: ToolExecutionContext): Promise<ToolResult>;
}

export interface ToolSchema {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, {
        type: string;
        description: string;
        enum?: string[];
      }>;
      required: string[];
    };
  };
}
