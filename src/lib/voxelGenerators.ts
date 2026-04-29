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
    const addBox = (
      x1: number,
      x2: number,
      y1: number,
      y2: number,
      z1: number,
      z2: number,
      color: number
    ) => {
      for (let x = x1; x <= x2; x++) {
        for (let y = y1; y <= y2; y++) {
          for (let z = z1; z <= z2; z++) {
            setBlock(map, x, y, z, color);
          }
        }
      }
    };

    const addLayer = (
      y: number,
      x1: number,
      x2: number,
      z1: number,
      z2: number,
      color: number
    ) => addBox(x1, x2, y, y, z1, z2, color);

    // A small deterministic perch gives the talons a believable base without adding random clutter.
    addBox(-6, 6, 0, 0, 3, 4, COLORS.WOOD);
    addBox(-5, -4, 0, 1, 4, 5, COLORS.WOOD);
    addBox(4, 5, 0, 1, 4, 5, COLORS.WOOD);

    // Talons and feet, with separate toe tips so the base reads as claws instead of a slab.
    addBox(-3, -2, 1, 2, -1, 1, COLORS.TALON);
    addBox(2, 3, 1, 2, -1, 1, COLORS.TALON);
    [-4, -2, 0, 2, 4].forEach((x) => setBlock(map, x, 1, -2, COLORS.GOLD));
    [-3, 3].forEach((x) => {
      setBlock(map, x, 1, 2, COLORS.GOLD);
      setBlock(map, x, 2, -2, COLORS.GOLD);
    });

    // Body core: more layers and a rounded silhouette, each upper footprint nested over lower support.
    addLayer(2, -4, 4, -2, 3, COLORS.DARK);
    addLayer(3, -5, 5, -2, 3, COLORS.DARK);
    addLayer(4, -5, 5, -3, 3, COLORS.DARK);
    addLayer(5, -4, 4, -3, 3, COLORS.DARK);
    addLayer(6, -4, 4, -2, 2, COLORS.DARK);
    addLayer(7, -3, 3, -2, 2, COLORS.DARK);
    addLayer(8, -2, 2, -1, 1, COLORS.DARK);

    // Lighter chest and belly feathers on the front.
    addLayer(3, -2, 2, -4, -3, COLORS.LIGHT);
    addLayer(4, -2, 2, -4, -3, COLORS.LIGHT);
    addLayer(5, -1, 1, -4, -3, COLORS.LIGHT);
    setBlock(map, -2, 6, -3, COLORS.LIGHT);
    setBlock(map, -1, 6, -3, COLORS.LIGHT);
    setBlock(map, 0, 6, -3, COLORS.LIGHT);
    setBlock(map, 1, 6, -3, COLORS.LIGHT);
    setBlock(map, 2, 6, -3, COLORS.LIGHT);

    // Wide stepped wings with visible feather bands. The lower layers are broader, upper layers taper.
    addLayer(2, -12, -5, -1, 3, COLORS.DARK);
    addLayer(2, 5, 12, -1, 3, COLORS.DARK);
    addLayer(3, -12, -5, -1, 3, COLORS.DARK);
    addLayer(3, 5, 12, -1, 3, COLORS.DARK);
    addLayer(4, -11, -5, 0, 3, COLORS.DARK);
    addLayer(4, 5, 11, 0, 3, COLORS.DARK);
    addLayer(5, -10, -5, 0, 2, COLORS.DARK);
    addLayer(5, 5, 10, 0, 2, COLORS.DARK);
    addLayer(6, -9, -5, 1, 2, COLORS.DARK);
    addLayer(6, 5, 9, 1, 2, COLORS.DARK);
    addLayer(7, -7, -5, 1, 2, COLORS.DARK);
    addLayer(7, 5, 7, 1, 2, COLORS.DARK);

    // Feather-tip color breaks are supported 1x1/1x2 details, not floating specks.
    [-12, -10, -8, -6, 6, 8, 10, 12].forEach((x) => {
      setBlock(map, x, 4, 3, COLORS.WOOD);
      setBlock(map, x, 5, 2, COLORS.WOOD);
    });
    [-11, -9, -7, 7, 9, 11].forEach((x) => setBlock(map, x, 3, -1, COLORS.WOOD));

    // Tail feathers behind the body, layered like a fan.
    addLayer(1, -4, 4, 4, 5, COLORS.WHITE);
    addLayer(2, -4, 4, 4, 5, COLORS.WHITE);
    addLayer(3, -3, 3, 4, 5, COLORS.WHITE);
    addLayer(4, -2, 2, 4, 5, COLORS.WHITE);
    [-5, -3, -1, 1, 3, 5].forEach((x) => setBlock(map, x, 1, 5, COLORS.WHITE));

    // Neck and head: larger white head with cheek blocks and a brow, all sitting on a dark neck.
    addLayer(9, -2, 2, -1, 1, COLORS.DARK);
    addLayer(10, -3, 3, -2, 1, COLORS.WHITE);
    addLayer(11, -3, 3, -3, 1, COLORS.WHITE);
    addLayer(12, -2, 2, -3, 1, COLORS.WHITE);
    addLayer(13, -1, 1, -2, 0, COLORS.WHITE);
    setBlock(map, -3, 11, -2, COLORS.WHITE);
    setBlock(map, 3, 11, -2, COLORS.WHITE);
    setBlock(map, -2, 12, -3, COLORS.WHITE);
    setBlock(map, 2, 12, -3, COLORS.WHITE);

    // Eyes stay as supported black 1x1 details. Brow blocks make the gaze more eagle-like.
    setBlock(map, -1, 12, -3, COLORS.BLACK);
    setBlock(map, 1, 12, -3, COLORS.BLACK);
    setBlock(map, -1, 13, -2, COLORS.DARK);
    setBlock(map, 1, 13, -2, COLORS.DARK);

    // Short supported beak. Keep it over the face footprint so support repair does not create a yellow column.
    addBox(0, 0, 10, 11, -4, -4, COLORS.GOLD);
    setBlock(map, 0, 9, -4, COLORS.DARK);

    // Extra feather texture raises the model detail without globally scaling it.
    [-11, -9, -7, -5].forEach((x, index) => {
      addBox(x, x + 1, 3 + index % 2, 4 + index % 2, -3, -2, COLORS.WOOD);
      addBox(-x - 1, -x, 3 + index % 2, 4 + index % 2, -3, -2, COLORS.WOOD);
    });
    [-3, -1, 1, 3].forEach((x) => {
      setBlock(map, x, 5, -4, COLORS.LIGHT);
      setBlock(map, x, 6, -4, COLORS.LIGHT);
    });

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

  Fox: (): VoxelData[] => {
    const map = new Map<string, VoxelData>();
    const baseY = CONFIG.FLOOR_Y + 1;

    const addBox = (
      x1: number,
      x2: number,
      y1: number,
      y2: number,
      z1: number,
      z2: number,
      color: number
    ) => {
      for (let x = x1; x <= x2; x++) {
        for (let y = y1; y <= y2; y++) {
          for (let z = z1; z <= z2; z++) {
            setBlock(map, x, y, z, color);
          }
        }
      }
    };

    // Low, long body so the silhouette reads as a fox rather than a generic cat.
    generateSphere(map, -2, baseY + 3, 0, 3.3, COLORS.FOX, 0.75);
    generateSphere(map, 2, baseY + 3, 0, 3.1, COLORS.FOX, 0.72);
    addBox(-3, 3, baseY + 1, baseY + 2, -2, 2, COLORS.FOX);
    addBox(-1, 3, baseY + 1, baseY + 2, -3, -3, COLORS.WHITE);

    // Four supported legs and dark paws.
    [-4, -1, 2, 5].forEach((x) => {
      addBox(x, x + 1, CONFIG.FLOOR_Y, baseY + 1, -1, 0, COLORS.FOX_DARK);
      setBlock(map, x, CONFIG.FLOOR_Y, -2, COLORS.FOX_DARK);
      setBlock(map, x + 1, CONFIG.FLOOR_Y, -2, COLORS.FOX_DARK);
    });

    // Big bushy tail curls upward behind the body, with a white supported tip.
    addBox(-8, -5, baseY + 1, baseY + 2, 1, 3, COLORS.FOX);
    addBox(-10, -7, baseY + 2, baseY + 4, 2, 4, COLORS.FOX);
    addBox(-11, -9, baseY + 4, baseY + 6, 3, 5, COLORS.FOX);
    addBox(-12, -10, baseY + 5, baseY + 6, 4, 5, COLORS.WHITE);
    setBlock(map, -12, baseY + 4, 4, COLORS.WHITE);

    // Head, cheeks, pointed muzzle, and ears. Front is negative z, matching the app camera.
    generateSphere(map, 5, baseY + 6, -1, 2.8, COLORS.FOX, 0.85);
    addBox(4, 6, baseY + 4, baseY + 5, -4, -3, COLORS.WHITE);
    addBox(5, 5, baseY + 5, baseY + 6, -5, -4, COLORS.WHITE);
    setBlock(map, 5, baseY + 5, -6, COLORS.BLACK);

    addBox(3, 4, baseY + 8, baseY + 10, -1, 0, COLORS.FOX);
    addBox(6, 7, baseY + 8, baseY + 10, -1, 0, COLORS.FOX);
    setBlock(map, 4, baseY + 9, -1, COLORS.WHITE);
    setBlock(map, 6, baseY + 9, -1, COLORS.WHITE);

    setBlock(map, 4, baseY + 6, -4, COLORS.BLACK);
    setBlock(map, 6, baseY + 6, -4, COLORS.BLACK);
    setBlock(map, 4, baseY + 7, -3, COLORS.FOX_DARK);
    setBlock(map, 6, baseY + 7, -3, COLORS.FOX_DARK);

    // A few same-color contour bands add life without creating floating freckles.
    addBox(-4, 1, baseY + 5, baseY + 5, -2, -2, COLORS.LIGHT);
    addBox(-2, 4, baseY + 4, baseY + 4, 2, 2, COLORS.FOX_DARK);

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
