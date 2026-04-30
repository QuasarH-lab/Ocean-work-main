import { BrickData, BrickType, VoxelData } from '../types';

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

function createCells(x: number, y: number, z: number, width: number, depth: number) {
  const cells: BrickData['cells'] = [];
  for (let dx = 0; dx < width; dx++) {
    for (let dz = 0; dz < depth; dz++) {
      cells.push({ x: x + dx, y, z: z + dz });
    }
  }
  return cells;
}

function markCells(used: Set<string>, cells: BrickData['cells']) {
  cells.forEach((cell) => used.add(cellKey(cell.x, cell.y, cell.z)));
}

function getHorizontalNeighbors(x: number, y: number, z: number) {
  return [
    { x: x + 1, y, z },
    { x: x - 1, y, z },
    { x, y, z: z + 1 },
    { x, y, z: z - 1 },
  ];
}

function isDetailCell(occupied: Set<string>, colorMap: Map<string, number>, x: number, y: number, z: number) {
  const key = cellKey(x, y, z);
  const color = colorMap.get(key);
  if (typeof color !== 'number') {
    return false;
  }

  const neighbors = getHorizontalNeighbors(x, y, z);
  const sameColorNeighbors = neighbors.filter((neighbor) =>
    colorMap.get(cellKey(neighbor.x, neighbor.y, neighbor.z)) === color
  ).length;
  const openOrColorBreaks = neighbors.filter((neighbor) => {
    const neighborKey = cellKey(neighbor.x, neighbor.y, neighbor.z);
    return !occupied.has(neighborKey) || colorMap.get(neighborKey) !== color;
  }).length;

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

  const cells = createCells(x, y, z, width, depth);
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

function buildMapsFromBricks(bricks: BrickData[]) {
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

function addEnhancedVoxel(map: Map<string, VoxelData>, x: number, y: number, z: number, color: number) {
  const key = cellKey(x, y, z);
  if (!map.has(key)) {
    map.set(key, { x, y, z, color });
  }
}

function buildVoxelSource(voxels: VoxelData[]) {
  const source = new Map<string, VoxelData>();
  voxels.forEach((voxel) => {
    const x = Math.round(voxel.x);
    const y = Math.round(voxel.y);
    const z = Math.round(voxel.z);
    source.set(cellKey(x, y, z), { x, y, z, color: voxel.color });
  });
  return source;
}

function ensureSculpturalVolume(voxels: VoxelData[]): VoxelData[] {
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
  const topByColumn = new Map<string, VoxelData>();
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

export function enhanceVoxelResolution(voxels: VoxelData[], minimumVoxels = 1300): VoxelData[] {
  const source = buildVoxelSource(ensureSculpturalVolume(voxels));

  if (source.size >= minimumVoxels) {
    return [...source.values()];
  }

  const enhanced = new Map<string, VoxelData>();
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

function buildBricksFromVoxels(voxels: VoxelData[], preferMediumParts = false) {
  const occupied = new Set<string>();
  const colorMap = new Map<string, number>();

  voxels.forEach((voxel) => {
    const x = Math.round(voxel.x);
    const y = Math.round(voxel.y);
    const z = Math.round(voxel.z);
    const key = cellKey(x, y, z);
    occupied.add(key);
    colorMap.set(key, voxel.color);
  });

  return stabilizeBrickSupports(buildBricksFromColorMap(occupied, colorMap, preferMediumParts), preferMediumParts);
}

function brickOwnKeys(brick: BrickData) {
  return new Set(brick.cells.map((cell) => cellKey(cell.x, cell.y, cell.z)));
}

function hasBrickSupport(brick: BrickData, occupied: Set<string>, ownKeys = brickOwnKeys(brick)) {
  if (brick.y <= 0 || brick.cells.some((cell) => cell.y <= 0)) {
    return true;
  }

  return brick.cells.some((cell) => {
    const belowKey = cellKey(cell.x, cell.y - 1, cell.z);
    return occupied.has(belowKey) && !ownKeys.has(belowKey);
  });
}

function moveBrickDown(
  brick: BrickData,
  occupied: Set<string>,
  colorMap: Map<string, number>
) {
  const ownKeys = brickOwnKeys(brick);

  for (let drop = 1; drop <= brick.y; drop++) {
    const targetCells = brick.cells.map((cell) => ({
      x: cell.x,
      y: cell.y - drop,
      z: cell.z,
    }));
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

function addSupportColumns(
  brick: BrickData,
  occupied: Set<string>,
  colorMap: Map<string, number>
) {
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

function buildBricksFromColorMap(
  occupied: Set<string>,
  colorMap: Map<string, number>,
  preferMediumParts = false
) {
  const used = new Set<string>();
  const bricks: BrickData[] = [];
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
    const patterns = isCriticalDetailCell(occupied, colorMap, cell.x, cell.y, cell.z)
      ? criticalDetailPatterns
      : isDetailCell(occupied, colorMap, cell.x, cell.y, cell.z)
      ? detailPatterns
      : structuralPatterns;

    for (const pattern of patterns) {
      const orientations = getOrientations(pattern, cell.y);

      const orientation = orientations.find((item) =>
        canUseBrickPattern(occupied, used, colorMap, cell.x, cell.y, cell.z, item.width, item.depth, color)
      );

      if (orientation) {
        const cells = createCells(cell.x, cell.y, cell.z, orientation.width, orientation.depth);
        markCells(used, cells);
        bricks.push({
          id: `B${bricks.length + 1}`,
          type: pattern.type,
          x: cell.x,
          y: cell.y,
          z: cell.z,
          width: orientation.width,
          depth: orientation.depth,
          height: 1,
          color,
          cells,
        });
        break;
      }
    }
  }

  return bricks;
}

export function stabilizeBrickSupports(bricks: BrickData[], preferMediumParts = false): BrickData[] {
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

    const unsupported = stableBricks.some((brick) => !hasBrickSupport(brick, occupied));
    if (!changed || !unsupported) {
      break;
    }
  }

  return buildBricksFromColorMap(occupied, colorMap, preferMediumParts);
}

function getCommonBrickType(width: number, depth: number): BrickType | null {
  const shortSide = Math.min(width, depth);
  const longSide = Math.max(width, depth);
  const key = `${shortSide}x${longSide}`;
  return ['1x3', '1x4', '2x2', '2x3', '2x4'].includes(key) ? key as BrickType : null;
}

function tryMergeCommonBrickPair(first: BrickData, second: BrickData): BrickData | null {
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
    cells: createCells(minX, first.y, minZ, width, depth),
  };
}

function mergeCommonBricksTowardTarget(bricks: BrickData[], minimum = Math.max(600, Math.floor(bricks.length * 0.82))) {
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

function isTargetBrickCount(bricks: BrickData[]) {
  return bricks.length >= 600;
}

function chooseClosestBrickCount(candidates: BrickData[][]) {
  return candidates
    .sort((a, b) => Math.abs(a.length - 600) - Math.abs(b.length - 600))[0];
}

export function voxelsToBricks(voxels: VoxelData[]): BrickData[] {
  const originalBricks = buildBricksFromVoxels(voxels);
  if (isTargetBrickCount(originalBricks)) {
    return originalBricks;
  }

  const candidates = [originalBricks];
  const voxelTargets = [1300, 1800, 2400, 3200, 4200];

  for (const voxelTarget of voxelTargets) {
    const enhancedVoxels = enhanceVoxelResolution(voxels, voxelTarget);
    const enhancedBricks = buildBricksFromVoxels(enhancedVoxels);
    const mediumBricks = buildBricksFromVoxels(enhancedVoxels, true);
    const fusedBricks = mergeCommonBricksTowardTarget(mediumBricks);

    candidates.push(enhancedBricks, mediumBricks, fusedBricks);

    if (isTargetBrickCount(fusedBricks)) {
      return fusedBricks;
    }
    if (isTargetBrickCount(mediumBricks)) {
      return mergeCommonBricksTowardTarget(mediumBricks);
    }
    if (isTargetBrickCount(enhancedBricks)) {
      return enhancedBricks;
    }
  }

  return chooseClosestBrickCount(candidates) || originalBricks;
}

export function normalizeBricks(value: unknown, fallbackVoxels: VoxelData[]): BrickData[] {
  if (!Array.isArray(value)) {
    return voxelsToBricks(fallbackVoxels);
  }

  const bricks = value
    .map((item, index) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const raw = item as Partial<BrickData>;
      const width = Math.max(1, Math.round(Number(raw.width) || 1));
      const depth = Math.max(1, Math.round(Number(raw.depth) || 1));
      const x = Math.round(Number(raw.x) || 0);
      const y = Math.round(Number(raw.y) || 0);
      const z = Math.round(Number(raw.z) || 0);
      const type = typeof raw.type === 'string' ? raw.type as BrickType : `${width}x${depth}` as BrickType;

      return {
        id: typeof raw.id === 'string' ? raw.id : `B${index + 1}`,
        type,
        x,
        y,
        z,
        width,
        depth,
        height: 1,
        color: typeof raw.color === 'number' ? raw.color : 0xcccccc,
        cells: Array.isArray(raw.cells) && raw.cells.length
          ? raw.cells.map((cell) => ({
              x: Math.round(Number(cell.x) || 0),
              y: Math.round(Number(cell.y) || 0),
              z: Math.round(Number(cell.z) || 0),
            }))
          : createCells(x, y, z, width, depth),
      } satisfies BrickData;
    })
    .filter((brick): brick is BrickData => Boolean(brick));

  return bricks.length ? stabilizeBrickSupports(bricks) : voxelsToBricks(fallbackVoxels);
}

export function bricksToVoxels(bricks: BrickData[]): VoxelData[] {
  return bricks.flatMap((brick) =>
    brick.cells.map((cell) => ({
      x: cell.x,
      y: cell.y,
      z: cell.z,
      color: brick.color,
    }))
  );
}
