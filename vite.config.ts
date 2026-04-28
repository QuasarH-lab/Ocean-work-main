import type { IncomingMessage, ServerResponse } from 'node:http';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv, type Plugin } from 'vite';

type ApiHandler = (req: any, res: any) => Promise<any> | any;

function createNodeStyleResponse(res: ServerResponse) {
  return {
    status(code: number) {
      res.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      if (!res.headersSent) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
      }
      res.end(JSON.stringify(payload));
      return this;
    },
  };
}

async function readJsonBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (!chunks.length) {
    return undefined;
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) {
    return undefined;
  }

  return JSON.parse(raw);
}

function localApiPlugin(): Plugin {
  const handlers = new Map<string, string>([
    ['/api/builds', path.resolve(__dirname, 'api', 'builds.ts')],
    ['/api/generate-voxel', path.resolve(__dirname, 'api', 'generate-voxel.ts')],
  ]);

  async function runHandler(
    server: { ssrLoadModule: (url: string) => Promise<Record<string, unknown>> },
    req: IncomingMessage & { url?: string | undefined },
    res: ServerResponse,
    next: () => void
  ) {
    const requestUrl = req.url ? new URL(req.url, 'http://127.0.0.1') : null;
    const route = requestUrl?.pathname;
    const entry = route ? handlers.get(route) : null;

    if (!entry) {
      return next();
    }

    try {
      const query = Object.fromEntries(requestUrl?.searchParams.entries() ?? []);
      const body = await readJsonBody(req);
      const modulePath = `/@fs/${entry.replace(/\\/g, '/')}`;
      const imported = await server.ssrLoadModule(modulePath);
      const handler = (imported.default || imported.handler) as ApiHandler;

      if (!handler) {
        throw new Error(`Failed to load handler for ${route}`);
      }

      await handler(
        {
          method: req.method,
          headers: req.headers,
          query,
          body,
        },
        createNodeStyleResponse(res)
      );
    } catch (error: any) {
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
      }
      res.end(JSON.stringify({ error: error?.message || 'Local API bridge failed' }));
    }
  }

  return {
    name: 'local-api-plugin',
    configureServer(server) {
      server.middlewares.use((req, res, next) => runHandler(server, req, res, next));
    },
  };
}

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [localApiPlugin(), react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
