/**
 * AI Model Router for JARVIS.
 * Optimized for high performance and low latency on standard laptops.
 */

export type ModelCategory = 'quick' | 'reasoning' | 'vision' | 'coding';

export interface ModelConfig {
  quick: string;
  reasoning: string;
  vision: string;
  coding: string;
}

export class ModelRouter {
  private config: ModelConfig = {
    quick: 'qwen2.5:1.5b',
    reasoning: 'qwen2.5:1.5b',
    vision: 'moondream',
    coding: 'qwen2.5:1.5b',
  };

  private resolveConfig(): ModelConfig {
    const geminiKey = process.env.GEMINI_API_KEY;
    const geminiModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    if (geminiKey && geminiKey !== 'YOUR_GEMINI_KEY_HERE') {
      return {
        quick: geminiModel,
        reasoning: geminiModel,
        vision: geminiModel,
        coding: geminiModel,
      };
    }

    const openRouterKey = process.env.OPENROUTER_API_KEY;
    const openRouterModel = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash';
    if (openRouterKey && openRouterKey !== 'YOUR_OPENROUTER_KEY_HERE' && openRouterKey.startsWith('sk-or-')) {
      return {
        quick: openRouterModel,
        reasoning: openRouterModel,
        vision: openRouterModel,
        coding: openRouterModel,
      };
    }

    return this.config;
  }

  public updateConfig(newConfig: Partial<ModelConfig>): void {
    this.config = { ...this.resolveConfig(), ...newConfig };
  }

  public getConfig(): ModelConfig {
    return { ...this.resolveConfig() };
  }

  /**
   * Analyzes user request or subtask and returns appropriate category and model name.
   */
  public route(task: string, hasImages: boolean = false): { category: ModelCategory; model: string; reason: string } {
    const cfg = this.resolveConfig();
    if (hasImages) {
      return {
        category: 'vision',
        model: cfg.vision,
        reason: 'Task requires visual screen comprehension.',
      };
    }

    const lower = task.toLowerCase();

    // 1. Vision intent
    if (lower.includes('что на экране') || lower.includes('посмотри на экран') || lower.includes('прочитай экран') || lower.includes('screenshot') || lower.includes('видишь')) {
      return {
        category: 'vision',
        model: cfg.vision,
        reason: 'Visual screen inspection requested.',
      };
    }

    // 2. Coding intent
    if (lower.includes('код') || lower.includes('скрипт') || lower.includes('напиши функцию') || lower.includes('powershell') || lower.includes('python') || lower.includes('typescript')) {
      return {
        category: 'coding',
        model: cfg.coding,
        reason: 'Code synthesis or shell scripting required.',
      };
    }

    // 3. Quick/simple intent
    const isSimpleAction = (
      lower.startsWith('открой ') ||
      lower.startsWith('закрой ') ||
      lower.startsWith('переключись ') ||
      lower.startsWith('кликни ') ||
      lower.startsWith('нажми ') ||
      lower.length < 30
    ) && !lower.includes(' и ') && !lower.includes('затем') && !lower.includes('после этого');

    if (isSimpleAction) {
      return {
        category: 'quick',
        model: cfg.quick,
        reason: 'Single-step immediate action routed to low-latency model.',
      };
    }

    // 4. Multi-step reasoning
    return {
      category: 'reasoning',
      model: cfg.reasoning,
      reason: 'Multi-step autonomous reasoning and planning.',
    };
  }
}

export const modelRouter = new ModelRouter();
