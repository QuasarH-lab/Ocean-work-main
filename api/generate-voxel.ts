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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Missing GEMINI_API_KEY on server environment' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { mode, prompt = '', paletteHint = '', referenceImage = null } = (body || {}) as GenerateRequestBody;

    if (!mode || !['create', 'morph', 'image'].includes(mode)) {
      return res.status(400).json({ error: 'Invalid mode' });
    }
    if (mode !== 'image' && !prompt.trim()) {
      return res.status(400).json({ error: 'Prompt is required for text generation' });
    }
    if (mode === 'image' && (!referenceImage?.base64 || !referenceImage?.mimeType)) {
      return res.status(400).json({ error: 'Reference image is required for image voxelization' });
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

    const response = await ai.models.generateContent({
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
    });

    const rawData = JSON.parse(response.text || '[]') as RawVoxel[];
    const voxels = rawData.map((voxel) => ({
      x: Math.round(Number(voxel.x)) || 0,
      y: Math.round(Number(voxel.y)) || 0,
      z: Math.round(Number(voxel.z)) || 0,
      color: toVoxelColor(String(voxel.color || '#cccccc')),
    }));

    return res.status(200).json({ voxels });
  } catch (error: any) {
    console.error('generate-voxel failed:', error);
    return res.status(500).json({ error: error?.message || 'Unknown server error' });
  }
}
