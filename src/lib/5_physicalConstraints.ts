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

function addVerticalConnectorBricks(
  additions: ConstraintBrick[],
  from: ConstraintVoxel,
  topY: number,
  color: number,
  idPrefix: string,
  occupied: Set<string>
) {
  for (let y = from.y + 1; y <= topY; y++) {
    const key = cellKey(from.x, y, from.z);
    if (occupied.has(key)) {
      continue;
    }
    occupied.add(key);
    additions.push({
      id: `${idPrefix}-riser-${from.x}-${y}-${from.z}`,
      x: from.x,
      y,
      z: from.z,
      width: 1,
      depth: 1,
      color,
      cells: [{ x: from.x, y, z: from.z }],
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
  const main = [...components[0]];
  const additions: ConstraintBrick[] = [];

  for (let componentIndex = 1; componentIndex < components.length; componentIndex++) {
    const pair = closestPairByXZ(main, components[componentIndex]);
    const path = pathBetweenXZ(pair.a, pair.b);
    const color = pair.a.color;
    const idPrefix = `stud-bridge-${componentIndex}`;
    const bridgeY = Math.max(pair.a.y, pair.b.y) + 1;
    const tieY = bridgeY + 1;
    addVerticalConnectorBricks(additions, pair.a, bridgeY - 1, color, `${idPrefix}-a`, occupied);
    addVerticalConnectorBricks(additions, pair.b, bridgeY - 1, color, `${idPrefix}-b`, occupied);
    addRailBricks(additions, path, bridgeY, color, idPrefix, 0, occupied);
    addRailBricks(
      additions,
      path,
      tieY,
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

function bottomFootprintKeys(bricks: ConstraintBrick[], groundY: number) {
  return new Set(
    bricks.flatMap((brick) =>
      brick.cells
        .filter((cell) => Math.round(cell.y) === groundY)
        .map((cell) => `${Math.round(cell.x)},${Math.round(cell.z)}`)
    )
  );
}

function parseFootprintKey(key: string) {
  const [x, z] = key.split(',').map(Number);
  return { x, z };
}

function footprintNeighborKeys(x: number, z: number) {
  return [`${x + 1},${z}`, `${x - 1},${z}`, `${x},${z + 1}`, `${x},${z - 1}`];
}

function connectedFootprintComponents(keys: Set<string>) {
  const visited = new Set<string>();
  const components: string[][] = [];

  for (const key of keys) {
    if (visited.has(key)) {
      continue;
    }
    const queue = [key];
    const component: string[] = [];
    visited.add(key);

    while (queue.length) {
      const current = queue.shift()!;
      component.push(current);
      const { x, z } = parseFootprintKey(current);
      footprintNeighborKeys(x, z).forEach((neighbor) => {
        if (!keys.has(neighbor) || visited.has(neighbor)) {
          return;
        }
        visited.add(neighbor);
        queue.push(neighbor);
      });
    }

    components.push(component);
  }

  return components;
}

function closestFootprintPair(a: string[], b: string[]) {
  let bestA = parseFootprintKey(a[0]);
  let bestB = parseFootprintKey(b[0]);
  let bestDistance = Number.POSITIVE_INFINITY;

  a.forEach((left) => {
    const leftCell = parseFootprintKey(left);
    b.forEach((right) => {
      const rightCell = parseFootprintKey(right);
      const distance = Math.abs(leftCell.x - rightCell.x) + Math.abs(leftCell.z - rightCell.z);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestA = leftCell;
        bestB = rightCell;
      }
    });
  });

  return { a: bestA, b: bestB };
}

function addFootprintPath(keys: Set<string>, from: { x: number; z: number }, to: { x: number; z: number }) {
  let x = from.x;
  let z = from.z;
  keys.add(`${x},${z}`);
  while (x !== to.x) {
    x += x < to.x ? 1 : -1;
    keys.add(`${x},${z}`);
  }
  while (z !== to.z) {
    z += z < to.z ? 1 : -1;
    keys.add(`${x},${z}`);
  }
}

function addFoundationRunsForAxis(
  foundation: ConstraintBrick[],
  keys: Set<string>,
  y: number,
  axis: 'x' | 'z',
  color: number,
  idPrefix: string
) {
  const grouped = new Map<number, number[]>();
  [...keys].forEach((key) => {
    const { x, z } = parseFootprintKey(key);
    const major = axis === 'x' ? z : x;
    const minor = axis === 'x' ? x : z;
    const list = grouped.get(major) || [];
    list.push(minor);
    grouped.set(major, list);
  });

  [...grouped.entries()].forEach(([major, minors]) => {
    const sorted = [...new Set(minors)].sort((a, b) => a - b);
    let runStart = sorted[0];
    let previous = sorted[0];

    const flushRun = (end: number) => {
      let start = runStart;
      while (start <= end) {
        const span = nextAllowedFoundationSpan(end - start + 1);
        const cells = axis === 'x'
          ? rectangleCells(start, y, major, span, 1)
          : rectangleCells(major, y, start, 1, span);
        foundation.push(lineBrickFromPathCells(`${idPrefix}-${axis}-${major}-${start}`, cells, color));
        start += span;
      }
    };

    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] !== previous + 1) {
        flushRun(previous);
        runStart = sorted[i];
      }
      previous = sorted[i];
    }
    flushRun(previous);
  });
}

export function createInterlockedFoundationBricks(bricks: ConstraintBrick[]): ConstraintBrick[] {
  if (!bricks.length) {
    return [];
  }
  const ys = bricks.flatMap((brick) => brick.cells.map((cell) => Math.round(cell.y)));
  const groundY = Math.min(...ys);
  const topY = groundY + 1;
  const bottomY = groundY + 2;
  const color = 0x444444;
  const foundationKeys = bottomFootprintKeys(bricks, groundY);
  if (!foundationKeys.size) {
    return [];
  }

  let components = connectedFootprintComponents(foundationKeys).sort((a, b) => b.length - a.length);
  while (components.length > 1) {
    const pair = closestFootprintPair(components[0], components[1]);
    addFootprintPath(foundationKeys, pair.a, pair.b);
    components = connectedFootprintComponents(foundationKeys).sort((a, b) => b.length - a.length);
  }

  const foundation: ConstraintBrick[] = [];
  addFoundationRunsForAxis(foundation, foundationKeys, topY, 'x', color, 'foundation-upper');
  addFoundationRunsForAxis(foundation, foundationKeys, bottomY, 'z', color, 'foundation-lower');
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
  color: number,
  bridgeY: number
) {
  let added = 0;
  const addVoxel = (vx: number, vy: number, vz: number) => {
    const key = cellKey(vx, vy, vz);
    if (!map.has(key)) {
      map.set(key, { x: vx, y: vy, z: vz, color });
      added++;
    }
  };

  const addVerticalRun = (x: number, z: number, startY: number, endY: number) => {
    const minY = Math.min(startY, endY);
    const maxY = Math.max(startY, endY);
    for (let y = minY; y <= maxY; y++) {
      addVoxel(x, y, z);
    }
  };

  const path = pathBetweenXZ(from, to);
  const tieY = bridgeY + 1;

  addVerticalRun(from.x, from.z, from.y, bridgeY);
  addVerticalRun(to.x, to.z, to.y, bridgeY);

  path.forEach((cell, index) => {
    addVoxel(cell.x, bridgeY, cell.z);
    if (index > 0 && index < path.length - 1) {
      addVoxel(cell.x, tieY, cell.z);
    }
  });

  return added;
}

function voxelNeighborCount(cell: ConstraintVoxel, map: Map<string, ConstraintVoxel>) {
  let count = 0;
  const neighbors = [
    cellKey(cell.x + 1, cell.y, cell.z),
    cellKey(cell.x - 1, cell.y, cell.z),
    cellKey(cell.x, cell.y + 1, cell.z),
    cellKey(cell.x, cell.y - 1, cell.z),
    cellKey(cell.x, cell.y, cell.z + 1),
    cellKey(cell.x, cell.y, cell.z - 1),
  ];
  neighbors.forEach((key) => {
    if (map.has(key)) {
      count++;
    }
  });
  return count;
}

function chooseCoreBridgeY(voxels: ConstraintVoxel[]) {
  const counts = new Map<number, number>();
  voxels.forEach((voxel) => {
    counts.set(voxel.y, (counts.get(voxel.y) || 0) + 1);
  });

  return [...counts.entries()]
    .sort((a, b) => (b[1] - a[1]) || (a[0] - b[0]))[0]?.[0] ?? 0;
}

function chooseBridgePair(
  main: ConstraintVoxel[],
  component: ConstraintVoxel[],
  map: Map<string, ConstraintVoxel>,
  coreY: number
) {
  const scoreCandidates = (voxels: ConstraintVoxel[]) =>
    [...voxels]
      .sort((a, b) => {
        const aScore = voxelNeighborCount(a, map) * 10 - Math.abs(a.y - coreY);
        const bScore = voxelNeighborCount(b, map) * 10 - Math.abs(b.y - coreY);
        if (aScore !== bScore) {
          return bScore - aScore;
        }
        return Math.abs(a.y - coreY) - Math.abs(b.y - coreY);
      })
      .slice(0, 16);

  const mainCandidates = scoreCandidates(main);
  const componentCandidates = scoreCandidates(component);
  let best = { a: mainCandidates[0], b: componentCandidates[0], score: Number.POSITIVE_INFINITY };

  mainCandidates.forEach((a) => {
    componentCandidates.forEach((b) => {
      const distance = Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
      const yPenalty = Math.abs(a.y - coreY) + Math.abs(b.y - coreY);
      const surfacePenalty = (6 - voxelNeighborCount(a, map)) + (6 - voxelNeighborCount(b, map));
      const score = distance * 10 + yPenalty * 2 + surfacePenalty;
      if (score < best.score) {
        best = { a, b, score };
      }
    });
  });

  return { a: best.a, b: best.b };
}

function addCoreLayerGapFill(map: Map<string, ConstraintVoxel>, y: number) {
  let added = 0;
  const layer = [...map.values()].filter((voxel) => voxel.y === y);
  if (!layer.length) {
    return added;
  }

  const addIfMissing = (x: number, z: number, color: number) => {
    const key = cellKey(x, y, z);
    if (!map.has(key)) {
      map.set(key, { x, y, z, color });
      added++;
    }
  };

  const byZ = new Map<number, ConstraintVoxel[]>();
  const byX = new Map<number, ConstraintVoxel[]>();
  layer.forEach((voxel) => {
    if (!byZ.has(voxel.z)) {
      byZ.set(voxel.z, []);
    }
    if (!byX.has(voxel.x)) {
      byX.set(voxel.x, []);
    }
    byZ.get(voxel.z)!.push(voxel);
    byX.get(voxel.x)!.push(voxel);
  });

  byZ.forEach((voxels) => {
    voxels.sort((a, b) => a.x - b.x);
    if (voxels.length < 3) {
      return;
    }
    const left = voxels[0];
    const right = voxels[voxels.length - 1];
    if (voxelNeighborCount(left, map) < 2 || voxelNeighborCount(right, map) < 2) {
      return;
    }
    for (let x = left.x + 1; x < right.x; x++) {
      addIfMissing(x, left.z, left.color);
    }
  });

  byX.forEach((voxels) => {
    voxels.sort((a, b) => a.z - b.z);
    if (voxels.length < 3) {
      return;
    }
    const front = voxels[0];
    const back = voxels[voxels.length - 1];
    if (voxelNeighborCount(front, map) < 2 || voxelNeighborCount(back, map) < 2) {
      return;
    }
    for (let z = front.z + 1; z < back.z; z++) {
      addIfMissing(front.x, z, front.color);
    }
  });

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
  let addedBridgeVoxels = 0;

  if (report.connectedComponents <= 1) {
    return {
      voxels: [...map.values()],
      addedBridgeVoxels,
      disconnectedComponentsBeforeRepair: report.connectedComponents,
    };
  }

  const byId = new Map(bricks.map((brick) => [brick.id, brick]));
  const components = report.componentBrickIds
    .map((ids) => ids.flatMap((id) => brickToVoxels(byId.get(id)!)))
    .sort((a, b) => b.length - a.length);

  const main = components[0];
  const coreY = chooseCoreBridgeY([...map.values()]);
  addedBridgeVoxels += addCoreLayerGapFill(map, coreY);
  for (let i = 1; i < components.length; i++) {
    const pair = chooseBridgePair(main, components[i], map, coreY);
    const bridgeY = [pair.a.y, pair.b.y, coreY].sort((a, b) => a - b)[1];
    addedBridgeVoxels += addStudLockedBridge(map, pair.a, pair.b, pair.a.color, bridgeY);
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
