-- =============================================================================
-- 오너 백필: create_channel 이전에 생성된 채널 또는 마이그레이션 미반영 상태로
-- 생성된 채널의 방장(owner_id)이 channel_members에 없는 경우 채워 넣는다.
-- ON CONFLICT DO NOTHING 으로 이미 등록된 방장은 건드리지 않는다.
-- SECURITY DEFINER 없이 직접 실행하므로 postgres 권한으로 적용.
-- =============================================================================

INSERT INTO channel_members (channel_id, user_id)
SELECT c.id, c.owner_id
FROM   channels c
WHERE  NOT EXISTS (
    SELECT 1
    FROM   channel_members cm
    WHERE  cm.channel_id = c.id
      AND  cm.user_id    = c.owner_id
)
ON CONFLICT (channel_id, user_id) DO NOTHING;
