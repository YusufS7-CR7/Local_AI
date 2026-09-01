import { AgentState, CoreMode, ConfirmationRequest } from '../types';

type StateListener = (state: AgentState) => void;
type StatusListener = (mode: CoreMode) => void;
type TaskCompleteListener = (finalResponse: string) => void;
type AssistantMessageListener = (message: string) => void;

class AgentSocketService {
  private ws: WebSocket | null = null;
  private isConnecting: boolean = false;
  private reconnectTimer: number | null = null;
  private stateListeners: Set<StateListener> = new Set();
  private statusListeners: Set<StatusListener> = new Set();
  private taskCompleteListeners: Set<TaskCompleteListener> = new Set();
  private assistantMessageListeners: Set<AssistantMessageListener> = new Set();

  private state: AgentState = {
    taskId: null,
    status: 'idle',
    plan: [],
    currentStep: null,
    history: [],
    pendingConfirmation: null,
    serverConnected: false,
    toolsCount: 0,
  };

  constructor() {
    // Auto-connect on startup
    if (typeof window !== 'undefined') {
      this.connect();
    }
  }

  public getState(): AgentState {
    return { ...this.state };
  }

  private updateState(updater: (prev: AgentState) => AgentState): void {
    this.state = updater(this.state);
    for (const listener of this.stateListeners) {
      try {
        listener(this.state);
      } catch (err) {
        console.error('[AgentSocketService] State listener error:', err);
      }
    }
  }

  private getWsUrl(): string {
    if (typeof window === 'undefined') return 'ws://localhost:3001';
    if (import.meta.env.VITE_WS_URL) {
      return import.meta.env.VITE_WS_URL;
    }
    const isSecure = window.location.protocol === 'https:';
    const wsProto = isSecure ? 'wss:' : 'ws:';
    return `${wsProto}//${window.location.host}/ws`;
  }

  public connect(): void {
    if (this.isConnecting) return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.isConnecting = true;

    try {
      const url = this.getWsUrl();
      console.log(`[AgentSocketService] Connecting to WebSocket at ${url}...`);
      const ws = new WebSocket(url);

      ws.onopen = () => {
        this.isConnecting = false;
        console.log('[AgentSocketService] Connected to JARVIS Backend Gateway.');
        this.updateState(prev => ({ ...prev, serverConnected: true }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === 'CONNECTED') {
            const pending = msg.payload?.pendingConfirmations?.[0] || null;
            const toolsCount = msg.payload?.toolsCount ?? 0;
            this.updateState(prev => ({
              ...prev,
              serverConnected: true,
              pendingConfirmation: pending,
              toolsCount,
            }));
          }

          if (msg.type === 'CONFIRMATION_REQUIRED') {
            const req = msg.payload as ConfirmationRequest;
            this.updateState(prev => ({
              ...prev,
              status: 'awaiting_confirmation',
              pendingConfirmation: req,
            }));
            for (const fn of this.statusListeners) fn('awaiting_confirmation');
          }

          if (msg.type === 'AGENT_EVENT') {
            const agentEvent = msg.event;
            const newStatus = agentEvent.status as CoreMode;

            this.updateState(prev => {
              let updatedHistory = [...prev.history];
              if (agentEvent.type === 'STEP_FINISH' && agentEvent.step) {
                updatedHistory.push({
                  stepIndex: agentEvent.step.stepIndex,
                  toolName: agentEvent.step.toolName,
                  observation: agentEvent.step.observation,
                });
              }

              return {
                ...prev,
                taskId: agentEvent.taskId,
                status: newStatus,
                plan: agentEvent.plan || prev.plan,
                currentStep: agentEvent.step || prev.currentStep,
                history: updatedHistory,
                pendingConfirmation: agentEvent.status !== 'awaiting_confirmation' ? null : prev.pendingConfirmation,
              };
            });

            if (newStatus) {
              for (const fn of this.statusListeners) fn(newStatus);
            }

            if (agentEvent.type === 'TASK_COMPLETE' && agentEvent.finalResponse) {
              for (const fn of this.taskCompleteListeners) fn(agentEvent.finalResponse);
            }

            if (agentEvent.type === 'ASSISTANT_MESSAGE' && agentEvent.message) {
              for (const fn of this.assistantMessageListeners) fn(agentEvent.message);
            }
          }
        } catch (err) {
          console.error('[AgentSocketService] Message parsing error:', err);
        }
      };

      ws.onclose = () => {
        this.isConnecting = false;
        this.ws = null;
        this.updateState(prev => ({ ...prev, serverConnected: false }));
        this.scheduleReconnect();
      };

      ws.onerror = () => {
        this.isConnecting = false;
      };

      this.ws = ws;
    } catch {
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 3000);
  }

  public subscribeState(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.state);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  public subscribeStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  public subscribeTaskComplete(listener: TaskCompleteListener): () => void {
    this.taskCompleteListeners.add(listener);
    return () => {
      this.taskCompleteListeners.delete(listener);
    };
  }

  public subscribeAssistantMessage(listener: AssistantMessageListener): () => void {
    this.assistantMessageListeners.add(listener);
    return () => {
      this.assistantMessageListeners.delete(listener);
    };
  }

  public startTask(prompt: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.updateState(prev => ({
        ...prev,
        status: 'thinking',
        plan: [],
        currentStep: null,
        history: [],
        pendingConfirmation: null,
      }));
      this.ws.send(JSON.stringify({
        type: 'START_TASK',
        prompt,
      }));
    } else {
      console.warn('[AgentSocketService] WebSocket is not open. Attempting to connect...');
      this.connect();
    }
  }

  public approveAction(requestId: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'CONFIRMATION_RESPONSE',
        requestId,
        approved: true,
      }));
      this.updateState(prev => ({ ...prev, pendingConfirmation: null }));
    }
  }

  public rejectAction(requestId: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'CONFIRMATION_RESPONSE',
        requestId,
        approved: false,
      }));
      this.updateState(prev => ({ ...prev, pendingConfirmation: null }));
    }
  }
}

export const agentSocketService = new AgentSocketService();
