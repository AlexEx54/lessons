-- Library badges become codes; the cards render their labels.
UPDATE library_lessons SET badge = CASE badge WHEN 'NEW' THEN 'new' WHEN 'Популярное' THEN 'popular' END
WHERE badge IS NOT NULL;
