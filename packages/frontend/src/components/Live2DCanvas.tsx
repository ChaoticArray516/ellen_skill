/**
 * Live2D Canvas Component
 *
 * Renders the Live2D Shark model with expression and motion control.
 * Uses pixi-live2d-display for model loading and rendering.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { Application, Ticker } from 'pixi.js';
import { Live2DModel } from 'pixi-live2d-display';

/**
 * Props for Live2DCanvas component
 */
interface Live2DCanvasProps {
  /** Model JSON path */
  modelPath: string;
  /** Current motion ID */
  motionId?: string;
  /** Callback to get expression parameters */
  getExpressionParams?: () => Record<string, number> | null;
  /** Canvas width */
  width?: number;
  /** Canvas height */
  height?: number;
}

/**
 * Live2D Canvas component
 *
 * Renders Ellen's Live2D model with expression support.
 */
export function Live2DCanvas({
  modelPath,
  motionId = 'idle',
  getExpressionParams,
  width = 800,
  height = 600,
}: Live2DCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const appRef = useRef<Application | null>(null);
  const modelRef = useRef<Live2DModel | null>(null);
  const animationFrameRef = useRef<number | null>(null);
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
      if (typeof window === 'undefined' || !(window as Record<string, unknown>).Live2DCubismCore) {
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

      // Start update loop for expressions
      startUpdateLoop();

      setLoading(false);
      console.log('[Live2DCanvas] Live2D initialized successfully');
      console.log('[Live2DCanvas] Model info:', {
        x: model.x,
        y: model.y,
        scale: model.scale?.x,
        visible: model.visible,
        alpha: model.alpha,
        hasInternalModel: !!(model as Record<string, unknown>).internalModel,
      });

      // Expose for debugging
      (window as Record<string, unknown>).__LIVE2D_DEBUG__ = {
        app,
        model,
        internalModel: (model as Record<string, unknown>).internalModel,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      console.error('[Live2DCanvas] Initialization failed:', errorMsg);
      setError(errorMsg);
      setLoading(false);
    }
  }, [modelPath, width, height]);

  /**
   * Start the update loop for expressions and model updates
   */
  const startUpdateLoop = () => {
    const update = () => {
      if (!modelRef.current) return;

      // Update the Live2D model (needed for proper rendering)
      const model = modelRef.current;
      if (typeof model.update === 'function') {
        model.update(appRef.current?.ticker?.deltaMS || 16.67);
      }

      // Get current expression parameters
      const params = getExpressionParams?.();

      if (params) {
        // Apply expression parameters to Live2D model
        applyExpressionParams(model, params);
      }

      animationFrameRef.current = requestAnimationFrame(update);
    };

    update();
  };

  /**
   * Apply expression parameters to Live2D model
   */
  const applyExpressionParams = (model: Live2DModel, params: Record<string, number>) => {
    // Map common parameter names to Live2D parameter IDs
    const paramMapping: Record<string, string> = {
      eyeOpenL: 'ParamEyeLOpen',
      eyeOpenR: 'ParamEyeROpen',
      eyeSmileL: 'ParamEyeLSmile',
      eyeSmileR: 'ParamEyeRSmile',
      browLY: 'ParamBrowLY',
      browRY: 'ParamBrowRY',
      browLAngle: 'ParamBrowLAngle',
      mouthForm: 'ParamMouthForm',
      mouthOpen: 'ParamMouthOpenY',
      angleY: 'ParamAngleY',
      angleZ: 'ParamAngleZ',
      cheekRed: 'ParamCheekRed',
    };

    try {
      // Access Cubism 4 core model through internalModel
      const internalModel = (model as Record<string, unknown>).internalModel as Record<string, unknown> | undefined;
      const coreModel = internalModel?.coreModel as { setParameterValueById?: (id: string, value: number) => void } | undefined;

      if (!coreModel || typeof coreModel.setParameterValueById !== 'function') {
        return;
      }

      Object.entries(params).forEach(([key, value]) => {
        const paramId = paramMapping[key];
        if (paramId) {
          coreModel.setParameterValueById!(paramId, value);
        }
      });
    } catch (err) {
      // Silently ignore expression errors during initial load
    }
  };

  /**
   * Change motion
   */
  useEffect(() => {
    if (!modelRef.current) return;

    // Check if model has motion manager and motions loaded
    const model = modelRef.current;
    const motionManager = (model as Record<string, unknown>).internalModel?.motionManager;

    if (!motionManager || !motionManager.motionNames || motionManager.motionNames.length === 0) {
      console.log('[Live2DCanvas] No motions available on this model');
      return;
    }

    // Start the specified motion
    const motionIndex = motionId === 'idle2' ? 1 : 0;
    try {
      // Try to get available motion groups
      const motionNames = motionManager.motionNames;
      const motionName = motionNames[0] || 'Idle';
      model.motion(motionName, motionIndex);
      console.log('[Live2DCanvas] Started motion:', motionName, 'index:', motionIndex);
    } catch (error) {
      console.warn('[Live2DCanvas] Failed to start motion:', error);
    }
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
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
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
