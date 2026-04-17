import { VoxelData } from '../types';
import { COLORS, CONFIG } from './voxelConstants';

function setBlock(map: Map<string, VoxelData>, x: number, y: number, z: number, color: number) {
  const rx = Math.round(x);
  const ry = Math.round(y);
  const rz = Math.round(z);
  map.set(`${rx},${ry},${rz}`, { x: rx, y: ry, z: rz, color });
}

function generateSphere(
  map: Map<string, VoxelData>,
  cx: number,
  cy: number,
  cz: number,
  r: number,
  col: number,
  sy = 1
) {
  const r2 = r * r;
  for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
    for (let y = Math.floor(cy - r * sy); y <= Math.ceil(cy + r * sy); y++) {
      for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) {
        const dx = x - cx;
        const dy = (y - cy) / sy;
        const dz = z - cz;
        if (dx * dx + dy * dy + dz * dz <= r2) {
          setBlock(map, x, y, z, col);
        }
      }
    }
  }
}

export const Generators = {
  Eagle: (): VoxelData[] => {
    const map = new Map<string, VoxelData>();
    for (let x = -8; x < 8; x++) {
      const y = Math.sin(x * 0.2) * 1.5;
      const z = Math.cos(x * 0.1) * 1.5;
      generateSphere(map, x, y, z, 1.8, COLORS.WOOD);
      if (Math.random() > 0.7) {
        generateSphere(map, x, y + 2, z + (Math.random() - 0.5) * 3, 1.5, COLORS.GREEN);
      }
    }

    const ex = 0;
    const ey = 2;
    const ez = 2;
    generateSphere(map, ex, ey + 6, ez, 4.5, COLORS.DARK, 1.4);
    for (let x = ex - 2; x <= ex + 2; x++) {
      for (let y = ey + 4; y <= ey + 9; y++) {
        setBlock(map, x, y, ez + 3, COLORS.LIGHT);
      }
    }
    for (const x of [-4, -3, 3, 4]) {
      for (let y = ey + 4; y <= ey + 10; y++) {
        for (let z = ez - 2; z <= ez + 3; z++) {
          setBlock(map, x, y, z, COLORS.DARK);
        }
      }
    }
    for (let x = ex - 2; x <= ex + 2; x++) {
      for (let y = ey; y <= ey + 4; y++) {
        for (let z = ez - 5; z <= ez - 3; z++) {
          setBlock(map, x, y, z, COLORS.WHITE);
        }
      }
    }

    const hy = ey + 12;
    const hz = ez + 1;
    generateSphere(map, ex, hy, hz, 2.8, COLORS.WHITE);
    generateSphere(map, ex, hy - 2, hz, 2.5, COLORS.WHITE);
    [[-2, 0], [-2, 1], [2, 0], [2, 1]].forEach(([dx, dy]) => setBlock(map, ex + dx, ey + dy, ez, COLORS.TALON));
    [[0, 1], [0, 2], [1, 1], [-1, 1]].forEach(([dx, dz]) => setBlock(map, ex + dx, hy, hz + 2 + dz, COLORS.GOLD));
    setBlock(map, ex, hy - 1, hz + 3, COLORS.GOLD);
    [[-1.5, COLORS.BLACK], [1.5, COLORS.BLACK]].forEach(([dx, color]) => setBlock(map, ex + Number(dx), hy + 0.5, hz + 1.5, Number(color)));
    [[-1.5, COLORS.WHITE], [1.5, COLORS.WHITE]].forEach(([dx, color]) => setBlock(map, ex + Number(dx), hy + 1.5, hz + 1.5, Number(color)));

    return Array.from(map.values());
  },

  Cat: (): VoxelData[] => {
    const map = new Map<string, VoxelData>();
    const cy = CONFIG.FLOOR_Y + 1;
    const cx = 0;
    const cz = 0;

    generateSphere(map, cx - 3, cy + 2, cz, 2.2, COLORS.DARK, 1.2);
    generateSphere(map, cx + 3, cy + 2, cz, 2.2, COLORS.DARK, 1.2);
    for (let y = 0; y < 7; y++) {
      const r = 3.5 - y * 0.2;
      generateSphere(map, cx, cy + 2 + y, cz, r, COLORS.DARK);
      generateSphere(map, cx, cy + 2 + y, cz + 2, r * 0.6, COLORS.WHITE);
    }
    for (let y = 0; y < 5; y++) {
      setBlock(map, cx - 1.5, cy + y, cz + 3, COLORS.WHITE);
      setBlock(map, cx + 1.5, cy + y, cz + 3, COLORS.WHITE);
      setBlock(map, cx - 1.5, cy + y, cz + 2, COLORS.WHITE);
      setBlock(map, cx + 1.5, cy + y, cz + 2, COLORS.WHITE);
    }

    const chy = cy + 9;
    generateSphere(map, cx, chy, cz, 3.2, COLORS.LIGHT, 0.8);
    [[-2, 1], [2, 1]].forEach(([dx]) => {
      setBlock(map, cx + dx, chy + 3, cz, COLORS.DARK);
      setBlock(map, cx + dx * 0.8, chy + 3, cz + 1, COLORS.WHITE);
      setBlock(map, cx + dx, chy + 4, cz, COLORS.DARK);
    });
    for (let i = 0; i < 12; i++) {
      const a = i * 0.3;
      const tx = Math.cos(a) * 4.5;
      const tz = Math.sin(a) * 4.5;
      if (tz > -2) {
        setBlock(map, cx + tx, cy, cz + tz, COLORS.DARK);
        setBlock(map, cx + tx, cy + 1, cz + tz, COLORS.DARK);
      }
    }
    setBlock(map, cx - 1, chy + 0.5, cz + 2.5, COLORS.GOLD);
    setBlock(map, cx + 1, chy + 0.5, cz + 2.5, COLORS.GOLD);
    setBlock(map, cx - 1, chy + 0.5, cz + 3, COLORS.BLACK);
    setBlock(map, cx + 1, chy + 0.5, cz + 3, COLORS.BLACK);
    setBlock(map, cx, chy, cz + 3, COLORS.TALON);
    return Array.from(map.values());
  },

  Rabbit: (): VoxelData[] => {
    const map = new Map<string, VoxelData>();
    const logY = CONFIG.FLOOR_Y + 2.5;
    const rx = 0;
    const rz = 0;

    for (let x = -6; x <= 6; x++) {
      const radius = 2.8 + Math.sin(x * 0.5) * 0.2;
      generateSphere(map, x, logY, 0, radius, COLORS.DARK);
      if (x === -6 || x === 6) {
        generateSphere(map, x, logY, 0, radius - 0.5, COLORS.WOOD);
      }
      if (Math.random() > 0.8) {
        setBlock(map, x, logY + radius, (Math.random() - 0.5) * 2, COLORS.GREEN);
      }
    }

    const by = logY + 2.5;
    generateSphere(map, rx - 1.5, by + 1.5, rz - 1.5, 1.8, COLORS.WHITE);
    generateSphere(map, rx + 1.5, by + 1.5, rz - 1.5, 1.8, COLORS.WHITE);
    generateSphere(map, rx, by + 2, rz, 2.2, COLORS.WHITE, 0.8);
    generateSphere(map, rx, by + 2.5, rz + 1.5, 1.5, COLORS.WHITE);
    setBlock(map, rx - 1.2, by, rz + 2.2, COLORS.LIGHT);
    setBlock(map, rx + 1.2, by, rz + 2.2, COLORS.LIGHT);
    setBlock(map, rx - 2.2, by, rz - 0.5, COLORS.WHITE);
    setBlock(map, rx + 2.2, by, rz - 0.5, COLORS.WHITE);
    generateSphere(map, rx, by + 1.5, rz - 2.5, 1.0, COLORS.WHITE);

    const hy = by + 4.5;
    const hz = rz + 1;
    generateSphere(map, rx, hy, hz, 1.7, COLORS.WHITE);
    generateSphere(map, rx - 1.1, hy - 0.5, hz + 0.5, 1.0, COLORS.WHITE);
    generateSphere(map, rx + 1.1, hy - 0.5, hz + 0.5, 1.0, COLORS.WHITE);
    for (let y = 0; y < 5; y++) {
      const curve = y * 0.2;
      setBlock(map, rx - 0.8, hy + 1.5 + y, hz - curve, COLORS.WHITE);
      setBlock(map, rx - 1.2, hy + 1.5 + y, hz - curve, COLORS.WHITE);
      setBlock(map, rx - 1.0, hy + 1.5 + y, hz - curve + 0.5, COLORS.LIGHT);
      setBlock(map, rx + 0.8, hy + 1.5 + y, hz - curve, COLORS.WHITE);
      setBlock(map, rx + 1.2, hy + 1.5 + y, hz - curve, COLORS.WHITE);
      setBlock(map, rx + 1.0, hy + 1.5 + y, hz - curve + 0.5, COLORS.LIGHT);
    }
    setBlock(map, rx - 0.8, hy + 0.2, hz + 1.5, COLORS.BLACK);
    setBlock(map, rx + 0.8, hy + 0.2, hz + 1.5, COLORS.BLACK);
    setBlock(map, rx, hy - 0.5, hz + 1.8, COLORS.TALON);

    return Array.from(map.values());
  },

  Twins: (): VoxelData[] => {
    const map = new Map<string, VoxelData>();
    function buildMiniEagle(offsetX: number, offsetZ: number) {
      for (let x = -5; x < 5; x++) {
        const y = Math.sin(x * 0.4) * 0.5;
        generateSphere(map, offsetX + x, y, offsetZ, 1.2, COLORS.WOOD);
        if (Math.random() > 0.8) {
          generateSphere(map, offsetX + x, y + 1, offsetZ, 1, COLORS.GREEN);
        }
      }
      const ex = offsetX;
      const ey = 1.5;
      const ez = offsetZ;
      generateSphere(map, ex, ey + 4, ez, 3.0, COLORS.DARK, 1.4);
      for (let x = ex - 1; x <= ex + 1; x++) {
        for (let y = ey + 2; y <= ey + 6; y++) {
          setBlock(map, x, y, ez + 2, COLORS.LIGHT);
        }
      }
      for (let x = ex - 1; x <= ex + 1; x++) {
        for (let y = ey + 2; y <= ey + 3; y++) {
          setBlock(map, x, y, ez - 3, COLORS.WHITE);
        }
      }
      for (let y = ey + 2; y <= ey + 6; y++) {
        for (let z = ez - 1; z <= ez + 2; z++) {
          setBlock(map, ex - 3, y, z, COLORS.DARK);
          setBlock(map, ex + 3, y, z, COLORS.DARK);
        }
      }
      const hy = ey + 8;
      const hz = ez + 1;
      generateSphere(map, ex, hy, hz, 2.0, COLORS.WHITE);
      setBlock(map, ex, hy, hz + 2, COLORS.GOLD);
      setBlock(map, ex, hy - 0.5, hz + 2, COLORS.GOLD);
      setBlock(map, ex - 1, hy + 0.5, hz + 1, COLORS.BLACK);
      setBlock(map, ex + 1, hy + 0.5, hz + 1, COLORS.BLACK);
      setBlock(map, ex - 1, ey, ez, COLORS.TALON);
      setBlock(map, ex + 1, ey, ez, COLORS.TALON);
    }
    buildMiniEagle(-10, 2);
    buildMiniEagle(10, -2);
    return Array.from(map.values());
  },
};
