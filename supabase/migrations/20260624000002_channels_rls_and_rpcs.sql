-- =============================================================================
-- Migration: 20260624000002_channels_rls_and_rpcs.sql
-- Description: pgcrypto, channels.is_password_protected, RLS 정책 교체,
--              방 생성/초대/입장 RPC 4개
-- =============================================================================

-- =============================================================================
-- 1. pgcrypto (bcrypt 해싱용)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================================
-- 1-b. 헬퍼 함수 재선언 (이 마이그레이션 단독 실행 시에도 안전하게)
--      실제 정의는 20260623000004_fix_rls_recursion.sql 에 있음.
--      CREATE OR REPLACE 이므로 중복 실행해도 안전.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_club_member(p_club_id uuid, p_user_id uuid)
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

CREATE OR REPLACE FUNCTION public.is_channel_member(p_channel_id uuid, p_user_id uuid)
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

-- =============================================================================
-- 2. channels.is_password_protected (generated column)
-- =============================================================================

ALTER TABLE channels
    ADD COLUMN IF NOT EXISTS is_password_protected boolean
    GENERATED ALWAYS AS (join_password_hash IS NOT NULL) STORED;

-- =============================================================================
-- 3. channels RLS 정책 교체
--    SELECT: club 멤버이면 해당 club의 방 목록 조회 가능
--    INSERT/UPDATE/DELETE: RPC(SECURITY DEFINER) 전용 — 직접 접근 차단
-- =============================================================================

-- SELECT: 기존 channel_members 기반 → club_id 기반으로 교체
DROP POLICY IF EXISTS "channels_select_member"          ON channels;
DROP POLICY IF EXISTS "channels_insert_club_member"     ON channels;
DROP POLICY IF EXISTS "channels_update_owner"           ON channels;
DROP POLICY IF EXISTS "channels_delete_owner"           ON channels;
DROP POLICY IF EXISTS "channels_select_club_member"     ON channels;
DROP POLICY IF EXISTS "channels_insert_rpc_only"        ON channels;
DROP POLICY IF EXISTS "channels_update_rpc_only"        ON channels;
DROP POLICY IF EXISTS "channels_delete_rpc_only"        ON channels;

CREATE POLICY "channels_select_club_member"
    ON channels
    FOR SELECT
    USING (public.is_club_member(club_id, auth.uid()));

CREATE POLICY "channels_insert_rpc_only"
    ON channels
    FOR INSERT
    WITH CHECK (false);

CREATE POLICY "channels_update_rpc_only"
    ON channels
    FOR UPDATE
    USING (false);

CREATE POLICY "channels_delete_rpc_only"
    ON channels
    FOR DELETE
    USING (false);

-- =============================================================================
-- 4. channel_members RLS 정책 교체
--    SELECT: 본인 멤버십만
--    INSERT/DELETE: RPC(SECURITY DEFINER) 전용
-- =============================================================================

DROP POLICY IF EXISTS "channel_members_select_same_channel" ON channel_members;
DROP POLICY IF EXISTS "channel_members_insert_self"         ON channel_members;
DROP POLICY IF EXISTS "channel_members_delete_self"         ON channel_members;
DROP POLICY IF EXISTS "channel_members_select_self"         ON channel_members;
DROP POLICY IF EXISTS "channel_members_insert_rpc_only"     ON channel_members;
DROP POLICY IF EXISTS "channel_members_delete_rpc_only"     ON channel_members;

CREATE POLICY "channel_members_select_self"
    ON channel_members
    FOR SELECT
    USING (user_id = auth.uid());

-- INSERT/DELETE: RPC만 허용
CREATE POLICY "channel_members_insert_rpc_only"
    ON channel_members
    FOR INSERT
    WITH CHECK (false);

CREATE POLICY "channel_members_delete_rpc_only"
    ON channel_members
    FOR DELETE
    USING (false);

-- =============================================================================
-- 5. invites RLS 정책 — 이미 존재하므로 건드리지 않음
--    (invites_select_channel_member, invites_insert_channel_owner,
--     invites_update_channel_owner, invites_delete_channel_owner)
-- =============================================================================

-- =============================================================================
-- 6. RPC: create_channel
--    동아리 owner만 방 생성. 방 생성자를 channel_members에 자동 추가.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_channel(
    p_club_id  uuid,
    p_name     text,
    p_password text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid        uuid;
    v_channel_id uuid;
    v_channel_name text;
BEGIN
    v_uid := auth.uid();

    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('error', 'not_authenticated');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM memberships
        WHERE club_id = p_club_id
          AND user_id = v_uid
          AND role    = 'owner'
    ) THEN
        RETURN jsonb_build_object('error', 'not_authorized');
    END IF;

    IF trim(p_name) = '' THEN
        RETURN jsonb_build_object('error', 'invalid_name');
    END IF;

    INSERT INTO channels (club_id, name, type, owner_id, join_password_hash)
    VALUES (
        p_club_id,
        trim(p_name),
        'group',
        v_uid,
        CASE WHEN p_password IS NOT NULL
             THEN crypt(p_password, gen_salt('bf'))
             ELSE NULL
        END
    )
    RETURNING id, name INTO v_channel_id, v_channel_name;

    INSERT INTO channel_members (channel_id, user_id)
    VALUES (v_channel_id, v_uid);

    RETURN jsonb_build_object(
        'success',      true,
        'channel_id',   v_channel_id,
        'channel_name', v_channel_name
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_channel(uuid, text, text) TO authenticated;

-- =============================================================================
-- 7. RPC: create_invite
--    방 멤버라면 초대 토큰 발급.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_invite(p_channel_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid      uuid;
    v_token    text;
    v_invite_id uuid;
BEGIN
    v_uid := auth.uid();

    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('error', 'not_authenticated');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM channel_members
        WHERE channel_id = p_channel_id
          AND user_id    = v_uid
    ) THEN
        RETURN jsonb_build_object('error', 'not_member');
    END IF;

    v_token := replace(gen_random_uuid()::text, '-', '');

    INSERT INTO invites (channel_id, token, created_by)
    VALUES (p_channel_id, v_token, v_uid)
    RETURNING id INTO v_invite_id;

    RETURN jsonb_build_object(
        'success',   true,
        'token',     v_token,
        'invite_id', v_invite_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_invite(uuid) TO authenticated;

-- =============================================================================
-- 8. RPC: join_channel_by_invite
--    초대 토큰 검증 후 channel_members 등록.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.join_channel_by_invite(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid          uuid;
    v_invite       invites%ROWTYPE;
    v_channel_name text;
BEGIN
    v_uid := auth.uid();

    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('error', 'not_authenticated');
    END IF;

    SELECT * INTO v_invite
    FROM invites
    WHERE token = trim(p_token);

    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'invalid_token');
    END IF;

    IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at < now() THEN
        RETURN jsonb_build_object('error', 'token_expired');
    END IF;

    IF v_invite.max_uses IS NOT NULL AND v_invite.use_count >= v_invite.max_uses THEN
        RETURN jsonb_build_object('error', 'token_exhausted');
    END IF;

    IF EXISTS (
        SELECT 1 FROM channel_members
        WHERE channel_id = v_invite.channel_id
          AND user_id    = v_uid
    ) THEN
        RETURN jsonb_build_object('error', 'already_member');
    END IF;

    INSERT INTO channel_members (channel_id, user_id)
    VALUES (v_invite.channel_id, v_uid);

    UPDATE invites
    SET use_count = use_count + 1
    WHERE id = v_invite.id;

    SELECT name INTO v_channel_name
    FROM channels
    WHERE id = v_invite.channel_id;

    RETURN jsonb_build_object(
        'success',      true,
        'channel_id',   v_invite.channel_id,
        'channel_name', v_channel_name
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_channel_by_invite(text) TO authenticated;

-- =============================================================================
-- 9. RPC: join_channel_by_password
--    bcrypt 비교 후 channel_members 등록.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.join_channel_by_password(
    p_channel_id uuid,
    p_password   text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid          uuid;
    v_channel      channels%ROWTYPE;
BEGIN
    v_uid := auth.uid();

    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('error', 'not_authenticated');
    END IF;

    SELECT * INTO v_channel
    FROM channels
    WHERE id = p_channel_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'channel_not_found');
    END IF;

    IF v_channel.join_password_hash IS NULL THEN
        RETURN jsonb_build_object('error', 'no_password_set');
    END IF;

    IF crypt(p_password, v_channel.join_password_hash) <> v_channel.join_password_hash THEN
        RETURN jsonb_build_object('error', 'wrong_password');
    END IF;

    IF EXISTS (
        SELECT 1 FROM channel_members
        WHERE channel_id = p_channel_id
          AND user_id    = v_uid
    ) THEN
        RETURN jsonb_build_object('error', 'already_member');
    END IF;

    INSERT INTO channel_members (channel_id, user_id)
    VALUES (p_channel_id, v_uid);

    RETURN jsonb_build_object(
        'success',      true,
        'channel_id',   p_channel_id,
        'channel_name', v_channel.name
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_channel_by_password(uuid, text) TO authenticated;
