-- events.channel_id를 nullable로 변경 (동아리 전체 일정 지원)
ALTER TABLE public.events ALTER COLUMN channel_id DROP NOT NULL;

-- club_id 추가
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS club_id uuid REFERENCES public.clubs(id) ON DELETE CASCADE;

-- channel_id XOR club_id — 반드시 하나만 설정
ALTER TABLE public.events
  ADD CONSTRAINT events_scope_exclusive CHECK (
    (channel_id IS NOT NULL AND club_id IS NULL)
    OR (channel_id IS NULL AND club_id IS NOT NULL)
  );

-- 동아리 일정 조회 인덱스
CREATE INDEX IF NOT EXISTS events_club_starts_at ON public.events(club_id, starts_at);

-- Helper: 현재 사용자가 해당 동아리 멤버인지 (is_club_member 가 없으면 생성)
CREATE OR REPLACE FUNCTION public.is_club_member(p_club_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT EXISTS (
    SELECT 1 FROM memberships WHERE club_id = p_club_id AND user_id = auth.uid()
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_club_member(uuid) TO authenticated;

-- 동아리 전체 일정 SELECT 정책 추가 (기존 채널 일정 정책과 OR로 합산)
CREATE POLICY "events_select_club" ON public.events
  FOR SELECT TO authenticated
  USING (
    club_id IS NOT NULL AND is_club_member(club_id)
  );

-- 동아리 전체 일정 INSERT 정책
CREATE POLICY "events_insert_club" ON public.events
  FOR INSERT TO authenticated
  WITH CHECK (
    club_id IS NOT NULL
    AND created_by = auth.uid()
    AND is_club_member(club_id)
  );
