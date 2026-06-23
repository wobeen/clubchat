-- =============================================================================
-- Migration: 20260622000001_base_tables.sql
-- Description: ClubChat 기반 테이블 전체 생성
--
-- 생성 순서 (의존성 순):
--   profiles → clubs → memberships → channels → channel_members
--   → invites → messages → attachments → channel_reads → push_tokens
--
-- 전제 조건:
--   - auth.users (Supabase 내장, 건드리지 않음)
-- =============================================================================

-- =============================================================================
-- 1. 테이블 생성
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1-1. profiles
-- ---------------------------------------------------------------------------
CREATE TABLE profiles (
    id           uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name text        NOT NULL,
    avatar_url   text,
    created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE profiles IS '사용자 프로필. auth.users 행 1:1 대응.';
COMMENT ON COLUMN profiles.id IS 'auth.users.id 와 동일한 UUID.';

-- ---------------------------------------------------------------------------
-- 1-2. clubs
-- ---------------------------------------------------------------------------
CREATE TABLE clubs (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    name       text        NOT NULL,
    owner_id   uuid        NOT NULL REFERENCES profiles(id),
    created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE clubs IS '동아리/소모임.';
COMMENT ON COLUMN clubs.owner_id IS '동아리 소유자. 프로필 삭제 시 동아리도 orphan 방지를 위해 owner_id 는 CASCADE 없이 제약.';

-- ---------------------------------------------------------------------------
-- 1-3. memberships
-- ---------------------------------------------------------------------------
CREATE TABLE memberships (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id    uuid        NOT NULL REFERENCES clubs(id)    ON DELETE CASCADE,
    user_id    uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    role       text        NOT NULL DEFAULT 'member'
                           CHECK (role IN ('owner', 'admin', 'member')),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (club_id, user_id)
);

COMMENT ON TABLE memberships IS '동아리 멤버십. role 은 owner/admin/member 세 값만 허용.';

-- ---------------------------------------------------------------------------
-- 1-4. channels
-- ---------------------------------------------------------------------------
CREATE TABLE channels (
    id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id            uuid        REFERENCES clubs(id) ON DELETE CASCADE,  -- nullable: DM
    name               text        NOT NULL,
    type               text        NOT NULL CHECK (type IN ('group', 'dm')),
    owner_id           uuid        NOT NULL REFERENCES profiles(id),
    join_password_hash text,                                                -- nullable
    created_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE channels IS '방. club_id NULL 이면 DM 채널.';
COMMENT ON COLUMN channels.join_password_hash IS 'argon2 또는 bcrypt 해시. 원문 저장 금지.';

-- ---------------------------------------------------------------------------
-- 1-5. channel_members
-- ---------------------------------------------------------------------------
CREATE TABLE channel_members (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id uuid        NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id    uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    joined_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (channel_id, user_id)
);

COMMENT ON TABLE channel_members IS '방 참여자 목록. RLS 의 핵심 게이트.';

-- ---------------------------------------------------------------------------
-- 1-6. invites
-- ---------------------------------------------------------------------------
CREATE TABLE invites (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id uuid        NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    token      text        NOT NULL UNIQUE,
    created_by uuid        NOT NULL REFERENCES profiles(id),
    expires_at timestamptz,           -- nullable
    max_uses   integer,               -- nullable
    use_count  integer      NOT NULL DEFAULT 0,
    created_at timestamptz  NOT NULL DEFAULT now()
);

COMMENT ON TABLE invites IS 'QR·링크 초대 토큰. token 은 전역 unique.';
COMMENT ON COLUMN invites.expires_at IS 'NULL 이면 만료 없음.';
COMMENT ON COLUMN invites.max_uses   IS 'NULL 이면 사용 횟수 무제한.';

-- ---------------------------------------------------------------------------
-- 1-7. messages
-- ---------------------------------------------------------------------------
CREATE TABLE messages (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id uuid        NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    sender_id  uuid        NOT NULL REFERENCES profiles(id),
    content    text        NOT NULL,
    type       text        NOT NULL DEFAULT 'text'
                           CHECK (type IN ('text', 'file', 'image', 'system')),
    created_at timestamptz NOT NULL DEFAULT now(),
    edited_at  timestamptz,           -- nullable
    deleted_at timestamptz            -- nullable: 소프트삭제
);

COMMENT ON TABLE messages IS '채팅 메시지. deleted_at NOT NULL 이면 소프트삭제된 메시지.';
COMMENT ON COLUMN messages.deleted_at IS 'NULL 이면 정상, NOT NULL 이면 소프트삭제.';

-- ---------------------------------------------------------------------------
-- 1-8. attachments
-- ---------------------------------------------------------------------------
CREATE TABLE attachments (
    id           uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id   uuid    NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    storage_path text    NOT NULL,
    mime_type    text    NOT NULL,
    size_bytes   bigint  NOT NULL,
    width        integer,              -- nullable: 이미지 전용
    height       integer               -- nullable: 이미지 전용
);

COMMENT ON TABLE attachments IS '메시지 첨부 파일/이미지. storage_path 는 Storage 버킷 내 경로.';

-- ---------------------------------------------------------------------------
-- 1-9. channel_reads
-- ---------------------------------------------------------------------------
CREATE TABLE channel_reads (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id   uuid        NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id      uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    last_read_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (channel_id, user_id)
);

COMMENT ON TABLE channel_reads IS '읽음 표시. 메시지당 행이 아닌 포인터 1개 방식.';

-- ---------------------------------------------------------------------------
-- 1-10. push_tokens
-- ---------------------------------------------------------------------------
CREATE TABLE push_tokens (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    expo_push_token text        NOT NULL,
    device_info     jsonb,
    updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE push_tokens IS 'Expo 푸시 토큰. 디바이스별 1행.';

-- =============================================================================
-- 2. 인덱스
-- =============================================================================

-- 메시지: 방별 시간순 조회 (핵심 쿼리 패턴)
CREATE INDEX ON messages      (channel_id, created_at);

-- 방 멤버: 사용자별 참여 방 조회
CREATE INDEX ON channel_members (user_id);

-- 동아리 멤버: 사용자별 동아리 조회
CREATE INDEX ON memberships   (user_id);

-- 초대 토큰: 토큰 조회 (UNIQUE 이지만 명시적 인덱스로 쿼리 가시성 확보)
CREATE INDEX ON invites       (token);

-- =============================================================================
-- 3. 트리거 함수 및 트리거
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 3-1. profiles 자동 생성 트리거
--      auth.users 에 신규 사용자가 INSERT 될 때 profiles 행을 자동으로 생성.
--      Google OAuth 로그인 시 raw_user_meta_data 에서 이름·아바타를 가져온다.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, display_name, avatar_url)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email, 'Unknown'),
        NEW.raw_user_meta_data->>'avatar_url'
    );
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS
    'auth.users INSERT 시 profiles 행을 자동 생성. SECURITY DEFINER 로 auth 스키마 접근.';

CREATE TRIGGER trg_on_new_user
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- 4. RLS 활성화
-- =============================================================================

ALTER TABLE profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE clubs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships     ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels        ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE invites         ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages        ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_reads   ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_tokens     ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 5. RLS 정책
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 5-1. profiles
-- ---------------------------------------------------------------------------

-- SELECT: 본인 프로필만 조회
CREATE POLICY "profiles_select_self"
    ON profiles
    FOR SELECT
    USING (auth.uid() = id);

-- INSERT: 본인 id 로만 삽입 (트리거 함수가 SECURITY DEFINER 로 처리하지만
--         직접 INSERT 시도에 대한 방어선 확보)
CREATE POLICY "profiles_insert_self"
    ON profiles
    FOR INSERT
    WITH CHECK (auth.uid() = id);

-- UPDATE: 본인 프로필만 수정
CREATE POLICY "profiles_update_self"
    ON profiles
    FOR UPDATE
    USING (auth.uid() = id);

-- DELETE: 정책 없음 — 프로필 직접 삭제 불가 (auth.users 삭제를 통해 CASCADE)

-- ---------------------------------------------------------------------------
-- 5-2. clubs
-- ---------------------------------------------------------------------------

-- SELECT: 해당 동아리의 멤버만 조회
CREATE POLICY "clubs_select_member"
    ON clubs
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM memberships
            WHERE memberships.club_id = clubs.id
              AND memberships.user_id = auth.uid()
        )
    );

-- INSERT: 로그인한 사용자 누구나 동아리 생성 가능
CREATE POLICY "clubs_insert_authenticated"
    ON clubs
    FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- UPDATE: 동아리 소유자만 수정
CREATE POLICY "clubs_update_owner"
    ON clubs
    FOR UPDATE
    USING (owner_id = auth.uid());

-- DELETE: 동아리 소유자만 삭제
CREATE POLICY "clubs_delete_owner"
    ON clubs
    FOR DELETE
    USING (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 5-3. memberships
-- ---------------------------------------------------------------------------

-- SELECT: 같은 동아리의 멤버이면 멤버 목록 조회 가능
CREATE POLICY "memberships_select_club_member"
    ON memberships
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM memberships m2
            WHERE m2.club_id = memberships.club_id
              AND m2.user_id = auth.uid()
        )
    );

-- INSERT: 해당 동아리의 owner 또는 admin만 멤버 추가 가능
CREATE POLICY "memberships_insert_admin"
    ON memberships
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM memberships m2
            WHERE m2.club_id = memberships.club_id
              AND m2.user_id = auth.uid()
              AND m2.role IN ('owner', 'admin')
        )
    );

-- UPDATE: 해당 동아리의 owner 또는 admin만 멤버 역할 수정 가능
CREATE POLICY "memberships_update_admin"
    ON memberships
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1
            FROM memberships m2
            WHERE m2.club_id = memberships.club_id
              AND m2.user_id = auth.uid()
              AND m2.role IN ('owner', 'admin')
        )
    );

-- DELETE: 해당 동아리의 owner 또는 admin만 멤버 제거 가능
CREATE POLICY "memberships_delete_admin"
    ON memberships
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1
            FROM memberships m2
            WHERE m2.club_id = memberships.club_id
              AND m2.user_id = auth.uid()
              AND m2.role IN ('owner', 'admin')
        )
    );

-- ---------------------------------------------------------------------------
-- 5-4. channels
-- ---------------------------------------------------------------------------

-- SELECT: 해당 방의 멤버만 채널 정보 조회
CREATE POLICY "channels_select_member"
    ON channels
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM channel_members
            WHERE channel_members.channel_id = channels.id
              AND channel_members.user_id    = auth.uid()
        )
    );

-- INSERT: DM(club_id IS NULL) 이거나 해당 동아리 멤버면 채널 생성 가능
CREATE POLICY "channels_insert_club_member"
    ON channels
    FOR INSERT
    WITH CHECK (
        club_id IS NULL
        OR EXISTS (
            SELECT 1
            FROM memberships
            WHERE memberships.club_id = channels.club_id
              AND memberships.user_id = auth.uid()
        )
    );

-- UPDATE: 방장만 채널 정보 수정
CREATE POLICY "channels_update_owner"
    ON channels
    FOR UPDATE
    USING (owner_id = auth.uid());

-- DELETE: 방장만 채널 삭제
CREATE POLICY "channels_delete_owner"
    ON channels
    FOR DELETE
    USING (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 5-5. channel_members
-- ---------------------------------------------------------------------------

-- SELECT: 같은 방의 멤버이면 참여자 목록 조회 가능
CREATE POLICY "channel_members_select_same_channel"
    ON channel_members
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM channel_members cm2
            WHERE cm2.channel_id = channel_members.channel_id
              AND cm2.user_id    = auth.uid()
        )
    );

-- INSERT: 본인만 입장 가능 (초대 토큰 검증은 애플리케이션 레이어에서 처리)
CREATE POLICY "channel_members_insert_self"
    ON channel_members
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- UPDATE: 정책 없음 — channel_members 행 직접 수정 불가

-- DELETE: 본인 퇴장만 가능
CREATE POLICY "channel_members_delete_self"
    ON channel_members
    FOR DELETE
    USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 5-6. invites
-- ---------------------------------------------------------------------------

-- SELECT: 해당 방의 멤버만 초대 토큰 조회
CREATE POLICY "invites_select_channel_member"
    ON invites
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM channel_members
            WHERE channel_members.channel_id = invites.channel_id
              AND channel_members.user_id    = auth.uid()
        )
    );

-- INSERT: 해당 방의 방장만 초대 토큰 생성
CREATE POLICY "invites_insert_channel_owner"
    ON invites
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM channels
            WHERE channels.id       = invites.channel_id
              AND channels.owner_id = auth.uid()
        )
    );

-- UPDATE: 해당 방의 방장만 초대 토큰 수정 (use_count 갱신 등)
CREATE POLICY "invites_update_channel_owner"
    ON invites
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1
            FROM channels
            WHERE channels.id       = invites.channel_id
              AND channels.owner_id = auth.uid()
        )
    );

-- DELETE: 해당 방의 방장만 초대 토큰 삭제
CREATE POLICY "invites_delete_channel_owner"
    ON invites
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1
            FROM channels
            WHERE channels.id       = invites.channel_id
              AND channels.owner_id = auth.uid()
        )
    );

-- ---------------------------------------------------------------------------
-- 5-7. messages
-- ---------------------------------------------------------------------------

-- SELECT: 해당 방의 멤버만 메시지 조회 (핵심 보안 경계)
CREATE POLICY "messages_select_channel_member"
    ON messages
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM channel_members
            WHERE channel_members.channel_id = messages.channel_id
              AND channel_members.user_id    = auth.uid()
        )
    );

-- INSERT: 방 멤버 본인만 메시지 전송. sender_id = auth.uid() 강제
CREATE POLICY "messages_insert_self"
    ON messages
    FOR INSERT
    WITH CHECK (
        sender_id = auth.uid()
        AND EXISTS (
            SELECT 1
            FROM channel_members
            WHERE channel_members.channel_id = messages.channel_id
              AND channel_members.user_id    = auth.uid()
        )
    );

-- UPDATE: 작성자 본인만 메시지 수정
CREATE POLICY "messages_update_sender"
    ON messages
    FOR UPDATE
    USING (sender_id = auth.uid());

-- DELETE: 작성자 본인만 메시지 삭제 (소프트삭제는 UPDATE로 처리)
CREATE POLICY "messages_delete_sender"
    ON messages
    FOR DELETE
    USING (sender_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 5-8. attachments
-- ---------------------------------------------------------------------------

-- SELECT: 해당 메시지가 속한 방의 멤버만 첨부 파일 조회
CREATE POLICY "attachments_select_channel_member"
    ON attachments
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM messages
            JOIN channel_members
              ON channel_members.channel_id = messages.channel_id
            WHERE messages.id            = attachments.message_id
              AND channel_members.user_id = auth.uid()
        )
    );

-- INSERT: 해당 메시지의 발신자 본인만 첨부 파일 추가
CREATE POLICY "attachments_insert_sender"
    ON attachments
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM messages
            WHERE messages.id        = attachments.message_id
              AND messages.sender_id = auth.uid()
        )
    );

-- UPDATE: 정책 없음 — 첨부 파일 메타데이터 직접 수정 불가
-- DELETE: 정책 없음 — 메시지 삭제(ON DELETE CASCADE) 를 통해 처리

-- ---------------------------------------------------------------------------
-- 5-9. channel_reads
-- ---------------------------------------------------------------------------

-- SELECT: 본인 읽음 포인터만 조회
CREATE POLICY "channel_reads_select_self"
    ON channel_reads
    FOR SELECT
    USING (user_id = auth.uid());

-- INSERT: 본인 읽음 포인터만 생성
CREATE POLICY "channel_reads_insert_self"
    ON channel_reads
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- UPDATE: 본인 읽음 포인터만 갱신
CREATE POLICY "channel_reads_update_self"
    ON channel_reads
    FOR UPDATE
    USING (user_id = auth.uid());

-- DELETE: 본인 읽음 포인터만 삭제
CREATE POLICY "channel_reads_delete_self"
    ON channel_reads
    FOR DELETE
    USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 5-10. push_tokens
-- ---------------------------------------------------------------------------

-- SELECT: 본인 토큰만 조회
CREATE POLICY "push_tokens_select_self"
    ON push_tokens
    FOR SELECT
    USING (user_id = auth.uid());

-- INSERT: 본인 토큰만 등록
CREATE POLICY "push_tokens_insert_self"
    ON push_tokens
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- UPDATE: 본인 토큰만 갱신
CREATE POLICY "push_tokens_update_self"
    ON push_tokens
    FOR UPDATE
    USING (user_id = auth.uid());

-- DELETE: 본인 토큰만 삭제
CREATE POLICY "push_tokens_delete_self"
    ON push_tokens
    FOR DELETE
    USING (user_id = auth.uid());
