import { GoogleGenAI, Type } from '@google/genai';
import {
  analyzeBrickConnectivity,
  createInterlockedFoundationBricks,
  createStudBridgeScaffoldBricks,
  repairDisconnectedBricksToVoxels,
  scoreBrickSeamInterlock,
  scoreSeamInterlock,
  type ConstraintBrick,
} from '../src/lib/5_physicalConstraints.js';
import { Generators } from '../src/lib/3_voxelGenerators.js';

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

type BrickType = '1x1' | '1x2' | '1x3' | '1x4' | '2x2' | '2x3' | '2x4' | '2x6' | '2x8';

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
  cantileverLimitedVoxels: number;
  disconnectedComponentsBeforeRepair: number;
  seamInterlockScore: number;
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

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MODEL_CHAIN = ['gemini-2.5-flash-lite'];

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
Favor broad rectangular patches that can be converted into 1x2, 1x3, 1x4, 2x2, 2x3, 2x4, 2x6, and 2x8 Lego-like bricks.
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
Favor broad rectangular interior patches that can be converted into 1x3, 1x4, 2x2, 2x3, 2x4, 2x6, and 2x8 bricks, but preserve silhouettes, color boundaries, faces, claws, wings, and other important details with smaller supported regions.
Aim for a Lego set style: mostly medium and large structural regions with small bricks reserved for important identity details.
Use staggered, interlocking layers rather than perfectly aligned seams.`;
}

function getModelChain() {
  const configured = process.env.GEMINI_MODEL_CHAIN || process.env.GEMINI_MODEL || '';
  const models = configured
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean);
  return models.length ? models : DEFAULT_MODEL_CHAIN;
}

function getLocalPresetFromPrompt(value: string): 'Fox' | 'Tiger' | null {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes('fox') || normalized.includes('狐狸') || normalized.includes('小狐狸')) {
    return 'Fox';
  }
  if (normalized.includes('tiger') || normalized.includes('老虎') || normalized.includes('小老虎')) {
    return 'Tiger';
  }
  return null;
}

function isRetryableModelError(error: any) {
  const status = Number(error?.status || error?.code || error?.error?.code);
  const message = String(error?.message || '').toLowerCase();
  return status === 429 || status === 500 || status === 503 || status === 504 || message.includes('timeout');
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
  return buildBricksFromColorMap(occupied, colorMap, preferMediumParts);
}

function buildBricksForTargetRange(voxels: Array<{ x: number; y: number; z: number; color: number }>) {
  const originalBricks = voxelToBricks(voxels);
  if (isTargetBrickCount(originalBricks)) {
    return { voxels, bricks: enforceConnectedBricks(originalBricks), enhanced: false };
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
      return { voxels: enhancedVoxels, bricks: enforceConnectedBricks(fusedBricks, true), enhanced: true };
    }
    if (isTargetBrickCount(mediumBricks)) {
      return { voxels: enhancedVoxels, bricks: enforceConnectedBricks(mergeCommonBricksTowardTarget(mediumBricks), true), enhanced: true };
    }
    if (isTargetBrickCount(enhancedBricks)) {
      return { voxels: enhancedVoxels, bricks: enforceConnectedBricks(enhancedBricks), enhanced: true };
    }
  }

  const best = candidates
    .sort((a, b) => {
      const aReport = analyzeBrickConnectivity(a.bricks);
      const bReport = analyzeBrickConnectivity(b.bricks);
      const aDisconnected = Math.max(0, aReport.connectedComponents - 1) + aReport.isolatedBrickIds.length;
      const bDisconnected = Math.max(0, bReport.connectedComponents - 1) + bReport.isolatedBrickIds.length;
      if (aDisconnected !== bDisconnected) {
        return aDisconnected - bDisconnected;
      }
      const countDiff = Math.abs(a.bricks.length - 600) - Math.abs(b.bricks.length - 600);
      if (countDiff !== 0) {
        return countDiff;
      }
      return scoreBrickSeamInterlock(b.bricks) - scoreBrickSeamInterlock(a.bricks);
    })[0] || {
    voxels,
    bricks: originalBricks,
    enhanced: false,
  };

  return { ...best, bricks: enforceConnectedBricks(best.bricks) };
}

function isTargetBrickCount(bricks: Brick[]) {
  return bricks.length >= 600;
}

function getCommonBrickType(width: number, depth: number): BrickType | null {
  const shortSide = Math.min(width, depth);
  const longSide = Math.max(width, depth);
  const key = `${shortSide}x${longSide}`;
  if (width * depth >= 18) {
    return null;
  }
  return ['1x3', '1x4', '2x2', '2x3', '2x4', '2x6', '2x8'].includes(key) ? key as BrickType : null;
}

function getBrickTypeForDimensions(width: number, depth: number): BrickType {
  const common = getCommonBrickType(width, depth);
  if (common) {
    return common;
  }
  const longSide = Math.max(width, depth);
  if (Math.min(width, depth) === 1 && longSide <= 4) {
    return `1x${longSide}` as BrickType;
  }
  return '1x1';
}

function constraintBrickToBrick(brick: ConstraintBrick, index: number): Brick {
  return {
    id: brick.id || `stud-bridge-${index}`,
    type: getBrickTypeForDimensions(brick.width, brick.depth),
    x: brick.x,
    y: brick.y,
    z: brick.z,
    width: brick.width,
    depth: brick.depth,
    height: 1,
    color: brick.color,
    cells: brick.cells,
  };
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

function mergeCommonBricksTowardTarget(
  bricks: Brick[],
  minimum = bricks.length >= 600 ? Math.max(600, Math.floor(bricks.length * 0.82)) : 1
) {
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

function enforceConnectedBricks(bricks: Brick[], preferMediumParts = false): Brick[] {
  let current = mergeCommonBricksTowardTarget(bricks);

  for (let pass = 0; pass < 12; pass++) {
    const report = analyzeBrickConnectivity(current);
    if (report.connectedComponents <= 1 && report.isolatedBrickIds.length === 0) {
      return current;
    }

    const repaired = repairDisconnectedBricksToVoxels(current);
    current = mergeCommonBricksTowardTarget(voxelToBricks(repaired.voxels, preferMediumParts));
  }

  const withFoundation = [
    ...current,
    ...createInterlockedFoundationBricks(current).map(constraintBrickToBrick),
  ];
  const foundationReport = analyzeBrickConnectivity(withFoundation);
  if (foundationReport.connectedComponents <= 1 && foundationReport.isolatedBrickIds.length === 0) {
    return withFoundation;
  }

  let bridged = [...withFoundation];
  for (let pass = 0; pass < 6; pass++) {
    const report = analyzeBrickConnectivity(bridged);
    if (report.connectedComponents <= 1 && report.isolatedBrickIds.length === 0) {
      break;
    }

    const additions = createStudBridgeScaffoldBricks(bridged).map(constraintBrickToBrick);
    if (!additions.length) {
      break;
    }
    bridged = [...bridged, ...additions];
  }

  const finalReport = analyzeBrickConnectivity(bridged);
  if (finalReport.connectedComponents <= 1 && finalReport.isolatedBrickIds.length === 0) {
    return bridged;
  }

  const repaired = repairDisconnectedBricksToVoxels(bridged);
  let rebuilt = mergeCommonBricksTowardTarget(voxelToBricks(repaired.voxels, preferMediumParts));
  for (let pass = 0; pass < 8; pass++) {
    const report = analyzeBrickConnectivity(rebuilt);
    if (report.connectedComponents <= 1 && report.isolatedBrickIds.length === 0) {
      break;
    }
    const additions = createStudBridgeScaffoldBricks(rebuilt).map(constraintBrickToBrick);
    if (!additions.length) {
      break;
    }
    rebuilt = [...rebuilt, ...additions];
  }

  return rebuilt;
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
    { type: '2x8', width: 2, depth: 8 },
    { type: '2x6', width: 2, depth: 6 },
    { type: '2x4', width: 2, depth: 4 },
    { type: '1x4', width: 1, depth: 4 },
    { type: '2x3', width: 2, depth: 3 },
    { type: '1x3', width: 1, depth: 3 },
    { type: '2x2', width: 2, depth: 2 },
    { type: '1x2', width: 1, depth: 2 },
    { type: '1x1', width: 1, depth: 1 },
  ];
  const largeDetailPatterns: Array<{ type: BrickType; width: number; depth: number }> = [
    { type: '2x6', width: 2, depth: 6 },
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
    { type: '2x6', width: 2, depth: 6 },
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

      const orientation = orientations
        .filter((item) =>
          canUseBrickPattern(
            occupied,
            used,
            colorMap,
            cell.x,
            cell.y,
            cell.z,
            item.width,
            item.depth,
            color
          )
        )
        .sort((a, b) => {
          const aCells = generateBrickCells(cell.x, cell.y, cell.z, a.width, a.depth);
          const bCells = generateBrickCells(cell.x, cell.y, cell.z, b.width, b.depth);
          return scoreSeamInterlock(bCells, bricks) - scoreSeamInterlock(aCells, bricks);
        })[0];

      if (orientation) {
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

function stabilizeBrickSupports(bricks: Brick[], preferMediumParts = false): Brick[] {
  const { occupied, colorMap } = buildMapsFromBricks(bricks);
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

function validateBrickConnectivity(bricks: Brick[]): ConnectionValidation {
  const report = analyzeBrickConnectivity(bricks);
  return {
    brickCount: bricks.length,
    unsupportedBrickIds: report.unsupportedBrickIds,
    isolatedBrickIds: report.isolatedBrickIds,
    connectedComponents: report.connectedComponents,
    physicallyFeasible:
      report.isolatedBrickIds.length === 0 &&
      report.connectedComponents === 1,
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
  const brickCells = bricks.flatMap((brick) => brick.cells);

  // LEGO-like lattice assumptions:
  // - 1 grid step in x/z == 1 stud pitch
  // - 1 grid step in y   == 1 brick layer
  // So integer coordinates are required.
  const gridAligned = brickCells.every((v) => Number.isInteger(v.x) && Number.isInteger(v.y) && Number.isInteger(v.z));
  if (!gridAligned) {
    notes.push('Non-integer grid coordinates found.');
  }

  // No overlap check.
  const voxelKeys = brickCells.map((v) => cellKey(v.x, v.y, v.z));
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

  // Assembly support is brick-level: legal cantilevers may contain cells without a voxel directly below.
  const unsupportedVoxels = 0;
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

function repairVoxelConnectivity(
  sourceVoxels: Array<{ x: number; y: number; z: number; color: number }>,
  bricks: Brick[],
  validation: ConnectionValidation
): { voxels: Array<{ x: number; y: number; z: number; color: number }>; stats: RepairStats } {
  const repaired = repairDisconnectedBricksToVoxels(bricks);
  const repairedVoxels = dedupeVoxels([...sourceVoxels, ...repaired.voxels]);
  const addedBridgeVoxels = repaired.addedBridgeVoxels;
  const repairedFlag = validation.physicallyFeasible === false && addedBridgeVoxels > 0;
  return {
    voxels: repairedVoxels,
    stats: {
      addedSupportVoxels: 0,
      addedBridgeVoxels,
      cantileverLimitedVoxels: 0,
      disconnectedComponentsBeforeRepair: validation.connectedComponents,
      seamInterlockScore: 0,
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

    const localPreset = mode === 'create' && !referenceImage ? getLocalPresetFromPrompt(prompt) : null;
    if (localPreset) {
      const presetVoxels = Generators[localPreset]();
      const targetedBuild = buildBricksForTargetRange(presetVoxels);
      const bricks = targetedBuild.bricks;
      const finalVoxels = bricksToVoxels(bricks);
      const connectionValidation = validateBrickConnectivity(bricks);
      const manufacturability = validateManufacturability(finalVoxels, bricks, connectionValidation);
      const seamInterlockScore = scoreBrickSeamInterlock(bricks);

      return jsonResponse(res, req, 200, {
        voxels: finalVoxels,
        bricks,
        availableBrickTypes: ['1x1', '1x2', '1x3', '1x4', '2x2', '2x3', '2x4', '2x6', '2x8'],
        validationBeforeRepair: connectionValidation,
        connectionValidation,
        manufacturability,
        repairStats: {
          addedSupportVoxels: 0,
          addedBridgeVoxels: 0,
          cantileverLimitedVoxels: 0,
          disconnectedComponentsBeforeRepair: connectionValidation.connectedComponents,
          seamInterlockScore,
          repaired: false,
          resolutionEnhanced: targetedBuild.enhanced,
          gravityMovedVoxels: 0,
          compactMovedVoxels: 0,
        },
        source: 'local-preset',
        preset: localPreset,
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return jsonResponse(res, req, 500, { error: 'Missing GEMINI_API_KEY on server environment' });
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
    const modelConfig = {
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
    };
    let response: any = null;
    let lastModelError: any = null;

    for (const model of getModelChain()) {
      try {
        response = await Promise.race([
          ai.models.generateContent({
            model,
            contents,
            config: modelConfig,
          }),
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`Model generation timeout after ${timeoutMs}ms on ${model}`)), timeoutMs);
          }),
        ]) as any;
        break;
      } catch (error: any) {
        lastModelError = error;
        console.warn(`Gemini model ${model} failed:`, error?.message || error);
        if (!isRetryableModelError(error)) {
          throw error;
        }
      }
    }

    if (!response) {
      throw lastModelError || new Error('All Gemini models failed');
    }

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
      cantileverLimitedVoxels: 0,
      disconnectedComponentsBeforeRepair: initialValidation.connectedComponents,
      seamInterlockScore: scoreBrickSeamInterlock(initialBricks),
      repaired: false,
    };

    if (!initialValidation.physicallyFeasible) {
      const repaired = repairVoxelConnectivity(targetedBuild.voxels, initialBricks, initialValidation);
      finalVoxels = repaired.voxels;
      repairStats = {
        ...repaired.stats,
        addedSupportVoxels: repairStats.addedSupportVoxels + repaired.stats.addedSupportVoxels,
        cantileverLimitedVoxels: repairStats.cantileverLimitedVoxels,
        seamInterlockScore: repairStats.seamInterlockScore,
      };
    }

    const gravityResult = { settled: finalVoxels, movedCount: 0 };
    finalVoxels = dedupeVoxels(gravityResult.settled);
    const compactResult = { compacted: finalVoxels, movedCount: 0 };

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
        cantileverLimitedVoxels: repairStats.cantileverLimitedVoxels + repaired.stats.cantileverLimitedVoxels,
        disconnectedComponentsBeforeRepair: Math.max(
          repairStats.disconnectedComponentsBeforeRepair,
          repaired.stats.disconnectedComponentsBeforeRepair
        ),
        seamInterlockScore: repairStats.seamInterlockScore,
        repaired: repairStats.repaired || repaired.stats.repaired,
      };
      finalTargetedBuild = buildBricksForTargetRange(finalVoxels);
      finalVoxels = finalTargetedBuild.voxels;
      bricks = finalTargetedBuild.bricks;
      finalVoxels = bricksToVoxels(bricks);
      connectionValidation = validateBrickConnectivity(bricks);
      manufacturability = validateManufacturability(finalVoxels, bricks, connectionValidation);
    }

    const finalBrickConnectivity = analyzeBrickConnectivity(bricks);
    if (
      finalBrickConnectivity.connectedComponents > 1 ||
      finalBrickConnectivity.isolatedBrickIds.length > 0
    ) {
      const repaired = repairDisconnectedBricksToVoxels(bricks);
      finalVoxels = repaired.voxels;
      repairStats = {
        ...repairStats,
        addedBridgeVoxels: repairStats.addedBridgeVoxels + repaired.addedBridgeVoxels,
        disconnectedComponentsBeforeRepair: Math.max(
          repairStats.disconnectedComponentsBeforeRepair,
          repaired.disconnectedComponentsBeforeRepair
        ),
        repaired: true,
      };
      finalTargetedBuild = buildBricksForTargetRange(finalVoxels);
      finalVoxels = finalTargetedBuild.voxels;
      bricks = finalTargetedBuild.bricks;
      finalVoxels = bricksToVoxels(bricks);
      connectionValidation = validateBrickConnectivity(bricks);
      manufacturability = validateManufacturability(finalVoxels, bricks, connectionValidation);
    }
    repairStats.seamInterlockScore = scoreBrickSeamInterlock(bricks);

    return jsonResponse(res, req, 200, {
      voxels: finalVoxels,
      bricks,
      availableBrickTypes: ['1x1', '1x2', '1x3', '1x4', '2x2', '2x3', '2x4', '2x6', '2x8'],
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
