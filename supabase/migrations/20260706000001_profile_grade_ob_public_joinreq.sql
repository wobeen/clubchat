-- profiles: grade, birth_year, gender
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS grade text,
  ADD COLUMN IF NOT EXISTS birth_year int,
  ADD COLUMN IF NOT EXISTS gender text CHECK (gender IN ('female', 'male', 'private'));

-- memberships: member_type (active / ob), graduation_year
ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS member_type text NOT NULL DEFAULT 'active'
    CHECK (member_type IN ('active', 'ob')),
  ADD COLUMN IF NOT EXISTS graduation_year int;

-- clubs: is_public, description
ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS description text;

-- ── join_requests ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.join_requests (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id     uuid        NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message     text,
  status      text        NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by uuid        REFERENCES public.profiles(id),
  reviewed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 한 사용자는 동아리당 한 개의 pending 신청만 허용
CREATE UNIQUE INDEX IF NOT EXISTS join_requests_one_pending
  ON public.join_requests(club_id, user_id)
  WHERE status = 'pending';

ALTER TABLE public.join_requests ENABLE ROW LEVEL SECURITY;

-- Helper: 현재 사용자가 해당 동아리의 owner 또는 admin인지
CREATE OR REPLACE FUNCTION public.is_club_admin(p_club_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT EXISTS (
    SELECT 1 FROM memberships
    WHERE club_id = p_club_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_club_admin(uuid) TO authenticated;

-- SELECT: 본인 신청 OR 동아리 admin
CREATE POLICY "join_requests_select" ON public.join_requests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_club_admin(club_id));

-- INSERT: 공개 동아리에 아직 가입 안 한 사용자만
CREATE POLICY "join_requests_insert" ON public.join_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (SELECT is_public FROM clubs WHERE id = club_id)
    AND NOT EXISTS (
      SELECT 1 FROM memberships
      WHERE club_id = join_requests.club_id AND user_id = auth.uid()
    )
  );

-- UPDATE: 동아리 admin이 status 변경 (승인/거절)
CREATE POLICY "join_requests_update_admin" ON public.join_requests
  FOR UPDATE TO authenticated
  USING (is_club_admin(club_id))
  WITH CHECK (is_club_admin(club_id));

-- DELETE: 본인이 pending 상태 취소
CREATE POLICY "join_requests_delete_own" ON public.join_requests
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND status = 'pending');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.join_requests TO authenticated;
