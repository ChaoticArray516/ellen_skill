/**
 * WebSocket Client for Ellen Skill Frontend
 *
 * Manages WebSocket connection with exponential backoff reconnection.
 * Handles multimodal sync packets and status messages from backend.
 */

import {
  MultimodalSyncPacket,
  StatusMessage,
  ConnectionStatus,
  MessageHandler,
  StatusHandler,
} from '../types';

/**
 * WebSocket client configuration
 */
interface WSConfig {
  /** WebSocket server URL */
  url: string;
  /** Maximum reconnection attempts */
  maxReconnectAttempts: number;
  /** Initial reconnection delay in ms */
  reconnectDelay: number;
}

/**
 * WebSocket client for communicating with Ellen Skill backend
 *
 * Features:
 * - Exponential backoff reconnection
 * - Message and status callbacks
 * - Connection state management
 */
export class WebSocketClient {
  private ws: WebSocket | null = null;
  private config: WSConfig;
  private reconnectAttempts = 0;
  private reconnectTimer: number | null = null;
  private status: ConnectionStatus = 'disconnected';

  private onMessageHandler: MessageHandler | null = null;
  private onStatusHandler: StatusHandler | null = null;
  private onConnectionChange: ((status: ConnectionStatus) => void) | null = null;

  /**
   * Creates a new WebSocket client
   *
   * @param {string} url - WebSocket server URL (ws://host:port)
   * @param {number} [maxReconnectAttempts=5] - Maximum reconnection attempts
   * @param {number} [reconnectDelay=1000] - Initial reconnection delay in ms
   */
  constructor(
    url: string,
    maxReconnectAttempts = 5,
    reconnectDelay = 1000
  ) {
    this.config = {
      url,
      maxReconnectAttempts,
      reconnectDelay,
    };
  }

  /**
   * Sets the message handler callback
   *
   * @param {MessageHandler} handler - Called when multimodal sync packet received
   */
  onMessage(handler: MessageHandler): void {
    this.onMessageHandler = handler;
  }

  /**
   * Sets the status handler callback
   *
   * @param {StatusHandler} handler - Called when status message received
   */
  onStatus(handler: StatusHandler): void {
    this.onStatusHandler = handler;
  }

  /**
   * Sets the connection state change callback
   *
   * @param {(status: ConnectionStatus) => void} handler - Called when connection state changes
   */
  onConnectionStatusChange(handler: (status: ConnectionStatus) => void): void {
    this.onConnectionChange = handler;
  }

  /**
   * Gets current connection status
   *
   * @returns {ConnectionStatus} Current status
   */
  getStatus(): ConnectionStatus {
    return this.status;
  }

  /**
   * Connects to WebSocket server
   *
   * Initiates connection with reconnection capability.
   */
  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('[WSClient] Already connected');
      return;
    }

    this.setStatus('connecting');

    try {
      this.ws = new WebSocket(this.config.url);

      this.ws.onopen = () => {
        console.log('[WSClient] Connected to server');
        this.reconnectAttempts = 0;
        this.setStatus('connected');
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onclose = () => {
        console.log('[WSClient] Connection closed');
        this.setStatus('disconnected');
        this.attemptReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('[WSClient] WebSocket error:', error);
        this.setStatus('disconnected');
      };
    } catch (error) {
      console.error('[WSClient] Failed to create connection:', error);
      this.setStatus('disconnected');
      this.attemptReconnect();
    }
  }

  /**
   * Disconnects from WebSocket server
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      // Prevent auto-reconnect on manual disconnect
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }

    this.reconnectAttempts = 0;
    this.setStatus('disconnected');
  }

  /**
   * Sends a message to the server
   *
   * @param {object} message - Message to send
   * @returns {boolean} Whether message was sent
   */
  send(message: object): boolean {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      return true;
    }
    console.warn('[WSClient] Cannot send, not connected');
    return false;
  }

  /**
   * Handles incoming WebSocket messages
   *
   * @param {string} data - Raw message data
   */
  private handleMessage(data: string): void {
    try {
      const parsed = JSON.parse(data);

      if (parsed.type === 'multimodal_sync') {
        this.onMessageHandler?.(parsed as MultimodalSyncPacket);
      } else if (parsed.type === 'status') {
        this.onStatusHandler?.(parsed as StatusMessage);
      } else {
        console.warn('[WSClient] Unknown message type:', parsed.type);
      }
    } catch (error) {
      console.error('[WSClient] Failed to parse message:', error);
    }
  }

  /**
   * Attempts to reconnect with exponential backoff
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.error('[WSClient] Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.config.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(
      `[WSClient] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.config.maxReconnectAttempts})`
    );

    this.reconnectTimer = window.setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Updates connection status and notifies listeners
   *
   * @param {ConnectionStatus} status - New status
   */
  private setStatus(status: ConnectionStatus): void {
    if (this.status !== status) {
      this.status = status;
      this.onConnectionChange?.(status);
    }
  }
}
