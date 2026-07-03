-- push_tokens: expo_push_token unique 제약 + RLS 정책 보완
-- (upsert onConflict: 'expo_push_token' 을 위해 unique 필요)

ALTER TABLE push_tokens
  ADD CONSTRAINT IF NOT EXISTS push_tokens_expo_token_unique UNIQUE (expo_push_token);

-- RLS 활성화 (이미 활성화되어 있으면 무시)
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

-- 자신의 토큰만 읽기/쓰기 가능
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'push_tokens' AND policyname = 'push_tokens_own_all'
  ) THEN
    CREATE POLICY "push_tokens_own_all" ON push_tokens
      FOR ALL
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- authenticated 역할에 GRANT (누락된 경우 대비)
GRANT SELECT, INSERT, UPDATE, DELETE ON push_tokens TO authenticated;
