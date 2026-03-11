/**
 * Expression Controller for Ellen Skill Frontend
 *
 * Maps Ellen emotion IDs to Live2D model parameter values.
 * Handles smooth transitions between expressions.
 */

import { EllenEmotion, ExpressionParams } from '../types';

/**
 * Ellen emotion parameter mappings for Live2D
 *
 * These values are tuned for the Shark model and control various
 * facial features like eye openness, brow position, and mouth shape.
 */
const ELLEN_EMOTIONS: Record<EllenEmotion, ExpressionParams> = {
  lazy: {
    eyeOpenL: 0.5,
    eyeOpenR: 0.5,
    mouthForm: -0.2,
    angleY: -5,
    browLY: 0.1,
    browRY: 0.1,
  },
  maid: {
    eyeOpenL: 0.9,
    eyeOpenR: 0.9,
    eyeSmileL: 0.3,
    mouthForm: 0.4,
    browLY: 0.0,
    browRY: 0.0,
  },
  predator: {
    eyeOpenL: 1.0,
    browLY: -0.6,
    browRY: -0.6,
    mouthForm: -0.3,
    mouthOpen: 0.2,
  },
  hangry: {
    eyeOpenL: 0.7,
    browLAngle: -0.4,
    mouthOpen: 0.3,
    angleZ: 5,
    eyeOpenR: 0.7,
  },
  shy: {
    eyeOpenL: 0.6,
    eyeSmileL: 0.2,
    mouthForm: 0.1,
    angleZ: -8,
    eyeOpenR: 0.6,
    cheekRed: 0.5,
  },
  surprised: {
    eyeOpenL: 1.0,
    browLY: 0.6,
    browRY: 0.6,
    mouthOpen: 0.5,
    eyeOpenR: 1.0,
  },
  happy: {
    eyeOpenL: 0.9,
    eyeSmileL: 0.7,
    mouthForm: 0.8,
    browLY: 0.3,
    eyeSmileR: 0.7,
    eyeOpenR: 0.9,
  },
};

/**
 * Expression controller for managing Live2D facial expressions
 *
 * Features:
 * - Smooth transitions between expressions
 * - Mouth control for lip sync
 * - Parameter mapping for Shark model
 */
export class ExpressionController {
  private currentExpression: EllenEmotion = 'lazy';
  private targetParams: ExpressionParams = {};
  private currentParams: ExpressionParams = {};
  private transitionStartTime = 0;
  private transitionDuration = 0;
  private isTransitioning = false;

  /**
   * Applies an expression to the Live2D model
   *
   * @param {EllenEmotion} expressionId - The emotion to apply
   * @param {number} [duration=800] - Transition duration in milliseconds
   */
  applyExpression(expressionId: string, duration = 800): void {
    // Validate expression ID
    const validEmotion = this.validateExpressionId(expressionId);

    if (validEmotion === this.currentExpression && !this.isTransitioning) {
      return; // No change needed
    }

    this.currentExpression = validEmotion;
    this.targetParams = { ...ELLEN_EMOTIONS[validEmotion] };
    this.transitionStartTime = Date.now();
    this.transitionDuration = duration;
    this.isTransitioning = true;

    console.log('[ExpressionController] Applying expression:', validEmotion);
  }

  /**
   * Sets mouth openness for lip sync
   *
   * @param {number} value - Mouth openness (0.0 to 1.0)
   */
  setMouthOpen(value: number): void {
    this.targetParams.mouthOpen = Math.max(0, Math.min(1, value));
  }

  /**
   * Updates expression parameters (call in animation loop)
   *
   * @returns {ExpressionParams | null} Current parameter values or null if no change
   */
  update(): ExpressionParams | null {
    if (!this.isTransitioning) {
      // Check if mouth needs updating during speech
      if (this.targetParams.mouthOpen !== this.currentParams.mouthOpen) {
        this.currentParams.mouthOpen = this.targetParams.mouthOpen;
        return { ...this.currentParams };
      }
      return null;
    }

    const elapsed = Date.now() - this.transitionStartTime;
    const progress = Math.min(1, elapsed / this.transitionDuration);

    // Ease-out curve for smooth transition
    const easedProgress = 1 - Math.pow(1 - progress, 3);

    // Interpolate all parameters
    const result: ExpressionParams = {};

    // Get all parameter keys from both current and target
    const allKeys = new Set([
      ...Object.keys(this.currentParams),
      ...Object.keys(this.targetParams),
    ]);

    allKeys.forEach((key) => {
      const current = this.currentParams[key] ?? 0;
      const target = this.targetParams[key] ?? 0;
      result[key] = current + (target - current) * easedProgress;
    });

    this.currentParams = result;

    if (progress >= 1) {
      this.isTransitioning = false;
    }

    return result;
  }

  /**
   * Gets the current expression ID
   *
   * @returns {string} Current expression
   */
  getCurrentExpression(): string {
    return this.currentExpression;
  }

  /**
   * Resets to default expression
   *
   * @param {number} [duration=800] - Transition duration
   */
  resetToDefault(duration = 800): void {
    this.applyExpression('lazy', duration);
  }

  /**
   * Validates and normalizes expression ID
   *
   * @param {string} expressionId - Expression ID to validate
   * @returns {EllenEmotion} Valid expression
   */
  private validateExpressionId(expressionId: string): EllenEmotion {
    const validEmotions: EllenEmotion[] = [
      'lazy',
      'maid',
      'predator',
      'hangry',
      'shy',
      'surprised',
      'happy',
    ];

    if (validEmotions.includes(expressionId as EllenEmotion)) {
      return expressionId as EllenEmotion;
    }

    console.warn(
      '[ExpressionController] Invalid expression ID, defaulting to lazy:',
      expressionId
    );
    return 'lazy';
  }
}
