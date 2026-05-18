-- Clear v1 Verdantly cache — raw_data schema changed in v2 and the new mapper cannot read v1 objects.
TRUNCATE public.verdantly_cache;
