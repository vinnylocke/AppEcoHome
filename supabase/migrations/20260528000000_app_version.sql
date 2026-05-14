INSERT INTO public.app_config (key, value)
VALUES ('app_version', '{"major": 1, "minor": 1}'::jsonb)
ON CONFLICT (key) DO NOTHING;
