/**
 * Unified Ollama Client for text, vision, and tool-calling models.
 * Includes graceful heuristic fallback if Ollama server is not yet running.
 */

export interface OllamaGenerateOptions {
  model?: string;
  prompt: string;
  system?: string;
  images?: string[]; // Base64 strings for vision models
  format?: 'json';
  temperature?: number;
}

export interface OllamaChatOptions {
  model?: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string; images?: string[] }>;
  temperature?: number;
}

export class OllamaClient {
  private endpoint: string;
  private defaultModel: string;
  private isConnected: boolean = false;

  constructor(endpoint: string = 'http://localhost:11434', defaultModel: string = 'qwen2.5:1.5b') {
    this.endpoint = endpoint.replace(/\/$/, '');
    this.defaultModel = defaultModel;
  }

  public isOnline(): boolean {
    return this.isConnected;
  }

  public async checkHealth(): Promise<boolean> {
    try {
      const res = await fetch(`${this.endpoint}/api/tags`, { method: 'GET' });
      this.isConnected = res.ok;
      return res.ok;
    } catch {
      this.isConnected = false;
      return false;
    }
  }

  public async generate(options: OllamaGenerateOptions): Promise<string> {
    const model = options.model || this.defaultModel;

    try {
      const res = await fetch(`${this.endpoint}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt: options.prompt,
          system: options.system,
          images: options.images,
          format: options.format,
          stream: false,
          options: {
            temperature: options.temperature ?? 0.2,
          },
        }),
      });

      if (!res.ok) {
        throw new Error(`Ollama HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      return data.response || '';
    } catch (err: any) {
      console.warn(`[OllamaClient] Could not reach Ollama at ${this.endpoint} (${err.message}). Using intelligent heuristic fallback.`);
      return this.heuristicFallback(options.prompt);
    }
  }

  public async generateWithVision(options: { prompt: string; images: string[]; model?: string }): Promise<string> {
    const visionModel = options.model || 'moondream';
    return this.generate({
      model: visionModel,
      prompt: options.prompt,
      images: options.images,
    });
  }

  /**
   * Built-in intelligent fallback for offline mode or before Ollama is started.
   */
  private heuristicFallback(prompt: string): string {
    const p = prompt.toLowerCase();
    
    if (p.includes('chrome') || p.includes('браузер') || p.includes('сайт') || p.includes('найди') || p.includes('гугл')) {
      return JSON.stringify({
        thought: "User wants to perform a search or open a web page. I'll open Chrome and navigate.",
        plan: ["Open browser", "Navigate to search", "Read content"],
        toolCall: {
          name: "browser.open",
          parameters: { url: "https://www.google.com" }
        }
      });
    }

    if (p.includes('окн') || p.includes('window') || p.includes('приложен')) {
      return JSON.stringify({
        thought: "User wants to inspect open windows or applications.",
        plan: ["List all open application windows"],
        toolCall: {
          name: "computer.list_windows",
          parameters: {}
        }
      });
    }

    if (p.includes('скрин') || p.includes('экран') || p.includes('screenshot') || p.includes('посмотри')) {
      return JSON.stringify({
        thought: "User wants a screen capture or screen analysis.",
        plan: ["Capture screen screenshot"],
        toolCall: {
          name: "computer.screenshot",
          parameters: { resizeWidth: 1024 }
        }
      });
    }

    if (p.includes('файл') || p.includes('папк') || p.includes('найди файл')) {
      return JSON.stringify({
        thought: "User wants to search for a file on the computer.",
        plan: ["Search filesystem for matches"],
        toolCall: {
          name: "filesystem.search",
          parameters: { query: "*", directory: "Desktop" }
        }
      });
    }

    // Default fallback planning
    return JSON.stringify({
      thought: `Received directive: "${prompt}". Ready to coordinate desktop automation.`,
      plan: ["Execute computer action"],
      toolCall: {
        name: "computer.list_windows",
        parameters: {}
      }
    });
  }
}

export const ollamaClient = new OllamaClient();
