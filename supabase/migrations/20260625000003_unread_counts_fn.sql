-- 채널별 안 읽은 메시지 수를 한 번의 쿼리로 반환하는 함수.
-- SECURITY DEFINER + EXISTS 멤버 체크로 임의 channel_id 전달을 방어한다.
CREATE OR REPLACE FUNCTION public.get_unread_counts(p_channel_ids uuid[])
RETURNS TABLE(channel_id uuid, unread_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    m.channel_id,
    COUNT(*) AS unread_count
  FROM public.messages m
  LEFT JOIN public.channel_reads cr
    ON  cr.channel_id = m.channel_id
    AND cr.user_id    = auth.uid()
  WHERE m.channel_id  = ANY(p_channel_ids)
    AND m.deleted_at  IS NULL
    AND m.sender_id   != auth.uid()
    AND (cr.last_read_at IS NULL OR m.created_at > cr.last_read_at)
    AND EXISTS (
      SELECT 1 FROM public.channel_members cm
      WHERE cm.channel_id = m.channel_id
        AND cm.user_id    = auth.uid()
    )
  GROUP BY m.channel_id
$$;

GRANT EXECUTE ON FUNCTION public.get_unread_counts(uuid[]) TO authenticated;
