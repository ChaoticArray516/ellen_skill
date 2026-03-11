/**
 * Unit tests for configLoader module
 */

import { loadConfig, getCachedConfig, clearConfigCache, SkillConfig } from '../configLoader';
import * as path from 'path';

describe('configLoader', () => {
  // Clear cache before each test
  beforeEach(() => {
    clearConfigCache();
  });

  test('loadConfig returns valid configuration', () => {
    process.env.LLM_API_KEY = 'test_key';
    const config = loadConfig();

    expect(config).toBeDefined();
    expect(config.project).toBeDefined();
    expect(config.llm).toBeDefined();
    expect(config.tts).toBeDefined();
    expect(config.websocket).toBeDefined();
    expect(config.live2d).toBeDefined();
    expect(config.persona).toBeDefined();
  });

  test('loadConfig applies LLM_API_KEY from environment', () => {
    process.env.LLM_API_KEY = 'test_api_key_123';
    const config = loadConfig();

    expect(config.llm.api_key).toBe('test_api_key_123');
  });

  test('loadConfig converts relative paths to absolute paths', () => {
    process.env.LLM_API_KEY = 'test_key';
    const config = loadConfig();

    // Check that paths are absolute
    expect(path.isAbsolute(config.tts.model.gpt_path)).toBe(true);
    expect(path.isAbsolute(config.tts.model.sovits_path)).toBe(true);
    expect(path.isAbsolute(config.tts.model.ref_audio)).toBe(true);
    expect(path.isAbsolute(config.live2d.model_path)).toBe(true);
  });

  test('loadConfig caches result (singleton pattern)', () => {
    process.env.LLM_API_KEY = 'test_key';
    const config1 = loadConfig();
    const config2 = loadConfig();

    expect(config1).toBe(config2); // Same reference
  });

  test('getCachedConfig returns null when not loaded', () => {
    clearConfigCache();
    const cached = getCachedConfig();
    expect(cached).toBeNull();
  });

  test('getCachedConfig returns config after loading', () => {
    process.env.LLM_API_KEY = 'test_key';
    const config = loadConfig();
    const cached = getCachedConfig();

    expect(cached).toBe(config);
  });

  test('throws error when LLM_API_KEY is missing', () => {
    delete process.env.LLM_API_KEY;
    clearConfigCache();

    expect(() => loadConfig()).toThrow('LLM_API_KEY is required');
  });

  test('environment variable LLM_PROVIDER overrides config', () => {
    process.env.LLM_API_KEY = 'test_key';
    process.env.LLM_PROVIDER = 'openai';
    const config = loadConfig();

    expect(config.llm.provider).toBe('openai');
  });

  test('environment variable TTS_API_URL overrides config', () => {
    process.env.LLM_API_KEY = 'test_key';
    process.env.TTS_API_URL = 'http://custom.tts.server:9999';
    const config = loadConfig();

    expect(config.tts.api_url).toBe('http://custom.tts.server:9999');
  });

  test('environment variable WS_PORT overrides config', () => {
    process.env.LLM_API_KEY = 'test_key';
    process.env.WS_PORT = '9090';
    const config = loadConfig();

    expect(config.websocket.port).toBe(9090);
  });
});
