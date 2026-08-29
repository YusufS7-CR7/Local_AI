import { useRef, useCallback, Suspense, lazy } from 'react';
import { Background } from './components/Background';
import { HUD } from './components/HUD';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoadingFallback } from './components/Scene3D/LoadingFallback';
import { useOrbControls } from './hooks/useOrbControls';
import { useVoiceInterface } from './hooks/useVoiceInterface';
import { useAgentSocket } from './hooks/useAgentSocket';
import { CoreMode } from './types';

// Lazy-load heavy 3D WebGL bundle to prevent blocking initial HUD render
const Scene3D = lazy(() => import('./components/Scene3D'));

export default function App() {
  const controls = useOrbControls();
  const speakHandlerRef = useRef<((text: string) => void) | null>(null);

  // 1. Agent WebSocket Hook (receives tasks and speaks final response)
  const { 
    agentState, 
    startTask, 
    approveAction, 
    rejectAction 
  } = useAgentSocket(
    useCallback((newMode: CoreMode) => {
      controls.setCoreMode(newMode);
    }, [controls]),
    useCallback((finalResponse: string) => {
      if (speakHandlerRef.current) {
        speakHandlerRef.current(finalResponse);
      }
    }, [])
    ,
    useCallback((message: string) => {
      if (speakHandlerRef.current) {
        speakHandlerRef.current(message);
      }
    }, [])
  );

  // 2. Voice Interface Hook (captures voice commands and sends to agent)
  const voiceInterface = useVoiceInterface(
    controls.coreState.mode,
    controls.setCoreMode,
    useCallback((command: string) => {
      startTask(command);
    }, [startTask])
  );

  // Bind speak handler to ref to avoid circular dependency
  speakHandlerRef.current = voiceInterface.speakResponse;

  const { voiceState, activateVoice, triggerManualWake } = voiceInterface;

  return (
    <div 
      className="relative w-screen h-screen overflow-hidden bg-[#0a0a1a]"
      onClick={activateVoice}
    >
      {/* Background layer */}
      <Background />

      {/* 3D Holographic Scene with ErrorBoundary and Suspense */}
      <ErrorBoundary
        fallbackTitle="3D HOLOGRAPHIC PIPELINE OFFLINE"
        fallbackMessage="WebGL context unavailable or GPU error. 2D HUD remains operational."
      >
        <Suspense fallback={<LoadingFallback />}>
          <Scene3D controls={controls} />
        </Suspense>
      </ErrorBoundary>

      {/* Full Holographic HUD */}
      <HUD 
        coreState={controls.coreState} 
        voiceState={voiceState}
        agentState={agentState}
        onActivateMic={activateVoice}
        onTriggerWake={triggerManualWake}
        onExecuteCommand={startTask}
        onApproveAction={approveAction}
        onRejectAction={rejectAction}
      />
    </div>
  );
}
