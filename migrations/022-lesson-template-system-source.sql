-- The system template a copy descends from, also through copies of copies. Kept when
-- copies in between are deleted: the editor resets block instructions to its text.
ALTER TABLE lesson_templates ADD COLUMN system_template_id TEXT;

WITH RECURSIVE ancestry(id, ancestor) AS (
  SELECT id, source_template_id FROM lesson_templates
  UNION
  SELECT ancestry.id, parent.source_template_id
  FROM ancestry JOIN lesson_templates AS parent ON parent.id = ancestry.ancestor
)
UPDATE lesson_templates SET system_template_id = (
  SELECT ancestor FROM ancestry
  WHERE ancestry.id = lesson_templates.id AND ancestor IN ('template-1', 'template-2')
);
