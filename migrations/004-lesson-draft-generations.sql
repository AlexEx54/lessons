CREATE TABLE lesson_draft_generations (
  draft_id TEXT PRIMARY KEY REFERENCES lesson_drafts(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('ai', 'synthetic')),
  model TEXT,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  reasoning_text TEXT NOT NULL DEFAULT '',
  output_text TEXT NOT NULL DEFAULT '',
  cost_usd REAL,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  reasoning_tokens INTEGER,
  provider_generation_id TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  error_message TEXT
) STRICT;

CREATE INDEX lesson_draft_generations_status_idx
  ON lesson_draft_generations(status, started_at);

INSERT INTO lesson_draft_generations (
  draft_id, mode, model, status, reasoning_text, output_text, cost_usd,
  prompt_tokens, completion_tokens, reasoning_tokens, started_at, completed_at, error_message
)
SELECT
  id,
  'synthetic',
  NULL,
  CASE WHEN status = 'generating' THEN 'running' WHEN status = 'failed' THEN 'failed' ELSE 'completed' END,
  'Синтетический урок создан локальным шаблоном до подключения нейрогенерации.',
  COALESCE(content_json, ''),
  0,
  0,
  0,
  0,
  created_at,
  CASE WHEN status = 'generating' THEN NULL ELSE updated_at END,
  error_message
FROM lesson_drafts;
