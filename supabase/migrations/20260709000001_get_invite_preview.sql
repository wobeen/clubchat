-- Migration: 20260709000001_get_invite_preview.sql
-- RPC: get_invite_preview
-- 딥링크/QR(clubchat://join?token=xxx)로 들어온 토큰을 읽기 전용으로 미리보기한다.
-- join_channel_by_invite와 동일한 토큰 검증(만료/소진)을 재사용하되
-- channel_members INSERT나 use_count 증가 등 어떠한 상태 변경도 하지 않는다.
-- SECURITY DEFINER: 아직 채널 멤버가 아닌 사용자도 채널 이름/비밀번호 여부를
-- 미리 볼 수 있어야 "OO방에 입장하시겠습니까?" 화면을 그릴 수 있다.
-- (초대 토큰을 안다는 것 자체가 이미 이 정보를 볼 수 있는 권한으로 간주한다.)

CREATE OR REPLACE FUNCTION public.get_invite_preview(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid           uuid;
    v_invite        invites%ROWTYPE;
    v_channel       channels%ROWTYPE;
    v_already_member boolean;
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

    SELECT * INTO v_channel
    FROM channels
    WHERE id = v_invite.channel_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'invalid_token');
    END IF;

    v_already_member := EXISTS (
        SELECT 1 FROM channel_members
        WHERE channel_id = v_invite.channel_id
          AND user_id    = v_uid
    );

    RETURN jsonb_build_object(
        'success',        true,
        'channel_id',     v_channel.id,
        'channel_name',   v_channel.name,
        'has_password',   v_channel.is_password_protected,
        'already_member', v_already_member
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_invite_preview(text) TO authenticated;
