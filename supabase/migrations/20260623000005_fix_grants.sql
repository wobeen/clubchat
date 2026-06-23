-- =============================================================================
-- Migration: 20260623000005_fix_grants.sql
-- Description: authenticated 롤 GRANT 누락 수정 + profiles 정책 정리
--
-- 원인: 마이그레이션으로 생성한 테이블에 authenticated 롤의 GRANT가 없어서
--       RLS 평가 전 단계에서 42501 permission denied가 발생.
--       GRANT는 "테이블 접근 자격", RLS는 "조회 가능한 행 범위"로 역할이 다르다.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 모든 테이블에 authenticated 롤 GRANT
-- -----------------------------------------------------------------------------

GRANT USAGE ON SCHEMA public TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clubs           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.memberships     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channels        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invites         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attachments     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_reads   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_tokens     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.events          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_responses TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. shares_channel_with 헬퍼 함수
--    profiles 정책의 channel_members 직접 JOIN을 함수로 교체한다.
--    SECURITY DEFINER 이므로 subquery 안에서 GRANT·RLS 평가 없이 실행된다.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.shares_channel_with(
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
        FROM public.channel_members cm1
        JOIN public.channel_members cm2 ON cm2.channel_id = cm1.channel_id
        WHERE cm1.user_id = p_user1_id
          AND cm2.user_id = p_user2_id
    );
$$;

-- -----------------------------------------------------------------------------
-- 3. profiles SELECT 정책 재생성
--    기존 정책도 auth.uid() = id 조건이 있었으나, channel_members 직접 JOIN이
--    GRANT 문제와 맞물려 실패할 수 있어 함수로 교체한다.
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "profiles_select_channel_or_self" ON public.profiles;

CREATE POLICY "profiles_select_channel_or_self"
    ON public.profiles
    FOR SELECT
    USING (
        auth.uid() = id
        OR public.shares_channel_with(auth.uid(), id)
    );
