import { copyFileSync, existsSync, readFileSync } from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const BACKEND_DIR = path.resolve(__dirname, '../backend');
const HEALTH_URL = 'http://localhost:8080/api/health';

async function isBackendHealthy(): Promise<boolean> {
  try {
    const response = await fetch(HEALTH_URL);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForBackend(maxWaitMs = 60_000): Promise<void> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    if (await isBackendHealthy()) return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Backend did not become healthy after ${maxWaitMs / 1000}s`);
}

function applyTestSeed(): void {
  const seedPath = path.join(BACKEND_DIR, 'seed-test.sql');
  const sql = readFileSync(seedPath, 'utf8');

  const result = spawnSync(
    'docker',
    ['compose', '-f', 'docker-compose.yml', '-f', 'docker-compose.test.yml',
     'exec', '-T', 'db',
     'mysql', '-uhexmap', '-phexmap', 'hexmap'],
    { cwd: BACKEND_DIR, input: sql, stdio: ['pipe', 'inherit', 'inherit'] },
  );

  if (result.status !== 0) {
    throw new Error('Failed to apply test seed SQL');
  }
}

export default async function globalSetup() {
  if (await isBackendHealthy()) {
    console.log('[setup] Backend already running — applying test seed');
    applyTestSeed();
    return;
  }

  // Ensure config.php exists for the backend
  const configPath = path.join(BACKEND_DIR, 'config.php');
  const configTestPath = path.join(BACKEND_DIR, 'config.test.php');
  if (!existsSync(configPath) && existsSync(configTestPath)) {
    console.log('[setup] Copying config.test.php → config.php');
    copyFileSync(configTestPath, configPath);
  }

  console.log('[setup] Starting Docker backend...');
  const result = spawnSync(
    'docker',
    ['compose', '-f', 'docker-compose.yml', '-f', 'docker-compose.test.yml', 'up', '-d'],
    { cwd: BACKEND_DIR, stdio: 'inherit' },
  );

  if (result.status !== 0) {
    throw new Error('docker compose failed to start');
  }

  console.log('[setup] Waiting for backend to be healthy...');
  await waitForBackend();
  console.log('[setup] Backend ready');
  // Seed is applied via initdb when starting fresh, but apply explicitly to be safe
  applyTestSeed();
}
