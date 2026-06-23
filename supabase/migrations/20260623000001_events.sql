-- =============================================================================
-- Migration: 20260623000001_events.sql
-- Description: 일정(events) 및 참석 응답(event_responses) 테이블 생성
--
-- 전제 조건 (이전 마이그레이션에서 생성):
--   - auth.users (Supabase 기본)
--   - profiles (id PK references auth.users)
--   - channels (id PK, owner_id references profiles)
--   - channel_members (channel_id, user_id, unique(channel_id, user_id))
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 테이블 생성
-- -----------------------------------------------------------------------------

CREATE TABLE events (
    id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    channel_id  uuid        NOT NULL REFERENCES channels(id)  ON DELETE CASCADE,
    title       text        NOT NULL,
    description text,
    starts_at   timestamptz NOT NULL,
    ends_at     timestamptz,
    location    text,
    created_by  uuid        NOT NULL REFERENCES profiles(id),
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE events IS '방(channel) 단위 일정. 방 멤버만 조회 가능, 작성자 또는 방장만 수정·삭제 가능.';
COMMENT ON COLUMN events.created_by IS 'INSERT 시 RLS WITH CHECK 로 auth.uid() 와 일치 여부를 강제한다.';
COMMENT ON COLUMN events.ends_at    IS 'NULL 허용 — 종료 시각이 미정인 일정.';

-- -----------------------------------------------------------------------------

CREATE TABLE event_responses (
    id           uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    event_id     uuid        NOT NULL REFERENCES events(id)   ON DELETE CASCADE,
    user_id      uuid        NOT NULL REFERENCES profiles(id),
    status       text        NOT NULL CHECK (status IN ('going', 'not_going', 'maybe')),
    responded_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (event_id, user_id)
);

COMMENT ON TABLE event_responses IS '일정에 대한 참석 응답. 본인 응답만 삽입·수정·삭제 가능.';
COMMENT ON COLUMN event_responses.status IS '''going'' | ''not_going'' | ''maybe'' 세 값만 허용.';

-- -----------------------------------------------------------------------------
-- 2. 인덱스
-- -----------------------------------------------------------------------------

-- 방별 시간순 일정 목록 조회 (핵심 쿼리 패턴)
CREATE INDEX ON events (channel_id, starts_at);

-- event_responses: 일정별 응답 집계
CREATE INDEX ON event_responses (event_id);

-- -----------------------------------------------------------------------------
-- 3. updated_at 자동 갱신 트리거
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_events_updated_at
    BEFORE UPDATE ON events
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- -----------------------------------------------------------------------------
-- 4. RLS 활성화
-- -----------------------------------------------------------------------------

ALTER TABLE events          ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_responses ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 5. RLS 정책 — events
-- -----------------------------------------------------------------------------

-- SELECT: 해당 방의 멤버만 일정을 볼 수 있다
CREATE POLICY "events_select_channel_member"
    ON events
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM channel_members
            WHERE channel_members.channel_id = events.channel_id
              AND channel_members.user_id    = auth.uid()
        )
    );

-- INSERT: 해당 방의 멤버만 일정을 생성할 수 있다
--         WITH CHECK 로 created_by = auth.uid() 를 강제한다
CREATE POLICY "events_insert_channel_member"
    ON events
    FOR INSERT
    WITH CHECK (
        created_by = auth.uid()
        AND EXISTS (
            SELECT 1
            FROM channel_members
            WHERE channel_members.channel_id = events.channel_id
              AND channel_members.user_id    = auth.uid()
        )
    );

-- UPDATE: 작성자 본인 또는 그 방의 방장만 수정할 수 있다
CREATE POLICY "events_update_author_or_owner"
    ON events
    FOR UPDATE
    USING (
        created_by = auth.uid()
        OR EXISTS (
            SELECT 1
            FROM channels
            WHERE channels.id       = events.channel_id
              AND channels.owner_id = auth.uid()
        )
    );

-- DELETE: 작성자 본인 또는 그 방의 방장만 삭제할 수 있다
CREATE POLICY "events_delete_author_or_owner"
    ON events
    FOR DELETE
    USING (
        created_by = auth.uid()
        OR EXISTS (
            SELECT 1
            FROM channels
            WHERE channels.id       = events.channel_id
              AND channels.owner_id = auth.uid()
        )
    );

-- -----------------------------------------------------------------------------
-- 6. RLS 정책 — event_responses
-- -----------------------------------------------------------------------------

-- SELECT: 그 일정이 속한 방의 멤버만 응답 목록을 볼 수 있다
CREATE POLICY "event_responses_select_channel_member"
    ON event_responses
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM channel_members cm
            JOIN events e ON e.id = event_responses.event_id
            WHERE cm.channel_id = e.channel_id
              AND cm.user_id    = auth.uid()
        )
    );

-- INSERT: 본인 응답만 삽입 가능 (user_id = auth.uid() 강제)
CREATE POLICY "event_responses_insert_self"
    ON event_responses
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- UPDATE: 본인 응답만 수정 가능
CREATE POLICY "event_responses_update_self"
    ON event_responses
    FOR UPDATE
    USING (user_id = auth.uid());

-- DELETE: 본인 응답만 삭제 가능
CREATE POLICY "event_responses_delete_self"
    ON event_responses
    FOR DELETE
    USING (user_id = auth.uid());
