/**
 * Ellen Skill Main Entry Point
 *
 * OpenClaw Skill lifecycle controller that orchestrates:
 * - Configuration loading
 * - WebSocket server management
 * - TTS model switching
 * - LLM client initialization
 * - Message processing pipeline
 */

// Load environment variables from .env file (project root)
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

import { loadConfig, SkillConfig } from './configLoader';
import { synthesizeSpeech, switchToEllenModel } from './voiceBridge';
import { EllenWSServer } from './wsServer';
import { EllenPersona } from './persona';
import OpenAI from 'openai';
import { Logger, LogLevel } from './logger';
import { MultimodalSyncPacket } from './types';

// Global instances
let config: SkillConfig;
let wsServer: EllenWSServer;
let llmClient: OpenAI;

// Logger instance
const logger = new Logger('EllenSkill', { level: LogLevel.INFO });

/**
 * Main startup sequence
 *
 * Initializes all components in order:
 * 1. Load configuration
 * 2. Start WebSocket server
 * 3. Switch TTS model to Ellen V4
 * 4. Initialize LLM client
 * 5. Register OpenClaw message handler
 *
 * Any failure logs error and exits.
 */
async function main(): Promise<void> {
  logger.info('Starting up...');

  try {
    // Step 1: Load configuration
    config = loadConfig();
    logger.info('Config loaded', { character: config.project.character });

    // Step 2: Start WebSocket server
    wsServer = new EllenWSServer(config);
    await wsServer.start();
    logger.info('WebSocket server ready', {
      host: config.websocket.host,
      port: config.websocket.port,
    });

    // Step 3: Switch TTS model to Ellen V4
    const modelSwitched = await switchToEllenModel(
      config.tts.api_url,
      config.tts.model.gpt_path,
      config.tts.model.sovits_path
    );
    if (modelSwitched) {
      logger.info('TTS model switched to Ellen V4');
    } else {
      logger.warn('Failed to switch TTS model, continuing with silent fallback');
    }

    // Step 4: Initialize LLM client
    llmClient = new OpenAI({
      apiKey: config.llm.api_key,
      baseURL: config.llm.base_url,
    });
    logger.info('LLM client initialized', { provider: config.llm.provider });

    // Step 5: Ready for messages
    logger.info('Ready. Waiting for messages...');
  } catch (error) {
    logger.error('Startup failed', error instanceof Error ? error : new Error(String(error)));
    process.exit(1);
  }
}

/**
 * Handles incoming user messages
 *
 * Processing pipeline:
 * 1. Broadcast 'thinking' status
 * 2. Call LLM with streaming
 * 3. Collect full response
 * 4. Broadcast 'speaking' status
 * 5. Synthesize speech (with fallback)
 * 6. Broadcast multimodal sync packet
 * 7. Broadcast 'ready' status
 *
 * @param {string} userMessage - User input message
 * @returns {Promise<void>}
 */
async function handleMessage(userMessage: string): Promise<void> {
  try {
    // 1. Broadcast "thinking" status
    wsServer.sendStatus('thinking');

    // 2. Call LLM with streaming
    const stream = await llmClient.chat.completions.create({
      model: config.llm.model,
      messages: [
        { role: 'system', content: EllenPersona.getSystemPrompt() },
        { role: 'user', content: userMessage },
      ],
      stream: true,
      temperature: config.llm.temperature,
      max_tokens: config.llm.max_tokens,
    });

    // 3. Collect full LLM response
    let fullResponse = '';
    for await (const chunk of stream) {
      fullResponse += chunk.choices[0]?.delta?.content ?? '';
    }

    logger.info('LLM response received', { preview: fullResponse.slice(0, 100) });

    // 4. Broadcast "speaking" status
    wsServer.sendStatus('speaking');

    // 5. Call TTS synthesis (returns null on failure for graceful degradation)
    const ttsResult = await synthesizeSpeech(fullResponse, config);

    // 6. Assemble and broadcast multimodal sync packet
    const packet: MultimodalSyncPacket = {
      type: 'multimodal_sync',
      text: ttsResult?.text ?? fullResponse,
      audioData: ttsResult?.audioData ?? '',
      motionId: ttsResult?.motionId ?? 'idle',
      expressionId: ttsResult?.expressionId ?? 'lazy',
      sampleRate: ttsResult?.sampleRate ?? 32000,
      duration: ttsResult?.duration ?? 0,
      timestamp: Date.now(),
      hasAudio: ttsResult !== null,
    };
    wsServer.broadcast(packet);

    // 7. Broadcast "ready" status
    wsServer.sendStatus('ready');
  } catch (error) {
    logger.error('Message handling failed', error instanceof Error ? error : new Error(String(error)));

    // Send error status to clients
    wsServer.sendStatus('error', error instanceof Error ? error.message : 'Unknown error');

    // Try to recover to ready state
    setTimeout(() => {
      wsServer.sendStatus('ready');
    }, 1000);
  }
}

/**
 * Graceful shutdown handler
 *
 * Closes WebSocket server and exits cleanly.
 */
async function gracefulShutdown(): Promise<void> {
  logger.info('Shutting down gracefully...');

  try {
    if (wsServer) {
      await wsServer.close();
      logger.info('WebSocket server closed');
    }
    process.exit(0);
  } catch (error) {
    logger.error('Shutdown error', error instanceof Error ? error : new Error(String(error)));
    process.exit(1);
  }
}

/**
 * OpenClaw Skill Interface
 *
 * Exported for OpenClaw integration.
 */
export const skill = {
  name: 'ellen-companion',
  displayName: 'Ellen Joe AI Companion (エレン・ジョー)',
  version: '1.0.0',
  onMessage: handleMessage,
  onStart: main,
  onStop: gracefulShutdown,
};

// Register process signal handlers for graceful shutdown
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught exception', error);
  gracefulShutdown();
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', new Error(String(reason)));
});

// Start if run directly (not imported)
if (require.main === module) {
  main().catch((error) => {
    logger.error('Fatal error', error instanceof Error ? error : new Error(String(error)));
    process.exit(1);
  });
}
