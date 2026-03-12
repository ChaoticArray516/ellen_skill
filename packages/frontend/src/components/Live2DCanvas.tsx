/**
 * Live2D Canvas Component
 *
 * Renders the Live2D Shark model with expression and motion control.
 * Uses pixi-live2d-display for model loading and rendering.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { Application, Ticker } from 'pixi.js';
import { Live2DModel } from 'pixi-live2d-display/cubism4';

// Global type extensions for Live2D
 declare global {
   interface Window {
     Live2DCubismCore: unknown;
     __LIVE2D_DEBUG__: {
       app: unknown;
       model: unknown;
       internalModel: unknown;
     };
   }
 }

 // Live2D internal model type (internal structure not fully exported by pixi-live2d-display)
 interface Live2DInternalModel {
   coreModel?: {
     setParameterValueById?: (id: string, value: number) => void;
   };
   motionManager?: {
     definitions?: Record<string, unknown[]>;
     expressionManager?: unknown;
   };
   originalWidth?: number;
   originalHeight?: number;
 }

/**
 * Props for Live2DCanvas component
 */
interface Live2DCanvasProps {
  /** Model JSON path */
  modelPath: string;
  /** Current motion ID */
  motionId?: string;
  /** Expression ID (e.g., 'lazy', 'shy', 'angry') */
  expressionId?: string;
  /** Hit callback when model is clicked */
  onHit?: (hitAreas: string[]) => void;
  /** Canvas width */
  width?: number;
  /** Canvas height */
  height?: number;
  /** Enable auto-fit to container */
  autoFit?: boolean;
}

// Emotion ID to shark.model3.json expression name mapping
const EMOTION_TO_EXPRESSION: Record<string, string> = {
  lazy: 'mouth_left',
  maid: 'holding_lollipop',
  predator: 'angry',
  hangry: 'angry',
  shy: 'blush',
  surprised: 'stunned',
  happy: 'mouth_right',
};

// Motion animation configuration (for models without .motion3.json files)
interface MotionAnimation {
  breathAmplitude: number;   // Breath amplitude (0-1)
  bodySwayX: number;         // Body left-right sway amplitude (-10 to 10)
  bodySwayZ: number;         // Body rotation amplitude
  headSwayX: number;         // Head left-right rotation amplitude (-30 to 30)
  headSwayY: number;         // Head up-down rotation amplitude
  speedMultiplier: number;   // Animation speed multiplier
}

const MOTION_ANIMATIONS: Record<string, MotionAnimation> = {
  idle: {
    breathAmplitude: 0.3,    // Light breathing
    bodySwayX: 1.5,          // Minimal body sway (lazy standby)
    bodySwayZ: 0.8,
    headSwayX: 3.0,          // Small head movement
    headSwayY: 1.5,
    speedMultiplier: 0.6,    // Slow (lazy feeling)
  },
  idle2: {
    breathAmplitude: 0.5,    // Deeper breathing
    bodySwayX: 3.0,          // Larger sway (dynamic when speaking)
    bodySwayZ: 1.5,
    headSwayX: 6.0,          // Larger head movement
    headSwayY: 3.0,
    speedMultiplier: 1.0,    // Normal speed
  },
};

/**
 * Live2D Canvas component
 *
 * Renders Ellen's Live2D model with expression support.
 */
export function Live2DCanvas({
  modelPath,
  motionId = 'idle',
  expressionId = 'lazy',
  onHit,
  width = 800,
  height = 600,
  autoFit = false,
}: Live2DCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const modelRef = useRef<Live2DModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [containerSize, setContainerSize] = useState({ width, height });
  const animationTickerRef = useRef<((delta: number) => void) | null>(null);

  /**
   * Calculate optimal model scale based on container size
   */
  const calcAutoFitScale = useCallback((containerWidth: number, containerHeight: number) => {
    // Ellen's model original size reference (approximate)
    // The model is very tall (full body), so we need a smaller scale to fit upper body
    const baseWidth = 1200;
    const baseHeight = 1600;

    // Calculate scale to fit within container
    // Use smaller ratio (0.4) to make model fit better and show upper body
    const scaleX = (containerWidth * 0.4) / baseWidth;
    const scaleY = (containerHeight * 0.4) / baseHeight;

    // Use the smaller scale to ensure model fits within both dimensions
    // Use smaller bounds (0.08 to 0.15) for a more zoomed-out view
    const scale = Math.min(scaleX, scaleY);
    return Math.max(0.08, Math.min(0.15, scale));
  }, []);

  /**
   * Monitor container size changes using ResizeObserver
   */
  useEffect(() => {
    if (!autoFit || !containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const { width: newWidth, height: newHeight } = entry.contentRect;
        setContainerSize({ width: newWidth, height: newHeight });

        // Update PIXI app and model if already initialized
        if (appRef.current && modelRef.current) {
          appRef.current.renderer.resize(newWidth, newHeight);

          const model = modelRef.current;
          const newScale = calcAutoFitScale(newWidth, newHeight);
          model.x = newWidth / 2;
          // Position model to show upper body including head
          // Position at 60% of container height to center the model better
          model.y = newHeight * 0.6;
          model.scale.set(newScale);
        }
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [autoFit, calcAutoFitScale]);

  /**
   * Initialize Live2D
   */
  const initLive2D = useCallback(async () => {
    if (!canvasRef.current) return;

    // Prevent re-initialization if already initialized
    if (appRef.current) {
      console.log('[Live2DCanvas] Already initialized, skipping...');
      return;
    }

    // When autoFit is enabled, get dimensions from container ref directly
    let canvasWidth = width;
    let canvasHeight = height;

    if (autoFit) {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        canvasWidth = Math.floor(rect.width);
        canvasHeight = Math.floor(rect.height);
      }

      // Wait for container to have valid size
      if (canvasWidth === 0 || canvasHeight === 0) {
        console.log('[Live2DCanvas] Waiting for container resize...', { canvasWidth, canvasHeight });
        return;
      }
    }

    console.log('[Live2DCanvas] Initializing with dimensions:', { canvasWidth, canvasHeight, autoFit });

    try {
      setLoading(true);
      setError(null);

      console.log('[Live2DCanvas] Checking Cubism Core...');
      // Check if Cubism Core is loaded
      if (typeof window === 'undefined' || !window.Live2DCubismCore) {
        throw new Error('Live2D Cubism Core not loaded. Please check your internet connection.');
      }

      // Validate dimensions
      if (canvasWidth <= 0 || canvasHeight <= 0) {
        throw new Error(`Invalid canvas dimensions: ${canvasWidth}x${canvasHeight}`);
      }

      // Create PIXI application
      const app = new Application({
        view: canvasRef.current,
        width: canvasWidth,
        height: canvasHeight,
        backgroundAlpha: 0,
        antialias: true,
        resolution: 1, // Use fixed resolution to avoid DPI scaling issues
        autoDensity: false,
      });
      appRef.current = app;

      console.log('[Live2DCanvas] Loading model from:', modelPath);

      // Start the PIXI application ticker to enable automatic rendering
      app.start();

      // Register PIXI Ticker with Live2DModel for automatic updates
      try {
        Live2DModel.registerTicker(Ticker);
      } catch (e) {
        console.warn('[Live2DCanvas] Failed to register ticker:', e);
      }

      // Force initial render to make model visible immediately
      app.renderer.render(app.stage);

      // Load Live2D model using pixi-live2d-display Cubism 4
      const model = await Live2DModel.from(modelPath);
      modelRef.current = model;

      // Add model to stage
      app.stage.addChild(model);

      // Position and scale the model to show Ellen's upper body
      const scale = autoFit ? calcAutoFitScale(canvasWidth, canvasHeight) : 0.12;
      model.x = canvasWidth / 2;
      // Position model to show upper body including head
      // Position at 60% of container height to center the model better
      model.y = canvasHeight * 0.6;
      model.scale.set(scale);
      model.anchor.set(0.5, 0.5);

      // Apply default expression
      const defaultExpression = EMOTION_TO_EXPRESSION[expressionId] ?? 'mouth_left';
      model.expression(defaultExpression);

      setLoading(false);
      console.log('[Live2DCanvas] Live2D initialized successfully');
      console.log('[Live2DCanvas] Model info:', {
        x: model.x,
        y: model.y,
        scale: model.scale?.x,
        visible: model.visible,
        alpha: model.alpha,
        hasInternalModel: !!model.internalModel,
      });

      // Expose for debugging
      window.__LIVE2D_DEBUG__ = {
        app,
        model,
        internalModel: model.internalModel,
      };

      // Enable PIXI interaction system
      app.renderer.plugins.interaction.moveWhenInside = true;

      // Set model as interactive
      model.interactive = true;
      (model as unknown as { buttonMode?: boolean }).buttonMode = true;

      // Mouse move: gaze follow
      const canvasEl = canvasRef.current!;
      canvasEl.addEventListener('pointermove', (e: PointerEvent) => {
        if (!modelRef.current || !canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        modelRef.current.focus(x, y);
      });

      // Mouse click: hit detection
      canvasEl.addEventListener('pointerdown', (e: PointerEvent) => {
        if (!modelRef.current || !canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        modelRef.current.tap(x, y);
      });

      // Listen for hit events
      model.on('hit', (hitAreas: string[]) => {
        console.log('[Live2DCanvas] Hit areas:', hitAreas);
        onHit?.(hitAreas);
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      console.error('[Live2DCanvas] Initialization failed:', errorMsg);
      setError(errorMsg);
      setLoading(false);
    }
  }, [modelPath, width, height, expressionId, autoFit, calcAutoFitScale]);

  /**
   * Initialize on mount when autoFit is enabled
   */
  useEffect(() => {
    if (!autoFit) return;

    // Wait for container to have valid size
    if (containerSize.width > 0 && containerSize.height > 0 && !appRef.current) {
      console.log('[Live2DCanvas] Container has valid size, triggering init...', containerSize);
      initLive2D();
    }
  }, [autoFit, containerSize, initLive2D]);

  /**
   * Listen for expression changes and apply via pixi-live2d-display ExpressionManager
   */
  useEffect(() => {
    if (!modelRef.current) return;
    const model = modelRef.current;
    const mappedExpression = EMOTION_TO_EXPRESSION[expressionId] ?? 'mouth_left';
    // model.expression(name) internally calls ExpressionManager.setExpression(name)
    // name must exactly match Expressions[].Name in shark.model3.json
    model.expression(mappedExpression).then((success) => {
      if (success) {
        console.log('[Live2DCanvas] Expression applied:', mappedExpression, '(from:', expressionId, ')');
      } else {
        console.warn('[Live2DCanvas] Expression not found:', mappedExpression);
      }
    }).catch((err) => {
      console.warn('[Live2DCanvas] Expression error:', err);
    });
  }, [expressionId]);

  /**
   * Motion animation: Use PIXI Ticker to drive parameter animations (alternative to missing .motion3.json)
   */
  useEffect(() => {
    if (!modelRef.current || !appRef.current) return;
    const app = appRef.current;

    // Remove old animation ticker
    if (animationTickerRef.current) {
      app.ticker.remove(animationTickerRef.current);
      animationTickerRef.current = null;
    }

    const config = MOTION_ANIMATIONS[motionId] ?? MOTION_ANIMATIONS['idle'];

    // Animation start time (for phase calculation to avoid parameter synchronization)
    const startTime = performance.now();

    const ticker = () => {
      // Always get the latest model ref and coreModel inside the ticker
      // to avoid stale closure issues when motionId changes
      const currentModelRef = modelRef.current;
      if (!currentModelRef?.internalModel) return;

      const coreModel = (currentModelRef.internalModel as unknown as Live2DInternalModel).coreModel;
      if (!coreModel?.setParameterValueById) return;

      const t = (performance.now() - startTime) / 1000; // Convert to seconds
      const s = config.speedMultiplier;

      // Breathing animation (4 second period)
      const breath = (Math.sin(t * s * Math.PI * 0.5) + 1) / 2 * config.breathAmplitude;
      coreModel.setParameterValueById('ParamBreath', breath);

      // Body left-right sway (6 second period, out of phase with breathing)
      const bodyX = Math.sin(t * s * Math.PI * 0.33 + 0.5) * config.bodySwayX;
      coreModel.setParameterValueById('ParamBodyAngleX', bodyX);

      // Body rotation (8 second period)
      const bodyZ = Math.sin(t * s * Math.PI * 0.25 + 1.0) * config.bodySwayZ;
      coreModel.setParameterValueById('ParamBodyAngleZ', bodyZ);

      // Head left-right rotation (5 second period, out of phase with body)
      const headX = Math.sin(t * s * Math.PI * 0.4 + 0.8) * config.headSwayX;
      coreModel.setParameterValueById('ParamAngleX', headX);

      // Head up-down rotation (7 second period)
      const headY = Math.sin(t * s * Math.PI * 0.286 + 1.5) * config.headSwayY;
      coreModel.setParameterValueById('ParamAngleY', headY);
    };

    animationTickerRef.current = ticker;
    app.ticker.add(ticker);

    // Cleanup: Remove ticker when component unmounts or motionId changes
    return () => {
      if (animationTickerRef.current && appRef.current) {
        appRef.current.ticker.remove(animationTickerRef.current);
        animationTickerRef.current = null;
      }
    };
  }, [motionId]);

  /**
   * Initialize on mount
   */
  useEffect(() => {
    // When autoFit is enabled, wait for ResizeObserver to provide valid dimensions
    if (autoFit) return;

    // Delay initialization to ensure SDK scripts are loaded
    const timer = setTimeout(() => {
      initLive2D();
    }, 100);

    return () => {
      clearTimeout(timer);
      appRef.current?.destroy(true);
    };
  }, [initLive2D, autoFit]);

  // Use dynamic or fixed dimensions based on autoFit mode
  const displayWidth = autoFit ? '100%' : width;
  const displayHeight = autoFit ? '100%' : height;
  const canvasWidth = autoFit ? containerSize.width : width;
  const canvasHeight = autoFit ? containerSize.height : height;

  return (
    <div ref={containerRef} style={{ position: 'relative', width: displayWidth, height: displayHeight }}>
      <canvas
        ref={canvasRef}
        width={canvasWidth}
        height={canvasHeight}
        style={{
          width: displayWidth,
          height: displayHeight,
          borderRadius: '8px',
          display: 'block',
        }}
      />
      {loading && (
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(0,0,0,0.5)',
          borderRadius: '8px',
          color: 'white',
          fontSize: '16px',
        }}>
          Loading Live2D Model...
        </div>
      )}
      {error && (
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(200,0,0,0.8)',
          borderRadius: '8px',
          color: 'white',
          fontSize: '14px',
          padding: '20px',
          textAlign: 'center',
        }}>
          <div>
            <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>Error Loading Model</div>
            <div>{error}</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Live2DCanvas;
