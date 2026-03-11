/**
 * WebSocket Client Test for Ellen Skill
 *
 * Tests WebSocket broadcast functionality by connecting to the server
 * and listening for multimodal sync packets.
 */

const WebSocket = require('ws');

const WS_URL = 'ws://127.0.0.1:8080';

console.log('[WS Test] Connecting to WebSocket server:', WS_URL);

const ws = new WebSocket(WS_URL);

ws.on('open', () => {
  console.log('[WS Test] Connected to server');
  console.log('[WS Test] Waiting for messages... (Press Ctrl+C to exit)');
});

ws.on('message', (data) => {
  try {
    const packet = JSON.parse(data.toString());

    if (packet.type === 'multimodal_sync') {
      console.log('[WS Test] Received multimodal_sync packet:');
      console.log(`  Motion: ${packet.motionId}`);
      console.log(`  Expression: ${packet.expressionId}`);
      console.log(`  Text: ${packet.text.substring(0, 50)}...`);
      console.log(`  Has Audio: ${packet.hasAudio}`);
      console.log(`  Sample Rate: ${packet.sampleRate} Hz`);
      console.log(`  Duration: ${packet.duration.toFixed(2)}s`);
      console.log('---');
    } else if (packet.type === 'status') {
      console.log(`[WS Test] Status: ${packet.status}`);
      if (packet.message) {
        console.log(`  Message: ${packet.message}`);
      }
    } else {
      console.log('[WS Test] Unknown packet:', packet);
    }
  } catch (error) {
    console.error('[WS Test] Failed to parse message:', error.message);
  }
});

ws.on('close', () => {
  console.log('[WS Test] Connection closed');
  process.exit(0);
});

ws.on('error', (error) => {
  console.error('[WS Test] WebSocket error:', error.message);
  console.error('[WS Test] Make sure the Ellen Skill backend is running');
  process.exit(1);
});

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n[WS Test] Closing connection...');
  ws.close();
});
