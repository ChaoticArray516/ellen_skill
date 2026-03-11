/**
 * Configuration Loader Module for Ellen Skill
 *
 * Provides type-safe YAML configuration loading with environment variable
 * overrides and path resolution. Implements singleton pattern for caching.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { Logger, LogLevel } from './logger';

// Logger instance
const logger = new Logger('ConfigLoader', { level: LogLevel.INFO });

/**
 * TTS synthesis parameters for GPT-SoVITS v4
 */
export interface TTSParams {
  top_k: number;
  top_p: number;
  temperature: number;
  speed_factor: number;
  sample_steps: number;
  super_sampling: boolean;
  batch_size: number;
  streaming_mode: boolean;
}

/**
 * Complete Skill configuration structure
 */
export interface SkillConfig {
  project: {
    name: string;
    version: string;
    character: string;
    cv: string;
  };
  llm: {
    provider: 'openai' | 'deepseek' | 'claude' | 'gemini' | 'zhipu';
    api_key: string;
    base_url: string;
    model: string;
    temperature: number;
    max_tokens: number;
    stream: boolean;
  };
  tts: {
    api_url: string;
    language: string;
    model: {
      gpt_path: string;
      sovits_path: string;
      ref_audio: string;
      ref_text: string;
    };
    params: TTSParams;
  };
  websocket: {
    host: string;
    port: number;
    heartbeat_interval: number;
    max_connections: number;
    reconnect_attempts: number;
    reconnect_delay: number;
  };
  live2d: {
    model_path: string;
    default_motion: string;
    default_expression: string;
  };
  persona: {
    trust_level: number;
    sugar_level: number;
    stress_level: number;
    allow_tail_touch: boolean;
    default_mode: string;
  };
}

// Singleton cache instance
let configCache: SkillConfig | null = null;

/**
 * Loads and returns the Skill configuration.
 *
 * Features:
 * - Parses YAML configuration from config.yaml
 * - Overrides with environment variables (env > yaml)
 * - Converts relative paths to absolute paths
 * - Validates required fields
 * - Caches result for subsequent calls
 *
 * @returns {SkillConfig} The loaded and processed configuration
 * @throws {Error} If required fields are missing or config file is invalid
 */
export function loadConfig(): SkillConfig {
  // Return cached config if available
  if (configCache !== null) {
    return configCache;
  }

  // Resolve config file path based on process.cwd() (Skill root directory)
  const configPath = path.resolve(process.cwd(), 'config.yaml');

  // Check if config file exists
  if (!fs.existsSync(configPath)) {
    throw new Error(`Configuration file not found: ${configPath}`);
  }

  // Read and parse YAML configuration
  const configContent = fs.readFileSync(configPath, 'utf8');
  const config = yaml.parse(configContent) as SkillConfig;

  // Apply environment variable overrides (priority: env > yaml)
  applyEnvironmentOverrides(config);

  // Convert relative paths to absolute paths
  resolveModelPaths(config);

  // Validate required fields
  validateConfig(config);

  // Cache the configuration
  configCache = config;

  return config;
}

/**
 * Applies environment variable overrides to configuration.
 *
 * Override rules:
 * - LLM_API_KEY -> config.llm.api_key
 * - LLM_PROVIDER -> config.llm.provider
 * - TTS_API_URL -> config.tts.api_url
 * - WS_PORT -> config.websocket.port
 *
 * @param {SkillConfig} config - The configuration to modify
 */
function applyEnvironmentOverrides(config: SkillConfig): void {
  // LLM API Key override
  if (process.env.LLM_API_KEY) {
    config.llm.api_key = process.env.LLM_API_KEY;
  }

  // LLM Provider override
  if (process.env.LLM_PROVIDER) {
    const validProviders = ['openai', 'deepseek', 'claude', 'gemini', 'zhipu'];
    const provider = process.env.LLM_PROVIDER;
    if (validProviders.includes(provider)) {
      config.llm.provider = provider as SkillConfig['llm']['provider'];
    }
  }

  // TTS API URL override
  if (process.env.TTS_API_URL) {
    config.tts.api_url = process.env.TTS_API_URL;
  }

  // WebSocket port override
  if (process.env.WS_PORT) {
    const port = parseInt(process.env.WS_PORT, 10);
    if (!isNaN(port)) {
      config.websocket.port = port;
    }
  }
}

/**
 * Converts relative model paths to absolute paths.
 *
 * GPT-SoVITS requires absolute paths for model files. This function
 * resolves paths relative to the Skill root directory (process.cwd()).
 *
 * @param {SkillConfig} config - The configuration to modify
 */
function resolveModelPaths(config: SkillConfig): void {
  const cwd = process.cwd();

  // TTS model paths must be absolute for GPT-SoVITS
  config.tts.model.gpt_path = path.resolve(cwd, config.tts.model.gpt_path);
  config.tts.model.sovits_path = path.resolve(cwd, config.tts.model.sovits_path);
  config.tts.model.ref_audio = path.resolve(cwd, config.tts.model.ref_audio);

  // Live2D model path
  config.live2d.model_path = path.resolve(cwd, config.live2d.model_path);
}

/**
 * Validates the configuration for required fields.
 *
 * @param {SkillConfig} config - The configuration to validate
 * @throws {Error} If validation fails
 */
function validateConfig(config: SkillConfig): void {
  // Validate LLM API Key
  if (!config.llm.api_key || config.llm.api_key.trim() === '') {
    throw new Error(
      'LLM_API_KEY is required. Set it in .env file or environment variable.'
    );
  }

  // Validate TTS model files exist (optional - warn only)
  const ttsPaths = [
    { key: 'gpt_path', path: config.tts.model.gpt_path },
    { key: 'sovits_path', path: config.tts.model.sovits_path },
    { key: 'ref_audio', path: config.tts.model.ref_audio },
  ];

  for (const { key, path: filePath } of ttsPaths) {
    if (!fs.existsSync(filePath)) {
      logger.warn('TTS model file not found', { key, path: filePath });
    }
  }

  // Validate Live2D model exists (optional - warn only)
  if (!fs.existsSync(config.live2d.model_path)) {
    logger.warn('Live2D model not found', {
      path: config.live2d.model_path,
    });
  }
}

/**
 * Clears the configuration cache.
 *
 * Useful for testing or when configuration needs to be reloaded.
 */
export function clearConfigCache(): void {
  configCache = null;
}

/**
 * Gets the cached configuration without reloading.
 *
 * @returns {SkillConfig | null} Cached config or null if not loaded
 */
export function getCachedConfig(): SkillConfig | null {
  return configCache;
}
