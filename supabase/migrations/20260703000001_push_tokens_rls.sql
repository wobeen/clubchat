-- push_tokens: expo_push_token unique 제약 + RLS 정책 보완

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'push_tokens_expo_token_unique'
  ) THEN
    ALTER TABLE push_tokens ADD CONSTRAINT push_tokens_expo_token_unique UNIQUE (expo_push_token);
  END IF;
END $$;

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

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

GRANT SELECT, INSERT, UPDATE, DELETE ON push_tokens TO authenticated;
