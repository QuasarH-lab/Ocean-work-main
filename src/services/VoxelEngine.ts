import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { AppState, BrickData, RebuildTarget, SimulationBrick, VoxelData } from '../types';
import { COLORS, CONFIG } from '../lib/voxelConstants';
import { bricksToVoxels, voxelsToBricks } from '../lib/brickLayout';

export class VoxelEngine {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private brickBodyMesh: THREE.InstancedMesh | null = null;
  private brickStudMesh: THREE.InstancedMesh | null = null;
  private brickUndersideMesh: THREE.InstancedMesh | null = null;
  private brickTubeMesh: THREE.InstancedMesh | null = null;
  private dummy = new THREE.Object3D();
  private bricks: SimulationBrick[] = [];
  private rebuildTargets: RebuildTarget[] = [];
  private rebuildStartTime = 0;
  private state: AppState = AppState.STABLE;
  private animationId = 0;
  private onStateChange: (state: AppState) => void;
  private onCountChange: (count: number) => void;
  private framingRadius = 12;
  private framingCenter = new THREE.Vector3(0, 5, 0);

  constructor(
    container: HTMLElement,
    onStateChange: (state: AppState) => void,
    onCountChange: (count: number) => void
  ) {
    this.container = container;
    this.onStateChange = onStateChange;
    this.onCountChange = onCountChange;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(CONFIG.BG_COLOR);
    this.scene.fog = new THREE.Fog(CONFIG.BG_COLOR, 60, 140);

    this.camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
    this.camera.position.set(30, 30, 60);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.5;
    this.controls.target.set(0, 5, 0);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.72);
    this.scene.add(ambientLight);

    const rimLight = new THREE.DirectionalLight(0xbfd4ff, 1.1);
    rimLight.position.set(-40, 50, -20);
    this.scene.add(rimLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 2.05);
    dirLight.position.set(50, 80, 30);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.left = -40;
    dirLight.shadow.camera.right = 40;
    dirLight.shadow.camera.top = 40;
    dirLight.shadow.camera.bottom = -40;
    this.scene.add(dirLight);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({ color: 0x111a2f, roughness: 1 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = CONFIG.FLOOR_Y;
    floor.receiveShadow = true;
    this.scene.add(floor);

    this.animate = this.animate.bind(this);
    this.animate();
  }

  public loadInitialModel(data: VoxelData[], brickData?: BrickData[]) {
    const bricks = brickData?.length ? brickData : voxelsToBricks(data);
    this.createBricks(bricks);
    this.fitCameraToBricks(bricks);
    this.onCountChange(this.getTotalCells());
    this.state = AppState.STABLE;
    this.onStateChange(this.state);
  }

  public rebuild(targetModel: VoxelData[], brickData?: BrickData[]) {
    if (this.state === AppState.REBUILDING) {
      return;
    }

    const targetBricks = brickData?.length ? brickData : voxelsToBricks(targetModel);
    if (targetBricks.length !== this.bricks.length) {
      this.loadInitialModel(targetModel, targetBricks);
      return;
    }

    const available = this.bricks.map((brick, i) => ({ index: i, color: brick.color, taken: false }));
    const mappings: RebuildTarget[] = new Array(this.bricks.length).fill(null);

    targetBricks.forEach((target) => {
      let bestDist = 9999;
      let bestIdx = -1;

      for (let i = 0; i < available.length; i++) {
        if (available[i].taken) {
          continue;
        }

        const d = this.getColorDist(available[i].color, target.color);
        const isLeafOrWood =
          available[i].color.g > 0.4 ||
          (available[i].color.r < 0.25 && available[i].color.b < 0.25);
        const targetIsGreen = target.color === COLORS.GREEN || target.color === COLORS.WOOD;
        const penalty = isLeafOrWood && !targetIsGreen ? 100 : 0;

        if (d + penalty < bestDist) {
          bestDist = d + penalty;
          bestIdx = i;
          if (d < 0.01) {
            break;
          }
        }
      }

      if (bestIdx !== -1) {
        available[bestIdx].taken = true;
        const h = Math.max(0, (target.y - CONFIG.FLOOR_Y) / 15);
        mappings[available[bestIdx].index] = {
          x: target.x,
          y: target.y,
          z: target.z,
          width: target.width,
          depth: target.depth,
          cells: target.cells,
          delay: h * 800,
        };
      }
    });

    for (let i = 0; i < this.bricks.length; i++) {
      if (!mappings[i]) {
        mappings[i] = {
          x: this.bricks[i].x,
          y: this.bricks[i].y,
          z: this.bricks[i].z,
          isRubble: true,
          delay: 0,
        };
      }
    }

    this.rebuildTargets = mappings;
    this.rebuildStartTime = Date.now();
    this.state = AppState.REBUILDING;
    this.onStateChange(this.state);
  }

  public dismantle() {
    if (this.state !== AppState.STABLE) {
      return;
    }

    this.state = AppState.DISMANTLING;
    this.onStateChange(this.state);
    this.bricks.forEach((brick) => {
      brick.vx = (Math.random() - 0.5) * 0.8;
      brick.vy = Math.random() * 0.5;
      brick.vz = (Math.random() - 0.5) * 0.8;
      brick.rvx = (Math.random() - 0.5) * 0.2;
      brick.rvy = (Math.random() - 0.5) * 0.2;
      brick.rvz = (Math.random() - 0.5) * 0.2;
    });
  }

  public handleResize() {
    this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
  }

  public setAutoRotate(enabled: boolean) {
    this.controls.autoRotate = enabled;
  }

  public focusModel(data: VoxelData[], brickData?: BrickData[]) {
    this.fitCameraToBricks(brickData?.length ? brickData : voxelsToBricks(data));
  }

  public getJsonData(): string {
    return JSON.stringify(
      this.getVoxelData().map((voxel, i) => ({
        id: i,
        x: voxel.x,
        y: voxel.y,
        z: voxel.z,
        c: `#${voxel.color.toString(16).padStart(6, '0')}`,
      })),
      null,
      2
    );
  }

  public getUniqueColors(): string[] {
    return Array.from(new Set(this.bricks.map((brick) => `#${brick.color.getHexString()}`)));
  }

  public cleanup() {
    cancelAnimationFrame(this.animationId);
    this.disposeInstancedMesh(this.brickBodyMesh);
    this.disposeInstancedMesh(this.brickStudMesh);
    this.disposeInstancedMesh(this.brickUndersideMesh);
    this.disposeInstancedMesh(this.brickTubeMesh);
    this.container.removeChild(this.renderer.domElement);
    this.renderer.dispose();
  }

  private createBricks(data: BrickData[]) {
    this.disposeInstancedMesh(this.brickBodyMesh);
    this.disposeInstancedMesh(this.brickStudMesh);
    this.disposeInstancedMesh(this.brickUndersideMesh);
    this.disposeInstancedMesh(this.brickTubeMesh);
    this.brickBodyMesh = null;
    this.brickStudMesh = null;
    this.brickUndersideMesh = null;
    this.brickTubeMesh = null;

    this.bricks = data.map((brick, i) => {
      const color = new THREE.Color(brick.color);
      color.offsetHSL(0, 0, (Math.random() * 0.04) - 0.02);
      return {
        id: i,
        type: brick.type,
        x: brick.x,
        y: brick.y,
        z: brick.z,
        width: brick.width,
        depth: brick.depth,
        cells: brick.cells,
        color,
        vx: 0,
        vy: 0,
        vz: 0,
        rx: 0,
        ry: 0,
        rz: 0,
        rvx: 0,
        rvy: 0,
        rvz: 0,
      };
    });

    const brickSize = CONFIG.VOXEL_SIZE;
    const bodyHeight = brickSize * 0.78;
    const studRadius = brickSize * 0.285;
    const studHeight = brickSize * 0.2;
    const undersideHeight = brickSize * 0.035;
    const tubeRadius = brickSize * 0.22;
    const tubeHeight = brickSize * 0.32;
    const bodyGeometry = new RoundedBoxGeometry(
      brickSize * 0.92,
      bodyHeight,
      brickSize * 0.92,
      5,
      brickSize * 0.045
    );
    const studGeometry = new THREE.CylinderGeometry(studRadius * 0.94, studRadius, studHeight, 36, 1);
    const undersideGeometry = new RoundedBoxGeometry(
      brickSize * 0.62,
      undersideHeight,
      brickSize * 0.62,
      3,
      brickSize * 0.025
    );
    const tubeGeometry = new THREE.CylinderGeometry(tubeRadius, tubeRadius, tubeHeight, 32, 1, true);

    const bodyMaterial = new THREE.MeshPhysicalMaterial({
      roughness: 0.26,
      metalness: 0.02,
      clearcoat: 0.55,
      clearcoatRoughness: 0.32,
      envMapIntensity: 0.95,
    });
    const studMaterial = new THREE.MeshPhysicalMaterial({
      roughness: 0.2,
      metalness: 0.03,
      clearcoat: 0.7,
      clearcoatRoughness: 0.24,
      envMapIntensity: 1.1,
    });
    const undersideMaterial = new THREE.MeshStandardMaterial({
      roughness: 0.7,
      metalness: 0,
      envMapIntensity: 0.2,
    });
    const tubeMaterial = new THREE.MeshPhysicalMaterial({
      roughness: 0.34,
      metalness: 0.02,
      clearcoat: 0.35,
      clearcoatRoughness: 0.42,
      envMapIntensity: 0.65,
      side: THREE.DoubleSide,
    });

    const studCount = Math.max(1, this.getTotalCells());
    this.brickBodyMesh = new THREE.InstancedMesh(bodyGeometry, bodyMaterial, Math.max(1, this.bricks.length));
    this.brickStudMesh = new THREE.InstancedMesh(studGeometry, studMaterial, studCount);
    this.brickUndersideMesh = new THREE.InstancedMesh(
      undersideGeometry,
      undersideMaterial,
      Math.max(1, this.bricks.length)
    );
    this.brickTubeMesh = new THREE.InstancedMesh(tubeGeometry, tubeMaterial, studCount);
    this.brickBodyMesh.castShadow = true;
    this.brickBodyMesh.receiveShadow = true;
    this.brickStudMesh.castShadow = true;
    this.brickStudMesh.receiveShadow = true;
    this.brickUndersideMesh.castShadow = true;
    this.brickUndersideMesh.receiveShadow = true;
    this.brickTubeMesh.castShadow = true;
    this.brickTubeMesh.receiveShadow = true;
    this.scene.add(this.brickBodyMesh);
    this.scene.add(this.brickUndersideMesh);
    this.scene.add(this.brickTubeMesh);
    this.scene.add(this.brickStudMesh);
    this.draw();
  }

  private fitCameraToBricks(bricks: BrickData[]) {
    if (!bricks.length) {
      return;
    }

    const bounds = new THREE.Box3();
    bricks.forEach((brick) => {
      brick.cells.forEach((cell) => bounds.expandByPoint(new THREE.Vector3(cell.x, cell.y, cell.z)));
    });

    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const maxDimension = Math.max(size.x, size.y, size.z, 6);

    this.framingCenter.copy(center);
    this.framingCenter.y = Math.max(center.y, 4);
    this.framingRadius = maxDimension * 0.92;
    this.applyCameraFraming();
  }

  private applyCameraFraming() {
    const aspect = Math.max(this.container.clientWidth / Math.max(this.container.clientHeight, 1), 1);
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(fov / 2) * aspect);
    const fitFov = Math.min(fov, horizontalFov);
    const distance = (this.framingRadius * 1.58) / Math.tan(fitFov / 2);

    this.controls.target.lerp(this.framingCenter, 1);
    this.camera.position.set(
      this.framingCenter.x + distance * 0.42,
      this.framingCenter.y + distance * 0.32,
      this.framingCenter.z - distance * 1.04
    );
    this.camera.lookAt(this.framingCenter);
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.near = Math.max(80, distance * 0.85);
      this.scene.fog.far = Math.max(220, distance + this.framingRadius * 3);
    }
    this.controls.update();
  }

  private draw() {
    if (!this.brickBodyMesh || !this.brickStudMesh || !this.brickUndersideMesh || !this.brickTubeMesh) {
      return;
    }

    const brickSize = CONFIG.VOXEL_SIZE;
    const bodyHeight = brickSize * 0.78;
    const studHeight = brickSize * 0.2;
    const undersideHeight = brickSize * 0.035;
    const tubeHeight = brickSize * 0.32;
    const verticalOverlap = 0.02;
    const bodyOffsetY = (brickSize - bodyHeight) / 2 - verticalOverlap;
    const studOffsetY = bodyOffsetY + bodyHeight / 2 + studHeight / 2 - 0.012;
    const undersideOffsetY = bodyOffsetY - bodyHeight / 2 - undersideHeight / 2 + 0.02;
    const tubeOffsetY = bodyOffsetY - bodyHeight / 2 + tubeHeight / 2 + 0.035;
    const coveredStudScale = 0.0001;

    const occupied = new Set<string>();
    this.bricks.forEach((brick) => {
      brick.cells.forEach((cell) => {
        occupied.add(`${Math.round(cell.x)},${Math.round(cell.y)},${Math.round(cell.z)}`);
      });
    });

    this.bricks.forEach((brick, i) => {
      this.dummy.position.set(
        brick.x + (brick.width - 1) / 2,
        brick.y + bodyOffsetY,
        brick.z + (brick.depth - 1) / 2
      );
      this.dummy.rotation.set(brick.rx, brick.ry, brick.rz);
      this.dummy.scale.set(brick.width, 1, brick.depth);
      this.dummy.updateMatrix();
      this.brickBodyMesh?.setMatrixAt(i, this.dummy.matrix);
      this.brickBodyMesh?.setColorAt(i, brick.color);

      this.dummy.position.set(
        brick.x + (brick.width - 1) / 2,
        brick.y + undersideOffsetY,
        brick.z + (brick.depth - 1) / 2
      );
      this.dummy.rotation.set(brick.rx, brick.ry, brick.rz);
      this.dummy.scale.set(Math.max(0.62, brick.width * 1.18), 1, Math.max(0.62, brick.depth * 1.18));
      this.dummy.updateMatrix();
      this.brickUndersideMesh?.setMatrixAt(i, this.dummy.matrix);
      this.brickUndersideMesh?.setColorAt(i, brick.color.clone().offsetHSL(0, -0.08, -0.28));
    });

    let studIndex = 0;
    let tubeIndex = 0;
    this.bricks.forEach((brick) => {
      const centerX = brick.x + (brick.width - 1) / 2;
      const centerZ = brick.z + (brick.depth - 1) / 2;
      const rotation = new THREE.Euler(brick.rx, brick.ry, brick.rz);

      brick.cells.forEach((cell) => {
        const gx = Math.round(cell.x);
        const gy = Math.round(cell.y);
        const gz = Math.round(cell.z);
        const hasBlockAbove = occupied.has(`${gx},${gy + 1},${gz}`);
        const localOffset = new THREE.Vector3(cell.x - centerX, 0, cell.z - centerZ).applyEuler(rotation);

        this.dummy.position.set(centerX + localOffset.x, brick.y + studOffsetY + localOffset.y, centerZ + localOffset.z);
        this.dummy.rotation.set(brick.rx, brick.ry, brick.rz);
        this.dummy.scale.set(
          hasBlockAbove ? coveredStudScale : 1,
          hasBlockAbove ? coveredStudScale : 1,
          hasBlockAbove ? coveredStudScale : 1
        );
        this.dummy.updateMatrix();
        this.brickStudMesh?.setMatrixAt(studIndex, this.dummy.matrix);
        this.brickStudMesh?.setColorAt(studIndex, brick.color.clone().offsetHSL(0, 0, 0.06));
        studIndex++;

        this.dummy.position.set(centerX + localOffset.x, brick.y + tubeOffsetY + localOffset.y, centerZ + localOffset.z);
        this.dummy.rotation.set(brick.rx, brick.ry, brick.rz);
        this.dummy.scale.set(1, 1, 1);
        this.dummy.updateMatrix();
        this.brickTubeMesh?.setMatrixAt(tubeIndex, this.dummy.matrix);
        this.brickTubeMesh?.setColorAt(tubeIndex, brick.color.clone().offsetHSL(0, -0.02, -0.16));
        tubeIndex++;
      });
    });

    this.brickBodyMesh.instanceMatrix.needsUpdate = true;
    this.brickBodyMesh.instanceColor!.needsUpdate = true;
    this.brickStudMesh.instanceMatrix.needsUpdate = true;
    this.brickStudMesh.instanceColor!.needsUpdate = true;
    this.brickUndersideMesh.instanceMatrix.needsUpdate = true;
    this.brickUndersideMesh.instanceColor!.needsUpdate = true;
    this.brickTubeMesh.instanceMatrix.needsUpdate = true;
    this.brickTubeMesh.instanceColor!.needsUpdate = true;
  }

  private getColorDist(c1: THREE.Color, hex2: number) {
    const c2 = new THREE.Color(hex2);
    const r = (c1.r - c2.r) * 0.3;
    const g = (c1.g - c2.g) * 0.59;
    const b = (c1.b - c2.b) * 0.11;
    return Math.sqrt(r * r + g * g + b * b);
  }

  private updatePhysics() {
    if (this.state === AppState.DISMANTLING) {
      this.bricks.forEach((brick) => {
        brick.vy -= 0.025;
        brick.x += brick.vx;
        brick.y += brick.vy;
        brick.z += brick.vz;
        brick.cells = brick.cells.map((cell) => ({
          x: cell.x + brick.vx,
          y: cell.y + brick.vy,
          z: cell.z + brick.vz,
        }));
        brick.rx += brick.rvx;
        brick.ry += brick.rvy;
        brick.rz += brick.rvz;

        if (brick.y < CONFIG.FLOOR_Y + 0.5) {
          const correction = CONFIG.FLOOR_Y + 0.5 - brick.y;
          brick.y += correction;
          brick.cells = brick.cells.map((cell) => ({ ...cell, y: cell.y + correction }));
          brick.vy *= -0.5;
          brick.vx *= 0.9;
          brick.vz *= 0.9;
          brick.rvx *= 0.8;
          brick.rvy *= 0.8;
          brick.rvz *= 0.8;
        }
      });
      return;
    }

    if (this.state !== AppState.REBUILDING) {
      return;
    }

    const elapsed = Date.now() - this.rebuildStartTime;
    let allDone = true;

    this.bricks.forEach((brick, i) => {
      const target = this.rebuildTargets[i];
      if (!target || target.isRubble) {
        return;
      }

      if (elapsed < target.delay) {
        allDone = false;
        return;
      }

      const speed = 0.12;
      const previousX = brick.x;
      const previousY = brick.y;
      const previousZ = brick.z;
      brick.x += (target.x - brick.x) * speed;
      brick.y += (target.y - brick.y) * speed;
      brick.z += (target.z - brick.z) * speed;
      brick.rx += (0 - brick.rx) * speed;
      brick.ry += (0 - brick.ry) * speed;
      brick.rz += (0 - brick.rz) * speed;

      const dx = brick.x - previousX;
      const dy = brick.y - previousY;
      const dz = brick.z - previousZ;
      brick.cells = brick.cells.map((cell) => ({ x: cell.x + dx, y: cell.y + dy, z: cell.z + dz }));

      if ((target.x - brick.x) ** 2 + (target.y - brick.y) ** 2 + (target.z - brick.z) ** 2 > 0.01) {
        allDone = false;
      } else {
        brick.x = target.x;
        brick.y = target.y;
        brick.z = target.z;
        brick.width = target.width || brick.width;
        brick.depth = target.depth || brick.depth;
        brick.cells = target.cells || brick.cells;
        brick.rx = 0;
        brick.ry = 0;
        brick.rz = 0;
      }
    });

    if (allDone) {
      this.state = AppState.STABLE;
      this.onStateChange(this.state);
    }
  }

  private animate() {
    this.animationId = requestAnimationFrame(this.animate);
    this.controls.update();
    this.updatePhysics();
    if (this.state !== AppState.STABLE || this.controls.autoRotate) {
      this.draw();
    }
    this.renderer.render(this.scene, this.camera);
  }

  private getVoxelData(): VoxelData[] {
    return bricksToVoxels(
      this.bricks.map((brick) => ({
        id: `${brick.id}`,
        type: brick.type,
        x: Math.round(brick.x),
        y: Math.round(brick.y),
        z: Math.round(brick.z),
        width: brick.width,
        depth: brick.depth,
        height: 1,
        color: brick.color.getHex(),
        cells: brick.cells.map((cell) => ({
          x: Math.round(cell.x),
          y: Math.round(cell.y),
          z: Math.round(cell.z),
        })),
      }))
    );
  }

  private getTotalCells() {
    return this.bricks.reduce((sum, brick) => sum + brick.cells.length, 0);
  }

  private disposeInstancedMesh(mesh: THREE.InstancedMesh | null) {
    if (!mesh) {
      return;
    }
    this.scene.remove(mesh);
    mesh.geometry.dispose();
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach((material) => material.dispose());
    } else {
      mesh.material.dispose();
    }
  }
}
