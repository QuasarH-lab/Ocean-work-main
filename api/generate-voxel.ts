import { GoogleGenAI, Type } from '@google/genai';

type GenerateMode = 'create' | 'morph' | 'image';

interface GenerateRequestBody {
  mode: GenerateMode;
  prompt?: string;
  paletteHint?: string;
  referenceImage?: {
    base64: string;
    mimeType: string;
  } | null;
}

interface RawVoxel {
  x: number;
  y: number;
  z: number;
  color: string;
}

const DEFAULT_TIMEOUT_MS = 55_000;

export const config = {
  api: {
    bodyParser: {
      // Mobile devices often upload larger base64 images.
      sizeLimit: '12mb',
    },
  },
};

function getCorsHeaders(req: any) {
  const requestOrigin = req.headers?.origin;
  return {
    'Access-Control-Allow-Origin': requestOrigin || '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
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

function toVoxelColor(color: string): number {
  const value = color.startsWith('#') ? color.slice(1) : color;
  return Number.parseInt(value, 16) || 0xcccccc;
}

function buildSystemPrompt(mode: GenerateMode, prompt: string, paletteHint: string): string {
  if (mode === 'image') {
    return `You are a 3D Lego Voxel Artist. Analyze the attached image and convert it into a 3D Lego-style voxel model.
Infer depth and volume so it becomes a true 3D sculpture, not a flat plane.
Return only a JSON array of voxels.
Each voxel must include x, y, z (integers) and color (hex string).
Keep voxel count between 200 and 800 for performance.
The model should be centered around (0, 0, 0).`;
  }

  return `Create a voxel Lego model for: ${prompt}. ${paletteHint}
Return only a JSON array.
Each item must include x, y, z, color where color is a hex string like #ff0000.
Keep the model compact and suitable for a tabletop toy sculpture.`;
}

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    const corsHeaders = getCorsHeaders(req);
    Object.entries(corsHeaders).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return jsonResponse(res, req, 405, { error: 'Method Not Allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return jsonResponse(res, req, 500, { error: 'Missing GEMINI_API_KEY on server environment' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { mode, prompt = '', paletteHint = '', referenceImage = null } = (body || {}) as GenerateRequestBody;

    if (!mode || !['create', 'morph', 'image'].includes(mode)) {
      return jsonResponse(res, req, 400, { error: 'Invalid mode' });
    }
    if (mode !== 'image' && !prompt.trim()) {
      return jsonResponse(res, req, 400, { error: 'Prompt is required for text generation' });
    }
    if (mode === 'image' && (!referenceImage?.base64 || !referenceImage?.mimeType)) {
      return jsonResponse(res, req, 400, { error: 'Reference image is required for image voxelization' });
    }

    const ai = new GoogleGenAI({ apiKey });
    const contents: any[] = [
      {
        role: 'user',
        parts: [
          {
            text: buildSystemPrompt(mode, prompt, paletteHint),
          },
        ],
      },
    ];

    if (referenceImage) {
      contents[0].parts.push({
        inlineData: {
          data: referenceImage.base64,
          mimeType: referenceImage.mimeType,
        },
      });
    }

    const timeoutMs = Number.parseInt(process.env.GENERATE_TIMEOUT_MS || '', 10) || DEFAULT_TIMEOUT_MS;
    const response = await Promise.race([
      ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                x: { type: Type.NUMBER },
                y: { type: Type.NUMBER },
                z: { type: Type.NUMBER },
                color: { type: Type.STRING },
              },
              required: ['x', 'y', 'z', 'color'],
            },
          },
        },
      }),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Model generation timeout after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]) as any;

    const rawData = JSON.parse(response.text || '[]') as RawVoxel[];
    const voxels = rawData.map((voxel) => ({
      x: Math.round(Number(voxel.x)) || 0,
      y: Math.round(Number(voxel.y)) || 0,
      z: Math.round(Number(voxel.z)) || 0,
      color: toVoxelColor(String(voxel.color || '#cccccc')),
    }));

    return jsonResponse(res, req, 200, { voxels });
  } catch (error: any) {
    console.error('generate-voxel failed:', error);
    const message = error?.message || 'Unknown server error';
    return jsonResponse(res, req, 500, { error: message });
  }
}
