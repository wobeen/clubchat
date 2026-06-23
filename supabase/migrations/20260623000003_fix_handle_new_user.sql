-- =============================================================================
-- Migration: 20260623000003_fix_handle_new_user.sql
-- Description: profiles 자동 생성 트리거 수정
--
-- 문제 1: profiles_insert_self 정책이 auth.uid() = id 를 검사하는데,
--         트리거 실행 시점에는 세션이 없어 auth.uid()가 NULL → INSERT 차단.
--         RLS 활성화 + INSERT 정책 없음 = 트리거(SECURITY DEFINER)만 삽입 가능.
--         이쪽이 보안상 더 엄격하므로 정책을 삭제한다.
--
-- 문제 2: SET search_path = public 은 Supabase 권장 패턴이 아님.
--         SET search_path = '' (빈 문자열)로 변경하고 테이블을 완전 한정명으로 참조.
-- =============================================================================

-- 1. 충돌하는 INSERT 정책 제거
DROP POLICY IF EXISTS "profiles_insert_self" ON public.profiles;

-- 2. 트리거 함수 재생성 (search_path 수정)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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
