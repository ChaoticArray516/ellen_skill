/**
 * TTS Process Manager
 *
 * Manages the lifecycle of the GPT-SoVITS v4 process.
 * Handles auto-launch, health monitoring, and graceful shutdown.
 *
 * Architecture reference: Live2D-Virtual-Girlfriend (chinokikiss)
 * Key design decisions:
 * - Check port 9880 before launching (avoid duplicate processes)
 * - Bind child process lifecycle to Node.js main process
 * - Poll /health endpoint with exponential backoff (model loading takes 30-60s)
 * - Graceful degradation: TTS failure never blocks LLM conversation
 */

import { spawn, ChildProcess } from 'child_process';
import * as net from 'net';
import { Logger, LogLevel } from './logger';

const logger = new Logger('TTSProcessManager', { level: LogLevel.INFO });

/** GPT-SoVITS process launch configuration */
export interface TTSLaunchConfig {
  /** Whether to auto-launch GPT-SoVITS on startup */
  autoLaunch: boolean;
  /** Absolute path to GPT-SoVITS repository root */
  gptsovitsPath: string;
  /** Python executable (e.g., 'python', 'python3', or conda env path) */
  pythonExecutable: string;
  /** API host (default: 127.0.0.1) */
  apiHost: string;
  /** API port (default: 9880) */
  apiPort: number;
  /** Max seconds to wait for service to become ready (default: 90) */
  startupTimeoutSeconds: number;
}

let ttsProcess: ChildProcess | null = null;
let isManaged = false; // true if we launched the process (vs user-launched)

/**
 * Checks if a port is already in use.
 * Used to detect if GPT-SoVITS is already running before launching.
 */
async function isPortInUse(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(true));   // Port in use
    server.once('listening', () => {
      server.close();
      resolve(false);  // Port free
    });
    server.listen(port, host);
  });
}

/**
 * Polls the GPT-SoVITS API until it responds or timeout is reached.
 *
 * GPT-SoVITS v4 loads models on startup which takes 30-90 seconds.
 * We poll with 2-second intervals and exponential backoff on repeated failures.
 */
async function waitForTTSReady(
  apiUrl: string,
  timeoutSeconds: number
): Promise<boolean> {
  const startTime = Date.now();
  const timeoutMs = timeoutSeconds * 1000;
  let attempt = 0;

  logger.info('Waiting for GPT-SoVITS to become ready...', { timeoutSeconds });

  while (Date.now() - startTime < timeoutMs) {
    try {
      const response = await fetch(`${apiUrl}/`, {
        signal: AbortSignal.timeout(3000),
      });
      if (response.ok || response.status === 404) {
        // 404 is acceptable - service is running but root path may not exist
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        logger.info(`GPT-SoVITS ready after ${elapsed}s`);
        return true;
      }
    } catch {
      // Service not ready yet, continue polling
    }

    attempt++;
    const waitMs = Math.min(2000 + attempt * 200, 5000); // 2s -> 5s
    await new Promise((resolve) => setTimeout(resolve, waitMs));

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    if (attempt % 5 === 0) {
      logger.info(`Still waiting for GPT-SoVITS... (${elapsed}s elapsed)`);
    }
  }

  logger.warn('GPT-SoVITS startup timeout reached');
  return false;
}

/**
 * Launches GPT-SoVITS v4 as a child process.
 *
 * Command: python api_v2.py -a {host} -p {port}
 *
 * IMPORTANT: The process is launched with:
 * - cwd set to gptsovitsPath (api_v2.py uses relative paths for model loading)
 * - stdio: ['ignore', 'pipe', 'pipe'] (capture stdout/stderr for logging)
 * - detached: false (process dies with parent)
 */
export async function launchTTSProcess(config: TTSLaunchConfig): Promise<boolean> {
  if (!config.autoLaunch) {
    logger.info('TTS auto-launch disabled, skipping');
    return false;
  }

  const apiUrl = `http://${config.apiHost}:${config.apiPort}`;

  // Step 1: Check if service is already running
  const portOccupied = await isPortInUse(config.apiPort, config.apiHost);
  if (portOccupied) {
    logger.info('GPT-SoVITS port already in use, assuming service is running', {
      port: config.apiPort,
    });
    // Wait for it to be ready (it might be starting up)
    const ready = await waitForTTSReady(apiUrl, 30);
    isManaged = false; // We didn't launch it
    return ready;
  }

  // Step 2: Validate GPT-SoVITS path
  const { existsSync } = await import('fs');
  const apiScript = `${config.gptsovitsPath}/api_v2.py`;
  if (!existsSync(apiScript)) {
    logger.error(
      'GPT-SoVITS api_v2.py not found',
      undefined,
      { path: apiScript, hint: 'Set tts.gptsovits_path in config.yaml to the GPT-SoVITS repository root' }
    );
    return false;
  }

  // Step 3: Launch process
  logger.info('Launching GPT-SoVITS v4...', {
    python: config.pythonExecutable,
    script: apiScript,
    host: config.apiHost,
    port: config.apiPort,
  });

  ttsProcess = spawn(
    config.pythonExecutable,
    ['api_v2.py', '-a', config.apiHost, '-p', String(config.apiPort)],
    {
      cwd: config.gptsovitsPath,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    }
  );

  isManaged = true;

  // Pipe GPT-SoVITS logs with prefix
  ttsProcess.stdout?.on('data', (data: Buffer) => {
    const lines = data.toString().trim().split('\n');
    lines.forEach((line) => {
      if (line.trim()) logger.debug(`[GPT-SoVITS] ${line}`);
    });
  });

  ttsProcess.stderr?.on('data', (data: Buffer) => {
    const lines = data.toString().trim().split('\n');
    lines.forEach((line) => {
      if (line.trim()) logger.debug(`[GPT-SoVITS stderr] ${line}`);
    });
  });

  ttsProcess.on('error', (err) => {
    logger.error('GPT-SoVITS process error', err);
    ttsProcess = null;
  });

  ttsProcess.on('exit', (code, signal) => {
    logger.info('GPT-SoVITS process exited', { code, signal });
    ttsProcess = null;
  });

  // Step 4: Wait for service to become ready
  const ready = await waitForTTSReady(apiUrl, config.startupTimeoutSeconds);

  if (!ready) {
    logger.error('GPT-SoVITS failed to start within timeout');
    stopTTSProcess();
    return false;
  }

  return true;
}

/**
 * Stops the managed GPT-SoVITS process.
 * Only terminates if we launched it (isManaged = true).
 */
export function stopTTSProcess(): void {
  if (!ttsProcess || !isManaged) return;

  logger.info('Stopping GPT-SoVITS process...');
  try {
    ttsProcess.kill('SIGTERM');
    // Force kill after 5 seconds if SIGTERM doesn't work
    setTimeout(() => {
      if (ttsProcess) {
        ttsProcess.kill('SIGKILL');
      }
    }, 5000);
  } catch (err) {
    logger.warn('Error stopping GPT-SoVITS process', { err });
  }
  ttsProcess = null;
}

/**
 * Returns whether the managed TTS process is running.
 */
export function isTTSProcessRunning(): boolean {
  return ttsProcess !== null && !ttsProcess.killed;
}
