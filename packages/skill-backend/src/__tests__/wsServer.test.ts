/**
 * Unit tests for wsServer module
 */

import { EllenWSServer, MultimodalSyncPacket } from '../wsServer';
import { SkillConfig } from '../configLoader';
import WebSocket = require('ws');

// Mock configuration
const mockConfig: SkillConfig = {
  project: {
    name: 'ellen-test',
    version: '1.0.0',
    character: 'Ellen Joe',
    cv: 'Wakayama Shion',
  },
  llm: {
    provider: 'deepseek',
    api_key: 'test-key',
    base_url: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    temperature: 0.7,
    max_tokens: 1000,
    stream: true,
  },
  tts: {
    api_url: 'http://127.0.0.1:9880',
    language: 'ja',
    model: {
      gpt_path: '/models/ellen.ckpt',
      sovits_path: '/models/ellen.pth',
      ref_audio: '/audio/ref.wav',
      ref_text: 'それで戦い方とかはいつ覚えるの？',
    },
    params: {
      top_k: 5,
      top_p: 0.8,
      temperature: 0.75,
      speed_factor: 0.9,
      sample_steps: 32,
      super_sampling: true,
      batch_size: 1,
      streaming_mode: false,
    },
  },
  websocket: {
    host: '127.0.0.1',
    port: 18080, // Use different port for testing
    heartbeat_interval: 1, // 1 second for faster tests
    max_connections: 10,
    reconnect_attempts: 5,
    reconnect_delay: 1000,
  },
  live2d: {
    model_path: '/models/shark.model3.json',
    default_motion: 'idle',
    default_expression: 'lazy',
  },
  persona: {
    trust_level: 100,
    sugar_level: 100,
    stress_level: 0,
    allow_tail_touch: true,
    default_mode: 'lazy',
  },
};

describe('EllenWSServer', () => {
  let server: EllenWSServer;

  beforeEach(async () => {
    server = new EllenWSServer(mockConfig);
    await server.start();
  });

  afterEach(async () => {
    if (server) {
      await server.close();
    }
  });

  test('starts successfully and listens on specified port', async () => {
    expect(server.getClientCount()).toBe(0);
  });

  test('accepts client connections', (done) => {
    const client = new WebSocket(`ws://${mockConfig.websocket.host}:${mockConfig.websocket.port}`);

    client.on('open', () => {
      expect(server.getClientCount()).toBe(1);
      client.close();
    });

    client.on('close', () => {
      done();
    });

    client.on('error', (err) => {
      done(err);
    });
  });

  test('sends ready status to new client', (done) => {
    const client = new WebSocket(`ws://${mockConfig.websocket.host}:${mockConfig.websocket.port}`);

    client.on('message', (data) => {
      const message = JSON.parse(data.toString());
      expect(message.type).toBe('status');
      expect(message.status).toBe('ready');
      client.close();
      done();
    });

    client.on('error', (err) => {
      done(err);
    });
  });

  test('broadcast sends message to all clients', (done) => {
    const clients: WebSocket[] = [];
    const receivedMessages: any[] = [];

    const packet: MultimodalSyncPacket = {
      type: 'multimodal_sync',
      text: 'おはよう',
      audioData: 'base64data',
      motionId: 'idle',
      expressionId: 'happy',
      sampleRate: 32000,
      duration: 1.5,
      timestamp: Date.now(),
      hasAudio: true,
    };

    // Create two clients
    const client1 = new WebSocket(`ws://${mockConfig.websocket.host}:${mockConfig.websocket.port}`);
    const client2 = new WebSocket(`ws://${mockConfig.websocket.host}:${mockConfig.websocket.port}`);

    clients.push(client1, client2);

    let connectedCount = 0;

    const checkComplete = () => {
      if (receivedMessages.length === 2) {
        expect(receivedMessages[0].type).toBe('multimodal_sync');
        expect(receivedMessages[0].text).toBe('おはよう');
        expect(receivedMessages[0].motionId).toBe('idle');
        expect(receivedMessages[0].expressionId).toBe('happy');
        expect(receivedMessages[0].hasAudio).toBe(true);

        clients.forEach(c => c.close());
        done();
      }
    };

    clients.forEach((client) => {
      client.on('open', () => {
        connectedCount++;
        if (connectedCount === 2) {
          // Wait a bit for ready messages to be processed
          setTimeout(() => {
            server.broadcast(packet);
          }, 100);
        }
      });

      client.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'multimodal_sync') {
          receivedMessages.push(message);
          checkComplete();
        }
      });

      client.on('error', (err) => {
        done(err);
      });
    });
  });

  test('sendStatus broadcasts status to all clients', (done) => {
    const clients: WebSocket[] = [];
    const receivedStatuses: string[] = [];

    const client1 = new WebSocket(`ws://${mockConfig.websocket.host}:${mockConfig.websocket.port}`);
    const client2 = new WebSocket(`ws://${mockConfig.websocket.host}:${mockConfig.websocket.port}`);

    clients.push(client1, client2);

    let connectedCount = 0;
    let readyCount = 0;

    const checkComplete = () => {
      if (receivedStatuses.length === 2) {
        expect(receivedStatuses.every(s => s === 'speaking')).toBe(true);
        clients.forEach(c => c.close());
        done();
      }
    };

    clients.forEach((client) => {
      client.on('open', () => {
        connectedCount++;
        if (connectedCount === 2) {
          // Wait for ready messages
          setTimeout(() => {
            server.sendStatus('speaking');
          }, 100);
        }
      });

      client.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'status') {
          if (message.status === 'ready') {
            readyCount++;
          } else if (message.status === 'speaking') {
            receivedStatuses.push(message.status);
            checkComplete();
          }
        }
      });

      client.on('error', (err) => {
        done(err);
      });
    });
  });

  test('close terminates all connections and stops server', async () => {
    const client = new WebSocket(`ws://${mockConfig.websocket.host}:${mockConfig.websocket.port}`);

    await new Promise<void>((resolve, reject) => {
      client.on('open', () => {
        expect(server.getClientCount()).toBe(1);
        resolve();
      });
      client.on('error', reject);
    });

    const closePromise = new Promise<void>((resolve) => {
      client.on('close', () => {
        resolve();
      });
    });

    await server.close();
    await closePromise;

    expect(server.getClientCount()).toBe(0);
    expect(client.readyState).toBe(WebSocket.CLOSED);
  });
});
