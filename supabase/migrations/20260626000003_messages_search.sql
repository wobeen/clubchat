-- pg_trgm 확장 활성화 (ILIKE 검색을 인덱스로 가속)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- messages.content 에 GIN trigram 인덱스 추가
-- 이 인덱스로 content ILIKE '%검색어%' 가 인덱스 스캔으로 처리된다.
CREATE INDEX IF NOT EXISTS messages_content_trgm_idx
  ON messages USING gin(content gin_trgm_ops);
