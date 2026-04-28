import { createBuild, databaseFilePath, deleteBuild, listBuilds } from '../server/database';

function getCorsHeaders(req: any) {
  const requestOrigin = req.headers?.origin;
  return {
    'Access-Control-Allow-Origin': requestOrigin || '*',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function jsonResponse(res: any, req: any, status: number, payload: Record<string, unknown>) {
  const corsHeaders = getCorsHeaders(req);
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
  return res.status(status).json(payload);
}

function parseBody(req: any) {
  if (!req.body) {
    return {};
  }

  if (typeof req.body === 'string') {
    return JSON.parse(req.body);
  }

  return req.body;
}

function isVoxelArray(value: unknown) {
  return Array.isArray(value) && value.every((item) => {
    if (!item || typeof item !== 'object') {
      return false;
    }

    const voxel = item as Record<string, unknown>;
    return ['x', 'y', 'z', 'color'].every((key) => typeof voxel[key] === 'number');
  });
}

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    const corsHeaders = getCorsHeaders(req);
    Object.entries(corsHeaders).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
    return res.status(204).end();
  }

  try {
    if (req.method === 'GET') {
      const records = listBuilds();
      return jsonResponse(res, req, 200, {
        records,
        databasePath: databaseFilePath(),
      });
    }

    if (req.method === 'POST') {
      const body = parseBody(req);
      const { name, prompt = '', mode = 'create', baseModel = null, data } = body || {};

      if (typeof name !== 'string' || !name.trim()) {
        return jsonResponse(res, req, 400, { error: 'Build name is required.' });
      }

      if (!['create', 'morph', 'image', 'import'].includes(mode)) {
        return jsonResponse(res, req, 400, { error: 'Invalid build mode.' });
      }

      if (!isVoxelArray(data) || !data.length) {
        return jsonResponse(res, req, 400, { error: 'Voxel data is required.' });
      }

      const record = createBuild({
        name,
        prompt,
        mode,
        baseModel: typeof baseModel === 'string' ? baseModel : null,
        data,
      });

      return jsonResponse(res, req, 201, { record });
    }

    if (req.method === 'DELETE') {
      const id = typeof req.query?.id === 'string'
        ? req.query.id
        : typeof parseBody(req)?.id === 'string'
          ? parseBody(req).id
          : '';

      if (!id) {
        return jsonResponse(res, req, 400, { error: 'Build id is required.' });
      }

      const deleted = deleteBuild(id);
      if (!deleted) {
        return jsonResponse(res, req, 404, { error: 'Build not found.' });
      }

      return jsonResponse(res, req, 200, { success: true });
    }

    return jsonResponse(res, req, 405, { error: 'Method Not Allowed' });
  } catch (error: any) {
    console.error('builds api failed:', error);
    return jsonResponse(res, req, 500, { error: error?.message || 'Unknown server error' });
  }
}
