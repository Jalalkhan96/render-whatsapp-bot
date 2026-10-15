'use strict';

const { spawn, execFile } = require('child_process');
const { existsSync, mkdirSync } = require('fs');
const path = require('path');

const PROJECT_ROOT = process.cwd();

function resolveGeminiWeb2ApiPaths() {
  const candidates = [];
  const configuredDir = String(process.env.GEMINI_WEB2API_DIR || '').trim();
  if (configuredDir) candidates.push(path.resolve(configuredDir));

  candidates.push(
    path.join(PROJECT_ROOT, 'gemini-web2api'),
    path.join(PROJECT_ROOT, 'gemini_web2api'),
    path.join(PROJECT_ROOT, 'lib', 'gemini-web2api'),
    path.join(PROJECT_ROOT, 'lib', 'gemini_web2api')
  );

  const unique = [...new Set(candidates)];
  for (const dir of unique) {
    const script = path.join(dir, 'gemini_web2api.py');
    if (existsSync(script)) return { dir, script };
  }

  const fallbackDir = unique[0] || path.join(PROJECT_ROOT, 'gemini-web2api');
  return { dir: fallbackDir, script: path.join(fallbackDir, 'gemini_web2api.py') };
}

const { dir: GEMINI_DIR, script: GEMINI_SCRIPT } = resolveGeminiWeb2ApiPaths();
const GEMINI_HOST = String(process.env.GEMINI_WEB2API_HOST || '127.0.0.1');
const GEMINI_PORT = Number(process.env.GEMINI_WEB2API_PORT) || 8081;
const GEMINI_BASE_URL = `http://${GEMINI_HOST}:${GEMINI_PORT}`;
const GEMINI_HEALTH_URL = `${GEMINI_BASE_URL}/`;
const START_TIMEOUT = 60000;
const HEALTH_INTERVAL = 1000;
const PYTHON_PACKAGE_DIR = path.join(GEMINI_DIR, '.python_packages');

let geminiProcess = null;
let startingPromise = null;

function getPythonCommand() {
  return process.env.GEMINI_PYTHON || 'python3';
}

function runPython(python, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = execFile(python, args, {
      cwd: options.cwd,
      env: options.env,
      timeout: options.timeout || 120000,
      maxBuffer: 5 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (error) {
        reject(Object.assign(error, { stdout, stderr }));
        return;
      }
      resolve({ stdout, stderr });
    });
    child.on('error', reject);
  });
}

function getPythonEnv() {
  const current = process.env.PYTHONPATH || '';
  return {
    ...process.env,
    PYTHONPATH: current ? `${PYTHON_PACKAGE_DIR}${path.delimiter}${current}` : PYTHON_PACKAGE_DIR,
  };
}

async function ensureHttpx() {
  const python = getPythonCommand();
  mkdirSync(PYTHON_PACKAGE_DIR, { recursive: true });
  const env = getPythonEnv();

  try {
    const result = await runPython(python, ['-c', 'import httpx; print(httpx.__version__)'], {
      cwd: GEMINI_DIR, env, timeout: 30000,
    });
    console.log(`[Gemini] ✅ httpx available: ${result.stdout.trim()}`);
    return env;
  } catch {
    console.log('[Gemini] ⚠️ httpx not found. Installing locally...');
  }

  try {
    await runPython(python, ['-m', 'pip', '--version'], { cwd: GEMINI_DIR, env, timeout: 30000 });
  } catch {
    console.log('[Gemini] ⚠️ pip not found. Bootstrapping pip...');
    await runPython(python, ['-m', 'ensurepip', '--upgrade', '--user'], {
      cwd: GEMINI_DIR, env, timeout: 60000,
    });
  }

  await runPython(python, [
    '-m', 'pip', 'install', '--disable-pip-version-check', '--no-warn-script-location',
    '--target', PYTHON_PACKAGE_DIR, 'httpx>=0.25',
  ], { cwd: GEMINI_DIR, env, timeout: 120000 });

  const result = await runPython(python, ['-c', 'import httpx; print(httpx.__version__)'], {
    cwd: GEMINI_DIR, env, timeout: 30000,
  });
  console.log(`[Gemini] ✅ httpx installed: ${result.stdout.trim()}`);
  return env;
}

function isGeminiRunning() {
  return Boolean(geminiProcess && geminiProcess.exitCode === null && !geminiProcess.killed);
}

async function checkGeminiHealth() {
  try {
    const response = await fetch(GEMINI_HEALTH_URL, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return false;
    const data = await response.json();
    return data?.status === 'ok';
  } catch {
    return false;
  }
}

async function waitForGeminiHealth(timeout = START_TIMEOUT) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    if (await checkGeminiHealth()) return true;
    await new Promise(resolve => setTimeout(resolve, HEALTH_INTERVAL));
  }
  return false;
}

async function startGeminiGateway() {
  if (await checkGeminiHealth()) {
    console.log('🟢 Gemini Web2API already running.');
    return { ok: true, alreadyRunning: true, url: GEMINI_BASE_URL };
  }
  if (startingPromise) return startingPromise;

  startingPromise = (async () => {
    if (!existsSync(GEMINI_SCRIPT)) {
      throw new Error(
        `Gemini Web2API script not found: ${GEMINI_SCRIPT}\n` +
        'Upload gemini_web2api.py to the project or set GEMINI_WEB2API_DIR.'
      );
    }

    console.log('🤖 Preparing Gemini Web2API...');
    const pythonEnv = await ensureHttpx();
    console.log('🤖 Starting Gemini Web2API...');

    geminiProcess = spawn(getPythonCommand(), [GEMINI_SCRIPT, '--port', String(GEMINI_PORT)], {
      cwd: GEMINI_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: pythonEnv,
    });

    geminiProcess.stdout.on('data', data => {
      const text = data.toString().trim();
      if (text) console.log(`[Gemini] ${text}`);
    });
    geminiProcess.stderr.on('data', data => {
      const text = data.toString().trim();
      if (text) console.log(`[Gemini] ${text}`);
    });
    geminiProcess.on('error', error => {
      console.error('❌ Gemini Web2API process error:', error.message);
    });
    geminiProcess.on('exit', (code, signal) => {
      console.log(`⚠️ Gemini Web2API stopped. code=${code} signal=${signal}`);
      geminiProcess = null;
    });

    const healthy = await waitForGeminiHealth();
    if (!healthy) {
      try { if (geminiProcess && !geminiProcess.killed) geminiProcess.kill('SIGTERM'); } catch {}
      geminiProcess = null;
      throw new Error(`Gemini Web2API failed health check within ${START_TIMEOUT}ms`);
    }

    console.log(`✅ Gemini Web2API ready: ${GEMINI_BASE_URL}`);
    return {
      ok: true,
      alreadyRunning: false,
      url: GEMINI_BASE_URL,
      pid: geminiProcess?.pid || null,
    };
  })().finally(() => { startingPromise = null; });

  return startingPromise;
}

async function stopGeminiGateway() {
  if (!geminiProcess) {
    console.log('ℹ️ Gemini Web2API is not running.');
    return { ok: true, stopped: false };
  }

  const processToStop = geminiProcess;
  console.log('🛑 Stopping Gemini Web2API...');

  return new Promise(resolve => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      geminiProcess = null;
      resolve({ ok: true, stopped: true });
    };
    processToStop.once('exit', finish);
    try { processToStop.kill('SIGTERM'); } catch { finish(); return; }
    setTimeout(() => {
      if (!finished) {
        try { processToStop.kill('SIGKILL'); } catch {}
        finish();
      }
    }, 5000);
  });
}

async function restartGeminiGateway() {
  await stopGeminiGateway();
  await new Promise(resolve => setTimeout(resolve, 1000));
  return startGeminiGateway();
}

function getGeminiGatewayStatus() {
  return {
    running: isGeminiRunning(),
    pid: geminiProcess?.pid || null,
    host: GEMINI_HOST,
    port: GEMINI_PORT,
    baseUrl: `${GEMINI_BASE_URL}/v1`,
    script: GEMINI_SCRIPT,
    pythonPackageDir: PYTHON_PACKAGE_DIR,
  };
}

module.exports = {
  startGeminiGateway,
  stopGeminiGateway,
  restartGeminiGateway,
  isHealthy: checkGeminiHealth,
  waitForHealthy: waitForGeminiHealth,
  checkGeminiHealth,
  waitForGeminiHealth,
  getGeminiGatewayStatus,
  baseUrl: GEMINI_BASE_URL,
  GEMINI_BASE_URL,
  GEMINI_PORT,
  GEMINI_HOST,
};
