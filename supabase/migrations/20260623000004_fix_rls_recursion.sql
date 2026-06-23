-- =============================================================================
-- Migration: 20260623000004_fix_rls_recursion.sql
-- Description: RLS 무한 재귀 수정
--
-- 원인: channel_members·memberships 정책이 자기 테이블을 직접 참조해
--       PostgreSQL이 정책 평가 → 동일 테이블 조회 → 정책 평가 ... 무한 루프.
--
-- 해결: SECURITY DEFINER 함수가 postgres 권한(BYPASSRLS)으로 테이블을 직접
--       조회하므로 RLS 평가 루프를 끊는다. 자기참조 정책만 이 함수로 교체.
--       나머지 정책(channels, messages 등)은 channel_members 정책이 고쳐지면
--       연쇄 재귀가 자동으로 해소된다.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. SECURITY DEFINER 헬퍼 함수
-- -----------------------------------------------------------------------------

-- 방 멤버 여부 확인 (channel_members RLS 우회)
CREATE OR REPLACE FUNCTION public.is_channel_member(
    p_channel_id uuid,
    p_user_id    uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.channel_members
        WHERE channel_id = p_channel_id
          AND user_id    = p_user_id
    );
$$;

-- 동아리 멤버 여부 확인 (memberships RLS 우회)
CREATE OR REPLACE FUNCTION public.is_club_member(
    p_club_id uuid,
    p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.memberships
        WHERE club_id = p_club_id
          AND user_id = p_user_id
    );
$$;

-- 동아리 owner/admin 여부 확인 (memberships RLS 우회)
CREATE OR REPLACE FUNCTION public.is_club_admin(
    p_club_id uuid,
    p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.memberships
        WHERE club_id = p_club_id
          AND user_id = p_user_id
          AND role IN ('owner', 'admin')
    );
$$;

-- -----------------------------------------------------------------------------
-- 2. channel_members — 자기참조 SELECT 정책 교체
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "channel_members_select_same_channel" ON public.channel_members;

CREATE POLICY "channel_members_select_same_channel"
    ON public.channel_members
    FOR SELECT
    USING (public.is_channel_member(channel_id, auth.uid()));

-- -----------------------------------------------------------------------------
-- 3. memberships — 자기참조 정책 4개 교체
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "memberships_select_club_member" ON public.memberships;
DROP POLICY IF EXISTS "memberships_insert_admin"       ON public.memberships;
DROP POLICY IF EXISTS "memberships_update_admin"       ON public.memberships;
DROP POLICY IF EXISTS "memberships_delete_admin"       ON public.memberships;

CREATE POLICY "memberships_select_club_member"
    ON public.memberships
    FOR SELECT
    USING (public.is_club_member(club_id, auth.uid()));

CREATE POLICY "memberships_insert_admin"
    ON public.memberships
    FOR INSERT
    WITH CHECK (public.is_club_admin(club_id, auth.uid()));

CREATE POLICY "memberships_update_admin"
    ON public.memberships
    FOR UPDATE
    USING (public.is_club_admin(club_id, auth.uid()));

CREATE POLICY "memberships_delete_admin"
    ON public.memberships
    FOR DELETE
    USING (public.is_club_admin(club_id, auth.uid()));

-- -----------------------------------------------------------------------------
-- 4. clubs — memberships를 직접 참조하던 SELECT 정책도 함수로 교체
--    (memberships SELECT RLS 가 정착되기 전까지 잠재적 연쇄 차단)
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "clubs_select_member" ON public.clubs;

CREATE POLICY "clubs_select_member"
    ON public.clubs
    FOR SELECT
    USING (public.is_club_member(id, auth.uid()));
