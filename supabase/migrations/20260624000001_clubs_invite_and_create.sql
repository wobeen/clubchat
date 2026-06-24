-- =============================================================================
-- Migration: 20260624000001_clubs_invite_and_create.sql
-- Description: clubs.invite_code 컬럼 + 동아리 생성/가입 RPC 함수
--
-- 재실행 안전성: ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE FUNCTION,
-- UNIQUE 제약 존재 여부 DO 블록 확인, CREATE INDEX IF NOT EXISTS.
-- gen_random_uuid() 만 사용 — 외부 확장 의존 없음.
-- =============================================================================

-- =============================================================================
-- 1. clubs.invite_code 컬럼 추가
-- =============================================================================

ALTER TABLE clubs ADD COLUMN IF NOT EXISTS invite_code TEXT;

-- 기존 rows에 코드 채움 (NOT NULL 제약 추가 전 필요)
UPDATE clubs
SET invite_code = upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8))
WHERE invite_code IS NULL;

ALTER TABLE clubs ALTER COLUMN invite_code SET NOT NULL;

-- UNIQUE 제약: 이미 존재하면 건너뜀
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'clubs_invite_code_unique'
          AND conrelid = 'clubs'::regclass
    ) THEN
        ALTER TABLE clubs ADD CONSTRAINT clubs_invite_code_unique UNIQUE (invite_code);
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS clubs_invite_code_idx ON clubs (invite_code);

-- =============================================================================
-- 2. generate_club_invite_code()
--    gen_random_uuid() → 하이픈 제거 → 대문자 → 앞 8자
-- =============================================================================

CREATE OR REPLACE FUNCTION public.generate_club_invite_code()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8));
$$;

GRANT EXECUTE ON FUNCTION public.generate_club_invite_code() TO authenticated;

-- =============================================================================
-- 3. create_club(p_name TEXT) → jsonb
--    동아리 INSERT + 멤버십 owner INSERT를 한 트랜잭션에서 원자적으로 처리.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_club(p_name TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid         uuid;
    v_club_id     uuid;
    v_club_name   text;
    v_invite_code text;
BEGIN
    v_uid := auth.uid();

    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('error', 'not_authenticated');
    END IF;

    INSERT INTO clubs (name, owner_id, invite_code)
    VALUES (p_name, v_uid, generate_club_invite_code())
    RETURNING id, name, invite_code
    INTO v_club_id, v_club_name, v_invite_code;

    INSERT INTO memberships (club_id, user_id, role)
    VALUES (v_club_id, v_uid, 'owner');

    RETURN jsonb_build_object(
        'success',     true,
        'club_id',     v_club_id,
        'club_name',   v_club_name,
        'invite_code', v_invite_code
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_club(TEXT) TO authenticated;

-- =============================================================================
-- 4. join_club_by_invite_code(p_code TEXT) → jsonb
--    초대코드로 동아리 가입. 중복·미존재 코드 안전하게 처리.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.join_club_by_invite_code(p_code TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid       uuid;
    v_club_id   uuid;
    v_club_name text;
BEGIN
    v_uid := auth.uid();

    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('error', 'not_authenticated');
    END IF;

    SELECT id, name
    INTO   v_club_id, v_club_name
    FROM   clubs
    WHERE  invite_code = upper(trim(p_code));

    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'invalid_code');
    END IF;

    IF EXISTS (
        SELECT 1 FROM memberships
        WHERE club_id = v_club_id AND user_id = v_uid
    ) THEN
        RETURN jsonb_build_object(
            'error',     'already_member',
            'club_id',   v_club_id,
            'club_name', v_club_name
        );
    END IF;

    INSERT INTO memberships (club_id, user_id, role)
    VALUES (v_club_id, v_uid, 'member');

    RETURN jsonb_build_object(
        'success',   true,
        'club_id',   v_club_id,
        'club_name', v_club_name
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_club_by_invite_code(TEXT) TO authenticated;
