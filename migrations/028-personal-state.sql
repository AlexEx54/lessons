-- Homework and self-assessment become each student's own: the session state keeps them under `personal`,
-- and an individual class keeps its one student's work under 'student'.
UPDATE class_live_state SET state_json = json_set(
  json_remove(state_json, '$.writings', '$.selfAssessments'),
  '$.personal', json_object('student', json_patch('{}', json_object(
    'writings', json(json_extract(state_json, '$.writings')),
    'selfAssessments', json(json_extract(state_json, '$.selfAssessments'))))))
WHERE json_type(state_json, '$.writings') IS NOT NULL OR json_type(state_json, '$.selfAssessments') IS NOT NULL;
