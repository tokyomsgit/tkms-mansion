-- tkms-mansion Supabase 初期セットアップ
-- Supabase Dashboard > SQL Editor で実行してください

-- 物件テーブル
CREATE TABLE IF NOT EXISTS "tkms-mansion-properties" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL DEFAULT '物件資料',
  address     TEXT DEFAULT '',
  property_data JSONB,
  html_content TEXT DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS 有効化
ALTER TABLE "tkms-mansion-properties" ENABLE ROW LEVEL SECURITY;

-- anon キーからの読み書き（管理画面・LP表示用）
DROP POLICY IF EXISTS "tkms-mansion-properties-select" ON "tkms-mansion-properties";
DROP POLICY IF EXISTS "tkms-mansion-properties-insert" ON "tkms-mansion-properties";
DROP POLICY IF EXISTS "tkms-mansion-properties-update" ON "tkms-mansion-properties";
DROP POLICY IF EXISTS "tkms-mansion-properties-delete" ON "tkms-mansion-properties";

CREATE POLICY "tkms-mansion-properties-select"
  ON "tkms-mansion-properties" FOR SELECT TO anon USING (true);

CREATE POLICY "tkms-mansion-properties-insert"
  ON "tkms-mansion-properties" FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "tkms-mansion-properties-update"
  ON "tkms-mansion-properties" FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "tkms-mansion-properties-delete"
  ON "tkms-mansion-properties" FOR DELETE TO anon USING (true);

-- マイソク解析ジョブ（Background Function 結果の受け渡し + 生成オーケストレーション）
CREATE TABLE IF NOT EXISTS "tkms-mansion-jobs" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status      TEXT NOT NULL DEFAULT 'pending',
  job_type    TEXT NOT NULL DEFAULT 'generate',
  progress    INT NOT NULL DEFAULT 0,
  message     TEXT DEFAULT '',
  property_id UUID,
  input       JSONB,
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

INSERT INTO storage.buckets (id, name, public)
VALUES ('tkms-mansion-images', 'tkms-mansion-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- ストレージ: 公開読み取り
DROP POLICY IF EXISTS "tkms-mansion-images-select" ON storage.objects;
DROP POLICY IF EXISTS "tkms-mansion-images-insert" ON storage.objects;
DROP POLICY IF EXISTS "tkms-mansion-images-update" ON storage.objects;
DROP POLICY IF EXISTS "tkms-mansion-images-delete" ON storage.objects;

CREATE POLICY "tkms-mansion-images-select"
  ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'tkms-mansion-images');

-- ストレージ: アップロード
CREATE POLICY "tkms-mansion-images-insert"
  ON storage.objects FOR INSERT TO anon
  WITH CHECK (bucket_id = 'tkms-mansion-images');

-- ストレージ: 上書き更新
CREATE POLICY "tkms-mansion-images-update"
  ON storage.objects FOR UPDATE TO anon
  USING (bucket_id = 'tkms-mansion-images');

-- ストレージ: 削除
CREATE POLICY "tkms-mansion-images-delete"
  ON storage.objects FOR DELETE TO anon
  USING (bucket_id = 'tkms-mansion-images');
