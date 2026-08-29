import dotenv from 'dotenv';
dotenv.config();

export interface GeminiGenerateOptions {
  model?: string;
  prompt: string;
  system?: string;
  images?: string[]; // base64 data URLs or raw base64 strings
  format?: 'json';
  temperature?: number;
}

export class GeminiClient {
  private apiKey: string;
  private defaultModel: string;
  private isConnected: boolean = false;

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || '';
    this.defaultModel = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey !== 'YOUR_GEMINI_KEY_HERE');
  }

  public isOnline(): boolean {
    return this.isConnected;
  }

  public async checkHealth(): Promise<boolean> {
    if (!this.isConfigured()) {
      this.isConnected = false;
      return false;
    }
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.defaultModel}`;
      const res = await fetch(url, {
        method: 'GET',
        headers: { 'x-goog-api-key': this.apiKey },
      });
      this.isConnected = res.ok;
      return res.ok;
    } catch {
      this.isConnected = false;
      return false;
    }
  }

  public async generate(options: GeminiGenerateOptions): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY || this.apiKey;
    if (!apiKey) {
      throw new Error('Gemini API key is not configured in .env');
    }

    const model = options.model || process.env.GEMINI_MODEL || this.defaultModel;
    const candidates = [model, 'gemini-3.6-flash', 'gemini-2.5-flash', 'gemini-2.0-flash']
      .filter((m, i, arr) => Boolean(m) && arr.indexOf(m) === i);

    let lastError = '';
    for (const candidate of candidates) {
      try {
        const text = await this.callGenerateContent(apiKey, candidate, options);
        this.defaultModel = candidate;
        this.isConnected = true;
        return text;
      } catch (err: any) {
        lastError = err.message || String(err);
        const retryable = /Gemini API Error (404|400)/.test(lastError);
        if (!retryable) throw err;
        console.warn(`[Gemini] Model ${candidate} failed, trying next: ${lastError.slice(0, 180)}`);
      }
    }

    throw new Error(lastError || 'Gemini generateContent failed');
  }

  private async callGenerateContent(
    apiKey: string,
    model: string,
    options: GeminiGenerateOptions
  ): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    // Build parts: text + images
    const parts: any[] = [];

    if (options.images && options.images.length > 0) {
      for (const img of options.images) {
        // Strip data:image/...;base64, prefix if present
        let mimeType = 'image/png';
        let base64Data = img;
        const match = img.match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
        if (match && match[1] && match[2]) {
          mimeType = match[1];
          base64Data = match[2];
        }
        parts.push({
          inline_data: {
            mime_type: mimeType,
            data: base64Data,
          },
        });
      }
    }

    parts.push({ text: options.prompt });

    const requestBody: any = {
      contents: [
        {
          role: 'user',
          parts,
        },
      ],
      generationConfig: {
        temperature: options.temperature ?? 0.2,
      },
    };

    if (options.system) {
      requestBody.system_instruction = {
        parts: [{ text: options.system }],
      };
    }

    if (options.format === 'json') {
      requestBody.generationConfig.response_mime_type = 'application/json';
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Gemini API Error ${res.status}: ${errorText}`);
    }

    const data = await res.json();
    const candidate = data.candidates?.[0];
    const textPart = (candidate?.content?.parts || [])
      .map((p: { text?: string }) => p.text || '')
      .join('')
      .trim();
    if (!textPart) {
      const block = data.promptFeedback?.blockReason || candidate?.finishReason;
      throw new Error(`Gemini returned empty text${block ? ` (${block})` : ''}`);
    }
    return textPart;
  }

  public async generateWithVision(options: { prompt: string; images: string[]; model?: string }): Promise<string> {
    return this.generate({
      model: options.model || this.defaultModel,
      prompt: options.prompt,
      images: options.images,
    });
  }
}

export const geminiClient = new GeminiClient();
