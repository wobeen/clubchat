-- pages 테이블 GRANT 누락 수정 + RLS 정책을 SECURITY DEFINER 헬퍼로 교체
--
-- 원인 1: pages 테이블이 fix_grants 마이그레이션 이후에 추가돼 GRANT가 없음
--          → RLS 평가 전 단계에서 403 permission denied 발생
-- 원인 2: pages RLS가 memberships/channel_members를 직접 EXISTS로 조회
--          → 기존 프로젝트에서 확립된 SECURITY DEFINER 헬퍼 패턴과 불일치,
--            잠재적 RLS 재귀 위험

-- 1. GRANT
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pages TO authenticated;

-- 2. 기존 정책 삭제
DROP POLICY IF EXISTS "pages_select" ON public.pages;
DROP POLICY IF EXISTS "pages_insert" ON public.pages;
DROP POLICY IF EXISTS "pages_update" ON public.pages;
DROP POLICY IF EXISTS "pages_delete" ON public.pages;

-- 3. SECURITY DEFINER 헬퍼 함수 기반으로 재작성
--    is_club_member / is_club_admin / is_channel_member 는
--    20260623000004_fix_rls_recursion.sql 에서 정의됨

-- SELECT: 동아리 멤버(동아리 페이지) / 방 멤버(방 페이지)
CREATE POLICY "pages_select" ON public.pages
  FOR SELECT
  USING (
    (room_id IS NULL     AND public.is_club_member(club_id, auth.uid()))
    OR
    (room_id IS NOT NULL AND public.is_channel_member(room_id, auth.uid()))
  );

-- INSERT: 동아리 admin+ / 방장, created_by = 본인 강제
CREATE POLICY "pages_insert" ON public.pages
  FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND (
      (room_id IS NULL AND public.is_club_admin(club_id, auth.uid()))
      OR
      (room_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.channels
        WHERE channels.id       = pages.room_id
          AND channels.owner_id = auth.uid()
      ))
    )
  );

-- UPDATE: 동아리 admin+ / 방장
CREATE POLICY "pages_update" ON public.pages
  FOR UPDATE
  USING (
    (room_id IS NULL AND public.is_club_admin(club_id, auth.uid()))
    OR
    (room_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.channels
      WHERE channels.id       = pages.room_id
        AND channels.owner_id = auth.uid()
    ))
  )
  WITH CHECK (
    (room_id IS NULL AND public.is_club_admin(club_id, auth.uid()))
    OR
    (room_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.channels
      WHERE channels.id       = pages.room_id
        AND channels.owner_id = auth.uid()
    ))
  );

-- DELETE: UPDATE와 동일 조건
CREATE POLICY "pages_delete" ON public.pages
  FOR DELETE
  USING (
    (room_id IS NULL AND public.is_club_admin(club_id, auth.uid()))
    OR
    (room_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.channels
      WHERE channels.id       = pages.room_id
        AND channels.owner_id = auth.uid()
    ))
  );
