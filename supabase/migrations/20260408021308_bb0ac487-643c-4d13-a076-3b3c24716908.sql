
DROP VIEW IF EXISTS v_fire_strength;
DROP VIEW IF EXISTS v_closing_distribution;
DROP VIEW IF EXISTS v_free_form_responses;

CREATE VIEW v_fire_strength AS
SELECT
  project_id AS dance_id,
  line_index,
  COUNT(*) AS fire_count,
  SUM(CASE
    WHEN hold_ms < 300  THEN 1
    WHEN hold_ms < 1000 THEN 2
    WHEN hold_ms < 3000 THEN 4
    ELSE 8
  END) AS fire_strength,
  AVG(hold_ms) AS avg_hold_ms
FROM project_fires
GROUP BY project_id, line_index;

CREATE VIEW v_closing_distribution AS
SELECT
  project_id AS dance_id,
  hook_index,
  COUNT(*) AS pick_count,
  ROUND(
    100.0 * COUNT(*) /
    NULLIF(SUM(COUNT(*)) OVER (PARTITION BY project_id), 0),
    1
  ) AS pct
FROM project_closing_picks
WHERE hook_index IS NOT NULL
GROUP BY project_id, hook_index;

CREATE VIEW v_free_form_responses AS
SELECT
  project_id AS dance_id,
  free_text,
  COUNT(*) AS repeat_count
FROM project_closing_picks
WHERE free_text IS NOT NULL AND free_text <> ''
GROUP BY project_id, free_text
ORDER BY repeat_count DESC;
