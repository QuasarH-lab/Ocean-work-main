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

type BrickType = '1x1' | '1x2' | '2x2' | '2x3' | '2x4';

interface Brick {
  id: string;
  type: BrickType;
  x: number;
  y: number;
  z: number;
  width: number;
  depth: number;
  height: 1;
  color: number;
  cells: Array<{ x: number; y: number; z: number }>;
}

interface ConnectionValidation {
  brickCount: number;
  unsupportedBrickIds: string[];
  isolatedBrickIds: string[];
  connectedComponents: number;
  physicallyFeasible: boolean;
}

interface RepairStats {
  addedSupportVoxels: number;
  addedBridgeVoxels: number;
  repaired: boolean;
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
Keep the model compact and suitable for a tabletop toy sculpture.
Prefer connected structures with stable support and avoid floating disconnected pieces.`;
}

function cellKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

function parseCellKey(key: string) {
  const [x, y, z] = key.split(',').map(Number);
  return { x, y, z };
}

function canPlaceBrick(
  occupied: Set<string>,
  used: Set<string>,
  x: number,
  y: number,
  z: number,
  width: number,
  depth: number,
  color: number,
  colorMap: Map<string, number>
) {
  for (let dx = 0; dx < width; dx++) {
    for (let dz = 0; dz < depth; dz++) {
      const key = cellKey(x + dx, y, z + dz);
      if (!occupied.has(key) || used.has(key)) {
        return false;
      }
      if ((colorMap.get(key) || 0) !== color) {
        return false;
      }
    }
  }
  return true;
}

function markBrickCells(used: Set<string>, x: number, y: number, z: number, width: number, depth: number) {
  for (let dx = 0; dx < width; dx++) {
    for (let dz = 0; dz < depth; dz++) {
      used.add(cellKey(x + dx, y, z + dz));
    }
  }
}

function generateBrickCells(x: number, y: number, z: number, width: number, depth: number) {
  const cells: Array<{ x: number; y: number; z: number }> = [];
  for (let dx = 0; dx < width; dx++) {
    for (let dz = 0; dz < depth; dz++) {
      cells.push({ x: x + dx, y, z: z + dz });
    }
  }
  return cells;
}

function voxelToBricks(voxels: Array<{ x: number; y: number; z: number; color: number }>): Brick[] {
  const occupied = new Set<string>();
  const colorMap = new Map<string, number>();
  voxels.forEach((v) => {
    const key = cellKey(v.x, v.y, v.z);
    occupied.add(key);
    colorMap.set(key, v.color);
  });

  const used = new Set<string>();
  const bricks: Brick[] = [];
  let idCounter = 0;

  // Prefer larger parts first.
  const patterns: Array<{ type: BrickType; width: number; depth: number }> = [
    { type: '2x4', width: 2, depth: 4 },
    { type: '2x3', width: 2, depth: 3 },
    { type: '2x2', width: 2, depth: 2 },
    { type: '1x2', width: 1, depth: 2 },
    { type: '1x1', width: 1, depth: 1 },
  ];

  const sortedCells = [...occupied]
    .map(parseCellKey)
    .sort((a, b) => (a.y - b.y) || (a.x - b.x) || (a.z - b.z));

  for (const cell of sortedCells) {
    const baseKey = cellKey(cell.x, cell.y, cell.z);
    if (used.has(baseKey)) {
      continue;
    }
    const color = colorMap.get(baseKey) || 0xcccccc;
    let placed = false;

    for (const pattern of patterns) {
      const orientations: Array<{ width: number; depth: number }> =
        pattern.width === pattern.depth
          ? [{ width: pattern.width, depth: pattern.depth }]
          : [
              { width: pattern.width, depth: pattern.depth },
              { width: pattern.depth, depth: pattern.width },
            ];

      for (const orientation of orientations) {
        if (
          canPlaceBrick(
            occupied,
            used,
            cell.x,
            cell.y,
            cell.z,
            orientation.width,
            orientation.depth,
            color,
            colorMap
          )
        ) {
          markBrickCells(used, cell.x, cell.y, cell.z, orientation.width, orientation.depth);
          bricks.push({
            id: `B${++idCounter}`,
            type: pattern.type,
            x: cell.x,
            y: cell.y,
            z: cell.z,
            width: orientation.width,
            depth: orientation.depth,
            height: 1,
            color,
            cells: generateBrickCells(cell.x, cell.y, cell.z, orientation.width, orientation.depth),
          });
          placed = true;
          break;
        }
      }
      if (placed) {
        break;
      }
    }
  }

  return bricks;
}

function shareAnyCellXY(a: Brick, b: Brick, dy: number): boolean {
  if (b.y - a.y !== dy) {
    return false;
  }
  const aSet = new Set(a.cells.map((c) => `${c.x},${c.z}`));
  for (const c of b.cells) {
    if (aSet.has(`${c.x},${c.z}`)) {
      return true;
    }
  }
  return false;
}

function shareAnySide(a: Brick, b: Brick): boolean {
  const bCells = new Set(b.cells.map((c) => cellKey(c.x, c.y, c.z)));
  for (const c of a.cells) {
    const neighbors = [
      cellKey(c.x + 1, c.y, c.z),
      cellKey(c.x - 1, c.y, c.z),
      cellKey(c.x, c.y, c.z + 1),
      cellKey(c.x, c.y, c.z - 1),
    ];
    if (neighbors.some((n) => bCells.has(n))) {
      return true;
    }
  }
  return false;
}

function validateBrickConnectivity(bricks: Brick[]): ConnectionValidation {
  if (!bricks.length) {
    return {
      brickCount: 0,
      unsupportedBrickIds: [],
      isolatedBrickIds: [],
      connectedComponents: 0,
      physicallyFeasible: false,
    };
  }

  const unsupported: string[] = [];
  const neighbors = new Map<string, Set<string>>();
  bricks.forEach((b) => neighbors.set(b.id, new Set()));

  for (let i = 0; i < bricks.length; i++) {
    const a = bricks[i];
    let hasSupport = a.y === 0;
    for (let j = 0; j < bricks.length; j++) {
      if (i === j) continue;
      const b = bricks[j];
      // Vertical stud connection (one layer above).
      if (shareAnyCellXY(a, b, 1) || shareAnyCellXY(b, a, 1)) {
        neighbors.get(a.id)!.add(b.id);
        neighbors.get(b.id)!.add(a.id);
      }
      // Same-layer side contact.
      if (a.y === b.y && shareAnySide(a, b)) {
        neighbors.get(a.id)!.add(b.id);
        neighbors.get(b.id)!.add(a.id);
      }
      if (!hasSupport && b.y === a.y - 1 && shareAnyCellXY(b, a, 1)) {
        hasSupport = true;
      }
    }
    if (!hasSupport) {
      unsupported.push(a.id);
    }
  }

  const isolated = bricks
    .filter((b) => (neighbors.get(b.id)?.size || 0) === 0)
    .map((b) => b.id);

  // Connected components on brick connection graph.
  const visited = new Set<string>();
  let components = 0;
  for (const brick of bricks) {
    if (visited.has(brick.id)) continue;
    components++;
    const stack = [brick.id];
    visited.add(brick.id);
    while (stack.length) {
      const id = stack.pop()!;
      for (const n of neighbors.get(id) || []) {
        if (!visited.has(n)) {
          visited.add(n);
          stack.push(n);
        }
      }
    }
  }

  return {
    brickCount: bricks.length,
    unsupportedBrickIds: unsupported,
    isolatedBrickIds: isolated,
    connectedComponents: components,
    physicallyFeasible: unsupported.length === 0 && isolated.length === 0 && components === 1,
  };
}

function dedupeVoxels(voxels: Array<{ x: number; y: number; z: number; color: number }>) {
  const map = new Map<string, { x: number; y: number; z: number; color: number }>();
  for (const v of voxels) {
    map.set(cellKey(v.x, v.y, v.z), v);
  }
  return [...map.values()];
}

function findConnectedComponentsFromVoxels(voxels: Array<{ x: number; y: number; z: number; color: number }>) {
  const occupied = new Set(voxels.map((v) => cellKey(v.x, v.y, v.z)));
  const visited = new Set<string>();
  const components: Array<Array<{ x: number; y: number; z: number; color: number }>> = [];
  const voxelMap = new Map(voxels.map((v) => [cellKey(v.x, v.y, v.z), v]));

  for (const key of occupied) {
    if (visited.has(key)) continue;
    const queue = [key];
    visited.add(key);
    const comp: Array<{ x: number; y: number; z: number; color: number }> = [];

    while (queue.length) {
      const current = queue.shift()!;
      const c = parseCellKey(current);
      const currentVoxel = voxelMap.get(current);
      if (currentVoxel) comp.push(currentVoxel);

      const neighbors = [
        cellKey(c.x + 1, c.y, c.z),
        cellKey(c.x - 1, c.y, c.z),
        cellKey(c.x, c.y + 1, c.z),
        cellKey(c.x, c.y - 1, c.z),
        cellKey(c.x, c.y, c.z + 1),
        cellKey(c.x, c.y, c.z - 1),
      ];
      for (const n of neighbors) {
        if (occupied.has(n) && !visited.has(n)) {
          visited.add(n);
          queue.push(n);
        }
      }
    }
    components.push(comp);
  }
  return components;
}

function closestPairByXZ(
  a: Array<{ x: number; y: number; z: number }>,
  b: Array<{ x: number; y: number; z: number }>
) {
  let bestA = a[0];
  let bestB = b[0];
  let bestDist = Number.POSITIVE_INFINITY;
  for (const va of a) {
    for (const vb of b) {
      const dist = Math.abs(va.x - vb.x) + Math.abs(va.z - vb.z);
      if (dist < bestDist) {
        bestDist = dist;
        bestA = va;
        bestB = vb;
      }
    }
  }
  return { a: bestA, b: bestB };
}

function addManhattanBridgeOnGround(
  voxels: Array<{ x: number; y: number; z: number; color: number }>,
  from: { x: number; y: number; z: number },
  to: { x: number; y: number; z: number },
  color: number
) {
  const additions: Array<{ x: number; y: number; z: number; color: number }> = [];
  let x = from.x;
  let z = from.z;
  const y = 0;

  while (x !== to.x) {
    x += x < to.x ? 1 : -1;
    additions.push({ x, y, z, color });
  }
  while (z !== to.z) {
    z += z < to.z ? 1 : -1;
    additions.push({ x, y, z, color });
  }

  voxels.push(...additions);
  return additions.length;
}

function repairVoxelConnectivity(
  sourceVoxels: Array<{ x: number; y: number; z: number; color: number }>,
  bricks: Brick[],
  validation: ConnectionValidation
): { voxels: Array<{ x: number; y: number; z: number; color: number }>; stats: RepairStats } {
  const _unused = bricks; // Keep parameter for future brick-guided repair extensions.
  const repaired = [...sourceVoxels];
  let addedSupportVoxels = 0;
  let addedBridgeVoxels = 0;

  // Step 1: Ensure every floating voxel has vertical support down to y=0.
  const occupied = new Set(repaired.map((v) => cellKey(v.x, v.y, v.z)));
  for (const v of [...repaired]) {
    if (v.y <= 0) continue;
    const belowKey = cellKey(v.x, v.y - 1, v.z);
    if (!occupied.has(belowKey)) {
      for (let yy = v.y - 1; yy >= 0; yy--) {
        const k = cellKey(v.x, yy, v.z);
        if (!occupied.has(k)) {
          repaired.push({ x: v.x, y: yy, z: v.z, color: v.color });
          occupied.add(k);
          addedSupportVoxels++;
        }
      }
    }
  }

  // Step 2: Connect disconnected components by ground-level Manhattan bridges.
  let components = findConnectedComponentsFromVoxels(dedupeVoxels(repaired));
  while (components.length > 1) {
    const base = components[0];
    let bestIdx = 1;
    let bestDist = Number.POSITIVE_INFINITY;
    let bestPair = closestPairByXZ(base, components[1]);

    for (let i = 1; i < components.length; i++) {
      const pair = closestPairByXZ(base, components[i]);
      const d = Math.abs(pair.a.x - pair.b.x) + Math.abs(pair.a.z - pair.b.z);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
        bestPair = pair;
      }
    }

    const bridgeColor = base[0]?.color || 0xcccccc;
    addedBridgeVoxels += addManhattanBridgeOnGround(repaired, bestPair.a, bestPair.b, bridgeColor);
    components = findConnectedComponentsFromVoxels(dedupeVoxels(repaired));
  }

  const repairedFlag = validation.physicallyFeasible === false && (addedSupportVoxels > 0 || addedBridgeVoxels > 0);
  return {
    voxels: dedupeVoxels(repaired),
    stats: {
      addedSupportVoxels,
      addedBridgeVoxels,
      repaired: repairedFlag,
    },
  };
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
    const initialBricks = voxelToBricks(voxels);
    const initialValidation = validateBrickConnectivity(initialBricks);

    let finalVoxels = voxels;
    let repairStats: RepairStats = {
      addedSupportVoxels: 0,
      addedBridgeVoxels: 0,
      repaired: false,
    };

    if (!initialValidation.physicallyFeasible) {
      const repaired = repairVoxelConnectivity(voxels, initialBricks, initialValidation);
      finalVoxels = repaired.voxels;
      repairStats = repaired.stats;
    }

    const bricks = voxelToBricks(finalVoxels);
    const connectionValidation = validateBrickConnectivity(bricks);

    return jsonResponse(res, req, 200, {
      voxels: finalVoxels,
      bricks,
      availableBrickTypes: ['1x1', '1x2', '2x2', '2x3', '2x4'],
      validationBeforeRepair: initialValidation,
      connectionValidation,
      repairStats,
    });
  } catch (error: any) {
    console.error('generate-voxel failed:', error);
    const message = error?.message || 'Unknown server error';
    return jsonResponse(res, req, 500, { error: message });
  }
}
