-- =============================================================================
-- Migration: 20260710000002_profiles_club_visibility.sql
-- Description: profiles SELECT RLS를 club(동아리) 단위 공유까지 확장
--
-- 배경:
--   기존 profiles_select_channel_or_self 정책(20260623000005_fix_grants.sql)은
--   "같은 채널(channel_members)을 공유하는가"만 확인한다. 동아리(club) 단위로
--   공유하는 개념이 없어서, 같은 동아리에 속하지만 서로 다른 스터디룸에만
--   속한 두 멤버는 서로의 프로필을 볼 수 없다.
--
--   동아리 전체 일정(events.club_id IS NOT NULL)의 event_responses 응답자
--   이름을 profiles(id, display_name, avatar_emoji) 임베드 조인으로 표시하려면
--   같은 동아리 멤버끼리도 프로필을 조회할 수 있어야 한다.
--
-- 조치:
--   1) shares_club_with 헬퍼 함수 추가 (shares_channel_with와 동일 스타일).
--   2) profiles_select_channel_or_self 정책을 재생성하여
--      shares_club_with 조건을 OR로 추가.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. shares_club_with 헬퍼 함수
--    두 사용자가 memberships 테이블에서 같은 club_id를 공유하는지 확인.
--    SECURITY DEFINER 이므로 정책 평가 중 memberships RLS를 우회해 실행된다.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.shares_club_with(
    p_user1_id uuid,
    p_user2_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.memberships m1
        JOIN public.memberships m2 ON m2.club_id = m1.club_id
        WHERE m1.user_id = p_user1_id
          AND m2.user_id = p_user2_id
    );
$$;

GRANT EXECUTE ON FUNCTION public.shares_club_with(uuid, uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. profiles SELECT 정책 재생성
--    기존 이름(profiles_select_channel_or_self)을 유지한다 — 다른 마이그레이션이나
--    클라이언트 코드가 정책 이름을 직접 참조하지는 않지만, 히스토리 추적을 위해
--    이름 변경 없이 로직만 확장한다.
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "profiles_select_channel_or_self" ON public.profiles;

CREATE POLICY "profiles_select_channel_or_self"
    ON public.profiles
    FOR SELECT
    USING (
        auth.uid() = id
        OR public.shares_channel_with(auth.uid(), id)
        OR public.shares_club_with(auth.uid(), id)
    );

COMMENT ON POLICY "profiles_select_channel_or_self" ON public.profiles IS
    '본인이거나(auth.uid()=id), 같은 채널을 공유하거나(shares_channel_with), '
    '같은 동아리를 공유하는(shares_club_with) 경우 프로필 조회 가능.';
