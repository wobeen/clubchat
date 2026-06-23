-- =============================================================================
-- Migration: 20260623000002_fix_profiles_rls.sql
-- Description: profiles SELECT 정책을 "본인만" → "같은 채널 멤버끼리 조회 가능"으로 변경
--
-- 메신저 특성상 같은 방에 속한 멤버의 이름·아바타를 볼 수 있어야 한다.
-- =============================================================================

DROP POLICY IF EXISTS "profiles_select_self" ON profiles;

CREATE POLICY "profiles_select_channel_or_self"
    ON profiles
    FOR SELECT
    USING (
        auth.uid() = id
        OR EXISTS (
            SELECT 1
            FROM channel_members cm1
            JOIN channel_members cm2 ON cm2.channel_id = cm1.channel_id
            WHERE cm1.user_id = auth.uid()
              AND cm2.user_id = profiles.id
        )
    );
