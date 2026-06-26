-- =============================================================================
-- Migration: 20260626000002_storage_attachments.sql
-- Description: 파일/이미지 공유용 Storage 버킷 + RLS
-- 버킷 경로 규칙: {channel_id}/{timestamp}-{random}.{ext}
--   → (storage.foldername(name))[1] = channel_id (UUID)
-- =============================================================================

-- 비공개 attachments 버킷 생성 (이미 있으면 무시)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('attachments', 'attachments', false, 20971520)  -- 20MB 제한
ON CONFLICT (id) DO NOTHING;

-- SELECT: 해당 채널 멤버만 다운로드 가능
CREATE POLICY "storage_attachments_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'attachments'
    AND EXISTS (
      SELECT 1 FROM public.channel_members
      WHERE channel_members.channel_id = (storage.foldername(name))[1]::uuid
        AND channel_members.user_id    = auth.uid()
    )
  );

-- INSERT: 해당 채널 멤버만 업로드 가능
CREATE POLICY "storage_attachments_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'attachments'
    AND EXISTS (
      SELECT 1 FROM public.channel_members
      WHERE channel_members.channel_id = (storage.foldername(name))[1]::uuid
        AND channel_members.user_id    = auth.uid()
    )
  );

-- UPDATE: 정책 없음 (첨부파일 내용 교체 불가)

-- DELETE: 파일 소유자만 삭제 가능
CREATE POLICY "storage_attachments_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'attachments'
    AND owner = auth.uid()
  );
