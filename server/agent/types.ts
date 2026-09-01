export type AgentStatus = 'idle' | 'listening' | 'thinking' | 'planning' | 'executing' | 'awaiting_confirmation' | 'speaking' | 'completed' | 'error';

export interface ErrorDiagnostics {
  errorCode: string;
  failedStepIndex?: number;
  failedTool?: string;
  parameters?: Record<string, any>;
  reason: string;
  systemDetails?: {
    processName?: string;
    pid?: number;
    hwnd?: string;
    wasInTray?: boolean;
    allFoundPids?: number[];
    windowsCount?: number;
    rawLog?: string;
  };
  suggestedFix?: string;
}

export interface AgentStep {
  stepIndex: number;
  thought: string;
  toolName?: string;
  parameters?: Record<string, any>;
  result?: any;
  screenshot?: string;
  observation?: string;
  error?: string;
  diagnostics?: ErrorDiagnostics;
  timestamp: number;
}

export interface AgentTask {
  id: string;
  prompt: string;
  status: AgentStatus;
  plan: string[];
  steps: AgentStep[];
  finalResponse?: string;
  error?: string;
  errorDiagnostics?: ErrorDiagnostics;
  startTime: number;
  endTime?: number;
}

export interface AgentEvent {
  type: 'STATUS_CHANGE' | 'PLAN_READY' | 'STEP_START' | 'STEP_FINISH' | 'ASSISTANT_MESSAGE' | 'CONFIRMATION_REQUIRED' | 'TASK_COMPLETE' | 'ERROR';
  taskId: string;
  status: AgentStatus;
  plan?: string[];
  step?: AgentStep;
  finalResponse?: string;
  message?: string;
  error?: string;
  errorDiagnostics?: ErrorDiagnostics;
  payload?: any;
}
