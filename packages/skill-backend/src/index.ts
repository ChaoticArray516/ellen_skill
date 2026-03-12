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
import { synthesizeSpeech, switchToEllenModel, parseLLMResponse } from './voiceBridge';
import { EllenWSServer } from './wsServer';
import { EllenPersona } from './persona';
import OpenAI from 'openai';
import { Logger, LogLevel } from './logger';
import { MultimodalSyncPacket } from './types';
import { getUserOperationLogger } from './userOperationLogger';

// Global instances
let config: SkillConfig;
let wsServer: EllenWSServer;
let llmClient: OpenAI;

// Logger instances
const logger = new Logger('EllenSkill', { level: LogLevel.INFO });
const userLogger = getUserOperationLogger({ consoleOutput: true });

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

    // Step 2.5: Register message handler (must be registered immediately after WS server starts)
    wsServer.setMessageHandler(handleMessage);
    logger.info('Message handler registered with WebSocket server');

    // Step 2.8: Check TTS service connectivity (non-blocking)
    try {
      const ttsHealthCheck = await fetch(`${config.tts.api_url}/`, {
        signal: AbortSignal.timeout(3000),  // 3 second timeout
      }).catch(() => null);

      if (ttsHealthCheck?.ok) {
        logger.info('TTS service is available', { url: config.tts.api_url });
      } else {
        logger.warn(
          '⚠️  TTS service not available. Voice synthesis will be disabled.\n' +
          '   To enable voice:\n' +
          '   1. Install GPT-SoVITS: https://github.com/RVC-Boss/GPT-SoVITS\n' +
          `   2. Start service: python api_v2.py -a 127.0.0.1 -p 9880\n` +
          `   3. Ensure model files exist at: ${config.tts.model.gpt_path}`
        );
      }
    } catch {
      logger.warn('TTS health check failed (non-fatal)');
    }

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

    // Log LLM response
    const detectedEmotion = extractEmotionFromResponse(fullResponse);
    userLogger.logLLMResponse(userMessage, fullResponse, detectedEmotion);

    // 4. Broadcast "speaking" status
    wsServer.sendStatus('speaking');

    // 5. Pre-parse LLM response to extract tags (regardless of TTS availability)
    // This ensures clean text and correct expression/motion IDs even when TTS fails
    const parsedResponse = parseLLMResponse(fullResponse);
    logger.debug('Parsed LLM response', {
      motionId: parsedResponse.motionId,
      expressionId: parsedResponse.expressionId,
      cleanText: parsedResponse.cleanText.substring(0, 50),
    });

    // 6. Call TTS synthesis (returns null on failure for graceful degradation)
    const ttsResult = await synthesizeSpeech(fullResponse, config);

    // Log TTS result
    if (ttsResult) {
      userLogger.logTTSSynthesis(ttsResult.text, ttsResult.duration, true);
    } else {
      userLogger.logTTSSynthesis(parsedResponse.cleanText, 0, false);
    }

    // 7. Assemble and broadcast multimodal sync packet
    // Use parsedResponse as fallback for all fields when TTS fails
    // This ensures: clean text (no tags), correct expressionId, correct motionId
    const packet: MultimodalSyncPacket = {
      type: 'multimodal_sync',
      text: ttsResult?.text ?? parsedResponse.cleanText,          // Use cleanText without tags
      audioData: ttsResult?.audioData ?? '',
      motionId: ttsResult?.motionId ?? parsedResponse.motionId,   // Parse from LLM response
      expressionId: ttsResult?.expressionId ?? parsedResponse.expressionId, // Parse from LLM response
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
 * Extract emotion from LLM response
 * Simple heuristic based on response content
 */
function extractEmotionFromResponse(response: string): string {
  const lower = response.toLowerCase();
  if (lower.includes('怒') || lower.includes('angry') || lower.includes('frustrated')) {
    return 'angry';
  }
  if (lower.includes('羞') || lower.includes('shy') || lower.includes('blush')) {
    return 'shy';
  }
  if (lower.includes('惊') || lower.includes('surprised') || lower.includes('wow')) {
    return 'surprised';
  }
  if (lower.includes('♪') || lower.includes('happy') || lower.includes('开心')) {
    return 'happy';
  }
  if (lower.includes('♡') || lower.includes('love') || lower.includes('maid')) {
    return 'maid';
  }
  if (lower.includes('饿') || lower.includes('hungry') || lower.includes('食物')) {
    return 'hangry';
  }
  return 'lazy';
}

/**
 * Graceful shutdown handler
 *
 * Closes WebSocket server and exits cleanly.
 */
async function gracefulShutdown(): Promise<void> {
  logger.info('Shutting down gracefully...');

  try {
    // Log system shutdown
    userLogger.logSystemShutdown();

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
