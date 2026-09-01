/* ────────────────────────────────────────────────
 *  Shared types for the JARVIS Core application
 * ──────────────────────────────────────────────── */

/** Simple 3D vector */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Visual mode of the AI core */
export type CoreMode = 'idle' | 'listening' | 'thinking' | 'planning' | 'executing' | 'awaiting_confirmation' | 'speaking' | 'error';

/** Holographic HUD menu item definition */
export interface HudMenuItem {
  id: string;
  label: string;
  angle: number; // radians — position on the orbit circle
}

/** Physical state of the 3D orb (position, scale, rotation) */
export interface OrbState {
  position: [number, number, number];
  scale: number;
  rotationVelocity: [number, number, number];
}

/** Complete state of the JARVIS core */
export interface CoreState {
  orb: OrbState;
  mode: CoreMode;
  menuOpen: boolean;
  activeMenuItem: string | null;
  hoveredMenuItem: string | null;
}

/** Voice recognition and synthesis pipeline state */
export interface VoiceState {
  isListening: boolean;
  isMicActive: boolean;
  wakeWordDetected: boolean;
  transcript: string;
  lastUserPrompt: string | null;
  lastAiResponse: string | null;
  error: string | null;
}

/** Agent Confirmation Request for Dangerous Actions */
export interface ConfirmationRequest {
  id: string;
  toolName: string;
  parameters: Record<string, any>;
  reason: string;
  timestamp: number;
}

/** Computer Use Agent state for UI */
export interface AgentState {
  taskId: string | null;
  status: CoreMode;
  plan: string[];
  currentStep: {
    stepIndex: number;
    thought: string;
    toolName?: string;
    parameters?: Record<string, any>;
    observation?: string;
  } | null;
  history: Array<{
    stepIndex: number;
    toolName?: string;
    observation?: string;
  }>;
  pendingConfirmation: ConfirmationRequest | null;
  serverConnected: boolean;
  toolsCount: number;
}

/** Colour palette for each core mode */
export const MODE_COLORS: Record<CoreMode, { primary: string; secondary: string; emissive: string }> = {
  idle:                  { primary: '#0088ff', secondary: '#8b5cf6', emissive: '#00d4ff' },
  listening:             { primary: '#00e5ff', secondary: '#3b82f6', emissive: '#67e8f9' },
  thinking:              { primary: '#f59e0b', secondary: '#f97316', emissive: '#fbbf24' },
  planning:              { primary: '#8b5cf6', secondary: '#c084fc', emissive: '#d8b4fe' },
  executing:             { primary: '#10b981', secondary: '#06b6d4', emissive: '#34d399' },
  awaiting_confirmation: { primary: '#f97316', secondary: '#ef4444', emissive: '#f87171' },
  speaking:              { primary: '#a855f7', secondary: '#ec4899', emissive: '#f472b6' },
  error:                 { primary: '#ef4444', secondary: '#b91c1c', emissive: '#fca5a5' },
};

/** Default HUD menu items */
export const HUD_MENU_ITEMS: HudMenuItem[] = [
  { id: 'web',    label: 'WEB',    angle: -Math.PI / 4 },          // top-left
  { id: 'ai',     label: 'AI',     angle: Math.PI / 4 },           // top-right
  { id: 'files',  label: 'FILES',  angle: -Math.PI + Math.PI / 4 }, // bottom-left
  { id: 'system', label: 'SYSTEM', angle: Math.PI - Math.PI / 4 },  // bottom-right
];
