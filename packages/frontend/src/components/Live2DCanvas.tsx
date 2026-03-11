/**
 * Live2D Canvas Component
 *
 * Renders the Live2D Shark model with expression and motion control.
 * Requires Live2D Cubism SDK to be loaded via script tags.
 */

import { useEffect, useRef, useCallback } from 'react';

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
 * Extended Window interface for Live2D SDK
 */
declare global {
  interface Window {
    PIXI: any;
    Live2DCubismCore: any;
    LIVE2DCUBISMPIXI: any;
  }
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
  const appRef = useRef<any>(null);
  const modelRef = useRef<any>(null);
  const animationFrameRef = useRef<number | null>(null);

  /**
   * Initialize Live2D
   */
  const initLive2D = useCallback(async () => {
    if (!canvasRef.current) return;

    // Check if SDK is loaded
    if (!window.PIXI || !window.Live2DCubismCore) {
      console.error('[Live2DCanvas] Live2D SDK not loaded');
      return;
    }

    try {
      const { Application } = window.PIXI;

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

      // Load model using Live2D SDK
      const model = await loadLive2DModel(modelPath);
      if (!model) {
        console.error('[Live2DCanvas] Failed to load model');
        return;
      }

      modelRef.current = model;

      // Add model to stage
      app.stage.addChild(model);

      // Center the model
      model.x = width / 2;
      model.y = height / 2;
      model.scale.set(0.5);

      // Start update loop
      startUpdateLoop();

      console.log('[Live2DCanvas] Live2D initialized');
    } catch (error) {
      console.error('[Live2DCanvas] Initialization failed:', error);
    }
  }, [modelPath, width, height]);

  /**
   * Load Live2D model
   */
  const loadLive2DModel = async (path: string): Promise<any> => {
    // This is a placeholder - actual implementation depends on
    // how the Live2D SDK is structured in the Shark model files
    // The original project likely uses a custom loader

    return new Promise((resolve, reject) => {
      // Try to use the SDK's model loader
      if (window.LIVE2DCUBISMPIXI?.Live2DModel) {
        const { Live2DModel } = window.LIVE2DCUBISMPIXI;
        Live2DModel.from(path)
          .then((model: any) => resolve(model))
          .catch(reject);
      } else {
        // Fallback or custom loader implementation would go here
        console.warn('[Live2DCanvas] Using placeholder model loader');
        resolve(createPlaceholderModel());
      }
    });
  };

  /**
   * Create a placeholder model for when SDK is not available
   */
  const createPlaceholderModel = (): any => {
    const container = new window.PIXI.Container();

    // Add a simple graphic as placeholder
    const graphics = new window.PIXI.Graphics();
    graphics.beginFill(0x667eea);
    graphics.drawCircle(0, 0, 100);
    graphics.endFill();

    // Add text label
    const text = new window.PIXI.Text('Ellen Live2D\n(Model Loading...)', {
      fontFamily: 'Arial',
      fontSize: 24,
      fill: 0xffffff,
      align: 'center',
    });
    text.anchor.set(0.5);

    container.addChild(graphics);
    container.addChild(text);

    return container;
  };

  /**
   * Start the update loop for expressions
   */
  const startUpdateLoop = () => {
    const update = () => {
      if (!modelRef.current) return;

      // Get current expression parameters
      const params = getExpressionParams?.();

      if (params && modelRef.current.internalModel) {
        const coreModel = modelRef.current.internalModel.coreModel;

        // Map expression parameters to Live2D parameters
        applyExpressionParams(coreModel, params);
      }

      animationFrameRef.current = requestAnimationFrame(update);
    };

    update();
  };

  /**
   * Apply expression parameters to Live2D model
   */
  const applyExpressionParams = (coreModel: any, params: Record<string, number>) => {
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

    Object.entries(params).forEach(([key, value]) => {
      const paramId = paramMapping[key];
      if (paramId && coreModel.getParameterIndex) {
        const index = coreModel.getParameterIndex(paramId);
        if (index >= 0) {
          coreModel.setParameterValueByIndex(index, value);
        }
      }
    });
  };

  /**
   * Change motion
   */
  useEffect(() => {
    if (!modelRef.current) return;

    // Start the specified motion
    if (modelRef.current.internalModel?.motionManager) {
      const motionManager = modelRef.current.internalModel.motionManager;
      motionManager.startMotion('Motion', motionId === 'idle2' ? 1 : 0);
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
  );
}

export default Live2DCanvas;
