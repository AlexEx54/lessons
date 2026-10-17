-- The values of the template's creation fields, keyed by input name, as the generation
-- uses them (fallbacks applied). `topic` keeps its own column: lists and titles read it.
ALTER TABLE lesson_drafts ADD COLUMN inputs_json TEXT NOT NULL DEFAULT '{}';

UPDATE lesson_drafts SET inputs_json = json_object(
  'topic', topic,
  'warmUpTopic', coalesce(warm_up_topic, topic),
  'grammarTopic', coalesce(grammar_topic, topic)
);

ALTER TABLE lesson_drafts DROP COLUMN warm_up_topic;
ALTER TABLE lesson_drafts DROP COLUMN grammar_topic;
