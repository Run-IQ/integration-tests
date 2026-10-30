import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { computeRuleChecksum } from '@run-iq/core';

const require = createRequire(import.meta.url);
const testsRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** Package root, found from its resolved entry point (packages do not export ./package.json). */
function packageDir(name: string, entryDir = 'dist'): string {
  const entry = require.resolve(name);
  return entry.slice(0, entry.lastIndexOf(`/${entryDir}/`));
}

function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const address = srv.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      srv.close(() => resolvePort(port));
    });
  });
}

function stop(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((done) => {
    child.once('exit', () => done());
    child.kill('SIGKILL');
  });
}

/** Minimal JSON-RPC client over the MCP stdio transport (one JSON message per line). */
function rpcClient(child: ChildProcessWithoutNullStreams) {
  const pending = new Map<number, (msg: { result?: unknown; error?: unknown }) => void>();
  createInterface({ input: child.stdout }).on('line', (line) => {
    let msg: { id?: number; result?: unknown; error?: unknown };
    try {
      msg = JSON.parse(line) as typeof msg;
    } catch {
      return;
    }
    if (typeof msg.id === 'number') pending.get(msg.id)?.(msg);
  });
  let nextId = 1;
  return {
    request(method: string, params: unknown): Promise<unknown> {
      const id = nextId++;
      return new Promise((resolveMsg, reject) => {
        const timer = setTimeout(() => reject(new Error(`${method}: no answer`)), 10_000);
        pending.set(id, (msg) => {
          clearTimeout(timer);
          if (msg.error) reject(new Error(`${method}: ${JSON.stringify(msg.error)}`));
          else resolveMsg(msg.result);
        });
        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
      });
    },
    notify(method: string): void {
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method }) + '\n');
    },
  };
}

describe('plugin-fiscal default bundle loaded by the access points', () => {
  // rupture n°13 du document, corrigée en phase 3
  it.fails(
    'mcp-server --plugin @run-iq/plugin-fiscal charge le plugin et ses modèles',
    async () => {
      const entry = resolve(packageDir('@run-iq/mcp-server'), 'dist/index.js');
      // cwd = integration-tests, from which @run-iq/plugin-fiscal resolves to the local build,
      // so the loader never falls back to installing it from the registry.
      const child = spawn(process.execPath, [entry, '--plugin', '@run-iq/plugin-fiscal'], {
        cwd: testsRoot,
        stdio: 'pipe',
      });
      let stderr = '';
      child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
      try {
        const rpc = rpcClient(child);
        await rpc.request('initialize', {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'integration-tests', version: '0.0.0' },
        });
        rpc.notify('notifications/initialized');

        const loaded = (await rpc.request('resources/read', { uri: 'plugins://loaded' })) as {
          contents: { text: string }[];
        };
        const plugins = JSON.parse(loaded.contents[0]!.text) as { plugins: { name: string }[] };

        const listed = (await rpc.request('tools/call', {
          name: 'list_models',
          arguments: {},
        })) as {
          content: { text: string }[];
        };
        const models = JSON.parse(listed.content[0]!.text) as { models: { name: string }[] };

        expect(stderr).not.toContain('[PluginLoader]');
        expect(plugins.plugins.map((p) => p.name)).toContain('@run-iq/plugin-fiscal');
        expect(models.models.length).toBeGreaterThan(0);
      } finally {
        await stop(child);
      }
    },
    20_000,
  );

  // rupture n°13 du document, corrigée en phase 3
  it.fails(
    'server PLUGINS=fiscal enregistre les modèles fiscaux',
    async () => {
      const entry = resolve(packageDir('@run-iq/server'), 'dist/standalone.js');
      const port = await freePort();
      const child = spawn(process.execPath, [entry], {
        cwd: testsRoot,
        stdio: 'pipe',
        env: {
          ...process.env,
          PORT: String(port),
          HOST: '127.0.0.1',
          LOG_LEVEL: 'silent',
          PLUGINS: 'fiscal',
          DSLS: 'jsonlogic',
        },
      });
      let stdout = '';
      child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
      try {
        const base = `http://127.0.0.1:${port}`;
        const deadline = Date.now() + 10_000;
        for (;;) {
          try {
            if ((await fetch(`${base}/health`)).ok) break;
          } catch {
            // not listening yet
          }
          if (Date.now() > deadline) throw new Error(`server did not start: ${stdout}`);
          await new Promise((r) => setTimeout(r, 100));
        }

        const draft = {
          id: 'vat',
          version: 1,
          model: 'FLAT_RATE',
          params: { base: 'sales', rate: 0.18 },
          priority: 1,
          effectiveFrom: new Date('2025-01-01T00:00:00.000Z'),
          effectiveUntil: null,
          tags: [],
        };
        const response = await fetch(`${base}/evaluate`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            rules: [{ ...draft, checksum: computeRuleChecksum(draft) }],
            input: {
              requestId: 'plugin-loading',
              data: { sales: 1000 },
              meta: { tenantId: 'acme', effectiveDate: '2025-06-01' },
            },
          }),
        });
        const body = (await response.json()) as { value?: unknown; message?: string };

        expect(stdout).toContain('plugins=[@run-iq/plugin-fiscal]');
        expect({ status: response.status, body }).toMatchObject({
          status: 200,
          body: { value: 180 },
        });
      } finally {
        await stop(child);
      }
    },
    20_000,
  );
});
