/**
 * Type definitions for Ellen Skill Frontend
 */

/**
 * Multimodal synchronization packet from backend
 */
export interface MultimodalSyncPacket {
  /** Packet type identifier */
  type: 'multimodal_sync';
  /** Clean Japanese text for display */
  text: string;
  /** Base64 encoded WAV audio (empty if TTS failed) */
  audioData: string;
  /** Live2D motion ID */
  motionId: string;
  /** Live2D expression ID */
  expressionId: string;
  /** Audio sample rate in Hz */
  sampleRate: number;
  /** Audio duration in seconds */
  duration: number;
  /** Unix timestamp in milliseconds */
  timestamp: number;
  /** Whether packet contains valid audio */
  hasAudio: boolean;
}

/**
 * Status message from backend
 */
export interface StatusMessage {
  /** Packet type identifier */
  type: 'status';
  /** Current status */
  status: 'ready' | 'thinking' | 'speaking' | 'error';
  /** Optional status message */
  message?: string;
}

/**
 * WebSocket connection state
 */
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

/**
 * Ellen Skill state for UI
 */
export interface EllenSkillState {
  /** WebSocket connection status */
  connectionStatus: ConnectionStatus;
  /** Current Ellen response text */
  currentText: string;
  /** Current expression ID */
  currentExpression: string;
  /** Whether Ellen is currently speaking */
  isSpeaking: boolean;
  /** Whether audio context is initialized */
  audioInitialized: boolean;
}

/**
 * Live2D model parameters for expressions
 */
export interface ExpressionParams {
  [key: string]: number;
}

/**
 * Ellen emotion definitions mapped to Live2D parameters
 */
export type EllenEmotion =
  | 'lazy'
  | 'maid'
  | 'predator'
  | 'hangry'
  | 'shy'
  | 'surprised'
  | 'happy';

/**
 * Live2D motion IDs
 */
export type MotionId = 'idle' | 'idle2';

/**
 * WebSocket message handler type
 */
export type MessageHandler = (packet: MultimodalSyncPacket) => void;

/**
 * Status handler type
 */
export type StatusHandler = (status: StatusMessage) => void;
