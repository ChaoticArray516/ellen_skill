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
}: Live2DCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const appRef = useRef<Application | null>(null);
  const modelRef = useRef<Live2DModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Initialize Live2D
   */
  const initLive2D = useCallback(async () => {
    if (!canvasRef.current) return;

    try {
      setLoading(true);
      setError(null);

      console.log('[Live2DCanvas] Checking Cubism Core...');
      // Check if Cubism Core is loaded
      if (typeof window === 'undefined' || !window.Live2DCubismCore) {
        throw new Error('Live2D Cubism Core not loaded. Please check your internet connection.');
      }

      // Create PIXI application
      const app = new Application({
        view: canvasRef.current,
        width,
        height,
        backgroundAlpha: 0,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
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
      model.x = width / 2;
      model.y = height / 2 + 150;
      model.scale.set(0.2);
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
  }, [modelPath, width, height, expressionId]);

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
   * Change motion (safe version for models without motion files)
   */
  useEffect(() => {
    if (!modelRef.current) return;
    const model = modelRef.current;
    const motionManager = (model.internalModel as unknown as Live2DInternalModel)?.motionManager;

    if (!motionManager?.definitions || Object.keys(motionManager.definitions).length === 0) {
      // Model has no motion files, skip (shark model has no .motion3.json)
      return;
    }
    // Motion call when available: model.motion(group, index, priority)
    const group = Object.keys(motionManager.definitions)[0];
    model.motion(group, 0).catch(() => {});
  }, [motionId]);

  /**
   * Initialize on mount
   */
  useEffect(() => {
    // Delay initialization to ensure SDK scripts are loaded
    const timer = setTimeout(() => {
      initLive2D();
    }, 100);

    return () => {
      clearTimeout(timer);
      appRef.current?.destroy(true);
    };
  }, [initLive2D]);

  return (
    <div style={{ position: 'relative', width, height }}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{
          width: `${width}px`,
          height: `${height}px`,
          borderRadius: '8px',
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
