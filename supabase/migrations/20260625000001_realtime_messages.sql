-- messages 테이블을 Realtime publication에 추가
-- channel_members RLS(SELECT)가 서버에서 필터링하므로 방 멤버만 수신한다.
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
