import type { IncomingMessage, ServerResponse } from 'node:http';
import dotenv from 'dotenv';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';

type ApiHandler = (req: any, res: any) => Promise<any> | any;

function createNodeStyleResponse(res: ServerResponse) {
  return {
    setHeader(name: string, value: string) {
      res.setHeader(name, value);
      return this;
    },
    end(payload?: string) {
      res.end(payload);
      return this;
    },
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

dotenv.config({ path: path.resolve(__dirname, '.env.local') });
dotenv.config({ path: path.resolve(__dirname, '.env') });

export default defineConfig({
  plugins: [localApiPlugin(), react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    hmr: process.env.DISABLE_HMR !== 'true',
  },
});
