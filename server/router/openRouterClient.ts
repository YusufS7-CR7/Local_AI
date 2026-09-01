import dotenv from 'dotenv';
dotenv.config();

export interface OpenRouterGenerateOptions {
  model?: string;
  prompt: string;
  system?: string;
  images?: string[]; // base64 data URLs or raw base64 strings
  format?: 'json';
  temperature?: number;
}

export class OpenRouterClient {
  private apiKey: string;
  private defaultModel: string;
  private isConnected: boolean = false;

  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY || '';
    this.defaultModel = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash';
  }

  public isConfigured(): boolean {
    const key = process.env.OPENROUTER_API_KEY || this.apiKey;
    return Boolean(key && key !== 'YOUR_OPENROUTER_KEY_HERE' && key.startsWith('sk-or-'));
  }

  public isOnline(): boolean {
    return this.isConnected;
  }

  public getModelName(): string {
    return process.env.OPENROUTER_MODEL || this.defaultModel;
  }

  public async checkHealth(): Promise<boolean> {
    if (!this.isConfigured()) {
      this.isConnected = false;
      return false;
    }

    try {
      const apiKey = process.env.OPENROUTER_API_KEY || this.apiKey;
      const res = await fetch('https://openrouter.ai/api/v1/auth/key', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });
      this.isConnected = res.ok;
      return res.ok;
    } catch {
      this.isConnected = false;
      return false;
    }
  }

  public async generate(options: OpenRouterGenerateOptions): Promise<string> {
    const apiKey = process.env.OPENROUTER_API_KEY || this.apiKey;
    if (!apiKey) {
      throw new Error('OpenRouter API key is not configured in .env');
    }

    const preferredModel = options.model || process.env.OPENROUTER_MODEL || this.defaultModel;
    const candidateModels = [
      preferredModel,
      'google/gemini-2.5-flash',
      'google/gemini-2.0-flash-001',
      'deepseek/deepseek-chat',
      'qwen/qwen-2.5-72b-instruct',
      'meta-llama/llama-3.3-70b-instruct',
    ].filter((m, i, arr) => Boolean(m) && arr.indexOf(m) === i);

    let lastError = '';

    for (const model of candidateModels) {
      try {
        const text = await this.callChatCompletion(apiKey, model, options);
        this.defaultModel = model;
        this.isConnected = true;
        return text;
      } catch (err: any) {
        lastError = err.message || String(err);
        console.warn(`[OpenRouter] Model ${model} error: ${lastError.slice(0, 180)}. Trying fallback...`);
      }
    }

    throw new Error(lastError || 'OpenRouter chat completion failed across all candidate models.');
  }

  private async callChatCompletion(
    apiKey: string,
    model: string,
    options: OpenRouterGenerateOptions
  ): Promise<string> {
    const url = 'https://openrouter.ai/api/v1/chat/completions';

    const messages: Array<{ role: string; content: any }> = [];

    if (options.system) {
      messages.push({
        role: 'system',
        content: options.system,
      });
    }

    if (options.images && options.images.length > 0) {
      const contentParts: any[] = [{ type: 'text', text: options.prompt }];

      for (const img of options.images) {
        let imageUrl = img;
        if (!img.startsWith('data:image/')) {
          imageUrl = `data:image/png;base64,${img}`;
        }
        contentParts.push({
          type: 'image_url',
          image_url: {
            url: imageUrl,
          },
        });
      }

      messages.push({
        role: 'user',
        content: contentParts,
      });
    } else {
      messages.push({
        role: 'user',
        content: options.prompt,
      });
    }

    const requestBody: any = {
      model,
      messages,
      max_tokens: 2048,
      temperature: options.temperature ?? 0.2,
    };

    if (options.format === 'json') {
      requestBody.response_format = { type: 'json_object' };
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'JARVIS Local AI Agent',
      },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`OpenRouter API Error ${res.status}: ${errorText}`);
    }

    const data = await res.json();
    const textContent = data.choices?.[0]?.message?.content;

    if (!textContent || typeof textContent !== 'string') {
      throw new Error('OpenRouter returned empty message response');
    }

    return textContent.trim();
  }

  public async generateWithVision(options: { prompt: string; images: string[]; model?: string }): Promise<string> {
    return this.generate({
      model: options.model || this.defaultModel,
      prompt: options.prompt,
      images: options.images,
    });
  }
}

export const openRouterClient = new OpenRouterClient();
