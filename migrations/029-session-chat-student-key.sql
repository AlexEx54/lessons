-- The student of an individual class writes to the session chat as 'student' on any device, so their earlier messages,
-- written under a device key, stay theirs. Files go first: they are matched by the keys their messages still carry.
UPDATE class_session_attachments SET sender_key = 'student' WHERE sender_key IN (
  SELECT m.sender_key FROM class_session_messages m JOIN class_sessions s ON s.id = m.session_id JOIN classes c ON c.id = s.class_id
  WHERE m.sender_role = 'student' AND c.is_group = 0);
UPDATE class_session_messages SET sender_key = 'student' WHERE sender_role = 'student' AND session_id IN (
  SELECT s.id FROM class_sessions s JOIN classes c ON c.id = s.class_id WHERE c.is_group = 0);
