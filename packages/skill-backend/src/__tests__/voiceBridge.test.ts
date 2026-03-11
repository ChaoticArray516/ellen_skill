/**
 * Unit tests for voiceBridge module
 */

import {
  parseLLMResponse,
  switchToEllenModel,
  synthesizeSpeech,
  ParsedLLMResponse,
  TTSResult,
} from '../voiceBridge';
import { SkillConfig } from '../configLoader';
import axios from 'axios';

// Mock axios for API tests
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('parseLLMResponse', () => {
  test('parses valid motion and expression tags correctly', () => {
    const result = parseLLMResponse('[motion:idle2][exp:shy] 尻尾触らないで…');

    expect(result.motionId).toBe('idle2');
    expect(result.expressionId).toBe('shy');
    expect(result.cleanText).toBe('尻尾触らないで…');
  });

  test('returns defaults when no tags present', () => {
    const result = parseLLMResponse('おはようございます。');

    expect(result.motionId).toBe('idle');
    expect(result.expressionId).toBe('lazy');
    expect(result.cleanText).toBe('おはようございます。');
  });

  test('downgrades invalid motion tag to default', () => {
    const result = parseLLMResponse('[motion:dance] テキスト');

    expect(result.motionId).toBe('idle'); // Default fallback
    expect(result.expressionId).toBe('lazy');
  });

  test('downgrades invalid expression tag to default', () => {
    const result = parseLLMResponse('[exp:unknown] テキスト');

    expect(result.motionId).toBe('idle');
    expect(result.expressionId).toBe('lazy'); // Default fallback
  });

  test('handles multiple tags in different order', () => {
    const result = parseLLMResponse('[exp:predator][motion:idle2] 噛んでもいい？');

    expect(result.motionId).toBe('idle2');
    expect(result.expressionId).toBe('predator');
    expect(result.cleanText).toBe('噛んでもいい？');
  });

  test('strips all tags from clean text', () => {
    const result = parseLLMResponse('[motion:idle][exp:happy][motion:idle2] テスト');

    // Should use first valid tag
    expect(result.motionId).toBe('idle');
    expect(result.cleanText).toBe('テスト');
  });

  test('handles all valid expressions', () => {
    const expressions = ['lazy', 'maid', 'predator', 'hangry', 'shy', 'surprised', 'happy'];

    expressions.forEach((exp) => {
      const result = parseLLMResponse(`[exp:${exp}] テスト`);
      expect(result.expressionId).toBe(exp);
    });
  });

  test('preserves original raw text', () => {
    const raw = '[motion:idle][exp:lazy] おはよう';
    const result = parseLLMResponse(raw);

    expect(result.rawText).toBe(raw);
  });
});

describe('switchToEllenModel', () => {
  const mockApiUrl = 'http://127.0.0.1:9880';
  const mockGptPath = '/models/ellen.ckpt';
  const mockSovitsPath = '/models/ellen.pth';

  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('returns true when both models load successfully', async () => {
    mockedAxios.get.mockResolvedValue({ data: 'success' });

    const result = await switchToEllenModel(mockApiUrl, mockGptPath, mockSovitsPath);

    expect(result).toBe(true);
    expect(mockedAxios.get).toHaveBeenCalledTimes(2);
    expect(mockedAxios.get).toHaveBeenNthCalledWith(
      1,
      `${mockApiUrl}/set_gpt_weights`,
      { params: { weights_path: mockGptPath }, timeout: 30000 }
    );
    expect(mockedAxios.get).toHaveBeenNthCalledWith(
      2,
      `${mockApiUrl}/set_sovits_weights`,
      { params: { weights_path: mockSovitsPath }, timeout: 30000 }
    );
  });

  test('returns false when GPT model fails', async () => {
    mockedAxios.get
      .mockResolvedValueOnce({ data: 'error' })
      .mockResolvedValueOnce({ data: 'success' });

    const result = await switchToEllenModel(mockApiUrl, mockGptPath, mockSovitsPath);

    expect(result).toBe(false);
  });

  test('returns false when SoVITS model fails', async () => {
    mockedAxios.get
      .mockResolvedValueOnce({ data: 'success' })
      .mockResolvedValueOnce({ data: 'error' });

    const result = await switchToEllenModel(mockApiUrl, mockGptPath, mockSovitsPath);

    expect(result).toBe(false);
  });

  test('returns false on network error', async () => {
    mockedAxios.get.mockRejectedValue(new Error('Network error'));

    const result = await switchToEllenModel(mockApiUrl, mockGptPath, mockSovitsPath);

    expect(result).toBe(false);
  });
});

describe('synthesizeSpeech', () => {
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
      port: 8080,
      heartbeat_interval: 30,
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

  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('returns null for empty text', async () => {
    const result = await synthesizeSpeech('[motion:idle]   ', mockConfig);

    expect(result).toBeNull();
  });

  test('returns TTSResult with correct structure on success', async () => {
    // Create a minimal WAV buffer (header + small data)
    const wavBuffer = Buffer.alloc(48);
    // RIFF header
    wavBuffer.write('RIFF', 0);
    wavBuffer.writeUInt32LE(40, 4); // File size - 8
    wavBuffer.write('WAVE', 8);
    // fmt chunk
    wavBuffer.write('fmt ', 12);
    wavBuffer.writeUInt32LE(16, 16); // Subchunk1Size
    wavBuffer.writeUInt16LE(1, 20); // AudioFormat (PCM)
    wavBuffer.writeUInt16LE(1, 22); // NumChannels (mono)
    wavBuffer.writeUInt32LE(32000, 24); // SampleRate
    wavBuffer.writeUInt32LE(64000, 28); // ByteRate
    wavBuffer.writeUInt16LE(2, 32); // BlockAlign
    wavBuffer.writeUInt16LE(16, 34); // BitsPerSample
    // data chunk
    wavBuffer.write('data', 36);
    wavBuffer.writeUInt32LE(4, 40); // Subchunk2Size

    mockedAxios.post.mockResolvedValue({
      data: wavBuffer.buffer.slice(wavBuffer.byteOffset, wavBuffer.byteOffset + wavBuffer.byteLength),
      headers: { 'content-type': 'audio/wav' },
    });

    const result = await synthesizeSpeech('[motion:idle2][exp:shy] 尻尾触らないで', mockConfig);

    expect(result).not.toBeNull();
    expect(result!.motionId).toBe('idle2');
    expect(result!.expressionId).toBe('shy');
    expect(result!.text).toBe('尻尾触らないで');
    expect(result!.sampleRate).toBe(32000);
    expect(result!.audioData).toBeDefined();
    expect(typeof result!.audioData).toBe('string'); // Base64 string
    expect(result!.duration).toBeGreaterThanOrEqual(0);
  });

  test('returns null on TTS API error', async () => {
    mockedAxios.post.mockRejectedValue(new Error('TTS service unavailable'));

    const result = await synthesizeSpeech('テスト', mockConfig);

    expect(result).toBeNull();
  });

  test('uses correct API parameters', async () => {
    const wavBuffer = Buffer.alloc(48);
    wavBuffer.write('RIFF', 0);
    wavBuffer.write('WAVE', 8);
    wavBuffer.write('fmt ', 12);
    wavBuffer.writeUInt32LE(16, 16);
    wavBuffer.writeUInt16LE(1, 20);
    wavBuffer.writeUInt16LE(1, 22);
    wavBuffer.writeUInt32LE(32000, 24);
    wavBuffer.writeUInt32LE(64000, 28);
    wavBuffer.writeUInt16LE(2, 32);
    wavBuffer.writeUInt16LE(16, 34);
    wavBuffer.write('data', 36);
    wavBuffer.writeUInt32LE(4, 40);

    mockedAxios.post.mockResolvedValue({
      data: wavBuffer.buffer.slice(wavBuffer.byteOffset, wavBuffer.byteOffset + wavBuffer.byteLength),
    });

    await synthesizeSpeech('おはよう', mockConfig);

    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${mockConfig.tts.api_url}/tts`,
      expect.objectContaining({
        text: 'おはよう',
        text_lang: 'ja',
        ref_audio_path: mockConfig.tts.model.ref_audio,
        prompt_text: mockConfig.tts.model.ref_text,
        prompt_lang: 'ja',
        top_k: mockConfig.tts.params.top_k,
        top_p: mockConfig.tts.params.top_p,
        temperature: mockConfig.tts.params.temperature,
        speed_factor: mockConfig.tts.params.speed_factor,
        sample_steps: mockConfig.tts.params.sample_steps,
        super_sampling: mockConfig.tts.params.super_sampling,
        batch_size: mockConfig.tts.params.batch_size,
        streaming_mode: false,
      }),
      expect.objectContaining({
        responseType: 'arraybuffer',
        timeout: 60000,
      })
    );
  });

  test('graceful degradation returns null instead of throwing', async () => {
    mockedAxios.post.mockRejectedValue(new Error('Network timeout'));

    // Should not throw
    await expect(synthesizeSpeech('テスト', mockConfig)).resolves.toBeNull();
  });
});
