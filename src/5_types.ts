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

export type BrickType = '1x1' | '1x2' | '1x3' | '1x4' | '2x2' | '2x3' | '2x4' | '2x6' | '2x8';

export interface BrickCell {
  x: number;
  y: number;
  z: number;
}

export interface BrickData {
  id: string;
  type: BrickType;
  x: number;
  y: number;
  z: number;
  width: number;
  depth: number;
  height: 1;
  color: number;
  cells: BrickCell[];
}

export interface SimulationBrick {
  id: number;
  type: BrickType;
  x: number;
  y: number;
  z: number;
  width: number;
  depth: number;
  cells: BrickCell[];
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
  width?: number;
  depth?: number;
  cells?: BrickCell[];
  delay: number;
  isRubble?: boolean;
}

export interface SavedModel {
  id?: string;
  name: string;
  data: VoxelData[];
  bricks?: BrickData[];
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
  bricks?: BrickData[];
  createdAt: number;
  updatedAt: number;
}
