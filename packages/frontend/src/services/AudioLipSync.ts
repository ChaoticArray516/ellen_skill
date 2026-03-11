/**
 * Audio Lip Sync Service for Ellen Skill Frontend
 *
 * Handles audio playback and real-time lip synchronization using Web Audio API.
 * Analyzes audio frequency data to drive Live2D mouth movements.
 */

/**
 * Lip sync callback type
 * @param value - Mouth openness value (0.0 to 1.0)
 */
export type LipSyncCallback = (value: number) => void;

/**
 * Audio lip sync manager
 *
 * Features:
 * - AudioContext initialization (must be triggered by user interaction)
 * - Base64 WAV audio playback
 * - Real-time frequency analysis for lip sync
 * - Proper resource cleanup
 */
export class AudioLipSync {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private isPlaying = false;
  private lipSyncCallback: LipSyncCallback | null = null;
  private animationFrameId: number | null = null;

  /**
   * Initializes the AudioContext
   *
   * IMPORTANT: Must be called in response to user interaction
   * (e.g., button click) due to browser autoplay policies.
   *
   * @returns {boolean} Whether initialization succeeded
   */
  initialize(): boolean {
    if (this.audioContext) {
      return true;
    }

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) {
        console.error('[AudioLipSync] Web Audio API not supported');
        return false;
      }

      this.audioContext = new AudioContextClass();

      // Create analyser for lip sync
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;

      // Create gain node for volume control
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = 1.0;

      // Connect: source -> analyser -> gain -> destination
      this.analyser.connect(this.gainNode);
      this.gainNode.connect(this.audioContext.destination);

      console.log('[AudioLipSync] AudioContext initialized');
      return true;
    } catch (error) {
      console.error('[AudioLipSync] Failed to initialize:', error);
      return false;
    }
  }

  /**
   * Checks if AudioContext is initialized
   *
   * @returns {boolean} Whether initialized
   */
  isInitialized(): boolean {
    return this.audioContext !== null && this.audioContext.state !== 'closed';
  }

  /**
   * Plays Base64-encoded WAV audio with lip sync
   *
   * @param {string} base64Audio - Base64 encoded WAV data
   * @param {number} sampleRate - Audio sample rate (typically 32000 for V4)
   * @param {LipSyncCallback} lipSyncCallback - Called with mouth openness value (0-1)
   * @returns {Promise<void>} Resolves when playback completes
   */
  async playAudio(
    base64Audio: string,
    _sampleRate: number,
    lipSyncCallback: LipSyncCallback
  ): Promise<void> {
    if (!this.audioContext) {
      throw new Error('[AudioLipSync] AudioContext not initialized. Call initialize() first.');
    }

    // Resume context if suspended (browser policy)
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    // Stop any currently playing audio
    this.stop();

    this.lipSyncCallback = lipSyncCallback;

    try {
      // Decode base64 to array buffer
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Decode audio data
      const audioBuffer = await this.audioContext.decodeAudioData(bytes.buffer);

      // Create source node
      this.source = this.audioContext.createBufferSource();
      this.source.buffer = audioBuffer;

      // Connect source to analyser
      this.source.connect(this.analyser!);

      // Start playback
      this.source.start(0);
      this.isPlaying = true;

      // Start lip sync loop
      this.startLipSyncLoop();

      // Handle playback completion
      return new Promise((resolve) => {
        this.source!.onended = () => {
          this.isPlaying = false;
          this.stopLipSyncLoop();
          this.lipSyncCallback?.(0); // Close mouth
          resolve();
        };
      });
    } catch (error) {
      console.error('[AudioLipSync] Failed to play audio:', error);
      this.isPlaying = false;
      throw error;
    }
  }

  /**
   * Stops current audio playback
   */
  stop(): void {
    if (this.source) {
      try {
        this.source.stop();
      } catch (e) {
        // Ignore errors from already stopped source
      }
      this.source.disconnect();
      this.source = null;
    }

    this.isPlaying = false;
    this.stopLipSyncLoop();
    this.lipSyncCallback?.(0); // Close mouth
  }

  /**
   * Sets playback volume
   *
   * @param {number} volume - Volume level (0.0 to 1.0)
   */
  setVolume(volume: number): void {
    if (this.gainNode) {
      this.gainNode.gain.value = Math.max(0, Math.min(1, volume));
    }
  }

  /**
   * Starts the lip sync analysis loop
   */
  private startLipSyncLoop(): void {
    if (!this.analyser || !this.lipSyncCallback) return;

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const updateLipSync = () => {
      if (!this.isPlaying || !this.analyser) return;

      // Get frequency data
      this.analyser.getByteFrequencyData(dataArray);

      // Calculate average amplitude (focus on speech frequencies)
      // Speech is typically in 200Hz - 4000Hz range
      let sum = 0;
      let count = 0;

      // Use lower frequency bins for speech detection
      // Skip very low frequencies (below ~200Hz)
      const startBin = Math.floor(bufferLength * 0.05);
      const endBin = Math.floor(bufferLength * 0.5);

      for (let i = startBin; i < endBin; i++) {
        sum += dataArray[i];
        count++;
      }

      const average = sum / count;

      // Map to mouth openness (0.0 to 1.0)
      // Normalize: typical audio values are 0-255
      const normalizedValue = average / 255;

      // Apply curve for more natural movement
      // Use power curve to make quieter sounds more visible
      const mouthOpenness = Math.pow(normalizedValue, 0.7);

      this.lipSyncCallback!(mouthOpenness);

      this.animationFrameId = requestAnimationFrame(updateLipSync);
    };

    updateLipSync();
  }

  /**
   * Stops the lip sync analysis loop
   */
  private stopLipSyncLoop(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Cleans up all audio resources
   */
  dispose(): void {
    this.stop();

    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }

    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    console.log('[AudioLipSync] Resources disposed');
  }
}
