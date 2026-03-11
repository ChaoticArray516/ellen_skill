/**
 * Audio Cache Module for Ellen Skill
 *
 * Provides LRU (Least Recently Used) + TTL (Time To Live) caching for TTS results.
 * Prevents redundant TTS inference by caching audio data based on text and expression.
 */

import * as crypto from 'crypto';
import { TTSResult } from './types';

/**
 * Cache entry structure
 */
interface CacheEntry {
  /** Base64 encoded audio data */
  audioData: string;
  /** Sample rate in Hz */
  sampleRate: number;
  /** Audio duration in seconds */
  duration: number;
  /** Timestamp when entry was created */
  timestamp: number;
}

/**
 * Audio cache with LRU and TTL support
 *
 * Features:
 * - SHA256-based cache keys for fast lookup
 * - LRU eviction when cache is full
 * - TTL expiration for stale entries
 * - Automatic cleanup of expired entries
 */
export class AudioCache {
  private cache: Map<string, CacheEntry>;
  private maxSize: number;
  private ttl: number; // milliseconds
  private cleanupInterval: NodeJS.Timeout | null = null;

  /**
   * Creates a new audio cache
   *
   * @param {number} [maxSize=50] - Maximum number of cached entries
   * @param {number} [ttlMinutes=30] - Time-to-live in minutes
   */
  constructor(maxSize = 50, ttlMinutes = 30) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttl = ttlMinutes * 60 * 1000;
  }

  /**
   * Generates cache key from text and expression
   *
   * Uses SHA256 hash of "text:expressionId" for unique identification.
   *
   * @param {string} text - The text that was synthesized
   * @param {string} expressionId - The expression ID used
   * @returns {string} 16-character hex hash
   */
  private generateKey(text: string, expressionId: string): string {
    return crypto
      .createHash('sha256')
      .update(`${text}:${expressionId}`)
      .digest('hex')
      .slice(0, 16);
  }

  /**
   * Retrieves cached TTS result
   *
   * @param {string} text - The text to look up
   * @param {string} expressionId - The expression ID
   * @returns {TTSResult | null} Cached result or null if not found/expired
   */
  get(text: string, expressionId: string): TTSResult | null {
    const key = this.generateKey(text, expressionId);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if entry has expired
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return {
      audioData: entry.audioData,
      sampleRate: entry.sampleRate,
      duration: entry.duration,
      motionId: '', // Not stored in cache
      expressionId, // Return the requested expression
      text, // Return the requested text
    };
  }

  /**
   * Stores TTS result in cache
   *
   * @param {string} text - The text that was synthesized
   * @param {string} expressionId - The expression ID used
   * @param {TTSResult} result - The TTS result to cache
   */
  set(text: string, expressionId: string, result: TTSResult): void {
    // LRU eviction: remove oldest entry if cache is full
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }

    const key = this.generateKey(text, expressionId);
    this.cache.set(key, {
      audioData: result.audioData,
      sampleRate: result.sampleRate,
      duration: result.duration,
      timestamp: Date.now(),
    });
  }

  /**
   * Starts automatic cleanup of expired entries
   *
   * Runs every 5 minutes by default.
   *
   * @param {number} [intervalMinutes=5] - Cleanup interval in minutes
   */
  startCleanup(intervalMinutes = 5): void {
    if (this.cleanupInterval) {
      return;
    }

    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, intervalMinutes * 60 * 1000);
  }

  /**
   * Stops automatic cleanup
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Manually cleans up expired entries
   *
   * @returns {number} Number of entries removed
   */
  cleanup(): number {
    const now = Date.now();
    let removedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttl) {
        this.cache.delete(key);
        removedCount++;
      }
    }

    return removedCount;
  }

  /**
   * Clears all cached entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Gets current cache size
   *
   * @returns {number} Number of cached entries
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Gets cache statistics
   *
   * @returns {object} Cache stats
   */
  getStats(): {
    size: number;
    maxSize: number;
    ttlMinutes: number;
  } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      ttlMinutes: this.ttl / 60000,
    };
  }
}
