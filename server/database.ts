import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

type BuildMode = 'create' | 'morph' | 'image' | 'import';

interface VoxelData {
  x: number;
  y: number;
  z: number;
  color: number;
}

export interface PersistedBuild {
  id: string;
  name: string;
  prompt: string;
  mode: BuildMode;
  baseModel: string | null;
  voxelCount: number;
  data: VoxelData[];
  createdAt: number;
  updatedAt: number;
}

export interface CreateBuildInput {
  name: string;
  prompt?: string;
  mode: BuildMode;
  baseModel?: string | null;
  data: VoxelData[];
}

const currentFile = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(currentFile), '..');
const dataDir = path.join(rootDir, '.data');
const dbPath = path.join(dataDir, 'ocean.db');
const schemaPath = path.join(rootDir, 'db', 'schema.sql');

let database: DatabaseSync | null = null;

function getDatabase() {
  if (database) {
    return database;
  }

  fs.mkdirSync(dataDir, { recursive: true });

  database = new DatabaseSync(dbPath);
  database.exec(fs.readFileSync(schemaPath, 'utf8'));

  return database;
}

function mapRow(row: Record<string, unknown>): PersistedBuild {
  return {
    id: String(row.id),
    name: String(row.name),
    prompt: String(row.prompt ?? ''),
    mode: String(row.mode) as BuildMode,
    baseModel: row.base_model ? String(row.base_model) : null,
    voxelCount: Number(row.voxel_count) || 0,
    data: JSON.parse(String(row.voxel_data || '[]')) as VoxelData[],
    createdAt: Number(row.created_at) || Date.now(),
    updatedAt: Number(row.updated_at) || Date.now(),
  };
}

export function listBuilds(limit = 50): PersistedBuild[] {
  const db = getDatabase();
  const statement = db.prepare(`
    SELECT id, name, prompt, mode, base_model, voxel_count, voxel_data, created_at, updated_at
    FROM builds
    ORDER BY created_at DESC
    LIMIT ?
  `);

  return statement.all(limit).map((row) => mapRow(row as Record<string, unknown>));
}

export function createBuild(input: CreateBuildInput): PersistedBuild {
  const db = getDatabase();
  const now = Date.now();
  const build: PersistedBuild = {
    id: randomUUID(),
    name: input.name.trim(),
    prompt: input.prompt?.trim() || '',
    mode: input.mode,
    baseModel: input.baseModel?.trim() || null,
    voxelCount: input.data.length,
    data: input.data,
    createdAt: now,
    updatedAt: now,
  };

  const statement = db.prepare(`
    INSERT INTO builds (id, name, prompt, mode, base_model, voxel_count, voxel_data, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  statement.run(
    build.id,
    build.name,
    build.prompt,
    build.mode,
    build.baseModel,
    build.voxelCount,
    JSON.stringify(build.data),
    build.createdAt,
    build.updatedAt
  );

  return build;
}

export function deleteBuild(id: string) {
  const db = getDatabase();
  const statement = db.prepare('DELETE FROM builds WHERE id = ?');
  const result = statement.run(id);
  return Number(result.changes) > 0;
}

export function databaseFilePath() {
  getDatabase();
  return dbPath;
}
