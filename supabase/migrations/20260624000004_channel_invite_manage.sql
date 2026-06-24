-- Migration: 20260624000004_channel_invite_manage.sql
-- RPC: get_channel_invite, regenerate_channel_invite
-- 채널 owner 전용 초대 토큰 조회(없으면 자동 생성) / 재발급

-- =============================================================================
-- 1. get_channel_invite
--    유효한 토큰이 있으면 반환, 없으면 생성
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_channel_invite(p_channel_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid       uuid;
    v_owner_id  uuid;
    v_token     text;
    v_invite_id uuid;
BEGIN
    v_uid := auth.uid();

    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('error', 'not_authenticated');
    END IF;

    SELECT owner_id INTO v_owner_id
    FROM channels
    WHERE id = p_channel_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'channel_not_found');
    END IF;

    IF v_owner_id != v_uid THEN
        RETURN jsonb_build_object('error', 'not_authorized');
    END IF;

    SELECT token, id INTO v_token, v_invite_id
    FROM invites
    WHERE channel_id = p_channel_id
      AND (expires_at IS NULL OR expires_at > now())
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'success',   true,
            'token',     v_token,
            'invite_id', v_invite_id
        );
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

GRANT EXECUTE ON FUNCTION public.get_channel_invite(uuid) TO authenticated;

-- =============================================================================
-- 2. regenerate_channel_invite
--    기존 유효 토큰 전부 만료 처리 후 새 토큰 발급
-- =============================================================================

CREATE OR REPLACE FUNCTION public.regenerate_channel_invite(p_channel_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid       uuid;
    v_owner_id  uuid;
    v_token     text;
    v_invite_id uuid;
BEGIN
    v_uid := auth.uid();

    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('error', 'not_authenticated');
    END IF;

    SELECT owner_id INTO v_owner_id
    FROM channels
    WHERE id = p_channel_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'channel_not_found');
    END IF;

    IF v_owner_id != v_uid THEN
        RETURN jsonb_build_object('error', 'not_authorized');
    END IF;

    UPDATE invites
    SET expires_at = now()
    WHERE channel_id = p_channel_id
      AND (expires_at IS NULL OR expires_at > now());

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

GRANT EXECUTE ON FUNCTION public.regenerate_channel_invite(uuid) TO authenticated;
