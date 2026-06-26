-- pages: 동아리·방 위키 페이지 (다중 페이지 스키마, 6단계는 홈페이지 1장만 사용)
CREATE TABLE IF NOT EXISTS pages (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id     uuid        NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  room_id     uuid        REFERENCES channels(id) ON DELETE CASCADE,  -- null = 동아리 레벨
  title       text,
  content     text        NOT NULL DEFAULT '',                         -- 마크다운 원문
  is_home     boolean     NOT NULL DEFAULT false,
  created_by  uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  updated_by  uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 동아리 홈페이지: 동아리당 1개
CREATE UNIQUE INDEX pages_home_club_unique
  ON pages (club_id)
  WHERE room_id IS NULL AND is_home = true;

-- 방 홈페이지: 방당 1개
CREATE UNIQUE INDEX pages_home_room_unique
  ON pages (club_id, room_id)
  WHERE room_id IS NOT NULL AND is_home = true;

-- 조회 성능 인덱스
CREATE INDEX pages_club_idx ON pages (club_id);
CREATE INDEX pages_room_idx ON pages (room_id) WHERE room_id IS NOT NULL;

ALTER TABLE pages ENABLE ROW LEVEL SECURITY;

-- SELECT: 동아리 멤버(동아리 레벨) / 방 멤버(방 레벨)
CREATE POLICY "pages_select" ON pages
  FOR SELECT TO authenticated
  USING (
    (room_id IS NULL AND EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.club_id = pages.club_id
        AND memberships.user_id = auth.uid()
    ))
    OR
    (room_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM channel_members
      WHERE channel_members.channel_id = pages.room_id
        AND channel_members.user_id = auth.uid()
    ))
  );

-- INSERT: owner·admin만 (동아리 레벨) / 방장만 (방 레벨)
CREATE POLICY "pages_insert" ON pages
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      (room_id IS NULL AND EXISTS (
        SELECT 1 FROM memberships
        WHERE memberships.club_id = pages.club_id
          AND memberships.user_id = auth.uid()
          AND memberships.role IN ('owner', 'admin')
      ))
      OR
      (room_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM channels
        WHERE channels.id = pages.room_id
          AND channels.owner_id = auth.uid()
      ))
    )
  );

-- UPDATE: owner·admin만 (동아리 레벨) / 방장만 (방 레벨)
CREATE POLICY "pages_update" ON pages
  FOR UPDATE TO authenticated
  USING (
    (room_id IS NULL AND EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.club_id = pages.club_id
        AND memberships.user_id = auth.uid()
        AND memberships.role IN ('owner', 'admin')
    ))
    OR
    (room_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM channels
      WHERE channels.id = pages.room_id
        AND channels.owner_id = auth.uid()
    ))
  )
  WITH CHECK (
    (room_id IS NULL AND EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.club_id = pages.club_id
        AND memberships.user_id = auth.uid()
        AND memberships.role IN ('owner', 'admin')
    ))
    OR
    (room_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM channels
      WHERE channels.id = pages.room_id
        AND channels.owner_id = auth.uid()
    ))
  );

-- DELETE: UPDATE와 동일 조건
CREATE POLICY "pages_delete" ON pages
  FOR DELETE TO authenticated
  USING (
    (room_id IS NULL AND EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.club_id = pages.club_id
        AND memberships.user_id = auth.uid()
        AND memberships.role IN ('owner', 'admin')
    ))
    OR
    (room_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM channels
      WHERE channels.id = pages.room_id
        AND channels.owner_id = auth.uid()
    ))
  );

-- updated_at 자동 갱신 트리거
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
