export interface ConstraintVoxel {
  x: number;
  y: number;
  z: number;
  color: number;
}

export interface ConstraintBrick {
  id: string;
  x: number;
  y: number;
  z: number;
  width: number;
  depth: number;
  color: number;
  cells: Array<{ x: number; y: number; z: number }>;
}

export interface VoxelSupportStats {
  addedSupportVoxels: number;
  cantileverLimitedVoxels: number;
}

export interface BrickConnectivityReport {
  connectedComponents: number;
  isolatedBrickIds: string[];
  unsupportedBrickIds: string[];
  overextendedBrickIds: string[];
  componentBrickIds: string[][];
}

export interface BrickConnectivityRepair {
  voxels: ConstraintVoxel[];
  addedBridgeVoxels: number;
  disconnectedComponentsBeforeRepair: number;
}

export const DEFAULT_MAX_CANTILEVER_DISTANCE = 2;

export function cellKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

function parseCellKey(key: string) {
  const [x, y, z] = key.split(',').map(Number);
  return { x, y, z };
}

function normalizeVoxels(voxels: ConstraintVoxel[]) {
  const map = new Map<string, ConstraintVoxel>();
  voxels.forEach((voxel) => {
    const x = Math.round(Number(voxel.x) || 0);
    const y = Math.round(Number(voxel.y) || 0);
    const z = Math.round(Number(voxel.z) || 0);
    map.set(cellKey(x, y, z), {
      x,
      y,
      z,
      color: typeof voxel.color === 'number' ? voxel.color : 0xcccccc,
    });
  });
  return map;
}

function sameLayerNeighborKeys(x: number, y: number, z: number) {
  return [
    cellKey(x + 1, y, z),
    cellKey(x - 1, y, z),
    cellKey(x, y, z + 1),
    cellKey(x, y, z - 1),
  ];
}

function hasVerticalSupport(occupied: Set<string>, x: number, y: number, z: number, groundY: number) {
  return y <= groundY || occupied.has(cellKey(x, y - 1, z));
}

function hasSupportedNeighborWithinDistance(
  occupied: Set<string>,
  start: ConstraintVoxel,
  maxDistance: number,
  groundY: number
) {
  const queue = [{ key: cellKey(start.x, start.y, start.z), distance: 0 }];
  const visited = new Set<string>([queue[0].key]);

  while (queue.length) {
    const current = queue.shift()!;
    const cell = parseCellKey(current.key);

    if (current.distance > 0 && hasVerticalSupport(occupied, cell.x, cell.y, cell.z, groundY)) {
      return true;
    }
    if (current.distance >= maxDistance) {
      continue;
    }

    sameLayerNeighborKeys(cell.x, cell.y, cell.z).forEach((neighborKey) => {
      if (!occupied.has(neighborKey) || visited.has(neighborKey)) {
        return;
      }
      visited.add(neighborKey);
      queue.push({ key: neighborKey, distance: current.distance + 1 });
    });
  }

  return false;
}

export function enforceVoxelSupport(
  voxels: ConstraintVoxel[],
  options: { maxCantileverDistance?: number } = {}
): { voxels: ConstraintVoxel[]; stats: VoxelSupportStats } {
  const maxCantileverDistance = options.maxCantileverDistance ?? DEFAULT_MAX_CANTILEVER_DISTANCE;
  const map = normalizeVoxels(voxels);
  const groundY = Math.min(0, ...[...map.values()].map((voxel) => voxel.y));
  const stats: VoxelSupportStats = {
    addedSupportVoxels: 0,
    cantileverLimitedVoxels: 0,
  };

  const sorted = [...map.values()].sort((a, b) => (a.y - b.y) || (a.x - b.x) || (a.z - b.z));
  for (const voxel of sorted) {
    if (voxel.y <= 0) {
      continue;
    }

    const occupied = new Set(map.keys());
    if (
      hasVerticalSupport(occupied, voxel.x, voxel.y, voxel.z, groundY) ||
      hasSupportedNeighborWithinDistance(occupied, voxel, maxCantileverDistance, groundY)
    ) {
      continue;
    }

    stats.cantileverLimitedVoxels++;
    for (let y = voxel.y - 1; y >= groundY; y--) {
      const key = cellKey(voxel.x, y, voxel.z);
      if (map.has(key)) {
        break;
      }
      map.set(key, { x: voxel.x, y, z: voxel.z, color: voxel.color });
      stats.addedSupportVoxels++;
    }
  }

  return { voxels: [...map.values()], stats };
}

function shareAnyCellXZ(a: ConstraintBrick, b: ConstraintBrick, dy: number) {
  if (b.y - a.y !== dy) {
    return false;
  }
  const aCells = new Set(a.cells.map((cell) => `${Math.round(cell.x)},${Math.round(cell.z)}`));
  return b.cells.some((cell) => aCells.has(`${Math.round(cell.x)},${Math.round(cell.z)}`));
}

function hasStudSupport(brick: ConstraintBrick, allCells: Set<string>, groundY: number) {
  return brick.cells.some((cell) => {
    const y = Math.round(cell.y);
    return y <= groundY || allCells.has(cellKey(Math.round(cell.x), y - 1, Math.round(cell.z)));
  });
}

function isBrickOverextended(
  brick: ConstraintBrick,
  allCells: Set<string>,
  maxCantileverDistance: number,
  groundY: number
) {
  if (brick.cells.some((cell) => Math.round(cell.y) <= groundY)) {
    return false;
  }

  const supportedCells = brick.cells.filter((cell) =>
    allCells.has(cellKey(Math.round(cell.x), Math.round(cell.y) - 1, Math.round(cell.z)))
  );
  if (!supportedCells.length) {
    return true;
  }

  return brick.cells.some((cell) => {
    const directlySupported = allCells.has(cellKey(Math.round(cell.x), Math.round(cell.y) - 1, Math.round(cell.z)));
    if (directlySupported) {
      return false;
    }
    const nearestSupport = Math.min(
      ...supportedCells.map((supported) =>
        Math.abs(Math.round(cell.x) - Math.round(supported.x)) +
        Math.abs(Math.round(cell.z) - Math.round(supported.z))
      )
    );
    return nearestSupport > maxCantileverDistance;
  });
}

export function analyzeBrickConnectivity(
  bricks: ConstraintBrick[],
  options: { maxCantileverDistance?: number } = {}
): BrickConnectivityReport {
  if (!bricks.length) {
    return {
      connectedComponents: 0,
      isolatedBrickIds: [],
      unsupportedBrickIds: [],
      overextendedBrickIds: [],
      componentBrickIds: [],
    };
  }

  const maxCantileverDistance = options.maxCantileverDistance ?? DEFAULT_MAX_CANTILEVER_DISTANCE;
  const groundY = Math.min(...bricks.flatMap((brick) => brick.cells.map((cell) => Math.round(cell.y))));
  const allCells = new Set(
    bricks.flatMap((brick) =>
      brick.cells.map((cell) => cellKey(Math.round(cell.x), Math.round(cell.y), Math.round(cell.z)))
    )
  );
  const neighbors = new Map<string, Set<string>>();
  bricks.forEach((brick) => neighbors.set(brick.id, new Set()));
  for (let i = 0; i < bricks.length; i++) {
    for (let j = i + 1; j < bricks.length; j++) {
      const a = bricks[i];
      const b = bricks[j];
      const connected =
        shareAnyCellXZ(a, b, 1) ||
        shareAnyCellXZ(b, a, 1);
      if (!connected) {
        continue;
      }
      neighbors.get(a.id)!.add(b.id);
      neighbors.get(b.id)!.add(a.id);
    }
  }

  const visited = new Set<string>();
  const componentBrickIds: string[][] = [];
  for (const brick of bricks) {
    if (visited.has(brick.id)) {
      continue;
    }
    const stack = [brick.id];
    const component: string[] = [];
    visited.add(brick.id);

    while (stack.length) {
      const id = stack.pop()!;
      component.push(id);
      for (const neighbor of neighbors.get(id) || []) {
        if (visited.has(neighbor)) {
          continue;
        }
        visited.add(neighbor);
        stack.push(neighbor);
      }
    }
    componentBrickIds.push(component);
  }

  return {
    connectedComponents: componentBrickIds.length,
    isolatedBrickIds: bricks
      .filter((brick) => bricks.length > 1 && (neighbors.get(brick.id)?.size || 0) === 0)
      .map((brick) => brick.id),
    unsupportedBrickIds: bricks
      .filter((brick) => !hasStudSupport(brick, allCells, groundY))
      .map((brick) => brick.id),
    overextendedBrickIds: bricks
      .filter((brick) => isBrickOverextended(brick, allCells, maxCantileverDistance, groundY))
      .map((brick) => brick.id),
    componentBrickIds,
  };
}

function brickToVoxels(brick: ConstraintBrick): ConstraintVoxel[] {
  return brick.cells.map((cell) => ({
    x: Math.round(cell.x),
    y: Math.round(cell.y),
    z: Math.round(cell.z),
    color: brick.color,
  }));
}

function closestPairByXZ(a: ConstraintVoxel[], b: ConstraintVoxel[]) {
  let bestA = a[0];
  let bestB = b[0];
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const va of a) {
    for (const vb of b) {
      const distance = Math.abs(va.x - vb.x) + Math.abs(va.z - vb.z);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestA = va;
        bestB = vb;
      }
    }
  }

  return { a: bestA, b: bestB };
}

function allBrickVoxelsById(bricks: ConstraintBrick[]) {
  const byId = new Map(bricks.map((brick) => [brick.id, brick]));
  return { byId, voxelsById: (id: string) => brickToVoxels(byId.get(id)!) };
}

function pathBetweenXZ(from: ConstraintVoxel, to: ConstraintVoxel) {
  const path: Array<{ x: number; z: number }> = [];
  let x = from.x;
  let z = from.z;
  path.push({ x, z });
  while (x !== to.x) {
    x += x < to.x ? 1 : -1;
    path.push({ x, z });
  }
  while (z !== to.z) {
    z += z < to.z ? 1 : -1;
    path.push({ x, z });
  }
  return path;
}

function lineBrickFromPathCells(
  id: string,
  cells: Array<{ x: number; y: number; z: number }>,
  color: number
): ConstraintBrick {
  const xs = cells.map((cell) => cell.x);
  const zs = cells.map((cell) => cell.z);
  return {
    id,
    x: Math.min(...xs),
    y: cells[0]?.y ?? 0,
    z: Math.min(...zs),
    width: Math.max(...xs) - Math.min(...xs) + 1,
    depth: Math.max(...zs) - Math.min(...zs) + 1,
    color,
    cells,
  };
}

function addRailBricks(
  additions: ConstraintBrick[],
  path: Array<{ x: number; z: number }>,
  y: number,
  color: number,
  idPrefix: string,
  startOffset: number,
  occupied?: Set<string>
) {
  for (let i = startOffset; i < path.length; i += 4) {
    const slice = path.slice(i, Math.min(i + 4, path.length));
    const available = slice.filter((cell) => !occupied?.has(cellKey(cell.x, y, cell.z)));
    if (!available.length) {
      continue;
    }
    const runs: Array<Array<{ x: number; z: number }>> = [];
    available.forEach((cell) => {
      const lastRun = runs[runs.length - 1];
      const previous = lastRun?.[lastRun.length - 1];
      const contiguous = previous && Math.abs(previous.x - cell.x) + Math.abs(previous.z - cell.z) === 1;
      if (!lastRun || !contiguous) {
        runs.push([cell]);
      } else {
        lastRun.push(cell);
      }
    });
    runs.forEach((run, runIndex) => {
      run.forEach((cell) => occupied?.add(cellKey(cell.x, y, cell.z)));
      additions.push(lineBrickFromPathCells(
        `${idPrefix}-rail-${y}-${i}-${runIndex}`,
        run.map((cell) => ({ x: cell.x, y, z: cell.z })),
        color
      ));
    });
  }
}

export function createStudBridgeScaffoldBricks(bricks: ConstraintBrick[]): ConstraintBrick[] {
  const report = analyzeBrickConnectivity(bricks);
  if (report.connectedComponents <= 1) {
    return [];
  }

  const occupied = new Set(
    bricks.flatMap((brick) =>
      brick.cells.map((cell) => cellKey(Math.round(cell.x), Math.round(cell.y), Math.round(cell.z)))
    )
  );
  const { byId, voxelsById } = allBrickVoxelsById(bricks);
  const components = report.componentBrickIds
    .map((ids) => ids.flatMap(voxelsById))
    .sort((a, b) => b.length - a.length);
  const globalTopY = Math.max(0, ...bricks.flatMap((brick) => brick.cells.map((cell) => Math.round(cell.y)))) + 1;
  const main = [...components[0]];
  const additions: ConstraintBrick[] = [];

  for (let componentIndex = 1; componentIndex < components.length; componentIndex++) {
    const pair = closestPairByXZ(main, components[componentIndex]);
    const path = pathBetweenXZ(pair.a, pair.b);
    const color = pair.a.color;
    const idPrefix = `stud-bridge-${componentIndex}`;

    path.forEach((cell, pathIndex) => {
      for (let y = 0; y < globalTopY; y++) {
        const key = cellKey(cell.x, y, cell.z);
        if (occupied.has(key)) {
          continue;
        }
        occupied.add(key);
        additions.push({
          id: `${idPrefix}-column-${pathIndex}-${y}`,
          x: cell.x,
          y,
          z: cell.z,
          width: 1,
          depth: 1,
          color,
          cells: [{ x: cell.x, y, z: cell.z }],
        });
      }
    });

    addRailBricks(additions, path, globalTopY, color, idPrefix, 0, occupied);
    addRailBricks(
      additions,
      path,
      globalTopY + 1,
      color,
      `${idPrefix}-tie`,
      Math.min(2, Math.max(0, path.length - 1)),
      occupied
    );
    main.push(...components[componentIndex]);
  }

  return additions.filter((brick) => brick.cells.length > 0 && byId.has(brick.id) === false);
}

function rectangleCells(x: number, y: number, z: number, width: number, depth: number) {
  const cells: Array<{ x: number; y: number; z: number }> = [];
  for (let dx = 0; dx < width; dx++) {
    for (let dz = 0; dz < depth; dz++) {
      cells.push({ x: x + dx, y, z: z + dz });
    }
  }
  return cells;
}

function nextAllowedFoundationSpan(remaining: number) {
  return [8, 6, 4, 3, 2, 1].find((span) => span <= remaining) || 1;
}

export function createInterlockedFoundationBricks(bricks: ConstraintBrick[]): ConstraintBrick[] {
  if (!bricks.length) {
    return [];
  }
  const xs = bricks.flatMap((brick) => brick.cells.map((cell) => Math.round(cell.x)));
  const ys = bricks.flatMap((brick) => brick.cells.map((cell) => Math.round(cell.y)));
  const zs = bricks.flatMap((brick) => brick.cells.map((cell) => Math.round(cell.z)));
  const minX = Math.min(...xs) - 1;
  const maxX = Math.max(...xs) + 1;
  const topY = Math.min(...ys) - 1;
  const bottomY = topY - 1;
  const minZ = Math.min(...zs) - 1;
  const maxZ = Math.max(...zs) + 1;
  const color = 0x444444;
  const path: Array<{ x: number; z: number }> = [];

  for (let z = minZ; z <= maxZ; z++) {
    if ((z - minZ) % 2 === 0) {
      for (let x = minX; x <= maxX; x++) {
        path.push({ x, z });
      }
    } else {
      for (let x = maxX; x >= minX; x--) {
        path.push({ x, z });
      }
    }
  }

  const foundation: ConstraintBrick[] = [];
  addRailBricks(foundation, path, topY, color, 'foundation-upper', 0);
  addRailBricks(foundation, path, bottomY, color, 'foundation-lower', Math.min(2, Math.max(0, path.length - 1)));
  return foundation;
}

export function createSupportColumnScaffoldBricks(bricks: ConstraintBrick[]): ConstraintBrick[] {
  const report = analyzeBrickConnectivity(bricks);
  const invalidIds = new Set([...report.unsupportedBrickIds, ...report.overextendedBrickIds]);
  if (!invalidIds.size) {
    return [];
  }

  const byId = new Map(bricks.map((brick) => [brick.id, brick]));
  const occupied = new Set(
    bricks.flatMap((brick) =>
      brick.cells.map((cell) => cellKey(Math.round(cell.x), Math.round(cell.y), Math.round(cell.z)))
    )
  );
  const groundY = Math.min(...bricks.flatMap((brick) => brick.cells.map((cell) => Math.round(cell.y))));
  const additions: ConstraintBrick[] = [];

  invalidIds.forEach((id) => {
    const brick = byId.get(id);
    if (!brick) {
      return;
    }
    brick.cells.forEach((cell, cellIndex) => {
      const x = Math.round(cell.x);
      const z = Math.round(cell.z);
      for (let y = groundY; y < Math.round(cell.y); y++) {
        const key = cellKey(x, y, z);
        if (occupied.has(key)) {
          continue;
        }
        occupied.add(key);
        additions.push({
          id: `support-column-${id}-${cellIndex}-${y}`,
          x,
          y,
          z,
          width: 1,
          depth: 1,
          color: brick.color,
          cells: [{ x, y, z }],
        });
      }
    });
  });

  return additions;
}

function addStudLockedBridge(
  map: Map<string, ConstraintVoxel>,
  from: ConstraintVoxel,
  to: ConstraintVoxel,
  color: number
) {
  let added = 0;
  let x = from.x;
  let z = from.z;
  const y = Math.max(from.y, to.y) + 1;

  const addVoxel = (vx: number, vy: number, vz: number) => {
    const key = cellKey(vx, vy, vz);
    if (!map.has(key)) {
      map.set(key, { x: vx, y: vy, z: vz, color });
      added++;
    }
  };

  const addBridgeCell = (vx: number, vz: number) => {
    for (let sy = 0; sy < y; sy++) {
      addVoxel(vx, sy, vz);
    }
    addVoxel(vx, y, vz);
  };

  addBridgeCell(x, z);

  while (x !== to.x) {
    x += x < to.x ? 1 : -1;
    addBridgeCell(x, z);
  }
  while (z !== to.z) {
    z += z < to.z ? 1 : -1;
    addBridgeCell(x, z);
  }

  return added;
}

function addSupportColumn(map: Map<string, ConstraintVoxel>, voxel: ConstraintVoxel) {
  let added = 0;
  for (let y = voxel.y - 1; y >= 0; y--) {
    const key = cellKey(voxel.x, y, voxel.z);
    if (map.has(key)) {
      break;
    }
    map.set(key, { x: voxel.x, y, z: voxel.z, color: voxel.color });
    added++;
  }
  return added;
}

function addBrickSupportColumns(
  map: Map<string, ConstraintVoxel>,
  brick: ConstraintBrick,
  allCells: Set<string>,
  maxCantileverDistance: number
) {
  const cells = brickToVoxels(brick);
  const supportedCells = cells.filter((cell) => cell.y <= 0 || allCells.has(cellKey(cell.x, cell.y - 1, cell.z)));
  if (!supportedCells.length) {
    return cells.reduce((added, cell) => added + addSupportColumn(map, cell), 0);
  }

  return cells.reduce((added, cell) => {
    if (cell.y <= 0 || allCells.has(cellKey(cell.x, cell.y - 1, cell.z))) {
      return added;
    }
    const nearestSupport = Math.min(
      ...supportedCells.map((supported) => Math.abs(cell.x - supported.x) + Math.abs(cell.z - supported.z))
    );
    return nearestSupport > maxCantileverDistance ? added + addSupportColumn(map, cell) : added;
  }, 0);
}

export function repairDisconnectedBricksToVoxels(bricks: ConstraintBrick[]): BrickConnectivityRepair {
  const report = analyzeBrickConnectivity(bricks);
  const map = normalizeVoxels(bricks.flatMap(brickToVoxels));
  const byId = new Map(bricks.map((brick) => [brick.id, brick]));
  const allCells = new Set([...map.keys()]);
  const invalidSupportIds = new Set([...report.unsupportedBrickIds, ...report.overextendedBrickIds]);
  let addedBridgeVoxels = 0;

  invalidSupportIds.forEach((id) => {
    const brick = byId.get(id);
    if (!brick) {
      return;
    }
    addedBridgeVoxels += addBrickSupportColumns(map, brick, allCells, DEFAULT_MAX_CANTILEVER_DISTANCE);
  });

  if (report.connectedComponents <= 1) {
    return {
      voxels: [...map.values()],
      addedBridgeVoxels,
      disconnectedComponentsBeforeRepair: report.connectedComponents,
    };
  }

  const components = report.componentBrickIds
    .map((ids) => ids.flatMap((id) => brickToVoxels(byId.get(id)!)))
    .sort((a, b) => b.length - a.length);

  const main = components[0];
  for (let i = 1; i < components.length; i++) {
    const pair = closestPairByXZ(main, components[i]);
    addedBridgeVoxels += addStudLockedBridge(map, pair.a, pair.b, pair.a.color);
    main.push(...components[i]);
  }

  return {
    voxels: [...map.values()],
    addedBridgeVoxels,
    disconnectedComponentsBeforeRepair: report.connectedComponents,
  };
}

function layerBoundaryKeys(cells: Array<{ x: number; y: number; z: number }>) {
  const keys = new Set<string>();
  const own = new Set(cells.map((cell) => cellKey(cell.x, cell.y, cell.z)));

  cells.forEach((cell) => {
    sameLayerNeighborKeys(cell.x, cell.y, cell.z).forEach((neighborKey) => {
      if (!own.has(neighborKey)) {
        keys.add(neighborKey);
      }
    });
  });

  return keys;
}

export function scoreSeamInterlock(
  candidateCells: Array<{ x: number; y: number; z: number }>,
  existingBricks: ConstraintBrick[]
) {
  if (candidateCells.length <= 1) {
    return 0;
  }

  const candidateFootprint = new Set(candidateCells.map((cell) => `${cell.x},${cell.z}`));
  const candidateBoundary = layerBoundaryKeys(candidateCells);
  let score = 0;

  existingBricks.forEach((brick) => {
    if (Math.abs(brick.y - candidateCells[0].y) !== 1) {
      return;
    }

    const overlap = brick.cells.filter((cell) => candidateFootprint.has(`${cell.x},${cell.z}`)).length;
    if (!overlap) {
      return;
    }

    const brickBoundary = layerBoundaryKeys(brick.cells);
    const alignedSeams = [...candidateBoundary].filter((key) => brickBoundary.has(key)).length;
    const crossesBrick = overlap > 0 && overlap < candidateCells.length;

    if (crossesBrick) {
      score += 4;
    }
    score += overlap;
    score -= alignedSeams * 2;
  });

  return score;
}

export function scoreBrickSeamInterlock(bricks: ConstraintBrick[]) {
  if (!bricks.length) {
    return 0;
  }
  const total = bricks.reduce((sum, brick, index) => {
    const previous = bricks.slice(0, index);
    return sum + scoreSeamInterlock(brick.cells, previous);
  }, 0);
  return Number((total / bricks.length).toFixed(3));
}
