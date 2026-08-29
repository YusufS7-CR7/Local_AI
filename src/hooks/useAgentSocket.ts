import { useState, useEffect, useCallback, useRef } from 'react';
import { AgentState, CoreMode } from '../types';
import { agentSocketService } from '../services/agentSocketService';

export function useAgentSocket(
  onStatusChange?: (mode: CoreMode) => void,
  onTaskComplete?: (finalResponse: string) => void,
  onAssistantMessage?: (message: string) => void
) {
  const [agentState, setAgentState] = useState<AgentState>(() => agentSocketService.getState());

  const onStatusChangeRef = useRef(onStatusChange);
  const onTaskCompleteRef = useRef(onTaskComplete);
  const onAssistantMessageRef = useRef(onAssistantMessage);
  onStatusChangeRef.current = onStatusChange;
  onTaskCompleteRef.current = onTaskComplete;
  onAssistantMessageRef.current = onAssistantMessage;

  useEffect(() => {
    const unsubState = agentSocketService.subscribeState((newState) => {
      setAgentState(newState);
    });

    const unsubStatus = agentSocketService.subscribeStatus((mode) => {
      onStatusChangeRef.current?.(mode);
    });

    const unsubComplete = agentSocketService.subscribeTaskComplete((finalResponse) => {
      onTaskCompleteRef.current?.(finalResponse);
    });
    const unsubMessage = agentSocketService.subscribeAssistantMessage((message) => {
      onAssistantMessageRef.current?.(message);
    });

    return () => {
      unsubState();
      unsubStatus();
      unsubComplete();
      unsubMessage();
    };
  }, []);

  const startTask = useCallback((prompt: string) => {
    agentSocketService.startTask(prompt);
  }, []);

  const approveAction = useCallback((requestId: string) => {
    agentSocketService.approveAction(requestId);
  }, []);

  const rejectAction = useCallback((requestId: string) => {
    agentSocketService.rejectAction(requestId);
  }, []);

  return {
    agentState,
    startTask,
    approveAction,
    rejectAction,
  };
}
