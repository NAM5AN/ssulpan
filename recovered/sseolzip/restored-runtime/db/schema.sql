PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS drafts (
  id TEXT NOT NULL,
  owner TEXT NOT NULL,
  data TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (id, owner)
);
CREATE TABLE IF NOT EXISTS versions (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  data TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_versions_draft_owner_created ON versions(draft_id, owner, created_at DESC);
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  published_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_posts_published ON posts(published_at DESC);
CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_images_owner_created ON images(owner, created_at DESC);
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  draft_id TEXT NOT NULL,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  input TEXT,
  result TEXT,
  error TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jobs_owner_created ON jobs(owner, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_owner_status ON jobs(owner, status);
CREATE TABLE IF NOT EXISTS settings (
  owner TEXT PRIMARY KEY,
  encrypted_key TEXT,
  model TEXT,
  writing_prompt TEXT NOT NULL DEFAULT '',
  prompt_revision INTEGER NOT NULL DEFAULT 0
);
