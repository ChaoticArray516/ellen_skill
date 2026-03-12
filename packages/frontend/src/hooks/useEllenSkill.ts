/**
 * React Hook for Ellen Skill Integration
 *
 * Manages WebSocket connection, audio playback, and Live2D state.
 * Provides a clean interface for the UI components.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { WebSocketClient } from '../services/WebSocketClient';
import { AudioLipSync } from '../services/AudioLipSync';
import { ExpressionController } from '../services/ExpressionController';
import {
  MultimodalSyncPacket,
  StatusMessage,
  ConnectionStatus,
  EllenSkillState,
} from '../types';

/**
 * WebSocket configuration
 */
const WS_URL = 'ws://127.0.0.1:8081';
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 1000;

/**
 * React hook for Ellen Skill integration
 *
 * @returns {object} Skill state and control functions
 */
export function useEllenSkill() {
  // State
  const [state, setState] = useState<EllenSkillState & { ttsAvailable: boolean }>({
    connectionStatus: 'disconnected',
    currentText: '',
    currentExpression: 'lazy',
    isSpeaking: false,
    audioInitialized: false,
    ttsAvailable: false,  // TTS availability status
  });

  // Refs for mutable state
  const wsClientRef = useRef<WebSocketClient | null>(null);
  const audioRef = useRef<AudioLipSync | null>(null);
  const expressionRef = useRef<ExpressionController | null>(null);

  /**
   * Initialize services
   */
  useEffect(() => {
    // Create expression controller
    expressionRef.current = new ExpressionController();

    // Create WebSocket client
    const wsClient = new WebSocketClient(
      WS_URL,
      MAX_RECONNECT_ATTEMPTS,
      RECONNECT_DELAY
    );
    wsClientRef.current = wsClient;

    // Create audio manager
    const audio = new AudioLipSync();
    audioRef.current = audio;

    // Set up WebSocket handlers
    wsClient.onConnectionStatusChange((status: ConnectionStatus) => {
      setState((prev) => ({ ...prev, connectionStatus: status }));
    });

    wsClient.onMessage((packet: MultimodalSyncPacket) => {
      handleMultimodalPacket(packet);
    });

    wsClient.onStatus((statusMsg: StatusMessage) => {
      handleStatusMessage(statusMsg);
    });

    // Connect to server
    wsClient.connect();

    // Cleanup on unmount
    return () => {
      wsClient.disconnect();
      audio.dispose();
    };
  }, []);

  /**
   * Handles multimodal sync packets from backend
   */
  const handleMultimodalPacket = useCallback((packet: MultimodalSyncPacket) => {
    console.log('[useEllenSkill] Received packet:', packet);

    // Update expression
    expressionRef.current?.applyExpression(packet.expressionId);

    // Update state (including TTS availability from packet)
    setState((prev) => ({
      ...prev,
      currentText: packet.text,
      currentExpression: packet.expressionId,
      ttsAvailable: packet.hasAudio,  // If this packet has audio, TTS is available
    }));

    // Play audio if available
    if (packet.hasAudio && packet.audioData) {
      playAudio(packet.audioData, packet.sampleRate);
    }
  }, []);

  /**
   * Handles status messages from backend
   */
  const handleStatusMessage = useCallback((statusMsg: StatusMessage) => {
    console.log('[useEllenSkill] Status:', statusMsg.status);

    switch (statusMsg.status) {
      case 'thinking':
        setState((prev) => ({ ...prev, isSpeaking: false }));
        break;
      case 'speaking':
        setState((prev) => ({ ...prev, isSpeaking: true }));
        break;
      case 'ready':
        setState((prev) => ({ ...prev, isSpeaking: false }));
        break;
      case 'error':
        console.error('[useEllenSkill] Backend error:', statusMsg.message);
        setState((prev) => ({ ...prev, isSpeaking: false }));
        break;
    }
  }, []);

  /**
   * Plays audio with lip sync
   */
  const playAudio = useCallback(async (audioData: string, sampleRate: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    try {
      await audio.playAudio(audioData, sampleRate, (mouthOpenness) => {
        // Update mouth in expression controller
        expressionRef.current?.setMouthOpen(mouthOpenness);
      });
    } catch (error) {
      console.error('[useEllenSkill] Audio playback failed:', error);
    }
  }, []);

  /**
   * Initializes audio context (must be called on user interaction)
   */
  const initializeAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return false;

    const success = audio.initialize();
    if (success) {
      setState((prev) => ({ ...prev, audioInitialized: true }));
    }
    return success;
  }, []);

  /**
   * Sends a message to the backend
   */
  const sendMessage = useCallback((message: string) => {
    const wsClient = wsClientRef.current;
    if (!wsClient) return false;

    return wsClient.send({
      type: 'message',
      content: message,
      timestamp: Date.now(),
    });
  }, []);

  /**
   * Manually reconnects WebSocket
   */
  const reconnect = useCallback(() => {
    wsClientRef.current?.disconnect();
    wsClientRef.current?.connect();
  }, []);

  return {
    // State
    connectionStatus: state.connectionStatus,
    currentText: state.currentText,
    currentExpression: state.currentExpression,
    isSpeaking: state.isSpeaking,
    audioInitialized: state.audioInitialized,
    ttsAvailable: state.ttsAvailable,  // TTS availability status

    // Actions
    initializeAudio,
    sendMessage,
    reconnect,
  };
}
