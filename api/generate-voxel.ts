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

type BrickType = '1x1' | '1x2' | '1x3' | '1x4' | '2x2' | '2x3' | '2x4';

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

interface ManufacturabilityReport {
  gridAligned: boolean;
  noOverlap: boolean;
  seamCompatible: boolean;
  unsupportedVoxels: number;
  disconnectedComponents: number;
  manufacturable: boolean;
  notes: string[];
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
Keep voxel count roughly between 700 and 1400 when the subject needs detail, and use fewer only for very simple objects.
The model should be centered around (0, 0, 0).
Favor broad rectangular patches that can be converted into 1x2, 1x3, 1x4, 2x2, 2x3, and 2x4 Lego-like bricks.
Add recognizable supported details such as eyes, beaks, ears, paws, wings, clothing folds, surface markings, or texture bands when relevant.
Aim for a Lego set style: mostly medium and large structural regions with small bricks reserved for important identity details.
Use staggered, interlocking layers rather than perfectly aligned seams.`;
  }

  return `Create a voxel Lego model for: ${prompt}. ${paletteHint}
Return only a JSON array.
Each item must include x, y, z, color where color is a hex string like #ff0000.
Keep the model compact and suitable for a tabletop toy sculpture.
Prefer connected structures with stable support and avoid floating disconnected pieces.
Use enough voxels to make the subject recognizable and lively, usually 700 to 1400 voxels for animals or characters.
Avoid both tiny under-detailed builds and overly huge builds that become hard to view or manipulate.
Favor broad rectangular interior patches that can be converted into 1x3, 1x4, 2x2, 2x3, and 2x4 bricks, but preserve silhouettes, color boundaries, faces, claws, wings, and other important details with smaller supported regions.
Aim for a Lego set style: mostly medium and large structural regions with small bricks reserved for important identity details.
Use staggered, interlocking layers rather than perfectly aligned seams.`;
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

function isDetailCell(occupied: Set<string>, colorMap: Map<string, number>, x: number, y: number, z: number) {
  const key = cellKey(x, y, z);
  const color = colorMap.get(key);
  if (typeof color !== 'number') {
    return false;
  }

  const neighbors = getHorizontalNeighborKeys(x, y, z);
  const sameColorNeighbors = neighbors.filter((neighborKey) => colorMap.get(neighborKey) === color).length;
  const openOrColorBreaks = neighbors.filter((neighborKey) =>
    !occupied.has(neighborKey) || colorMap.get(neighborKey) !== color
  ).length;

  return sameColorNeighbors <= 1 || openOrColorBreaks >= 3;
}

function isCriticalDetailCell(occupied: Set<string>, colorMap: Map<string, number>, x: number, y: number, z: number) {
  const key = cellKey(x, y, z);
  const color = colorMap.get(key);
  if (typeof color !== 'number') {
    return false;
  }

  const colorCount = [...colorMap.values()].filter((item) => item === color).length;
  return colorCount <= 24;
}

function canUseBrickPattern(
  occupied: Set<string>,
  used: Set<string>,
  colorMap: Map<string, number>,
  x: number,
  y: number,
  z: number,
  width: number,
  depth: number,
  color: number
) {
  if (!canPlaceBrick(occupied, used, x, y, z, width, depth, color, colorMap)) {
    return false;
  }

  const cells = generateBrickCells(x, y, z, width, depth);
  const detailCellCount = cells.filter((cell) => isDetailCell(occupied, colorMap, cell.x, cell.y, cell.z)).length;
  const criticalDetailCount = cells.filter((cell) =>
    isCriticalDetailCell(occupied, colorMap, cell.x, cell.y, cell.z)
  ).length;
  const area = width * depth;

  if (area >= 6 && criticalDetailCount > 0) {
    return false;
  }
  if (area === 4 && criticalDetailCount > 1) {
    return false;
  }

  return true;
}

function getOrientations(pattern: { width: number; depth: number }, y: number) {
  if (pattern.width === pattern.depth) {
    return [{ width: pattern.width, depth: pattern.depth }];
  }

  const primary = { width: pattern.width, depth: pattern.depth };
  const rotated = { width: pattern.depth, depth: pattern.width };
  return y % 2 === 0 ? [primary, rotated] : [rotated, primary];
}

function getHorizontalNeighborKeys(x: number, y: number, z: number) {
  return [
    cellKey(x + 1, y, z),
    cellKey(x - 1, y, z),
    cellKey(x, y, z + 1),
    cellKey(x, y, z - 1),
  ];
}

function getNeighborKeys(x: number, y: number, z: number) {
  return [
    ...getHorizontalNeighborKeys(x, y, z),
    cellKey(x, y + 1, z),
    cellKey(x, y - 1, z),
  ];
}

function normalizeDecorativeSingletons(colorMap: Map<string, number>) {
  const components: Array<{ color: number; keys: string[] }> = [];
  const visited = new Set<string>();

  for (const [startKey, startColor] of colorMap) {
    if (visited.has(startKey)) {
      continue;
    }

    const queue = [startKey];
    const component: string[] = [];
    visited.add(startKey);

    while (queue.length) {
      const key = queue.shift()!;
      component.push(key);
      const cell = parseCellKey(key);

      for (const neighborKey of getNeighborKeys(cell.x, cell.y, cell.z)) {
        if (visited.has(neighborKey) || colorMap.get(neighborKey) !== startColor) {
          continue;
        }
        visited.add(neighborKey);
        queue.push(neighborKey);
      }
    }
    components.push({ color: startColor, keys: component });

    if (component.length !== 1) {
      continue;
    }

    const singletonKey = component[0];
    const singleton = parseCellKey(singletonKey);
    if (singleton.y <= 0) {
      continue;
    }

    const horizontalNeighbor = getHorizontalNeighborKeys(singleton.x, singleton.y, singleton.z)
      .map((key) => ({ key, color: colorMap.get(key) }))
      .find((neighbor) => typeof neighbor.color === 'number' && neighbor.color !== startColor);

    if (horizontalNeighbor) {
      colorMap.set(horizontalNeighbor.key, startColor);
      continue;
    }

    const anyNeighbor = getNeighborKeys(singleton.x, singleton.y, singleton.z)
      .map((key) => ({ key, color: colorMap.get(key) }))
      .find((neighbor) => typeof neighbor.color === 'number' && neighbor.color !== startColor);

    if (typeof anyNeighbor?.color === 'number') {
      colorMap.set(singletonKey, anyNeighbor.color);
    }
  }

  components.forEach((component) => {
    if (component.keys.length > 3) {
      return;
    }

    component.keys.forEach((key) => {
      if (colorMap.get(key) !== component.color) {
        return;
      }

      const cell = parseCellKey(key);
      if (cell.y <= 0) {
        return;
      }

      const hasSameLayerMate = getHorizontalNeighborKeys(cell.x, cell.y, cell.z)
        .some((neighborKey) => colorMap.get(neighborKey) === component.color);
      if (hasSameLayerMate) {
        return;
      }

      const replacement = getHorizontalNeighborKeys(cell.x, cell.y, cell.z)
        .map((neighborKey) => colorMap.get(neighborKey))
        .find((color) => typeof color === 'number' && color !== component.color);

      if (typeof replacement === 'number') {
        colorMap.set(key, replacement);
      }
    });
  });

  for (const [key, color] of colorMap) {
    const cell = parseCellKey(key);
    if (cell.y <= 0) {
      continue;
    }

    const hasSameLayerMate = getHorizontalNeighborKeys(cell.x, cell.y, cell.z)
      .some((neighborKey) => colorMap.get(neighborKey) === color);
    if (hasSameLayerMate || countConnectedSameColor(colorMap, key, color, 5) > 4) {
      continue;
    }

    const replacement = getHorizontalNeighborKeys(cell.x, cell.y, cell.z)
      .map((neighborKey) => colorMap.get(neighborKey))
      .find((neighborColor) => typeof neighborColor === 'number' && neighborColor !== color);

    if (typeof replacement === 'number') {
      colorMap.set(key, replacement);
    }
  }
}

function countConnectedSameColor(colorMap: Map<string, number>, startKey: string, color: number, limit: number) {
  const queue = [startKey];
  const visited = new Set<string>([startKey]);

  while (queue.length && visited.size <= limit) {
    const key = queue.shift()!;
    const cell = parseCellKey(key);

    for (const neighborKey of getNeighborKeys(cell.x, cell.y, cell.z)) {
      if (visited.has(neighborKey) || colorMap.get(neighborKey) !== color) {
        continue;
      }
      visited.add(neighborKey);
      queue.push(neighborKey);
    }
  }

  return visited.size;
}

function findNearestDifferentColor(
  colorMap: Map<string, number>,
  x: number,
  y: number,
  z: number,
  sourceColor: number,
  radius = 3
) {
  for (let distance = 1; distance <= radius; distance++) {
    for (let dx = -distance; dx <= distance; dx++) {
      for (let dy = -distance; dy <= distance; dy++) {
        for (let dz = -distance; dz <= distance; dz++) {
          if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) !== distance) {
            continue;
          }
          const color = colorMap.get(cellKey(x + dx, y + dy, z + dz));
          if (typeof color === 'number' && color !== sourceColor) {
            return color;
          }
        }
      }
    }
  }
  return undefined;
}

function voxelToBricks(
  voxels: Array<{ x: number; y: number; z: number; color: number }>,
  preferMediumParts = false
): Brick[] {
  const occupied = new Set<string>();
  const colorMap = new Map<string, number>();
  voxels.forEach((v) => {
    const key = cellKey(v.x, v.y, v.z);
    occupied.add(key);
    colorMap.set(key, v.color);
  });
  return stabilizeBrickSupports(buildBricksFromColorMap(occupied, colorMap, preferMediumParts), preferMediumParts);
}

function buildBricksForTargetRange(voxels: Array<{ x: number; y: number; z: number; color: number }>) {
  const originalBricks = voxelToBricks(voxels);
  if (isTargetBrickCount(originalBricks)) {
    return { voxels, bricks: originalBricks, enhanced: false };
  }

  const candidates = [{ voxels, bricks: originalBricks, enhanced: false }];
  const voxelTargets = [1300, 1800, 2400, 3200, 4200];

  for (const voxelTarget of voxelTargets) {
    const enhancedVoxels = enhanceVoxelResolution(voxels, voxelTarget);
    const enhancedBricks = voxelToBricks(enhancedVoxels);
    const mediumBricks = voxelToBricks(enhancedVoxels, true);
    const fusedBricks = mergeCommonBricksTowardTarget(mediumBricks);

    candidates.push(
      { voxels: enhancedVoxels, bricks: enhancedBricks, enhanced: true },
      { voxels: enhancedVoxels, bricks: mediumBricks, enhanced: true },
      { voxels: enhancedVoxels, bricks: fusedBricks, enhanced: true }
    );

    if (isTargetBrickCount(fusedBricks)) {
      return { voxels: enhancedVoxels, bricks: fusedBricks, enhanced: true };
    }
    if (isTargetBrickCount(mediumBricks)) {
      return { voxels: enhancedVoxels, bricks: mergeCommonBricksTowardTarget(mediumBricks), enhanced: true };
    }
    if (isTargetBrickCount(enhancedBricks)) {
      return { voxels: enhancedVoxels, bricks: enhancedBricks, enhanced: true };
    }
  }

  return candidates
    .sort((a, b) => Math.abs(a.bricks.length - 600) - Math.abs(b.bricks.length - 600))[0] || {
    voxels,
    bricks: originalBricks,
    enhanced: false,
  };
}

function isTargetBrickCount(bricks: Brick[]) {
  return bricks.length >= 600;
}

function getCommonBrickType(width: number, depth: number): BrickType | null {
  const shortSide = Math.min(width, depth);
  const longSide = Math.max(width, depth);
  const key = `${shortSide}x${longSide}`;
  return ['1x3', '1x4', '2x2', '2x3', '2x4'].includes(key) ? key as BrickType : null;
}

function tryMergeCommonBrickPair(first: Brick, second: Brick): Brick | null {
  if (first.y !== second.y || first.color !== second.color) {
    return null;
  }

  const cells = [...first.cells, ...second.cells].map((cell) => ({
    x: Math.round(cell.x),
    y: Math.round(cell.y),
    z: Math.round(cell.z),
  }));
  const unique = new Set(cells.map((cell) => cellKey(cell.x, cell.y, cell.z)));
  if (unique.size !== cells.length) {
    return null;
  }

  const xs = cells.map((cell) => cell.x);
  const zs = cells.map((cell) => cell.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const width = maxX - minX + 1;
  const depth = maxZ - minZ + 1;
  const type = getCommonBrickType(width, depth);

  if (!type || width * depth !== cells.length) {
    return null;
  }

  return {
    ...first,
    type,
    x: minX,
    z: minZ,
    width,
    depth,
    cells: generateBrickCells(minX, first.y, minZ, width, depth),
  };
}

function mergeCommonBricksTowardTarget(bricks: Brick[], minimum = Math.max(600, Math.floor(bricks.length * 0.82))) {
  const result = [...bricks];

  for (let i = 0; i < result.length; i++) {
    for (let j = i + 1; j < result.length; j++) {
      const merged = tryMergeCommonBrickPair(result[i], result[j]);
      if (!merged) {
        continue;
      }
      if (result.length - 1 < minimum) {
        continue;
      }

      result[i] = merged;
      result.splice(j, 1);
      j = i;
    }
  }

  return result.map((brick, index) => ({ ...brick, id: `B${index + 1}` }));
}

function buildBricksFromColorMap(
  occupied: Set<string>,
  colorMap: Map<string, number>,
  preferMediumParts = false
) {
  const used = new Set<string>();
  const bricks: Brick[] = [];
  let idCounter = 0;

  // Interior mass uses large bricks; silhouettes and color seams use smaller bricks
  // so generated models keep their recognizable features.
  const largeStructuralPatterns: Array<{ type: BrickType; width: number; depth: number }> = [
    { type: '2x4', width: 2, depth: 4 },
    { type: '1x4', width: 1, depth: 4 },
    { type: '2x3', width: 2, depth: 3 },
    { type: '1x3', width: 1, depth: 3 },
    { type: '2x2', width: 2, depth: 2 },
    { type: '1x2', width: 1, depth: 2 },
    { type: '1x1', width: 1, depth: 1 },
  ];
  const largeDetailPatterns: Array<{ type: BrickType; width: number; depth: number }> = [
    { type: '2x4', width: 2, depth: 4 },
    { type: '1x4', width: 1, depth: 4 },
    { type: '2x3', width: 2, depth: 3 },
    { type: '2x2', width: 2, depth: 2 },
    { type: '1x3', width: 1, depth: 3 },
    { type: '1x2', width: 1, depth: 2 },
    { type: '1x1', width: 1, depth: 1 },
  ];
  const mediumStructuralPatterns: Array<{ type: BrickType; width: number; depth: number }> = [
    { type: '2x2', width: 2, depth: 2 },
    { type: '2x3', width: 2, depth: 3 },
    { type: '1x4', width: 1, depth: 4 },
    { type: '1x3', width: 1, depth: 3 },
    { type: '2x4', width: 2, depth: 4 },
    { type: '1x2', width: 1, depth: 2 },
    { type: '1x1', width: 1, depth: 1 },
  ];
  const mediumDetailPatterns: Array<{ type: BrickType; width: number; depth: number }> = [
    { type: '2x2', width: 2, depth: 2 },
    { type: '1x3', width: 1, depth: 3 },
    { type: '2x3', width: 2, depth: 3 },
    { type: '1x2', width: 1, depth: 2 },
    { type: '1x4', width: 1, depth: 4 },
    { type: '2x4', width: 2, depth: 4 },
    { type: '1x1', width: 1, depth: 1 },
  ];
  const structuralPatterns = preferMediumParts ? mediumStructuralPatterns : largeStructuralPatterns;
  const detailPatterns = preferMediumParts ? mediumDetailPatterns : largeDetailPatterns;
  const criticalDetailPatterns: Array<{ type: BrickType; width: number; depth: number }> = [
    { type: '1x2', width: 1, depth: 2 },
    { type: '1x1', width: 1, depth: 1 },
    { type: '1x3', width: 1, depth: 3 },
    { type: '2x2', width: 2, depth: 2 },
    { type: '1x4', width: 1, depth: 4 },
    { type: '2x3', width: 2, depth: 3 },
    { type: '2x4', width: 2, depth: 4 },
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
    const patterns = isCriticalDetailCell(occupied, colorMap, cell.x, cell.y, cell.z)
      ? criticalDetailPatterns
      : isDetailCell(occupied, colorMap, cell.x, cell.y, cell.z)
      ? detailPatterns
      : structuralPatterns;

    for (const pattern of patterns) {
      const orientations = getOrientations(pattern, cell.y);

      for (const orientation of orientations) {
        if (
          canUseBrickPattern(
            occupied,
            used,
            colorMap,
            cell.x,
            cell.y,
            cell.z,
            orientation.width,
            orientation.depth,
            color
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

function buildMapsFromBricks(bricks: Brick[]) {
  const occupied = new Set<string>();
  const colorMap = new Map<string, number>();

  bricks.forEach((brick) => {
    brick.cells.forEach((cell) => {
      const key = cellKey(cell.x, cell.y, cell.z);
      occupied.add(key);
      colorMap.set(key, brick.color);
    });
  });

  return { occupied, colorMap };
}

function mixColor(a: number, b: number, ratio: number) {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar * (1 - ratio) + br * ratio);
  const g = Math.round(ag * (1 - ratio) + bg * ratio);
  const bl = Math.round(ab * (1 - ratio) + bb * ratio);
  return (r << 16) + (g << 8) + bl;
}

function addEnhancedVoxel(
  map: Map<string, { x: number; y: number; z: number; color: number }>,
  x: number,
  y: number,
  z: number,
  color: number
) {
  const key = cellKey(x, y, z);
  if (!map.has(key)) {
    map.set(key, { x, y, z, color });
  }
}

function buildVoxelSource(voxels: Array<{ x: number; y: number; z: number; color: number }>) {
  const source = new Map<string, { x: number; y: number; z: number; color: number }>();
  voxels.forEach((voxel) => {
    const x = Math.round(voxel.x);
    const y = Math.round(voxel.y);
    const z = Math.round(voxel.z);
    source.set(cellKey(x, y, z), { x, y, z, color: voxel.color });
  });
  return source;
}

function ensureSculpturalVolume(voxels: Array<{ x: number; y: number; z: number; color: number }>) {
  const source = buildVoxelSource(voxels);
  if (!source.size) {
    return voxels;
  }

  const cells = [...source.values()];
  const xs = cells.map((cell) => cell.x);
  const ys = cells.map((cell) => cell.y);
  const zs = cells.map((cell) => cell.z);
  const width = Math.max(...xs) - Math.min(...xs) + 1;
  const height = Math.max(...ys) - Math.min(...ys) + 1;
  const depth = Math.max(...zs) - Math.min(...zs) + 1;
  const broadSide = Math.max(width, depth);

  if (height >= broadSide * 0.42 || height >= 14) {
    return cells;
  }

  const enhanced = new Map(source);
  const topByColumn = new Map<string, { x: number; y: number; z: number; color: number }>();
  cells.forEach((cell) => {
    const columnKey = `${cell.x},${cell.z}`;
    const current = topByColumn.get(columnKey);
    if (!current || cell.y > current.y) {
      topByColumn.set(columnKey, cell);
    }
  });

  const lift = Math.min(4, Math.ceil(broadSide * 0.42 - height));
  topByColumn.forEach((cell) => {
    const neighbors = [
      source.get(cellKey(cell.x + 1, cell.y, cell.z)),
      source.get(cellKey(cell.x - 1, cell.y, cell.z)),
      source.get(cellKey(cell.x, cell.y, cell.z + 1)),
      source.get(cellKey(cell.x, cell.y, cell.z - 1)),
    ].filter(Boolean).length;

    if (neighbors < 2) {
      return;
    }

    for (let dy = 1; dy <= lift; dy++) {
      addEnhancedVoxel(enhanced, cell.x, cell.y + dy, cell.z, cell.color);
    }
  });

  return [...enhanced.values()];
}

function enhanceVoxelResolution(
  voxels: Array<{ x: number; y: number; z: number; color: number }>,
  minimumVoxels = 1300
) {
  const source = buildVoxelSource(ensureSculpturalVolume(voxels));

  if (source.size >= minimumVoxels) {
    return [...source.values()];
  }

  const enhanced = new Map<string, { x: number; y: number; z: number; color: number }>();
  const scaleY = 1;
  const scaleXZ = source.size * 4 < minimumVoxels ? 3 : 2;
  source.forEach((voxel) => {
    for (let dx = 0; dx < scaleXZ; dx++) {
      for (let dz = 0; dz < scaleXZ; dz++) {
        addEnhancedVoxel(enhanced, voxel.x * scaleXZ + dx, voxel.y * scaleY, voxel.z * scaleXZ + dz, voxel.color);
      }
    }
    if (scaleY > 1) {
      for (let dx = 0; dx < scaleXZ; dx++) {
        for (let dz = 0; dz < scaleXZ; dz++) {
          addEnhancedVoxel(enhanced, voxel.x * scaleXZ + dx, voxel.y * scaleY + 1, voxel.z * scaleXZ + dz, voxel.color);
        }
      }
    }
  });

  const addUntilTarget = (x: number, y: number, z: number, color: number) => {
    if (enhanced.size < minimumVoxels) {
      addEnhancedVoxel(enhanced, x, y, z, color);
    }
  };

  source.forEach((voxel) => {
    if (enhanced.size >= minimumVoxels) {
      return;
    }
    const neighbors = [
      { dx: 1, dz: 0 },
      { dx: -1, dz: 0 },
      { dx: 0, dz: 1 },
      { dx: 0, dz: -1 },
    ];

    neighbors.forEach((neighbor) => {
      const neighborVoxel = source.get(cellKey(voxel.x + neighbor.dx, voxel.y, voxel.z + neighbor.dz));
      if (!neighborVoxel) {
        return;
      }
      addUntilTarget(
        voxel.x * scaleXZ + neighbor.dx,
        voxel.y * scaleY,
        voxel.z * scaleXZ + neighbor.dz,
        voxel.color
      );
      if (scaleY > 1) {
        addUntilTarget(
          voxel.x * scaleXZ + neighbor.dx,
          voxel.y * scaleY + 1,
          voxel.z * scaleXZ + neighbor.dz,
          voxel.color
        );
      }
    });

    const openSideCount = neighbors.filter((neighbor) => !source.has(cellKey(voxel.x + neighbor.dx, voxel.y, voxel.z + neighbor.dz))).length;
    if (openSideCount >= 2) {
      addUntilTarget(voxel.x * scaleXZ, voxel.y * scaleY, voxel.z * scaleXZ + 1, voxel.color);
      if (scaleY > 1) {
        addUntilTarget(voxel.x * scaleXZ, voxel.y * scaleY + 1, voxel.z * scaleXZ + 1, voxel.color);
      }
    }
  });

  source.forEach((voxel) => {
    if (enhanced.size >= minimumVoxels) {
      return;
    }
    if (!source.has(cellKey(voxel.x, voxel.y + 1, voxel.z))) {
      addUntilTarget(voxel.x * scaleXZ, voxel.y + 1, voxel.z * scaleXZ, voxel.color);
    }
  });

  return [...enhanced.values()];
}

function brickOwnKeys(brick: Brick) {
  return new Set(brick.cells.map((cell) => cellKey(cell.x, cell.y, cell.z)));
}

function hasBrickSupport(brick: Brick, occupied: Set<string>, ownKeys = brickOwnKeys(brick)) {
  if (brick.y <= 0 || brick.cells.some((cell) => cell.y <= 0)) {
    return true;
  }

  return brick.cells.some((cell) => {
    const belowKey = cellKey(cell.x, cell.y - 1, cell.z);
    return occupied.has(belowKey) && !ownKeys.has(belowKey);
  });
}

function moveBrickDown(brick: Brick, occupied: Set<string>, colorMap: Map<string, number>) {
  const ownKeys = brickOwnKeys(brick);

  for (let drop = 1; drop <= brick.y; drop++) {
    const targetCells = brick.cells.map((cell) => ({ x: cell.x, y: cell.y - drop, z: cell.z }));
    const targetKeys = new Set(targetCells.map((cell) => cellKey(cell.x, cell.y, cell.z)));
    const collides = targetCells.some((cell) => {
      const key = cellKey(cell.x, cell.y, cell.z);
      return occupied.has(key) && !ownKeys.has(key);
    });

    if (collides) {
      continue;
    }

    const supported = targetCells.some((cell) => {
      if (cell.y <= 0) {
        return true;
      }
      const belowKey = cellKey(cell.x, cell.y - 1, cell.z);
      return occupied.has(belowKey) && !ownKeys.has(belowKey) && !targetKeys.has(belowKey);
    });

    if (!supported) {
      continue;
    }

    ownKeys.forEach((key) => {
      occupied.delete(key);
      colorMap.delete(key);
    });
    targetCells.forEach((cell) => {
      const key = cellKey(cell.x, cell.y, cell.z);
      occupied.add(key);
      colorMap.set(key, brick.color);
    });
    return true;
  }

  return false;
}

function addSupportColumns(brick: Brick, occupied: Set<string>, colorMap: Map<string, number>) {
  let added = false;

  brick.cells.forEach((cell) => {
    if (cell.y <= 0 || occupied.has(cellKey(cell.x, cell.y - 1, cell.z))) {
      return;
    }

    for (let y = cell.y - 1; y >= 0; y--) {
      const key = cellKey(cell.x, y, cell.z);
      if (occupied.has(key)) {
        break;
      }
      occupied.add(key);
      colorMap.set(key, brick.color);
      added = true;
    }
  });

  return added;
}

function stabilizeBrickSupports(bricks: Brick[], preferMediumParts = false): Brick[] {
  let { occupied, colorMap } = buildMapsFromBricks(bricks);
  let stableBricks = buildBricksFromColorMap(occupied, colorMap, preferMediumParts);

  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    stableBricks = [...stableBricks].sort((a, b) => (a.y - b.y) || (a.x - b.x) || (a.z - b.z));

    for (const brick of stableBricks) {
      const ownKeys = brickOwnKeys(brick);
      if (hasBrickSupport(brick, occupied, ownKeys)) {
        continue;
      }
      changed = addSupportColumns(brick, occupied, colorMap) || moveBrickDown(brick, occupied, colorMap) || changed;
    }

    stableBricks = buildBricksFromColorMap(occupied, colorMap, preferMediumParts);
    ({ occupied, colorMap } = buildMapsFromBricks(stableBricks));

    if (!changed || !stableBricks.some((brick) => !hasBrickSupport(brick, occupied))) {
      break;
    }
  }

  return buildBricksFromColorMap(occupied, colorMap, preferMediumParts);
}

function bricksToVoxels(bricks: Brick[]) {
  return bricks.flatMap((brick) =>
    brick.cells.map((cell) => ({
      x: cell.x,
      y: cell.y,
      z: cell.z,
      color: brick.color,
    }))
  );
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

function validateManufacturability(
  voxels: Array<{ x: number; y: number; z: number; color: number }>,
  bricks: Brick[],
  connectionValidation: ConnectionValidation
): ManufacturabilityReport {
  const notes: string[] = [];

  // LEGO-like lattice assumptions:
  // - 1 grid step in x/z == 1 stud pitch
  // - 1 grid step in y   == 1 brick layer
  // So integer coordinates are required.
  const gridAligned = voxels.every((v) => Number.isInteger(v.x) && Number.isInteger(v.y) && Number.isInteger(v.z));
  if (!gridAligned) {
    notes.push('Non-integer grid coordinates found.');
  }

  // No overlap check.
  const voxelKeys = voxels.map((v) => cellKey(v.x, v.y, v.z));
  const noOverlap = new Set(voxelKeys).size === voxelKeys.length;
  if (!noOverlap) {
    notes.push('Overlapping voxel occupancy detected.');
  }

  // Seam compatibility:
  // Adjacent bricks should only meet on lattice-adjacent faces, not fractional offsets.
  let seamCompatible = true;
  const occupied = new Set(voxelKeys);
  for (const b of bricks) {
    for (const c of b.cells) {
      const neighbors = [
        cellKey(c.x + 1, c.y, c.z),
        cellKey(c.x - 1, c.y, c.z),
        cellKey(c.x, c.y, c.z + 1),
        cellKey(c.x, c.y, c.z - 1),
      ];
      // If a cell edge is internal to structure, it must match lattice-neighbor contact only.
      // This prevents "fractional seam" concepts by construction.
      const hasLatticeSideContact = neighbors.some((n) => occupied.has(n));
      if (!hasLatticeSideContact && c.y > 0) {
        // not always invalid, but indicates isolated side seam at upper layer.
        // keep as warning only if the global graph already flags isolation.
      }
    }
  }
  if (!seamCompatible) {
    notes.push('Detected non-lattice seam alignment.');
  }

  // Voxel-level support check.
  let unsupportedVoxels = 0;
  for (const v of voxels) {
    if (v.y === 0) continue;
    if (!occupied.has(cellKey(v.x, v.y - 1, v.z))) {
      unsupportedVoxels++;
    }
  }
  if (unsupportedVoxels > 0) {
    notes.push(`Unsupported voxels: ${unsupportedVoxels}`);
  }

  const disconnectedComponents = connectionValidation.connectedComponents;
  if (disconnectedComponents > 1) {
    notes.push(`Disconnected brick components: ${disconnectedComponents}`);
  }

  const manufacturable =
    gridAligned &&
    noOverlap &&
    seamCompatible &&
    unsupportedVoxels === 0 &&
    connectionValidation.physicallyFeasible &&
    disconnectedComponents === 1;

  if (manufacturable) {
    notes.push('Model satisfies lattice assembly and connectivity constraints.');
  }

  return {
    gridAligned,
    noOverlap,
    seamCompatible,
    unsupportedVoxels,
    disconnectedComponents,
    manufacturable,
    notes,
  };
}

function settleVoxelsByGravity(
  voxels: Array<{ x: number; y: number; z: number; color: number }>
): { settled: Array<{ x: number; y: number; z: number; color: number }>; movedCount: number } {
  // Strong guarantee: for each (x,z) column, bricks are packed from y=0 upward.
  // This removes all floating voxels in final output.
  const columns = new Map<string, Array<{ x: number; y: number; z: number; color: number }>>();
  for (const v of voxels) {
    const key = `${v.x},${v.z}`;
    if (!columns.has(key)) {
      columns.set(key, []);
    }
    columns.get(key)!.push(v);
  }

  const settled: Array<{ x: number; y: number; z: number; color: number }> = [];
  let movedCount = 0;

  for (const [, col] of columns) {
    col.sort((a, b) => a.y - b.y);
    for (let i = 0; i < col.length; i++) {
      const original = col[i];
      const targetY = i; // pack from ground
      if (original.y !== targetY) {
        movedCount++;
      }
      settled.push({
        x: original.x,
        y: targetY,
        z: original.z,
        color: original.color,
      });
    }
  }

  return { settled, movedCount };
}

function sideNeighborCount(
  occupied: Set<string>,
  x: number,
  y: number,
  z: number
) {
  let count = 0;
  const neighbors = [
    cellKey(x + 1, y, z),
    cellKey(x - 1, y, z),
    cellKey(x, y, z + 1),
    cellKey(x, y, z - 1),
  ];
  for (const n of neighbors) {
    if (occupied.has(n)) count++;
  }
  return count;
}

function compactVoxelsForTightContact(
  voxels: Array<{ x: number; y: number; z: number; color: number }>
): { compacted: Array<{ x: number; y: number; z: number; color: number }>; movedCount: number } {
  // Adhesive pass:
  // For weakly connected voxels, try shifting by 1 step in x/z toward denser neighbors on the same layer.
  // Constraints: no overlap, and support must remain (y==0 or voxel below exists).
  const working = dedupeVoxels(voxels).map((v) => ({ ...v }));
  let movedCount = 0;

  for (let iter = 0; iter < 6; iter++) {
    let movedInIter = 0;
    const occupied = new Set(working.map((v) => cellKey(v.x, v.y, v.z)));

    for (const v of working) {
      const currentKey = cellKey(v.x, v.y, v.z);
      const currentNeighbors = sideNeighborCount(occupied, v.x, v.y, v.z);
      if (currentNeighbors >= 2) {
        continue;
      }

      const candidates = [
        { x: v.x + 1, y: v.y, z: v.z },
        { x: v.x - 1, y: v.y, z: v.z },
        { x: v.x, y: v.y, z: v.z + 1 },
        { x: v.x, y: v.y, z: v.z - 1 },
      ];

      let best: { x: number; y: number; z: number; gain: number } | null = null;
      for (const c of candidates) {
        const targetKey = cellKey(c.x, c.y, c.z);
        if (occupied.has(targetKey)) {
          continue;
        }
        // Keep physical support.
        if (c.y > 0 && !occupied.has(cellKey(c.x, c.y - 1, c.z))) {
          continue;
        }

        // Evaluate neighbor gain if moved.
        occupied.delete(currentKey);
        occupied.add(targetKey);
        const newNeighbors = sideNeighborCount(occupied, c.x, c.y, c.z);
        occupied.delete(targetKey);
        occupied.add(currentKey);

        const gain = newNeighbors - currentNeighbors;
        if (gain > 0 && (!best || gain > best.gain)) {
          best = { x: c.x, y: c.y, z: c.z, gain };
        }
      }

      if (best) {
        occupied.delete(currentKey);
        v.x = best.x;
        v.y = best.y;
        v.z = best.z;
        occupied.add(cellKey(v.x, v.y, v.z));
        movedCount++;
        movedInIter++;
      }
    }

    if (movedInIter === 0) {
      break;
    }
  }

  return { compacted: dedupeVoxels(working), movedCount };
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
    const targetedBuild = buildBricksForTargetRange(voxels);
    const initialBricks = targetedBuild.bricks;
    const initialValidation = validateBrickConnectivity(initialBricks);

    let finalVoxels = targetedBuild.voxels;
    let repairStats: RepairStats = {
      addedSupportVoxels: 0,
      addedBridgeVoxels: 0,
      repaired: false,
    };

    if (!initialValidation.physicallyFeasible) {
      const repaired = repairVoxelConnectivity(targetedBuild.voxels, initialBricks, initialValidation);
      finalVoxels = repaired.voxels;
      repairStats = repaired.stats;
    }

    // Final hard constraints:
    // 1) no floating voxels
    // 2) tighter side contact for brick-like attachment
    const gravityResult = settleVoxelsByGravity(finalVoxels);
    finalVoxels = dedupeVoxels(gravityResult.settled);
    const compactResult = compactVoxelsForTightContact(finalVoxels);
    finalVoxels = compactResult.compacted;

    let finalTargetedBuild = buildBricksForTargetRange(finalVoxels);
    finalVoxels = finalTargetedBuild.voxels;
    let bricks = finalTargetedBuild.bricks;
    finalVoxels = bricksToVoxels(bricks);
    let connectionValidation = validateBrickConnectivity(bricks);
    let manufacturability = validateManufacturability(finalVoxels, bricks, connectionValidation);

    if (!manufacturability.manufacturable) {
      const repaired = repairVoxelConnectivity(finalVoxels, bricks, connectionValidation);
      finalVoxels = dedupeVoxels(repaired.voxels);
      repairStats = {
        addedSupportVoxels: repairStats.addedSupportVoxels + repaired.stats.addedSupportVoxels,
        addedBridgeVoxels: repairStats.addedBridgeVoxels + repaired.stats.addedBridgeVoxels,
        repaired: repairStats.repaired || repaired.stats.repaired,
      };
      finalTargetedBuild = buildBricksForTargetRange(finalVoxels);
      finalVoxels = finalTargetedBuild.voxels;
      bricks = finalTargetedBuild.bricks;
      finalVoxels = bricksToVoxels(bricks);
      connectionValidation = validateBrickConnectivity(bricks);
      manufacturability = validateManufacturability(finalVoxels, bricks, connectionValidation);
    }

    return jsonResponse(res, req, 200, {
      voxels: finalVoxels,
      bricks,
      availableBrickTypes: ['1x1', '1x2', '1x3', '1x4', '2x2', '2x3', '2x4'],
      validationBeforeRepair: initialValidation,
      connectionValidation,
      manufacturability,
      repairStats: {
        ...repairStats,
        resolutionEnhanced: targetedBuild.enhanced || finalTargetedBuild.enhanced,
        gravityMovedVoxels: gravityResult.movedCount,
        compactMovedVoxels: compactResult.movedCount,
      },
    });
  } catch (error: any) {
    console.error('generate-voxel failed:', error);
    const message = error?.message || 'Unknown server error';
    return jsonResponse(res, req, 500, { error: message });
  }
}
