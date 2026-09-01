/**
 * Text-to-Speech (TTS) Service supporting ElevenLabs High-Fidelity Neural Voice
 * with automatic fallback to browser SpeechSynthesis.
 */
class TTSService {
  private synth: SpeechSynthesis | null = null;
  private voices: SpeechSynthesisVoice[] = [];
  private isInitialized = false;
  private activeAudio: HTMLAudioElement | null = null;

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.synth = window.speechSynthesis;
      this.loadVoices();
      if (this.synth.onvoiceschanged !== undefined) {
        this.synth.onvoiceschanged = () => this.loadVoices();
      }
    }
  }

  private loadVoices(): void {
    if (!this.synth) return;
    this.voices = this.synth.getVoices();
    this.isInitialized = true;
  }

  /**
   * Selects the best available natural/neural voice for Russian or English (fallback).
   */
  private getBestVoice(isRussian: boolean): SpeechSynthesisVoice | null {
    if (!this.isInitialized) {
      this.loadVoices();
    }

    const langPrefix = isRussian ? 'ru' : 'en';
    const langVoices = this.voices.filter(v => v.lang.toLowerCase().startsWith(langPrefix));

    if (langVoices.length === 0) {
      return this.voices.find(v => v.default) || this.voices[0] || null;
    }

    const preferredNames = isRussian
      ? ['Google русский', 'Dmitry', 'Pavel', 'Yuri', 'Microsoft', 'Natural']
      : ['Google UK English Male', 'Google US English', 'Microsoft Ryan', 'Natural', 'Daniel'];

    for (const name of preferredNames) {
      const match = langVoices.find(v => v.name.toLowerCase().includes(name.toLowerCase()));
      if (match) return match;
    }

    return langVoices[0];
  }

  /**
   * Fallback to browser SpeechSynthesis if ElevenLabs API is offline or quota exceeded.
   */
  private speakWithSpeechSynthesis(
    text: string,
    options?: {
      onStart?: () => void;
      onEnd?: () => void;
      onError?: (err: unknown) => void;
    }
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.synth) {
        options?.onEnd?.();
        resolve();
        return;
      }

      this.synth.cancel();

      const hasCyrillic = /[а-яё]/i.test(text);
      const voice = this.getBestVoice(hasCyrillic);

      const utterance = new SpeechSynthesisUtterance(text);
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      } else {
        utterance.lang = hasCyrillic ? 'ru-RU' : 'en-US';
      }

      utterance.pitch = 0.96;
      utterance.rate = 1.05;
      utterance.volume = 1.0;

      utterance.onstart = () => {
        options?.onStart?.();
      };

      utterance.onend = () => {
        options?.onEnd?.();
        resolve();
      };

      utterance.onerror = (e) => {
        if (e.error === 'canceled' || e.error === 'interrupted') {
          options?.onEnd?.();
          resolve();
        } else {
          options?.onError?.(e);
          reject(e);
        }
      };

      this.synth.speak(utterance);
    });
  }

  /**
   * Speaks the given text using ElevenLabs Neural TTS, with automatic browser fallback.
   */
  public async speak(
    text: string,
    options?: {
      onStart?: () => void;
      onEnd?: () => void;
      onError?: (err: unknown) => void;
    }
  ): Promise<void> {
    this.stop();

    try {
      // Use relative URL — Vite dev proxy routes /api → backend, production serves from same origin
      const endpoint = '/api/tts';

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (response.ok && response.headers.get('content-type')?.includes('audio')) {
        const blob = await response.blob();
        const audioUrl = URL.createObjectURL(blob);
        const audio = new Audio(audioUrl);
        this.activeAudio = audio;

        return new Promise((resolve) => {
          audio.onplay = () => {
            options?.onStart?.();
          };

          audio.onended = () => {
            URL.revokeObjectURL(audioUrl);
            this.activeAudio = null;
            options?.onEnd?.();
            resolve();
          };

          audio.onerror = (e) => {
            URL.revokeObjectURL(audioUrl);
            this.activeAudio = null;
            console.warn('[TTSService] ElevenLabs audio playback error, fallback to browser speech:', e);
            this.speakWithSpeechSynthesis(text, options).then(resolve);
          };

          audio.play().catch((err) => {
            URL.revokeObjectURL(audioUrl);
            this.activeAudio = null;
            console.warn('[TTSService] Audio autoplay blocked or failed, fallback to browser speech:', err);
            this.speakWithSpeechSynthesis(text, options).then(resolve);
          });
        });
      } else {
        throw new Error(`Server returned status ${response.status}`);
      }
    } catch (err) {
      console.warn('[TTSService] ElevenLabs synthesis failed, using local browser voice:', err);
      return this.speakWithSpeechSynthesis(text, options);
    }
  }

  /**
   * Stops current speech output immediately.
   */
  public stop(): void {
    if (this.activeAudio) {
      this.activeAudio.pause();
      this.activeAudio.currentTime = 0;
      this.activeAudio = null;
    }
    if (this.synth) {
      this.synth.cancel();
    }
  }

  public isSpeaking(): boolean {
    return (this.activeAudio !== null && !this.activeAudio.paused) || !!this.synth?.speaking;
  }
}

export const ttsService = new TTSService();
