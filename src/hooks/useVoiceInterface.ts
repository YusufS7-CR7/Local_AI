import { useState, useEffect, useRef, useCallback } from 'react';
import { CoreMode, VoiceState } from '../types';
import { soundFx } from '../services/soundFxService';
import { ttsService } from '../services/ttsService';
import { WakeWordDetector } from '../services/wakeWordDetector';

export function useVoiceInterface(
  currentMode: CoreMode,
  setCoreMode: (mode: CoreMode) => void,
  onCommandCaptured?: (command: string) => void
) {
  const [voiceState, setVoiceState] = useState<VoiceState>({
    isListening: false,
    isMicActive: false,
    wakeWordDetected: false,
    transcript: '',
    lastUserPrompt: null,
    lastAiResponse: null,
    error: null,
  });

  const wakeDetectorRef = useRef<WakeWordDetector | null>(null);
  const commandSTTRef = useRef<any>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const accumulatedCommandRef = useRef<string>('');
  const modeRef = useRef<CoreMode>(currentMode);
  modeRef.current = currentMode;

  // ── Dispatch Voice Command to Agent Pipeline ──
  const handleVoiceCommand = useCallback((command: string) => {
    const cleanCmd = command.trim();
    if (!cleanCmd) {
      setCoreMode('idle');
      return;
    }

    console.log('[VoiceInterface] Command captured:', cleanCmd);
    soundFx.playAcknowledgeBlip();

    setVoiceState(prev => ({
      ...prev,
      lastUserPrompt: cleanCmd,
      transcript: '',
      wakeWordDetected: false,
    }));

    if (onCommandCaptured) {
      onCommandCaptured(cleanCmd);
    }
  }, [onCommandCaptured, setCoreMode]);

  // ── Tier 2: Dedicated Command Speech-To-Text Engine ──
  const startCommandSTT = useCallback(() => {
    const SpeechAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechAPI) return;

    if (commandSTTRef.current) {
      try {
        commandSTTRef.current.stop();
      } catch {}
    }

    const stt = new SpeechAPI();
    stt.continuous = true;
    stt.interimResults = true;
    stt.lang = 'ru-RU';

    stt.onstart = () => {
      setVoiceState(prev => ({ ...prev, isListening: true, isMicActive: true }));
    };

    stt.onerror = (e: any) => {
      if (e.error !== 'no-speech' && e.error !== 'aborted') {
        console.warn('[CommandSTT] Error:', e.error);
      }
    };

    stt.onresult = (event: any) => {
      let interim = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const item = event.results[i];
        if (item.isFinal) {
          finalTranscript += item[0].transcript + ' ';
        } else {
          interim += item[0].transcript;
        }
      }

      const heard = (finalTranscript + interim).trim();
      if (!heard) return;

      console.log('[CommandSTT] Live utterance:', heard);
      setVoiceState(prev => ({ ...prev, transcript: heard }));
      accumulatedCommandRef.current = heard;

      // Reset Silence Timer on every spoken word
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

      // Once user pauses for 1.8s -> finish command, stop STT, send to Agent!
      silenceTimerRef.current = window.setTimeout(() => {
        const finalCmd = accumulatedCommandRef.current;
        console.log('[CommandSTT] Silence threshold reached! Final prompt:', finalCmd);
        
        try {
          stt.stop();
        } catch {}
        
        accumulatedCommandRef.current = '';
        handleVoiceCommand(finalCmd);
      }, 1800);
    };

    stt.onend = () => {
      setVoiceState(prev => ({ ...prev, isListening: false }));
    };

    commandSTTRef.current = stt;
    try {
      stt.start();
    } catch {}
  }, [handleVoiceCommand]);

  // ── Tier 1: Standalone Wake Word Detector Setup ──
  useEffect(() => {
    const detector = new WakeWordDetector({
      onWake: (detectedPhrase) => {
        console.log('[JARVIS] Standalone Wake Word triggered:', detectedPhrase);
        detector.stop();
        soundFx.playWakeChime();

        setCoreMode('listening');
        setVoiceState(prev => ({ ...prev, wakeWordDetected: true, transcript: '' }));
        accumulatedCommandRef.current = '';

        const commandAfterWake = detectedPhrase
          .replace(/(?:джар\s*вис|джарвис|jarvis|ярвис|джейвис|джарвиз|джарвес|гарвис|жарвис|чарвис)/i, '')
          .replace(/^[,\s:.-]+/, '')
          .trim();

        if (commandAfterWake) {
          handleVoiceCommand(commandAfterWake);
        } else {
          startCommandSTT();
        }
      },
      onStatusChange: (isActive) => {
        setVoiceState(prev => ({ ...prev, isMicActive: isActive }));
      },
      onError: (err) => {
        setVoiceState(prev => ({ ...prev, error: `Wake Engine Error: ${err}` }));
      }
    });

    wakeDetectorRef.current = detector;

    return () => {
      detector.stop();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (commandSTTRef.current) {
        try {
          commandSTTRef.current.stop();
        } catch {}
      }
    };
  }, [setCoreMode, startCommandSTT]);

  // ── Mode-driven Engine Lifecycle Manager ──
  useEffect(() => {
    if (currentMode === 'idle') {
      if (commandSTTRef.current) {
        try {
          commandSTTRef.current.stop();
        } catch {}
      }
      // Restart wake word detector so it listens for the next "Jarvis" trigger
      if (wakeDetectorRef.current) {
        wakeDetectorRef.current.start();
      }
    } else {
      // While agent is busy, pause the wake detector to avoid double-triggering
      if (wakeDetectorRef.current) {
        wakeDetectorRef.current.stop();
      }
    }
  }, [currentMode]);

  // ── Speak Agent Response ──
  const speakResponse = useCallback(async (text: string) => {
    setVoiceState(prev => ({ ...prev, lastAiResponse: text }));
    setCoreMode('speaking');

    await ttsService.speak(text, {
      onStart: () => setCoreMode('speaking'),
      onEnd: () => {
        soundFx.playSuccessTone();
        setCoreMode('idle');
      },
      onError: () => setCoreMode('idle'),
    });
  }, [setCoreMode]);

  // ── Manual activation on user gesture ──
  const activateVoice = useCallback(async () => {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        await navigator.mediaDevices.getUserMedia({ audio: true });
      }
    } catch {}
    if (wakeDetectorRef.current) {
      wakeDetectorRef.current.start();
    }
    soundFx.playAcknowledgeBlip();
  }, []);

  // ── Manual wake test ──
  const triggerManualWake = useCallback(() => {
    if (wakeDetectorRef.current) {
      wakeDetectorRef.current.stop();
    }
    soundFx.playWakeChime();
    setCoreMode('listening');
    setVoiceState(prev => ({ ...prev, wakeWordDetected: true }));
    accumulatedCommandRef.current = '';
    startCommandSTT();
  }, [setCoreMode, startCommandSTT]);

  return {
    voiceState,
    activateVoice,
    triggerManualWake,
    speakResponse,
  };
}
