PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS builds (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  prompt TEXT,
  mode TEXT NOT NULL,
  base_model TEXT,
  voxel_count INTEGER NOT NULL DEFAULT 0,
  voxel_data TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_builds_created_at ON builds(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_builds_mode ON builds(mode);
CREATE INDEX IF NOT EXISTS idx_builds_base_model ON builds(base_model);
