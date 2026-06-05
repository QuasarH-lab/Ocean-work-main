// 负责人：6号成员
import { voxelsToBricks } from '../src/lib/5_brickLayout.js';
import {
  analyzeBrickConnectivity,
  enforceVoxelSupport,
  repairDisconnectedBricksToVoxels,
  scoreSeamInterlock,
  type ConstraintBrick,
  type ConstraintVoxel,
} from '../src/lib/5_physicalConstraints.js';

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function hasVoxel(voxels: ConstraintVoxel[], x: number, y: number, z: number) {
  return voxels.some((voxel) => voxel.x === x && voxel.y === y && voxel.z === z);
}

const red = 0xff0000;

{
  const result = enforceVoxelSupport([{ x: 0, y: 3, z: 0, color: red }]);
  assert(hasVoxel(result.voxels, 0, 0, 0), 'floating voxel should receive support at y=0');
  assert(hasVoxel(result.voxels, 0, 1, 0), 'floating voxel should receive support at y=1');
  assert(hasVoxel(result.voxels, 0, 2, 0), 'floating voxel should receive support at y=2');
  assert(result.stats.addedSupportVoxels === 3, 'single floating voxel should add three support voxels');
}

{
  const result = enforceVoxelSupport([
    { x: 0, y: 0, z: 0, color: red },
    { x: 0, y: 1, z: 0, color: red },
    { x: 1, y: 1, z: 0, color: red },
    { x: 2, y: 1, z: 0, color: red },
  ]);
  assert(!hasVoxel(result.voxels, 2, 0, 0), 'two-stud cantilever should remain unsupported by a column');
  assert(result.stats.addedSupportVoxels === 0, 'two-stud cantilever should not add support voxels');
}

{
  const result = enforceVoxelSupport([
    { x: 0, y: 0, z: 0, color: red },
    { x: 0, y: 1, z: 0, color: red },
    { x: 1, y: 1, z: 0, color: red },
    { x: 2, y: 1, z: 0, color: red },
    { x: 3, y: 1, z: 0, color: red },
  ]);
  assert(hasVoxel(result.voxels, 3, 0, 0), 'three-stud cantilever should receive support');
  assert(result.stats.cantileverLimitedVoxels === 1, 'three-stud cantilever should be counted as limited');
}

{
  const bricks: ConstraintBrick[] = [
    {
      id: 'A',
      x: 0,
      y: 1,
      z: 0,
      width: 1,
      depth: 1,
      color: red,
      cells: [{ x: 0, y: 1, z: 0 }],
    },
    {
      id: 'B',
      x: 5,
      y: 1,
      z: 0,
      width: 1,
      depth: 1,
      color: red,
      cells: [{ x: 5, y: 1, z: 0 }],
    },
  ];
  const before = analyzeBrickConnectivity(bricks);
  assert(before.connectedComponents === 2, 'fixture should start with two disconnected brick components');
  const repaired = repairDisconnectedBricksToVoxels(bricks);
  assert(repaired.addedBridgeVoxels > 0, 'disconnected components should receive repair voxels');
}

{
  const sideTouching: ConstraintBrick[] = [
    {
      id: 'A',
      x: 0,
      y: 1,
      z: 0,
      width: 1,
      depth: 1,
      color: red,
      cells: [{ x: 0, y: 1, z: 0 }],
    },
    {
      id: 'B',
      x: 1,
      y: 1,
      z: 0,
      width: 1,
      depth: 1,
      color: red,
      cells: [{ x: 1, y: 1, z: 0 }],
    },
  ];
  const report = analyzeBrickConnectivity(sideTouching);
  assert(report.connectedComponents === 2, 'same-layer side contact must not count as physical LEGO connection');
}

{
  const groundSideTouching: ConstraintBrick[] = [
    {
      id: 'A',
      x: 0,
      y: 0,
      z: 0,
      width: 1,
      depth: 1,
      color: red,
      cells: [{ x: 0, y: 0, z: 0 }],
    },
    {
      id: 'B',
      x: 1,
      y: 0,
      z: 0,
      width: 1,
      depth: 1,
      color: red,
      cells: [{ x: 1, y: 0, z: 0 }],
    },
  ];
  const report = analyzeBrickConnectivity(groundSideTouching);
  assert(report.connectedComponents === 2, 'ground-level side contact must not imply baseplate connection');
}

{
  const legalNose: ConstraintBrick[] = [
    {
      id: 'face',
      x: 0,
      y: 0,
      z: 0,
      width: 1,
      depth: 1,
      color: red,
      cells: [{ x: 0, y: 0, z: 0 }],
    },
    {
      id: 'nose-bridge',
      x: 0,
      y: 1,
      z: 0,
      width: 1,
      depth: 3,
      color: red,
      cells: [
        { x: 0, y: 1, z: 0 },
        { x: 0, y: 1, z: 1 },
        { x: 0, y: 1, z: 2 },
      ],
    },
  ];
  const report = analyzeBrickConnectivity(legalNose);
  assert(report.unsupportedBrickIds.length === 0, 'cantilevered brick with stud support should be supported');
  assert(report.overextendedBrickIds.length === 0, 'short brick-internal cantilever should be legal');
  assert(report.connectedComponents === 1, 'stud-supported cantilever should connect through the supported cell');
}

{
  const topLockedButNotSameBrickCantilever: ConstraintBrick[] = [
    {
      id: 'body-lower',
      x: 0,
      y: 0,
      z: 0,
      width: 1,
      depth: 1,
      color: red,
      cells: [{ x: 0, y: 0, z: 0 }],
    },
    {
      id: 'floating-nose-detail',
      x: 2,
      y: 1,
      z: 0,
      width: 1,
      depth: 1,
      color: red,
      cells: [{ x: 2, y: 1, z: 0 }],
    },
    {
      id: 'top-lock-only',
      x: 2,
      y: 2,
      z: 0,
      width: 1,
      depth: 1,
      color: red,
      cells: [{ x: 2, y: 2, z: 0 }],
    },
  ];
  const report = analyzeBrickConnectivity(topLockedButNotSameBrickCantilever);
  assert(
    report.unsupportedBrickIds.includes('floating-nose-detail'),
    'a floating brick must not become legal merely because another brick sits on top'
  );
}

{
  const tooLongNose: ConstraintBrick[] = [
    {
      id: 'face',
      x: 0,
      y: 0,
      z: 0,
      width: 1,
      depth: 1,
      color: red,
      cells: [{ x: 0, y: 0, z: 0 }],
    },
    {
      id: 'nose-bridge',
      x: 0,
      y: 1,
      z: 0,
      width: 1,
      depth: 4,
      color: red,
      cells: [
        { x: 0, y: 1, z: 0 },
        { x: 0, y: 1, z: 1 },
        { x: 0, y: 1, z: 2 },
        { x: 0, y: 1, z: 3 },
      ],
    },
  ];
  const report = analyzeBrickConnectivity(tooLongNose);
  assert(report.overextendedBrickIds.includes('nose-bridge'), 'overlong brick-internal cantilever should be invalid');
}

{
  const lower: ConstraintBrick[] = [
    {
      id: 'lower',
      x: 0,
      y: 0,
      z: 0,
      width: 2,
      depth: 1,
      color: red,
      cells: [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
      ],
    },
  ];
  const aligned = scoreSeamInterlock([
    { x: 0, y: 1, z: 0 },
    { x: 1, y: 1, z: 0 },
  ], lower);
  const staggered = scoreSeamInterlock([
    { x: 1, y: 1, z: 0 },
    { x: 2, y: 1, z: 0 },
  ], lower);
  assert(staggered > aligned, 'staggered candidate should score higher than aligned seams');
}

{
  const voxels: ConstraintVoxel[] = [];
  for (let x = 0; x < 2; x++) {
    for (let z = 0; z < 8; z++) {
      voxels.push({ x, y: 0, z, color: red });
    }
  }
  const bricks = voxelsToBricks(voxels);
  assert(bricks.some((brick) => brick.type === '2x8'), 'same-color 2x8 region should produce a 2x8 brick');
  assert(
    bricks.every((brick) => brick.width * brick.depth < 18),
    'merged bricks should respect the area limit below 18 studs'
  );
}

console.log('physical constraints tests passed');
