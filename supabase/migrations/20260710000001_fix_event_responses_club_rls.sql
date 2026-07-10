-- =============================================================================
-- Migration: 20260710000001_fix_event_responses_club_rls.sql
-- Description: club 스코프 일정(events.club_id)의 event_responses RLS 누락 수정
--
-- 배경:
--   20260706000002_club_events.sql 에서 events.channel_id 를 nullable 로 바꾸고
--   club_id 컬럼(채널/동아리 스코프 XOR)을 추가하면서 events 테이블에는
--   events_select_club / events_insert_club 정책을 추가했지만,
--   event_responses 의 SELECT 정책(event_responses_select_channel_member)은
--   여전히 channel_members ↔ events.channel_id 조인만 사용한다.
--
--   club 스코프 일정은 events.channel_id 가 NULL 이므로 위 조건이 항상 거짓이
--   되어 club 일정에 달린 event_responses 행을 아무도(작성자 본인 포함) SELECT
--   할 수 없다. PostgREST 의 upsert(INSERT ... ON CONFLICT DO UPDATE)는 충돌
--   대상 기존 행을 확인하기 위해 SELECT 권한이 필요하므로, RLS 가 이를 막아
--   "new row violates row-level security policy for table event_responses"
--   (42501) 에러가 발생한다.
--
-- 조치:
--   기존 event_responses_select_channel_member 정책은 그대로 두고(채널 스코프
--   케이스 보존), club 스코프 일정을 위한 permissive SELECT 정책을 추가한다.
--   PERMISSIVE 정책은 OR 로 합산되므로 기존 채널 스코프 동작에는 영향 없다.
--
--   INSERT/UPDATE/DELETE 정책(event_responses_insert_self/update_self/delete_self)
--   은 이미 user_id = auth.uid() 만 체크하며 스코프와 무관하게 정상 동작하므로
--   변경하지 않는다.
-- =============================================================================

CREATE POLICY "event_responses_select_club_member"
    ON public.event_responses
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.events e
            WHERE e.id = event_responses.event_id
              AND e.club_id IS NOT NULL
              AND public.is_club_member(e.club_id)
        )
    );

COMMENT ON POLICY "event_responses_select_club_member" ON public.event_responses IS
    'club 스코프 일정(events.club_id IS NOT NULL)의 응답은 해당 동아리 멤버가 조회 가능. '
    '기존 event_responses_select_channel_member(채널 스코프)와 PERMISSIVE OR 로 합산됨.';
