import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { AppState, RebuildTarget, SimulationVoxel, VoxelData } from '../types';
import { COLORS, CONFIG } from '../lib/voxelConstants';

export class VoxelEngine {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private brickBodyMesh: THREE.InstancedMesh | null = null;
  private brickStudMesh: THREE.InstancedMesh | null = null;
  private dummy = new THREE.Object3D();
  private voxels: SimulationVoxel[] = [];
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
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.5;
    this.controls.target.set(0, 5, 0);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    this.scene.add(ambientLight);

    const rimLight = new THREE.DirectionalLight(0xaec8ff, 0.75);
    rimLight.position.set(-40, 50, -20);
    this.scene.add(rimLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.6);
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

  public loadInitialModel(data: VoxelData[]) {
    this.createVoxels(data);
    this.fitCameraToData(data);
    this.onCountChange(this.voxels.length);
    this.state = AppState.STABLE;
    this.onStateChange(this.state);
  }

  public rebuild(targetModel: VoxelData[]) {
    if (this.state === AppState.REBUILDING) {
      return;
    }

    const available = this.voxels.map((v, i) => ({ index: i, color: v.color, taken: false }));
    const mappings: RebuildTarget[] = new Array(this.voxels.length).fill(null);

    targetModel.forEach((target) => {
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
          delay: h * 800,
        };
      }
    });

    for (let i = 0; i < this.voxels.length; i++) {
      if (!mappings[i]) {
        mappings[i] = {
          x: this.voxels[i].x,
          y: this.voxels[i].y,
          z: this.voxels[i].z,
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
    this.voxels.forEach((v) => {
      v.vx = (Math.random() - 0.5) * 0.8;
      v.vy = Math.random() * 0.5;
      v.vz = (Math.random() - 0.5) * 0.8;
      v.rvx = (Math.random() - 0.5) * 0.2;
      v.rvy = (Math.random() - 0.5) * 0.2;
      v.rvz = (Math.random() - 0.5) * 0.2;
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

  public focusModel(data: VoxelData[]) {
    this.fitCameraToData(data);
  }

  public getJsonData(): string {
    return JSON.stringify(
      this.voxels.map((v, i) => ({
        id: i,
        x: +v.x.toFixed(2),
        y: +v.y.toFixed(2),
        z: +v.z.toFixed(2),
        c: `#${v.color.getHexString()}`,
      })),
      null,
      2
    );
  }

  public getUniqueColors(): string[] {
    return Array.from(new Set(this.voxels.map((v) => `#${v.color.getHexString()}`)));
  }

  public cleanup() {
    cancelAnimationFrame(this.animationId);
    this.disposeInstancedMesh(this.brickBodyMesh);
    this.disposeInstancedMesh(this.brickStudMesh);
    this.container.removeChild(this.renderer.domElement);
    this.renderer.dispose();
  }

  private createVoxels(data: VoxelData[]) {
    this.disposeInstancedMesh(this.brickBodyMesh);
    this.disposeInstancedMesh(this.brickStudMesh);
    this.brickBodyMesh = null;
    this.brickStudMesh = null;

    this.voxels = data.map((v, i) => {
      const color = new THREE.Color(v.color);
      color.offsetHSL(0, 0, (Math.random() * 0.04) - 0.02);
      return {
        id: i,
        x: v.x,
        y: v.y,
        z: v.z,
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
    const bodyHeight = brickSize * 0.82;
    const studRadius = brickSize * 0.22;
    const studHeight = brickSize * 0.16;
    const bodyGeometry = new RoundedBoxGeometry(brickSize - 0.08, bodyHeight, brickSize - 0.08, 3, brickSize * 0.1);
    const studGeometry = new THREE.CylinderGeometry(studRadius, studRadius, studHeight, 24);

    const bodyMaterial = new THREE.MeshStandardMaterial({
      roughness: 0.42,
      metalness: 0.02,
      envMapIntensity: 0.6,
    });
    const studMaterial = new THREE.MeshStandardMaterial({
      roughness: 0.35,
      metalness: 0.03,
      envMapIntensity: 0.7,
    });

    this.brickBodyMesh = new THREE.InstancedMesh(bodyGeometry, bodyMaterial, this.voxels.length);
    this.brickStudMesh = new THREE.InstancedMesh(studGeometry, studMaterial, this.voxels.length);
    this.brickBodyMesh.castShadow = true;
    this.brickBodyMesh.receiveShadow = true;
    this.brickStudMesh.castShadow = true;
    this.brickStudMesh.receiveShadow = true;
    this.scene.add(this.brickBodyMesh);
    this.scene.add(this.brickStudMesh);
    this.draw();
  }

  private fitCameraToData(data: VoxelData[]) {
    if (!data.length) {
      return;
    }

    const bounds = new THREE.Box3();
    data.forEach((voxel) => {
      bounds.expandByPoint(new THREE.Vector3(voxel.x, voxel.y, voxel.z));
    });

    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const maxDimension = Math.max(size.x, size.y, size.z, 6);

    this.framingCenter.copy(center);
    this.framingCenter.y = Math.max(center.y, 4);
    this.framingRadius = maxDimension * 0.72;
    this.applyCameraFraming();
  }

  private applyCameraFraming() {
    const aspect = Math.max(this.container.clientWidth / Math.max(this.container.clientHeight, 1), 1);
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(fov / 2) * aspect);
    const fitFov = Math.min(fov, horizontalFov);
    const distance = (this.framingRadius * 1.7) / Math.tan(fitFov / 2);

    this.controls.target.lerp(this.framingCenter, 1);
    this.camera.position.set(
      this.framingCenter.x + distance * 0.62,
      this.framingCenter.y + distance * 0.52,
      this.framingCenter.z + distance
    );
    this.camera.lookAt(this.framingCenter);
    this.controls.update();
  }

  private draw() {
    if (!this.brickBodyMesh || !this.brickStudMesh) {
      return;
    }

    const bodyOffsetY = (CONFIG.VOXEL_SIZE - CONFIG.VOXEL_SIZE * 0.82) / 2;
    const studOffsetY = bodyOffsetY + (CONFIG.VOXEL_SIZE * 0.82) / 2 + (CONFIG.VOXEL_SIZE * 0.16) / 2 - 0.01;

    this.voxels.forEach((v, i) => {
      this.dummy.position.set(v.x, v.y + bodyOffsetY, v.z);
      this.dummy.rotation.set(v.rx, v.ry, v.rz);
      this.dummy.updateMatrix();
      this.brickBodyMesh?.setMatrixAt(i, this.dummy.matrix);
      this.brickBodyMesh?.setColorAt(i, v.color);

      this.dummy.position.set(v.x, v.y + studOffsetY, v.z);
      this.dummy.updateMatrix();
      this.brickStudMesh?.setMatrixAt(i, this.dummy.matrix);
      this.brickStudMesh?.setColorAt(i, v.color.clone().offsetHSL(0, 0, 0.06));
    });

    this.brickBodyMesh.instanceMatrix.needsUpdate = true;
    this.brickBodyMesh.instanceColor!.needsUpdate = true;
    this.brickStudMesh.instanceMatrix.needsUpdate = true;
    this.brickStudMesh.instanceColor!.needsUpdate = true;
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
      this.voxels.forEach((v) => {
        v.vy -= 0.025;
        v.x += v.vx;
        v.y += v.vy;
        v.z += v.vz;
        v.rx += v.rvx;
        v.ry += v.rvy;
        v.rz += v.rvz;

        if (v.y < CONFIG.FLOOR_Y + 0.5) {
          v.y = CONFIG.FLOOR_Y + 0.5;
          v.vy *= -0.5;
          v.vx *= 0.9;
          v.vz *= 0.9;
          v.rvx *= 0.8;
          v.rvy *= 0.8;
          v.rvz *= 0.8;
        }
      });
      return;
    }

    if (this.state !== AppState.REBUILDING) {
      return;
    }

    const elapsed = Date.now() - this.rebuildStartTime;
    let allDone = true;

    this.voxels.forEach((v, i) => {
      const target = this.rebuildTargets[i];
      if (!target || target.isRubble) {
        return;
      }

      if (elapsed < target.delay) {
        allDone = false;
        return;
      }

      const speed = 0.12;
      v.x += (target.x - v.x) * speed;
      v.y += (target.y - v.y) * speed;
      v.z += (target.z - v.z) * speed;
      v.rx += (0 - v.rx) * speed;
      v.ry += (0 - v.ry) * speed;
      v.rz += (0 - v.rz) * speed;

      if ((target.x - v.x) ** 2 + (target.y - v.y) ** 2 + (target.z - v.z) ** 2 > 0.01) {
        allDone = false;
      } else {
        v.x = target.x;
        v.y = target.y;
        v.z = target.z;
        v.rx = 0;
        v.ry = 0;
        v.rz = 0;
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
