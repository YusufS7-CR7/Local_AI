import fs from 'fs';
import path from 'path';

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const [key, ...valueParts] = trimmed.split('=');
        const k = key.trim();
        const v = valueParts.join('=').trim();
        if (!process.env[k]) {
          process.env[k] = v;
        }
      }
    }
  }
}

loadEnv();

export interface TTSOptions {
  text: string;
  voiceId?: string;
  modelId?: string;
}

export class ElevenLabsService {
  private apiKey: string;
  private defaultVoiceId: string;
  private modelId: string;

  constructor() {
    this.apiKey = process.env.ELEVENLABS_API_KEY || '';
    this.defaultVoiceId = process.env.ELEVENLABS_VOICE_ID || '7WZbBUHIEkJWmTtmyvZ6';
    this.modelId = process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2';
  }


  public isConfigured(): boolean {
    return Boolean(
      this.apiKey &&
      this.apiKey.startsWith('sk_') &&
      this.apiKey !== 'YOUR_NEW_KEY_HERE'
    );
  }

  public async synthesize(options: TTSOptions): Promise<Buffer> {
    if (!this.isConfigured()) {
      throw new Error('ElevenLabs API key is not configured');
    }

    const voice = options.voiceId || this.defaultVoiceId;
    const model = options.modelId || this.modelId;

    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voice}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: options.text,
        model_id: model,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`ElevenLabs error (${response.status}): ${errText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  public async listVoices(): Promise<any[]> {
    if (!this.isConfigured()) return [];
    try {
      const res = await fetch('https://api.elevenlabs.io/v1/voices', {
        headers: { 'xi-api-key': this.apiKey },
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.voices || [];
    } catch {
      return [];
    }
  }
}

export const elevenLabsService = new ElevenLabsService();
