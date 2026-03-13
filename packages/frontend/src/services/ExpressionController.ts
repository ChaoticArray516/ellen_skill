/**
 * ExpressionController - Shark Model Expression System
 *
 * Architecture (dual-track approach, inspired by SoulLink_Live2D):
 * Track 1: Native expression files via model.expression(name)
 *   - Handles Shark-specific params: Param40(blush), Param2(stunned),
 *     Param39(dark face), Param14(angry), Param13(sweat), etc.
 *   - These params are ONLY accessible via the expression JSON files
 * Track 2: Facial parameter overlay via setParameterValueById
 *   - Controls: ParamEyeLOpen, ParamEyeROpen, ParamBrowLY/RY,
 *     ParamMouthForm, ParamMouthOpenY, ParamAngleZ, etc.
 *   - Applied on top of native expression for composite effect
 *
 * Shark model expression files (12 available):
 *   angry, blush, empty_hand, holding_lollipop, lollipop,
 *   mouth_left, mouth_right, outfit, plate, stunned, sunglasses, sweat
 *
 * Emotion to Expression mapping (7 LLM emotions to Shark expressions):
 *   lazy      -> (none) + droopy eyes + slight frown
 *   maid      -> (none) + professional smile + attentive brows
 *   predator  -> angry + narrowed eyes + intense brows
 *   hangry    -> sweat + open mouth + angled head
 *   shy       -> blush + averted eyes + head tilt
 *   surprised -> stunned + wide eyes + raised brows
 *   happy     -> blush(light) + smile eyes + raised brows
 */

export type EllenEmotion =
  | 'lazy'
  | 'maid'
  | 'predator'
  | 'hangry'
  | 'shy'
  | 'surprised'
  | 'happy';

/** Native expression file name to use (or null for none) */
type NativeExpression =
  | 'angry'
  | 'blush'
  | 'stunned'
  | 'sweat'
  | 'sunglasses'
  | 'mouth_left'
  | 'mouth_right'
  | null;

/** Facial parameter overlay (applied on top of native expression) */
interface FacialParams {
  ParamEyeLOpen?: number;    // 0.0 (closed) - 1.0 (open)
  ParamEyeROpen?: number;
  ParamBrowLY?: number;      // -1.0 (down) - 1.0 (up)
  ParamBrowRY?: number;
  ParamBrowLAngle?: number;  // -1.0 - 1.0
  ParamBrowRAngle?: number;
  ParamMouthForm?: number;   // -1.0 (frown) - 1.0 (smile)
  ParamMouthOpenY?: number;  // 0.0 (closed) - 1.0 (open)
  ParamAngleZ?: number;      // head tilt degrees
  ParamAngleX?: number;      // head turn degrees
  ParamAngleY?: number;      // head nod degrees
}

interface EmotionConfig {
  /** Native Shark expression file to activate */
  nativeExpression: NativeExpression;
  /** Facial parameter overlay */
  facialParams: FacialParams;
  /** Transition duration in milliseconds */
  duration: number;
  /** Brief description for debugging */
  description: string;
}

/**
 * Complete emotion configuration for Shark model.
 * Each emotion uses the dual-track approach:
 * 1. nativeExpression: activates Shark's built-in expression file
 * 2. facialParams: overlays additional facial parameters
 */
const EMOTION_CONFIGS: Record<EllenEmotion, EmotionConfig> = {
  lazy: {
    nativeExpression: null,
    facialParams: {
      ParamEyeLOpen: 0.45,      // Half-closed eyes (sleepy)
      ParamEyeROpen: 0.45,
      ParamBrowLY: 0.0,
      ParamBrowRY: 0.0,
      ParamMouthForm: -0.15,    // Slight frown (bored)
      ParamAngleY: -3,          // Slight head droop
      ParamAngleZ: -2,          // Slight tilt
    },
    duration: 800,
    description: 'Lazy (half-closed eyes, slight frown)',
  },
  maid: {
    nativeExpression: null,
    facialParams: {
      ParamEyeLOpen: 0.85,      // Open, attentive eyes
      ParamEyeROpen: 0.85,
      ParamBrowLY: 0.1,         // Slightly raised brows (attentive)
      ParamBrowRY: 0.1,
      ParamMouthForm: 0.5,      // Professional smile
      ParamAngleY: 2,           // Slight upward look
      ParamAngleZ: 0,
    },
    duration: 600,
    description: 'Professional maid (smile, attentive)',
  },
  predator: {
    nativeExpression: 'angry',  // Activates Param14 (angry)
    facialParams: {
      ParamEyeLOpen: 0.7,       // Narrowed, intense eyes
      ParamEyeROpen: 0.7,
      ParamBrowLY: -0.7,        // Furrowed brows
      ParamBrowRY: -0.7,
      ParamBrowLAngle: -0.4,
      ParamBrowRAngle: -0.4,
      ParamMouthForm: -0.4,     // Slight snarl
      ParamMouthOpenY: 0.15,    // Slightly open (threatening)
      ParamAngleX: 5,           // Turn slightly (predatory gaze)
    },
    duration: 400,
    description: 'Predator mode (angry expression + furrowed brows + narrowed eyes)',
  },
  hangry: {
    nativeExpression: 'sweat',  // Activates Param13 (sweat)
    facialParams: {
      ParamEyeLOpen: 0.65,
      ParamEyeROpen: 0.65,
      ParamBrowLAngle: -0.3,    // Angled brows (frustrated)
      ParamBrowRAngle: -0.3,
      ParamMouthOpenY: 0.35,    // Open mouth (hungry/complaining)
      ParamMouthForm: -0.2,
      ParamAngleZ: 4,           // Head tilt (exasperated)
    },
    duration: 500,
    description: 'Hangry (sweat + open mouth + tilted head)',
  },
  shy: {
    nativeExpression: 'blush',  // Activates Param40 (blush)
    facialParams: {
      ParamEyeLOpen: 0.55,      // Slightly closed (embarrassed)
      ParamEyeROpen: 0.55,
      ParamBrowLY: 0.2,         // Slightly raised (surprised-shy)
      ParamBrowRY: 0.2,
      ParamMouthForm: 0.1,      // Tiny smile
      ParamAngleZ: -10,         // Head tilt (shy gesture)
      ParamAngleY: -5,          // Look slightly down
    },
    duration: 700,
    description: 'Shy (blush + lowered head + tilt)',
  },
  surprised: {
    nativeExpression: 'stunned', // Activates Param2 (stunned)
    facialParams: {
      ParamEyeLOpen: 1.0,       // Wide open eyes
      ParamEyeROpen: 1.0,
      ParamBrowLY: 0.7,         // Raised brows
      ParamBrowRY: 0.7,
      ParamMouthOpenY: 0.5,     // Open mouth (surprised)
      ParamMouthForm: 0.0,
      ParamAngleY: 3,           // Head slightly back
    },
    duration: 300,
    description: 'Surprised (stunned + wide eyes + open mouth)',
  },
  happy: {
    nativeExpression: 'blush',  // Light blush for happiness
    facialParams: {
      ParamEyeLOpen: 0.9,
      ParamEyeROpen: 0.9,
      ParamBrowLY: 0.35,        // Raised happy brows
      ParamBrowRY: 0.35,
      ParamMouthForm: 0.85,     // Big smile
      ParamMouthOpenY: 0.2,     // Slightly open (happy)
      ParamAngleY: 5,           // Head up (cheerful)
      ParamAngleZ: 3,           // Slight tilt (cute)
    },
    duration: 600,
    description: 'Happy (blush + big smile + raised head)',
  },
};

/** Callback type for applying native expression and facial params to Live2D model */
export interface ExpressionApplyCallbacks {
  /** Apply native expression file by name */
  applyNativeExpression: (name: string | null) => void;
  /** Set a parameter value by ID */
  setParameter: (id: string, value: number) => void;
}

/**
 * Expression controller for Shark model.
 * Manages emotion transitions with smooth parameter interpolation.
 */
export class ExpressionController {
  private currentEmotion: EllenEmotion = 'lazy';
  private targetParams: FacialParams = {};
  private currentParams: FacialParams = {};
  private transitionStartTime = 0;
  private transitionDuration = 0;
  private isTransitioning = false;
  private callbacks: ExpressionApplyCallbacks | null = null;

  /**
   * Registers Live2D model callbacks for expression application.
   * Must be called after model is loaded.
   */
  registerCallbacks(callbacks: ExpressionApplyCallbacks): void {
    this.callbacks = callbacks;
    // Apply current emotion immediately
    this.applyEmotion(this.currentEmotion, 0);
  }

  /**
   * Applies an emotion to the Live2D model.
   * Uses dual-track: native expression file + facial parameter overlay.
   *
   * @param emotionId - Emotion identifier (from LLM response tag)
   * @param duration - Transition duration in ms (0 = instant)
   */
  applyExpression(emotionId: string, duration?: number): void {
    const emotion = this.validateEmotion(emotionId);
    this.applyEmotion(emotion, duration);
  }

  private applyEmotion(emotion: EllenEmotion, duration?: number): void {
    const config = EMOTION_CONFIGS[emotion];
    const transitionMs = duration ?? config.duration;

    // Track 2: Set up facial parameter transition
    this.targetParams = { ...config.facialParams };
    this.transitionStartTime = Date.now();
    this.transitionDuration = transitionMs;
    this.isTransitioning = transitionMs > 0;
    this.currentEmotion = emotion;

    // Apply native expression immediately (no interpolation needed)
    if (this.callbacks) {
      this.callbacks.applyNativeExpression(config.nativeExpression);
    }

    if (transitionMs === 0) {
      // Instant apply
      this.currentParams = { ...this.targetParams };
      this.isTransitioning = false;
      this.applyCurrentParams();
    }
  }

  /**
   * Sets mouth openness for lip sync during TTS playback.
   */
  setMouthOpen(value: number): void {
    this.targetParams.ParamMouthOpenY = Math.max(0, Math.min(1, value));
    if (!this.isTransitioning) {
      this.currentParams.ParamMouthOpenY = this.targetParams.ParamMouthOpenY;
      this.callbacks?.setParameter('ParamMouthOpenY', this.currentParams.ParamMouthOpenY ?? 0);
    }
  }

  /**
   * Updates expression parameters (call in animation loop, ~60fps).
   * Returns true if parameters were updated this frame.
   */
  update(): boolean {
    if (!this.isTransitioning) return false;

    const elapsed = Date.now() - this.transitionStartTime;
    const progress = Math.min(1, elapsed / this.transitionDuration);
    const eased = 1 - Math.pow(1 - progress, 3); // Ease-out cubic

    // Interpolate all facial parameters
    const allKeys = new Set([
      ...Object.keys(this.currentParams),
      ...Object.keys(this.targetParams),
    ]) as Set<keyof FacialParams>;

    allKeys.forEach((key) => {
      const current = (this.currentParams[key] as number) ?? 0;
      const target = (this.targetParams[key] as number) ?? 0;
      (this.currentParams as Record<string, number>)[key] = current + (target - current) * eased;
    });

    this.applyCurrentParams();

    if (progress >= 1) {
      this.isTransitioning = false;
    }

    return true;
  }

  private applyCurrentParams(): void {
    if (!this.callbacks) return;
    Object.entries(this.currentParams).forEach(([id, value]) => {
      this.callbacks!.setParameter(id, value as number);
    });
  }

  getCurrentEmotion(): EllenEmotion {
    return this.currentEmotion;
  }

  resetToDefault(duration = 800): void {
    this.applyExpression('lazy', duration);
  }

  private validateEmotion(id: string): EllenEmotion {
    const valid: EllenEmotion[] = ['lazy', 'maid', 'predator', 'hangry', 'shy', 'surprised', 'happy'];
    if (valid.includes(id as EllenEmotion)) return id as EllenEmotion;
    console.warn('[ExpressionController] Unknown emotion, defaulting to lazy:', id);
    return 'lazy';
  }
}
