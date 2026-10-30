-- verify_pgvector.sql
-- Run: docker exec -i opsense-db psql -U postgres -d opsense < scripts/verify_pgvector.sql
-- Save the output as evidence for the pgvector deliverable.

-- 1. Extension is installed
SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';

-- 2. Vector type and distance operator work (cosine distance)
SELECT '[1,2,3]'::vector <=> '[1,2,4]'::vector AS cosine_distance;

-- 3. Vector column can be created and queried (temporary table, nothing persists)
CREATE TEMP TABLE vec_test (id int, embedding vector(3));
INSERT INTO vec_test VALUES (1, '[1,0,0]'), (2, '[0,1,0]'), (3, '[0.9,0.1,0]');
SELECT id, embedding <=> '[1,0,0]' AS distance
FROM vec_test
ORDER BY embedding <=> '[1,0,0]'
LIMIT 3;
