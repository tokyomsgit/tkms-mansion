-- v2 マイグレーション（既存環境向け）
-- Supabase Dashboard > SQL Editor で実行

-- ① jobs テーブル（未作成の場合）
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

-- ② jobs 拡張カラム（生成オーケストレーション用）
ALTER TABLE "tkms-mansion-jobs" ADD COLUMN IF NOT EXISTS job_type TEXT DEFAULT 'generate';
ALTER TABLE "tkms-mansion-jobs" ADD COLUMN IF NOT EXISTS progress INT DEFAULT 0;
ALTER TABLE "tkms-mansion-jobs" ADD COLUMN IF NOT EXISTS message TEXT DEFAULT '';
ALTER TABLE "tkms-mansion-jobs" ADD COLUMN IF NOT EXISTS property_id UUID;
ALTER TABLE "tkms-mansion-jobs" ADD COLUMN IF NOT EXISTS input JSONB;

-- ③ properties に構造化 JSON
ALTER TABLE "tkms-mansion-properties" ADD COLUMN IF NOT EXISTS property_data JSONB;
ALTER TABLE "tkms-mansion-properties" ALTER COLUMN html_content DROP NOT NULL;
ALTER TABLE "tkms-mansion-properties" ALTER COLUMN html_content SET DEFAULT '';
