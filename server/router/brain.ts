import { geminiClient } from './geminiClient.js';
import { openRouterClient } from './openRouterClient.js';
import { ollamaClient } from './ollamaClient.js';

export interface BrainGenerateOptions {
  prompt: string;
  system?: string;
  images?: string[];
  format?: 'json';
  temperature?: number;
}

export type BrainProvider = 'gemini' | 'openrouter' | 'ollama';

/**
 * Single entry point for LLM calls.
 * Cascade order: Gemini -> OpenRouter -> Ollama (local offline fallback).
 */
export class Brain {
  public getProvider(): BrainProvider {
    if (geminiClient.isConfigured()) return 'gemini';
    if (openRouterClient.isConfigured()) return 'openrouter';
    return 'ollama';
  }

  public isGemini(): boolean {
    return this.getProvider() === 'gemini';
  }

  public isOpenRouter(): boolean {
    return this.getProvider() === 'openrouter';
  }

  public getModelName(): string {
    if (this.isGemini()) {
      return process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    }
    if (this.isOpenRouter()) {
      return openRouterClient.getModelName();
    }
    return 'qwen2.5:1.5b';
  }

  public async checkHealth(): Promise<{ provider: BrainProvider; online: boolean; model: string }> {
    if (this.isGemini()) {
      const online = await geminiClient.checkHealth();
      return { provider: 'gemini', online, model: this.getModelName() };
    }
    if (this.isOpenRouter()) {
      const online = await openRouterClient.checkHealth();
      return { provider: 'openrouter', online, model: this.getModelName() };
    }
    const online = await ollamaClient.checkHealth();
    return { provider: 'ollama', online, model: this.getModelName() };
  }

  public async generate(options: BrainGenerateOptions): Promise<string> {
    // 1. Try Google Gemini (Direct API)
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
        console.error(`[Brain] Gemini failed (${err.message}). Trying OpenRouter / Ollama...`);
      }
    }

    // 2. Try OpenRouter (Multi-model Cloud API)
    if (openRouterClient.isConfigured()) {
      try {
        return await openRouterClient.generate({
          prompt: options.prompt,
          system: options.system,
          images: options.images,
          format: options.format,
          temperature: options.temperature,
        });
      } catch (err: any) {
        console.error(`[Brain] OpenRouter failed (${err.message}). Falling back to local Ollama...`);
      }
    }

    // 3. Fallback to local Ollama
    return ollamaClient.generate({
      prompt: options.prompt,
      system: options.system,
      images: options.images,
      format: options.format,
      temperature: options.temperature,
    });
  }

  public async generateWithVision(options: { prompt: string; images: string[] }): Promise<string> {
    // 1. Try Gemini Vision
    if (geminiClient.isConfigured()) {
      try {
        return await geminiClient.generateWithVision({
          prompt: options.prompt,
          images: options.images,
        });
      } catch (err: any) {
        console.error(`[Brain] Gemini vision failed (${err.message}). Trying OpenRouter / Ollama...`);
      }
    }

    // 2. Try OpenRouter Vision
    if (openRouterClient.isConfigured()) {
      try {
        return await openRouterClient.generateWithVision(options);
      } catch (err: any) {
        console.error(`[Brain] OpenRouter vision failed (${err.message}). Falling back to local Ollama...`);
      }
    }

    // 3. Fallback to local Ollama Vision
    return ollamaClient.generateWithVision(options);
  }
}

export const brain = new Brain();

