ALTER TABLE users ADD COLUMN default_avatar TEXT NOT NULL DEFAULT 'female'
  CHECK (default_avatar IN ('female', 'male'));

-- File name inside the avatars directory; NULL shows the default avatar.
ALTER TABLE users ADD COLUMN avatar_file TEXT;
