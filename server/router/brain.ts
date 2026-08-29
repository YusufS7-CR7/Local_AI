import { geminiClient } from './geminiClient.js';
import { ollamaClient } from './ollamaClient.js';

export interface BrainGenerateOptions {
  prompt: string;
  system?: string;
  images?: string[];
  format?: 'json';
  temperature?: number;
}

export type BrainProvider = 'gemini' | 'ollama';

/**
 * Single entry point for LLM calls.
 * Gemini is the primary brain when GEMINI_API_KEY is set; Ollama is fallback only.
 */
export class Brain {
  public getProvider(): BrainProvider {
    return geminiClient.isConfigured() ? 'gemini' : 'ollama';
  }

  public isGemini(): boolean {
    return this.getProvider() === 'gemini';
  }

  public getModelName(): string {
    if (this.isGemini()) {
      return process.env.GEMINI_MODEL || 'gemini-3.6-flash';
    }
    return 'qwen2.5:1.5b';
  }

  public async checkHealth(): Promise<{ provider: BrainProvider; online: boolean; model: string }> {
    if (this.isGemini()) {
      const online = await geminiClient.checkHealth();
      return { provider: 'gemini', online, model: this.getModelName() };
    }
    const online = await ollamaClient.checkHealth();
    return { provider: 'ollama', online, model: this.getModelName() };
  }

  public async generate(options: BrainGenerateOptions): Promise<string> {
    if (geminiClient.isConfigured()) {
      try {
        return await geminiClient.generate({
          prompt: options.prompt,
          system: options.system,
          images: options.images,
          format: options.format,
          temperature: options.temperature,
        });
      } catch (err: any) {
        console.error(`[Brain] Gemini failed (${err.message}). Falling back to Ollama.`);
      }
    }

    return ollamaClient.generate({
      prompt: options.prompt,
      system: options.system,
      images: options.images,
      format: options.format,
      temperature: options.temperature,
    });
  }

  public async generateWithVision(options: { prompt: string; images: string[] }): Promise<string> {
    if (geminiClient.isConfigured()) {
      try {
        return await geminiClient.generateWithVision({
          prompt: options.prompt,
          images: options.images,
        });
      } catch (err: any) {
        console.error(`[Brain] Gemini vision failed (${err.message}). Falling back to Ollama.`);
      }
    }

    return ollamaClient.generateWithVision(options);
  }
}

export const brain = new Brain();
