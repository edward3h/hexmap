import { copyFileSync, existsSync, readFileSync } from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const BACKEND_DIR = path.resolve(__dirname, '../backend');
const HEALTH_URL = 'http://localhost:8080/api/health';

const DOCKER_COMPOSE_ARGS = [
  'compose', '-f', 'docker-compose.yml', '-f', 'docker-compose.test.yml',
];

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

// The /api/health endpoint doesn't query MySQL, so we wait separately.
async function waitForMySQL(maxWaitMs = 60_000): Promise<void> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const result = spawnSync(
      'docker',
      [...DOCKER_COMPOSE_ARGS, 'exec', '-T', 'db',
       'mysqladmin', 'ping', '-h', 'localhost', '-uhexmap', '-phexmap', '--silent'],
      { cwd: BACKEND_DIR, stdio: 'pipe' },
    );
    if (result.status === 0) return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`MySQL did not become ready after ${maxWaitMs / 1000}s`);
}

function applyTestSeed(): void {
  const seedPath = path.join(BACKEND_DIR, 'seed-test.sql');
  const sql = readFileSync(seedPath, 'utf8');

  const result = spawnSync(
    'docker',
    [...DOCKER_COMPOSE_ARGS, 'exec', '-T', 'db', 'mysql', '-uhexmap', '-phexmap', 'hexmap'],
    { cwd: BACKEND_DIR, input: sql, stdio: ['pipe', 'inherit', 'inherit'] },
  );

  if (result.status !== 0) {
    throw new Error('Failed to apply test seed SQL');
  }
}

export default async function globalSetup() {
  if (await isBackendHealthy()) {
    console.log('[setup] Backend already running — applying test seed');
    await waitForMySQL();
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
    [...DOCKER_COMPOSE_ARGS, 'up', '-d'],
    { cwd: BACKEND_DIR, stdio: 'inherit' },
  );

  if (result.status !== 0) {
    throw new Error('docker compose failed to start');
  }

  console.log('[setup] Waiting for backend to be healthy...');
  await waitForBackend();
  console.log('[setup] Waiting for MySQL to be ready...');
  await waitForMySQL();
  console.log('[setup] Applying test seed...');
  applyTestSeed();
  console.log('[setup] Ready');
}
