DO $$
DECLARE
  con RECORD;
BEGIN
  FOR con IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'restaurants'
      AND c.contype = 'u'
      AND EXISTS (
        SELECT 1 FROM pg_attribute a
        WHERE a.attrelid = t.oid
          AND a.attnum = ANY(c.conkey)
          AND a.attname = 'name'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.restaurants DROP CONSTRAINT %I', con.conname);
    RAISE NOTICE 'Dropped constraint: %', con.conname;
  END LOOP;
END
$$;

ALTER TABLE public.restaurants DROP CONSTRAINT IF EXISTS restaurants_name_key;
ALTER TABLE public.restaurants DROP CONSTRAINT IF EXISTS restaurants_name_unique;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'restaurants'
      AND c.contype = 'u'
      AND c.conname = 'restaurants_zomato_id_key'
  ) THEN
    ALTER TABLE public.restaurants ADD CONSTRAINT restaurants_zomato_id_key UNIQUE (zomato_id);
  END IF;
END
$$;