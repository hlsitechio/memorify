INSERT INTO public.agents (user_id, name, kind, token, status, metadata)
VALUES ('904b6fce-81df-4289-ad6f-ddcffb5dd3b5', 'Public Demo', 'custom', 'public_demo_token_synapse_landing', 'connected', '{"demo":true}'::jsonb)
ON CONFLICT DO NOTHING;