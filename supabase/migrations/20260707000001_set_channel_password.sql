-- Migration: 20260707000001_set_channel_password.sql
-- RPC: set_channel_password
-- 채널 owner가 방 비밀번호를 새로 설정/변경하거나(재발급) 해제할 수 있게 함.
-- 비밀번호는 해시로만 저장되어 기존 값을 "확인"하는 것은 불가능하므로,
-- 방장은 새 비밀번호를 발급(교체)하는 방식으로만 관리한다.

CREATE OR REPLACE FUNCTION public.set_channel_password(
    p_channel_id uuid,
    p_password   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid      uuid;
    v_owner_id uuid;
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

    IF p_password IS NOT NULL AND length(trim(p_password)) < 4 THEN
        RETURN jsonb_build_object('error', 'password_too_short');
    END IF;

    UPDATE channels
    SET join_password_hash = CASE WHEN p_password IS NOT NULL
                                   THEN crypt(trim(p_password), gen_salt('bf'))
                                   ELSE NULL
                              END
    WHERE id = p_channel_id;

    RETURN jsonb_build_object(
        'success',      true,
        'has_password', p_password IS NOT NULL
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_channel_password(uuid, text) TO authenticated;
