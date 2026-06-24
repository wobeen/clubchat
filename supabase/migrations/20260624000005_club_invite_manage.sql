CREATE OR REPLACE FUNCTION public.get_club_invite(p_club_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid         uuid;
    v_invite_code text;
BEGIN
    v_uid := auth.uid();

    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('error', 'not_authenticated');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM memberships
        WHERE club_id = p_club_id
          AND user_id = v_uid
          AND role = 'owner'
    ) THEN
        RETURN jsonb_build_object('error', 'not_authorized');
    END IF;

    SELECT invite_code INTO v_invite_code
    FROM clubs
    WHERE id = p_club_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'club_not_found');
    END IF;

    RETURN jsonb_build_object('success', true, 'invite_code', v_invite_code);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_club_invite(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.regenerate_club_invite(p_club_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid         uuid;
    v_new_code    text;
BEGIN
    v_uid := auth.uid();

    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('error', 'not_authenticated');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM memberships
        WHERE club_id = p_club_id
          AND user_id = v_uid
          AND role = 'owner'
    ) THEN
        RETURN jsonb_build_object('error', 'not_authorized');
    END IF;

    v_new_code := upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8));

    UPDATE clubs
    SET invite_code = v_new_code
    WHERE id = p_club_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'club_not_found');
    END IF;

    RETURN jsonb_build_object('success', true, 'invite_code', v_new_code);
END;
$$;

GRANT EXECUTE ON FUNCTION public.regenerate_club_invite(uuid) TO authenticated;
