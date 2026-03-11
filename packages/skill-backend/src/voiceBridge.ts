/**
 * TTS Voice Bridge Module for Ellen Skill
 *
 * Provides integration with GPT-SoVITS v4 for Japanese voice synthesis.
 * Handles LLM response tag parsing, model switching, audio synthesis,
 * with LRU+TTL caching and exponential backoff retry.
 */

import axios from 'axios';
import { SkillConfig } from './configLoader';
import { AudioCache } from './audioCache';
import { Logger, LogLevel } from './logger';
import { ParsedLLMResponse, TTSResult } from './types';

// Re-export types for backward compatibility
export { ParsedLLMResponse, TTSResult } from './types';

// Regex patterns for parsing LLM response tags
const MOTION_REGEX = /\[motion:([a-zA-Z0-9_]+)\]/;
const EXP_REGEX = /\[exp:([a-zA-Z0-9_]+)\]/;
const TAG_STRIP = /\[(motion|exp):[a-zA-Z0-9_]+\]/g;

// Valid motion and expression IDs (whitelist for validation)
const VALID_MOTIONS = ['idle', 'idle2'];
const VALID_EXPRESSIONS = ['lazy', 'maid', 'predator', 'hangry', 'shy', 'surprised', 'happy'];

// Default values for fallback
const DEFAULT_MOTION = 'idle';
const DEFAULT_EXPRESSION = 'lazy';
const V4_SAMPLE_RATE = 32000; // GPT-SoVITS v4 outputs 32000Hz, NOT 22050Hz

// Global audio cache instance
const audioCache = new AudioCache(50, 30);
audioCache.startCleanup(5);

// Logger instance
const logger = new Logger('VoiceBridge', { level: LogLevel.INFO });

/**
 * Parses LLM response to extract motion/expression tags and clean text.
 *
 * Tag format: [motion:idle][exp:lazy] おはようございます
 *
 * Invalid tags are silently downgraded to defaults (no errors thrown).
 *
 * @param {string} rawText - Raw LLM output with optional tags
 * @returns {ParsedLLMResponse} Parsed result with validated IDs
 */
export function parseLLMResponse(rawText: string): ParsedLLMResponse {
  // Extract motion tag
  const motionMatch = rawText.match(MOTION_REGEX);
  let motionId = motionMatch ? motionMatch[1] : DEFAULT_MOTION;

  // Validate motion ID against whitelist
  if (!VALID_MOTIONS.includes(motionId)) {
    motionId = DEFAULT_MOTION;
  }

  // Extract expression tag
  const expMatch = rawText.match(EXP_REGEX);
  let expressionId = expMatch ? expMatch[1] : DEFAULT_EXPRESSION;

  // Validate expression ID against whitelist
  if (!VALID_EXPRESSIONS.includes(expressionId)) {
    expressionId = DEFAULT_EXPRESSION;
  }

  // Strip all tags to get clean text for TTS
  const cleanText = rawText.replace(TAG_STRIP, '').trim();

  return {
    motionId,
    expressionId,
    cleanText,
    rawText,
  };
}

/**
 * Calls TTS API with exponential backoff retry.
 *
 * Retry strategy: 1s → 2s → 4s (max 3 attempts)
 *
 * @param {string} apiUrl - GPT-SoVITS API base URL
 * @param {object} params - TTS request parameters
 * @param {number} [maxRetries=3] - Maximum retry attempts
 * @returns {Promise<Buffer | null>} Audio buffer or null on failure
 */
async function callTTSWithRetry(
  apiUrl: string,
  params: object,
  maxRetries = 3
): Promise<Buffer | null> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.debug(`TTS API call attempt ${attempt}/${maxRetries}`);

      const response = await axios.post(`${apiUrl}/tts`, params, {
        responseType: 'arraybuffer',
        timeout: 60000,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      logger.debug(`TTS API call successful on attempt ${attempt}`);
      return Buffer.from(response.data as ArrayBuffer);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn(`TTS API call failed on attempt ${attempt}`, { error: errorMessage });

      if (attempt === maxRetries) {
        logger.error('TTS API call failed after all retry attempts');
        return null;
      }

      // Exponential backoff: 1s → 2s → 4s
      const delayMs = 1000 * Math.pow(2, attempt - 1);
      logger.debug(`Waiting ${delayMs}ms before retry...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return null;
}

/**
 * Switches GPT-SoVITS to Ellen V4 model.
 *
 * This should be called once during Skill startup, not on every TTS call.
 * Makes two independent GET requests to load GPT and SoVITS weights.
 *
 * @param {string} apiUrl - GPT-SoVITS API base URL
 * @param {string} gptPath - Absolute path to GPT model file (.ckpt)
 * @param {string} sovitsPath - Absolute path to SoVITS model file (.pth)
 * @returns {Promise<boolean>} True if both models loaded successfully
 */
export async function switchToEllenModel(
  apiUrl: string,
  gptPath: string,
  sovitsPath: string
): Promise<boolean> {
  logger.info('Switching to Ellen V4 model', { gptPath, sovitsPath });

  try {
    // Load GPT weights
    logger.debug('Loading GPT weights...');
    const gptResponse = await axios.get(`${apiUrl}/set_gpt_weights`, {
      params: { weights_path: gptPath },
      timeout: 30000,
    });

    if (gptResponse.data !== 'success') {
      logger.warn('GPT model switch returned non-success', {
        response: gptResponse.data,
      });
      return false;
    }
    logger.debug('GPT weights loaded successfully');

    // Load SoVITS weights
    logger.debug('Loading SoVITS weights...');
    const sovitsResponse = await axios.get(`${apiUrl}/set_sovits_weights`, {
      params: { weights_path: sovitsPath },
      timeout: 30000,
    });

    if (sovitsResponse.data !== 'success') {
      logger.warn('SoVITS model switch returned non-success', {
        response: sovitsResponse.data,
      });
      return false;
    }
    logger.debug('SoVITS weights loaded successfully');

    logger.info('Successfully switched to Ellen V4 model');
    return true;
  } catch (error) {
    logger.error(
      'Failed to switch model',
      error instanceof Error ? error : new Error(String(error))
    );
    return false;
  }
}

/**
 * Synthesizes speech using GPT-SoVITS v4 with caching and retry.
 *
 * Critical implementation notes:
 * - Checks AudioCache before calling TTS API (cache hit returns immediately)
 * - Uses exponential backoff retry on TTS API failures
 * - Returns raw WAV stream, NOT JSON (must use responseType: 'arraybuffer')
 * - V4 outputs 32000Hz audio (not 22050Hz)
 * - ref_audio_path must be absolute path
 * - All errors return null (graceful degradation, no exceptions)
 *
 * @param {string} rawText - Raw LLM output with optional tags
 * @param {SkillConfig} config - Skill configuration
 * @returns {Promise<TTSResult | null>} Synthesis result or null on failure
 */
export async function synthesizeSpeech(
  rawText: string,
  config: SkillConfig
): Promise<TTSResult | null> {
  // Step 1: Parse LLM response tags
  const parsed = parseLLMResponse(rawText);

  // Return null for empty text (no audio needed)
  if (!parsed.cleanText || parsed.cleanText.length === 0) {
    logger.debug('Empty text after parsing, skipping TTS');
    return null;
  }

  // Step 2: Check cache first
  const cachedResult = audioCache.get(parsed.cleanText, parsed.expressionId);
  if (cachedResult) {
    logger.info('Cache hit for TTS', {
      text: parsed.cleanText.substring(0, 50),
      expressionId: parsed.expressionId,
    });

    // Fill in motion/expression from parsed result (not stored in cache)
    return {
      ...cachedResult,
      motionId: parsed.motionId,
      expressionId: parsed.expressionId,
      text: parsed.cleanText,
    };
  }

  logger.debug('Cache miss for TTS, calling API', {
    text: parsed.cleanText.substring(0, 50),
    expressionId: parsed.expressionId,
  });

  // Step 3: Call TTS API with retry
  const ttsParams = {
    text: parsed.cleanText,
    text_lang: config.tts.language,
    ref_audio_path: config.tts.model.ref_audio,
    prompt_text: config.tts.model.ref_text,
    prompt_lang: config.tts.language,
    top_k: config.tts.params.top_k,
    top_p: config.tts.params.top_p,
    temperature: config.tts.params.temperature,
    speed_factor: config.tts.params.speed_factor,
    sample_steps: config.tts.params.sample_steps,
    super_sampling: config.tts.params.super_sampling,
    batch_size: config.tts.params.batch_size,
    streaming_mode: false,
  };

  const audioBuffer = await callTTSWithRetry(config.tts.api_url, ttsParams);

  if (!audioBuffer) {
    logger.error('TTS synthesis failed after retries');
    return null;
  }

  // Step 4: Process successful response
  const base64Audio = audioBuffer.toString('base64');
  const duration = parseWavDuration(audioBuffer, V4_SAMPLE_RATE);

  const result: TTSResult = {
    audioData: base64Audio,
    sampleRate: V4_SAMPLE_RATE,
    duration,
    motionId: parsed.motionId,
    expressionId: parsed.expressionId,
    text: parsed.cleanText,
  };

  // Step 5: Store in cache
  audioCache.set(parsed.cleanText, parsed.expressionId, result);
  logger.debug('Stored TTS result in cache', {
    cacheSize: audioCache.size(),
  });

  logger.info('TTS synthesis successful', {
    textLength: parsed.cleanText.length,
    duration: duration.toFixed(2),
    expressionId: parsed.expressionId,
  });

  return result;
}

/**
 * Gets the global audio cache instance.
 *
 * @returns {AudioCache} The global audio cache
 */
export function getAudioCache(): AudioCache {
  return audioCache;
}

/**
 * Parses WAV file duration from buffer.
 *
 * WAV format:
 * - Bytes 40-43: Subchunk2Size (data size in bytes)
 * - Duration = Subchunk2Size / (sampleRate * channels * bitsPerSample/8)
 *
 * @param {Buffer} buffer - WAV file buffer
 * @param {number} sampleRate - Sample rate in Hz
 * @returns {number} Duration in seconds
 */
function parseWavDuration(buffer: Buffer, sampleRate: number): number {
  try {
    // Standard WAV header parsing
    // Byte 22-23: Number of channels (little-endian uint16)
    const numChannels = buffer.readUInt16LE(22);

    // Byte 34-35: Bits per sample (little-endian uint16)
    const bitsPerSample = buffer.readUInt16LE(34);

    // Byte 40-43: Subchunk2Size (little-endian uint32)
    // This is the size of the actual audio data
    const subchunk2Size = buffer.readUInt32LE(40);

    // Calculate duration: samples / sampleRate
    // samples = subchunk2Size / (channels * bytesPerSample)
    const bytesPerSample = bitsPerSample / 8;
    const totalSamples = subchunk2Size / (numChannels * bytesPerSample);
    const duration = totalSamples / sampleRate;

    return Math.max(0, duration); // Ensure non-negative
  } catch (error) {
    // Fallback: estimate based on buffer size (rough approximation)
    // WAV header is typically 44 bytes, rest is audio data
    const estimatedDataSize = buffer.length - 44;
    const bytesPerSecond = sampleRate * 2; // Assuming 16-bit mono
    return Math.max(0, estimatedDataSize / bytesPerSecond);
  }
}
