-- マイソク解析ジョブ用テーブル（未作成の場合のみ実行）
-- Supabase Dashboard > SQL Editor に貼り付けて Run

CREATE TABLE IF NOT EXISTS "tkms-mansion-jobs" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status      TEXT NOT NULL DEFAULT 'pending',
  result      JSONB,
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE "tkms-mansion-jobs" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tkms-mansion-jobs-select" ON "tkms-mansion-jobs";
DROP POLICY IF EXISTS "tkms-mansion-jobs-insert" ON "tkms-mansion-jobs";
DROP POLICY IF EXISTS "tkms-mansion-jobs-update" ON "tkms-mansion-jobs";

CREATE POLICY "tkms-mansion-jobs-select"
  ON "tkms-mansion-jobs" FOR SELECT TO anon USING (true);

CREATE POLICY "tkms-mansion-jobs-insert"
  ON "tkms-mansion-jobs" FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "tkms-mansion-jobs-update"
  ON "tkms-mansion-jobs" FOR UPDATE TO anon USING (true) WITH CHECK (true);
