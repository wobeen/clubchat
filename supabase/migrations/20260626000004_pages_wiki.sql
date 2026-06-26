-- pages: 동아리·방 홈페이지 위키 (동아리당·방당 1페이지)
CREATE TABLE IF NOT EXISTS pages (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type  text        NOT NULL CHECK (owner_type IN ('club', 'channel')),
  owner_id    uuid        NOT NULL,
  title       text,
  blocks      jsonb       NOT NULL DEFAULT '[]'::jsonb,
  created_by  uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_type, owner_id)
);

ALTER TABLE pages ENABLE ROW LEVEL SECURITY;

-- SELECT: 동아리 멤버 / 방 멤버
CREATE POLICY "pages_select" ON pages
  FOR SELECT TO authenticated
  USING (
    (owner_type = 'club' AND EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.club_id = pages.owner_id
        AND memberships.user_id = auth.uid()
    ))
    OR
    (owner_type = 'channel' AND EXISTS (
      SELECT 1 FROM channel_members
      WHERE channel_members.channel_id = pages.owner_id
        AND channel_members.user_id = auth.uid()
    ))
  );

-- INSERT: 멤버만, created_by = 본인
CREATE POLICY "pages_insert" ON pages
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      (owner_type = 'club' AND EXISTS (
        SELECT 1 FROM memberships
        WHERE memberships.club_id = pages.owner_id
          AND memberships.user_id = auth.uid()
      ))
      OR
      (owner_type = 'channel' AND EXISTS (
        SELECT 1 FROM channel_members
        WHERE channel_members.channel_id = pages.owner_id
          AND channel_members.user_id = auth.uid()
      ))
    )
  );

-- UPDATE: 동아리 → admin/owner | 방 → 방장
CREATE POLICY "pages_update" ON pages
  FOR UPDATE TO authenticated
  USING (
    (owner_type = 'club' AND EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.club_id = pages.owner_id
        AND memberships.user_id = auth.uid()
        AND memberships.role IN ('owner', 'admin')
    ))
    OR
    (owner_type = 'channel' AND EXISTS (
      SELECT 1 FROM channels
      WHERE channels.id = pages.owner_id
        AND channels.owner_id = auth.uid()
    ))
  )
  WITH CHECK (
    (owner_type = 'club' AND EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.club_id = pages.owner_id
        AND memberships.user_id = auth.uid()
        AND memberships.role IN ('owner', 'admin')
    ))
    OR
    (owner_type = 'channel' AND EXISTS (
      SELECT 1 FROM channels
      WHERE channels.id = pages.owner_id
        AND channels.owner_id = auth.uid()
    ))
  );

-- DELETE: UPDATE와 동일
CREATE POLICY "pages_delete" ON pages
  FOR DELETE TO authenticated
  USING (
    (owner_type = 'club' AND EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.club_id = pages.owner_id
        AND memberships.user_id = auth.uid()
        AND memberships.role IN ('owner', 'admin')
    ))
    OR
    (owner_type = 'channel' AND EXISTS (
      SELECT 1 FROM channels
      WHERE channels.id = pages.owner_id
        AND channels.owner_id = auth.uid()
    ))
  );

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION update_pages_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER pages_updated_at
  BEFORE UPDATE ON pages
  FOR EACH ROW EXECUTE FUNCTION update_pages_updated_at();
