export interface LegoPart {
  id: string;
  name: string;
  code: string;
  color: string;
  count: number;
  icon?: string;
}

export interface BuildHistory {
  id: string;
  prompt: string;
  imageUrl?: string;
  timestamp: number;
}

export enum AppState {
  STABLE = 'STABLE',
  DISMANTLING = 'DISMANTLING',
  REBUILDING = 'REBUILDING',
}

export interface VoxelData {
  x: number;
  y: number;
  z: number;
  color: number;
}

export interface SimulationVoxel {
  id: number;
  x: number;
  y: number;
  z: number;
  color: import('three').Color;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  rz: number;
  rvx: number;
  rvy: number;
  rvz: number;
}

export interface RebuildTarget {
  x: number;
  y: number;
  z: number;
  delay: number;
  isRubble?: boolean;
}

export interface SavedModel {
  id?: string;
  name: string;
  data: VoxelData[];
  baseModel?: string;
  prompt?: string;
  mode?: 'create' | 'morph' | 'image' | 'import';
  createdAt?: number;
}

export interface PersistedBuildRecord {
  id: string;
  name: string;
  prompt: string;
  mode: 'create' | 'morph' | 'image' | 'import';
  baseModel: string | null;
  voxelCount: number;
  data: VoxelData[];
  createdAt: number;
  updatedAt: number;
}
