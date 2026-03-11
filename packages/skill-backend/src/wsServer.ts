/**
 * WebSocket Broadcast Server for Ellen Skill
 *
 * Provides real-time communication between backend and Live2D frontend.
 * Handles multimodal sync packets, heartbeat mechanism, and connection management.
 */

import * as WebSocket from 'ws';
import { SkillConfig } from './configLoader';
import { randomUUID } from 'crypto';
import { Logger, LogLevel } from './logger';
import { MultimodalSyncPacket, StatusMessage } from './types';

// Re-export types
export { MultimodalSyncPacket, StatusMessage } from './types';

/**
 * Extended WebSocket with isAlive property for heartbeat tracking
 */
interface ExtendedWebSocket extends WebSocket {
  isAlive: boolean;
}

// Logger instance
const logger = new Logger('WSServer', { level: LogLevel.INFO });

/**
 * WebSocket server for Ellen Skill
 *
 * Features:
 * - UUID-based client identification
 * - Heartbeat mechanism with automatic dead connection cleanup
 * - Broadcast/multicast message support
 * - Status message broadcasting
 * - Graceful shutdown handling
 */
export class EllenWSServer {
  private wss: WebSocket.Server | null = null;
  private clients: Map<string, ExtendedWebSocket> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private config: SkillConfig;

  /**
   * Creates a new WebSocket server instance
   *
   * @param {SkillConfig} config - Skill configuration with websocket settings
   */
  constructor(config: SkillConfig) {
    this.config = config;
  }

  /**
   * Starts the WebSocket server
   *
   * Initializes the server, sets up connection handlers, and starts
   * the heartbeat mechanism for dead connection detection.
   *
   * @returns {Promise<void>} Resolves when server is ready
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Create WebSocket server
        this.wss = new WebSocket.Server({
          host: this.config.websocket.host,
          port: this.config.websocket.port,
        });

        // Handle server errors
        this.wss.on('error', (error) => {
          logger.error('Server error', error);
          reject(error);
        });

        // Handle new connections
        this.wss.on('connection', (ws: ExtendedWebSocket) => {
          this.handleConnection(ws);
        });

        // Server is ready
        this.wss.on('listening', () => {
          logger.info('WebSocket server ready', {
            host: this.config.websocket.host,
            port: this.config.websocket.port,
          });
          this.startHeartbeat();
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Handles a new WebSocket connection
   *
   * Assigns UUID, sets up event handlers, and sends ready status
   *
   * @param {ExtendedWebSocket} ws - New WebSocket connection
   */
  private handleConnection(ws: ExtendedWebSocket): void {
    // Generate unique client ID
    const clientId = randomUUID();
    ws.isAlive = true;

    // Store client
    this.clients.set(clientId, ws);
    logger.info('Client connected', { clientId, total: this.clients.size });

    // Send ready status to new client
    this.sendToClient(ws, {
      type: 'status',
      status: 'ready',
      timestamp: Date.now(),
    });

    // Handle pong responses (heartbeat)
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // Handle incoming messages (optional - for client->server communication)
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        logger.debug('Received message', { clientId, message });
        // Handle client messages if needed
      } catch (error) {
        logger.warn('Invalid message from client', {
          clientId,
          data: data.toString(),
        });
      }
    });

    // Handle connection close
    ws.on('close', () => {
      this.clients.delete(clientId);
      logger.info('Client disconnected', { clientId, total: this.clients.size });
    });

    // Handle errors
    ws.on('error', (error) => {
      logger.error('Client error', error, { clientId });
      this.clients.delete(clientId);
      ws.terminate();
    });
  }

  /**
   * Starts the heartbeat mechanism
   *
   * Periodically checks client connections and terminates
   * unresponsive clients to prevent zombie connections.
   */
  private startHeartbeat(): void {
    const intervalMs = this.config.websocket.heartbeat_interval * 1000;

    this.heartbeatInterval = setInterval(() => {
      this.clients.forEach((ws, clientId) => {
        if (!ws.isAlive) {
          // Client didn't respond to ping, terminate connection
          logger.info('Terminating dead connection', { clientId });
          ws.terminate();
          this.clients.delete(clientId);
          return;
        }

        // Mark as not alive until pong received
        ws.isAlive = false;
        ws.ping();
      });
    }, intervalMs);

    logger.info('Heartbeat started', { intervalMs });
  }

  /**
   * Broadcasts a multimodal sync packet to all connected clients
   *
   * @param {MultimodalSyncPacket} packet - Packet to broadcast
   */
  broadcast(packet: MultimodalSyncPacket): void {
    const message = JSON.stringify(packet);
    let sentCount = 0;

    this.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
        sentCount++;
      }
    });

    logger.info('Broadcasted to clients', {
      sentCount,
      type: packet.type,
      motionId: packet.motionId,
      expressionId: packet.expressionId,
      hasAudio: packet.hasAudio,
    });
  }

  /**
   * Sends a status message to all connected clients
   *
   * @param {StatusMessage['status']} status - Status to broadcast
   * @param {string} [message] - Optional status message
   */
  sendStatus(status: StatusMessage['status'], message?: string): void {
    const statusMessage: StatusMessage = {
      type: 'status',
      status,
      timestamp: Date.now(),
    };

    if (message) {
      statusMessage.message = message;
    }

    const jsonMessage = JSON.stringify(statusMessage);
    let sentCount = 0;

    this.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(jsonMessage);
        sentCount++;
      }
    });

    logger.info('Status broadcast', { status, sentCount });
  }

  /**
   * Sends a message to a specific client
   *
   * @param {ExtendedWebSocket} ws - Target WebSocket
   * @param {object} message - Message to send
   */
  private sendToClient(ws: ExtendedWebSocket, message: object): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Gracefully closes the WebSocket server
   *
   * Stops heartbeat, closes all client connections, and shuts down server
   *
   * @returns {Promise<void>} Resolves when server is closed
   */
  async close(): Promise<void> {
    return new Promise((resolve) => {
      // Stop heartbeat
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
        logger.info('Heartbeat stopped');
      }

      // Close all client connections
      this.clients.forEach((ws, clientId) => {
        ws.close();
        logger.info('Closed connection', { clientId });
      });
      this.clients.clear();

      // Close server
      if (this.wss) {
        this.wss.close(() => {
          logger.info('Server closed');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Gets the number of connected clients
   *
   * @returns {number} Client count
   */
  getClientCount(): number {
    return this.clients.size;
  }
}
