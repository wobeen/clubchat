-- 프로필 이모지 아바타 컬럼 추가
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_emoji text;
