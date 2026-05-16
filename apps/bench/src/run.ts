import { type ChildProcess, spawn } from 'node:child_process';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';

type Adapter = 'memory' | 'redis' | 'pg';

const adapter = (process.argv[2] ?? 'memory') as Adapter;
const k6Script = process.argv[3] ?? 'k6/publish.js';
const port = process.env.PORT ?? '3210';
const benchDir = path.resolve(import.meta.dirname, '..');
const repoRoot = path.resolve(benchDir, '../..');

async function ensureK6(): Promise<void> {
  try {
    await runProcess('k6', ['version'], { stdio: 'ignore' });
  } catch {
    throw new Error(
      'k6 is not installed.\n' +
        '  macOS:   brew install k6\n' +
        '  Linux:   https://k6.io/docs/get-started/installation/\n' +
        '  Docker:  see apps/bench/README.md for the docker-based workaround.',
    );
  }
}

async function ensureBuild(adp: Adapter): Promise<void> {
  const filters = ['--filter', '@pubber-subber/core'];
  if (adp === 'memory') filters.push('--filter', '@pubber-subber/memory');
  if (adp === 'redis') filters.push('--filter', '@pubber-subber/redis');
  if (adp === 'pg') filters.push('--filter', '@pubber-subber/pg');
  await runProcess('pnpm', [...filters, 'build'], { cwd: repoRoot });
}

async function waitForHealth(url: string, timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  let lastErr: unknown;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch (err) {
      lastErr = err;
    }
    await sleep(200);
  }
  throw new Error(`Server did not become healthy within ${timeoutMs}ms: ${lastErr}`);
}

async function runK6(baseUrl: string, script: string): Promise<void> {
  await runProcess('k6', ['run', '--env', `BASE_URL=${baseUrl}`, script], {
    cwd: benchDir,
  });
}

interface RunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdio?: 'inherit' | 'ignore' | 'pipe';
}

function runProcess(command: string, args: string[], opts: RunOptions = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      stdio: opts.stdio ?? 'inherit',
    });
    proc.on('error', reject);
    proc.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}`)),
    );
  });
}

async function main(): Promise<void> {
  await ensureK6();
  console.log(`\n=== building required packages for adapter=${adapter} ===`);
  await ensureBuild(adapter);

  let container: StartedRedisContainer | StartedPostgreSqlContainer | undefined;
  const env: NodeJS.ProcessEnv = { ...process.env, ADAPTER: adapter, PORT: port };

  if (adapter === 'redis') {
    console.log('\n=== starting redis:7-alpine container ===');
    const c = await new RedisContainer('redis:7-alpine').start();
    container = c;
    env.REDIS_URL = c.getConnectionUrl();
  } else if (adapter === 'pg') {
    console.log('\n=== starting postgres:16-alpine container ===');
    const c = await new PostgreSqlContainer('postgres:16-alpine').start();
    container = c;
    env.DATABASE_URL = c.getConnectionUri();
  }

  let server: ChildProcess | undefined;
  try {
    console.log(`\n=== starting bench server (adapter=${adapter}) ===`);
    server = spawn('node', ['--import', 'tsx', 'src/server.ts'], {
      cwd: benchDir,
      env,
      stdio: 'inherit',
    });

    await waitForHealth(`http://localhost:${port}/healthz`);
    // Warm-up + reset counters so the test window is clean.
    await fetch(`http://localhost:${port}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ warmup: true }),
    });
    await sleep(200);
    await fetch(`http://localhost:${port}/reset`, { method: 'POST' });

    console.log('\n=== running k6 ===');
    await runK6(`http://localhost:${port}`, k6Script);

    // Wait a touch so any in-flight subscribes settle before we read metrics.
    await sleep(300);
    const metrics = await fetch(`http://localhost:${port}/metrics`).then((r) => r.json());
    console.log('\n=== server-side metrics ===');
    console.log(JSON.stringify(metrics, null, 2));
  } finally {
    if (server) {
      server.kill('SIGTERM');
      await new Promise((r) => {
        if (server?.exitCode != null) r(undefined);
        else server?.once('exit', () => r(undefined));
      });
    }
    if (container) {
      console.log('\n=== stopping container ===');
      await container.stop();
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
