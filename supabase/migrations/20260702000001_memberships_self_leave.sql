-- 동아리 멤버 본인 탈퇴 허용 (owner 제외)
CREATE POLICY "memberships_delete_self"
    ON memberships
    FOR DELETE
    USING (user_id = auth.uid() AND role != 'owner');
