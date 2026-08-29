/**
 * Standalone Wake Word Detector Engine for JARVIS.
 * Operates in isolated standby mode, looking strictly for the activation keyword ("Jarvis").
 * Disconnects when active to ensure privacy and minimal CPU overhead.
 */

export interface WakeWordListenerOptions {
  onWake: (detectedWord: string) => void;
  onStatusChange?: (isActive: boolean) => void;
  onError?: (error: string) => void;
}

const WAKE_KEYWORDS = [
  'джарвис',
  'jarvis',
  'ярвис',
  'джейвис',
  'джарвиз',
  'джарвес',
  'гарвис',
  'жарвис',
  'чарвис',
  'джар вис'
];

export class WakeWordDetector {
  private recognition: any = null;
  private isRunning: boolean = false;
  private shouldRun: boolean = false;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly silenceTimeoutMs = 10_000;
  private options: WakeWordListenerOptions;

  constructor(options: WakeWordListenerOptions) {
    this.options = options;
    this.initEngine();
  }

  private initEngine(): void {
    if (typeof window === 'undefined') return;

    const SpeechAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechAPI) {
      this.options.onError?.('SpeechRecognition is not supported in this browser.');
      return;
    }

    const rec = new SpeechAPI();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'ru-RU';
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      this.isRunning = true;
      this.options.onStatusChange?.(true);
      this.resetSilenceTimer();
    };

    rec.onerror = (e: any) => {
      if (e.error !== 'no-speech' && e.error !== 'aborted') {
        this.options.onError?.(`SpeechRecognition: ${e.error}`);
      }
    };

    rec.onend = () => {
      this.isRunning = false;
      this.options.onStatusChange?.(false);
      this.clearSilenceTimer();
    };

    rec.onresult = (event: any) => {
      this.resetSilenceTimer();
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript.toLowerCase();
        for (const kw of WAKE_KEYWORDS) {
          if (text.includes(kw)) {
            console.log('[WakeWordDetector] Trigger match:', kw, 'text:', text);
            this.options.onWake(text);
            return;
          }
        }
      }
    };

    this.recognition = rec;
  }

  public start(): void {
    if (!this.recognition) return;
    this.shouldRun = true;
    if (this.isRunning) return;
    try {
      this.recognition.start();
      this.isRunning = true;
    } catch (err: any) {
      this.isRunning = false;
      this.options.onStatusChange?.(false);
      if (err?.message && !/already started/i.test(err.message)) {
        this.options.onError?.(err.message);
      }
    }
  }

  public stop(): void {
    if (!this.recognition) return;
    this.shouldRun = false;
    this.clearSilenceTimer();
    this.isRunning = false;
    try {
      this.recognition.stop();
    } catch {}
  }

  public isStandbyActive(): boolean {
    return this.isRunning;
  }

  private resetSilenceTimer(): void {
    this.clearSilenceTimer();
    if (!this.shouldRun) return;
    this.silenceTimer = setTimeout(() => {
      this.silenceTimer = null;
      this.stop();
    }, this.silenceTimeoutMs);
  }

  private clearSilenceTimer(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }
}
