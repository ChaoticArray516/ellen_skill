/**
 * Shared Types for Ellen Skill Backend
 *
 * Common interfaces used across multiple modules to avoid circular dependencies.
 */

/**
 * Parsed LLM response with motion/expression tags and clean text
 */
export interface ParsedLLMResponse {
  /** Motion ID for Live2D animation */
  motionId: string;
  /** Expression ID for Live2D face expression */
  expressionId: string;
  /** Clean text without tags for TTS */
  cleanText: string;
  /** Original raw LLM output */
  rawText: string;
}

/**
 * TTS synthesis result with audio data and metadata
 */
export interface TTSResult {
  /** Base64 encoded WAV audio data */
  audioData: string;
  /** Sample rate in Hz (GPT-SoVITS v4 outputs 32000Hz) */
  sampleRate: number;
  /** Audio duration in seconds */
  duration: number;
  /** Motion ID for synchronization */
  motionId: string;
  /** Expression ID for synchronization */
  expressionId: string;
  /** Text that was synthesized */
  text: string;
}

/**
 * WebSocket message types
 */
export interface WSMessage {
  type: string;
  [key: string]: unknown;
}

/**
 * Multimodal sync packet for WebSocket broadcast
 */
export interface MultimodalSyncPacket {
  type: 'multimodal_sync';
  motionId: string;
  expressionId: string;
  text: string;
  hasAudio: boolean;
  audioData?: string;
  sampleRate: number;
  duration: number;
  timestamp: number;
}

/**
 * Status message for WebSocket
 */
export interface StatusMessage {
  type: 'status';
  status: 'thinking' | 'speaking' | 'ready' | 'error';
  message?: string;
  timestamp: number;
}
