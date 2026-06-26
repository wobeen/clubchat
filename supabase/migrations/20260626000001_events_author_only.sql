-- =============================================================================
-- Migration: 20260626000001_events_author_only.sql
-- Description: events 수정·삭제 권한을 작성자 본인만으로 변경
--
-- 변경 전: 작성자(created_by) 또는 채널 방장(channels.owner_id)
-- 변경 후: 작성자(created_by) 본인만
-- =============================================================================

DROP POLICY IF EXISTS "events_update_author_or_owner" ON events;
DROP POLICY IF EXISTS "events_delete_author_or_owner" ON events;

CREATE POLICY "events_update_author_only"
    ON events
    FOR UPDATE
    USING (created_by = auth.uid());

CREATE POLICY "events_delete_author_only"
    ON events
    FOR DELETE
    USING (created_by = auth.uid());
