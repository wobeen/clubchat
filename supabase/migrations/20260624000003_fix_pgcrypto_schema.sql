-- =============================================================================
-- Migration: 20260624000003_fix_pgcrypto_schema.sql
-- Description: gen_salt/crypt를 extensions 스키마로 명시 (Supabase Cloud 호환)
--              Supabase Cloud의 pgcrypto는 extensions 스키마에 설치되어 있어
--              search_path에 포함되지 않으면 unqualified 호출이 실패함.
-- =============================================================================

-- create_channel: gen_salt → extensions.gen_salt, crypt → extensions.crypt
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
    v_uid          uuid;
    v_channel_id   uuid;
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
             THEN extensions.crypt(p_password, extensions.gen_salt('bf'))
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

-- join_channel_by_password: crypt → extensions.crypt
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
    v_uid     uuid;
    v_channel channels%ROWTYPE;
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

    IF extensions.crypt(p_password, v_channel.join_password_hash) <> v_channel.join_password_hash THEN
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
