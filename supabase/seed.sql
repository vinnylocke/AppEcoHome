SET session_replication_role = replica;

--
-- PostgreSQL database dump
--

-- \restrict Qtmzdydlxhh5czc9Ifs7v8VEjZFpXJBYUh3ZXqqXS6uL2j0uNH4hcl0FIqCXx1d

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: audit_log_entries; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: custom_oauth_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: flow_state; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: users; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."users" ("instance_id", "id", "aud", "role", "email", "encrypted_password", "email_confirmed_at", "invited_at", "confirmation_token", "confirmation_sent_at", "recovery_token", "recovery_sent_at", "email_change_token_new", "email_change", "email_change_sent_at", "last_sign_in_at", "raw_app_meta_data", "raw_user_meta_data", "is_super_admin", "created_at", "updated_at", "phone", "phone_confirmed_at", "phone_change", "phone_change_token", "phone_change_sent_at", "email_change_token_current", "email_change_confirm_status", "banned_until", "reauthentication_token", "reauthentication_sent_at", "is_sso_user", "deleted_at", "is_anonymous") VALUES
	('00000000-0000-0000-0000-000000000000', '28ae4e90-5b1c-4290-91ee-6b68e35c86b2', 'authenticated', 'authenticated', 'vinnylocke@gmail.com', '$2a$10$4r6.ZVIKaCzIrWMSFKC7ZehAZd6rZMy/TALfXDx7mJbmmyxrskSIa', '2026-03-27 14:42:46.856889+00', NULL, '', NULL, '', NULL, '', '', NULL, '2026-03-30 15:05:31.048367+00', '{"provider": "email", "providers": ["email", "google"]}', '{"iss": "https://accounts.google.com", "sub": "104030226810952436626", "name": "Vinny Locke", "email": "vinnylocke@gmail.com", "picture": "https://lh3.googleusercontent.com/a/ACg8ocIuhg9R5kEodOB_v6Ci9wM3gP-20PmnO1e5Sc8BNpWaimRwRw=s96-c", "full_name": "Vinny Locke", "avatar_url": "https://lh3.googleusercontent.com/a/ACg8ocIuhg9R5kEodOB_v6Ci9wM3gP-20PmnO1e5Sc8BNpWaimRwRw=s96-c", "provider_id": "104030226810952436626", "email_verified": true, "phone_verified": false}', NULL, '2026-03-27 14:42:46.81271+00', '2026-04-01 06:45:03.303504+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false);


--
-- Data for Name: identities; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."identities" ("provider_id", "user_id", "identity_data", "provider", "last_sign_in_at", "created_at", "updated_at", "id") VALUES
	('28ae4e90-5b1c-4290-91ee-6b68e35c86b2', '28ae4e90-5b1c-4290-91ee-6b68e35c86b2', '{"sub": "28ae4e90-5b1c-4290-91ee-6b68e35c86b2", "email": "vinnylocke@gmail.com", "email_verified": false, "phone_verified": false}', 'email', '2026-03-27 14:42:46.849336+00', '2026-03-27 14:42:46.84991+00', '2026-03-27 14:42:46.84991+00', '3262f2df-4a1d-4462-b56f-29fd68e413f9'),
	('104030226810952436626', '28ae4e90-5b1c-4290-91ee-6b68e35c86b2', '{"iss": "https://accounts.google.com", "sub": "104030226810952436626", "name": "Vinny Locke", "email": "vinnylocke@gmail.com", "picture": "https://lh3.googleusercontent.com/a/ACg8ocIuhg9R5kEodOB_v6Ci9wM3gP-20PmnO1e5Sc8BNpWaimRwRw=s96-c", "full_name": "Vinny Locke", "avatar_url": "https://lh3.googleusercontent.com/a/ACg8ocIuhg9R5kEodOB_v6Ci9wM3gP-20PmnO1e5Sc8BNpWaimRwRw=s96-c", "provider_id": "104030226810952436626", "email_verified": true, "phone_verified": false}', 'google', '2026-03-27 14:59:53.131917+00', '2026-03-27 14:59:53.131974+00', '2026-03-30 14:54:30.646593+00', 'e89f6a03-be9f-4125-9846-71eeebc83060');


--
-- Data for Name: instances; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: oauth_clients; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: sessions; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."sessions" ("id", "user_id", "created_at", "updated_at", "factor_id", "aal", "not_after", "refreshed_at", "user_agent", "ip", "tag", "oauth_client_id", "refresh_token_hmac_key", "refresh_token_counter", "scopes") VALUES
	('fc168654-78e4-4823-a0d3-c1ae259ed9d7', '28ae4e90-5b1c-4290-91ee-6b68e35c86b2', '2026-03-30 15:05:31.048468+00', '2026-04-01 06:45:03.31624+00', NULL, 'aal1', NULL, '2026-04-01 06:45:03.316117', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36', '5.71.186.255', NULL, NULL, NULL, NULL, NULL);


--
-- Data for Name: mfa_amr_claims; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."mfa_amr_claims" ("session_id", "created_at", "updated_at", "authentication_method", "id") VALUES
	('fc168654-78e4-4823-a0d3-c1ae259ed9d7', '2026-03-30 15:05:31.113421+00', '2026-03-30 15:05:31.113421+00', 'password', 'ce78683b-ad02-4d40-9d11-084c4c2567df');


--
-- Data for Name: mfa_factors; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: mfa_challenges; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: oauth_authorizations; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: oauth_client_states; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: oauth_consents; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: one_time_tokens; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: refresh_tokens; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."refresh_tokens" ("instance_id", "id", "token", "user_id", "revoked", "created_at", "updated_at", "parent", "session_id") VALUES
	('00000000-0000-0000-0000-000000000000', 51, '5fwklw6glo7i', '28ae4e90-5b1c-4290-91ee-6b68e35c86b2', true, '2026-03-30 15:05:31.085484+00', '2026-03-31 07:08:54.035283+00', NULL, 'fc168654-78e4-4823-a0d3-c1ae259ed9d7'),
	('00000000-0000-0000-0000-000000000000', 52, 'v3x7vuk3fl3l', '28ae4e90-5b1c-4290-91ee-6b68e35c86b2', true, '2026-03-31 07:08:54.067832+00', '2026-03-31 08:50:04.795921+00', '5fwklw6glo7i', 'fc168654-78e4-4823-a0d3-c1ae259ed9d7'),
	('00000000-0000-0000-0000-000000000000', 53, 'ndbfopppxvyg', '28ae4e90-5b1c-4290-91ee-6b68e35c86b2', true, '2026-03-31 08:50:04.822886+00', '2026-03-31 09:48:32.015534+00', 'v3x7vuk3fl3l', 'fc168654-78e4-4823-a0d3-c1ae259ed9d7'),
	('00000000-0000-0000-0000-000000000000', 54, '4ebousdjivsf', '28ae4e90-5b1c-4290-91ee-6b68e35c86b2', true, '2026-03-31 09:48:32.034974+00', '2026-03-31 10:46:38.410942+00', 'ndbfopppxvyg', 'fc168654-78e4-4823-a0d3-c1ae259ed9d7'),
	('00000000-0000-0000-0000-000000000000', 55, 'rkct43gnnfxs', '28ae4e90-5b1c-4290-91ee-6b68e35c86b2', true, '2026-03-31 10:46:38.42863+00', '2026-03-31 12:12:42.955188+00', '4ebousdjivsf', 'fc168654-78e4-4823-a0d3-c1ae259ed9d7'),
	('00000000-0000-0000-0000-000000000000', 56, 'cimqvfmnfnkt', '28ae4e90-5b1c-4290-91ee-6b68e35c86b2', true, '2026-03-31 12:12:42.968461+00', '2026-03-31 13:10:55.686312+00', 'rkct43gnnfxs', 'fc168654-78e4-4823-a0d3-c1ae259ed9d7'),
	('00000000-0000-0000-0000-000000000000', 57, 'pwb5bm7stl6p', '28ae4e90-5b1c-4290-91ee-6b68e35c86b2', true, '2026-03-31 13:10:55.698189+00', '2026-03-31 16:13:32.283251+00', 'cimqvfmnfnkt', 'fc168654-78e4-4823-a0d3-c1ae259ed9d7'),
	('00000000-0000-0000-0000-000000000000', 58, 'xlk35vpdbrrc', '28ae4e90-5b1c-4290-91ee-6b68e35c86b2', true, '2026-03-31 16:13:32.350095+00', '2026-03-31 17:12:36.998478+00', 'pwb5bm7stl6p', 'fc168654-78e4-4823-a0d3-c1ae259ed9d7'),
	('00000000-0000-0000-0000-000000000000', 59, 'eonxackxmyii', '28ae4e90-5b1c-4290-91ee-6b68e35c86b2', true, '2026-03-31 17:12:37.012946+00', '2026-03-31 18:10:44.933362+00', 'xlk35vpdbrrc', 'fc168654-78e4-4823-a0d3-c1ae259ed9d7'),
	('00000000-0000-0000-0000-000000000000', 60, 'w2wdabvc6gtj', '28ae4e90-5b1c-4290-91ee-6b68e35c86b2', true, '2026-03-31 18:10:44.969844+00', '2026-03-31 19:08:46.397887+00', 'eonxackxmyii', 'fc168654-78e4-4823-a0d3-c1ae259ed9d7'),
	('00000000-0000-0000-0000-000000000000', 61, '7r3jfta3ha7i', '28ae4e90-5b1c-4290-91ee-6b68e35c86b2', true, '2026-03-31 19:08:46.421991+00', '2026-03-31 20:07:09.834101+00', 'w2wdabvc6gtj', 'fc168654-78e4-4823-a0d3-c1ae259ed9d7'),
	('00000000-0000-0000-0000-000000000000', 62, 'v7qvz7mkvuh2', '28ae4e90-5b1c-4290-91ee-6b68e35c86b2', true, '2026-03-31 20:07:09.852043+00', '2026-04-01 06:45:03.262917+00', '7r3jfta3ha7i', 'fc168654-78e4-4823-a0d3-c1ae259ed9d7'),
	('00000000-0000-0000-0000-000000000000', 63, 'qytgcdhmm752', '28ae4e90-5b1c-4290-91ee-6b68e35c86b2', false, '2026-04-01 06:45:03.290165+00', '2026-04-01 06:45:03.290165+00', 'v7qvz7mkvuh2', 'fc168654-78e4-4823-a0d3-c1ae259ed9d7');


--
-- Data for Name: sso_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: saml_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: saml_relay_states; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: sso_domains; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: webauthn_challenges; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: webauthn_credentials; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: homes; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."homes" ("id", "name", "created_at", "address", "lat", "lng") VALUES
	('2fe0859d-821b-4b6c-842a-37add4a6ccb4', 'Test Home', '2026-03-27 16:00:58.049759+00', 'CR6 9NE', NULL, NULL);


--
-- Data for Name: locations; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."locations" ("id", "home_id", "name", "created_at", "placement") VALUES
	('10ae7883-e61c-4ce4-9de2-3be1f9e262c8', '2fe0859d-821b-4b6c-842a-37add4a6ccb4', 'Allotment', '2026-03-27 16:35:17.899578+00', 'Outside'),
	('9742d6a1-0883-4110-8499-8b487e78cd4b', '2fe0859d-821b-4b6c-842a-37add4a6ccb4', 'Greenhouse', '2026-03-27 16:32:12.421997+00', 'Inside');


--
-- Data for Name: areas; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."areas" ("id", "location_id", "name", "created_at") VALUES
	('eeef0c26-7f0e-4759-9ae0-a46d4364b2d6', '9742d6a1-0883-4110-8499-8b487e78cd4b', 'Zone 1', '2026-03-27 16:32:45.209073+00');


--
-- Data for Name: species_cache; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: inventory_items; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: doctor_history; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: guides; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: home_members; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."home_members" ("id", "home_id", "user_id", "role", "created_at") VALUES
	('cb253a00-c022-4ff6-95c0-1091351444e7', '2fe0859d-821b-4b6c-842a-37add4a6ccb4', '28ae4e90-5b1c-4290-91ee-6b68e35c86b2', 'owner', '2026-03-27 16:00:58.049759+00');


--
-- Data for Name: plants; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: reports; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: task_blueprints; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: tasks; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: user_profiles; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."user_profiles" ("uid", "email", "display_name", "fcm_token", "created_at", "home_id", "notification_interval_hours", "ai_enabled") VALUES
	('28ae4e90-5b1c-4290-91ee-6b68e35c86b2', 'vinnylocke@gmail.com', NULL, NULL, '2026-03-27 14:42:46.812343+00', '2fe0859d-821b-4b6c-842a-37add4a6ccb4', 8, true);


--
-- Data for Name: weather_alerts; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: weather_snapshots; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."weather_snapshots" ("id", "home_id", "data", "updated_at") VALUES
	('5695ffdb-a8cd-49d0-bae9-8d49656af950', '2fe0859d-821b-4b6c-842a-37add4a6ccb4', '{"daily": {"time": ["2026-03-31", "2026-04-01", "2026-04-02", "2026-04-03", "2026-04-04", "2026-04-05", "2026-04-06"], "rain_sum": [0, 0, 0.4, 0.3, 0.6, 0.3, 0.6], "showers_sum": [0, 0, 0, 0, 0, 0, 0], "snowfall_sum": [0, 0, 0, 0, 0, 0, 0], "uv_index_max": [1.9, 2.3, 2.8, 0.6, 4.85, 3.95, 4.75], "weather_code": [3, 45, 51, 51, 51, 51, 51], "temperature_2m_max": [14.6, 13.7, 10.5, 12.5, 12, 11.6, 16.7], "temperature_2m_min": [7.3, 5.7, 4.6, 6.3, 9.5, 5.9, 4.6]}, "hourly": {"rain": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.1, 0.1, 0.1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.1, 0.1, 0.1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], "time": ["2026-03-31T00:00", "2026-03-31T01:00", "2026-03-31T02:00", "2026-03-31T03:00", "2026-03-31T04:00", "2026-03-31T05:00", "2026-03-31T06:00", "2026-03-31T07:00", "2026-03-31T08:00", "2026-03-31T09:00", "2026-03-31T10:00", "2026-03-31T11:00", "2026-03-31T12:00", "2026-03-31T13:00", "2026-03-31T14:00", "2026-03-31T15:00", "2026-03-31T16:00", "2026-03-31T17:00", "2026-03-31T18:00", "2026-03-31T19:00", "2026-03-31T20:00", "2026-03-31T21:00", "2026-03-31T22:00", "2026-03-31T23:00", "2026-04-01T00:00", "2026-04-01T01:00", "2026-04-01T02:00", "2026-04-01T03:00", "2026-04-01T04:00", "2026-04-01T05:00", "2026-04-01T06:00", "2026-04-01T07:00", "2026-04-01T08:00", "2026-04-01T09:00", "2026-04-01T10:00", "2026-04-01T11:00", "2026-04-01T12:00", "2026-04-01T13:00", "2026-04-01T14:00", "2026-04-01T15:00", "2026-04-01T16:00", "2026-04-01T17:00", "2026-04-01T18:00", "2026-04-01T19:00", "2026-04-01T20:00", "2026-04-01T21:00", "2026-04-01T22:00", "2026-04-01T23:00", "2026-04-02T00:00", "2026-04-02T01:00", "2026-04-02T02:00", "2026-04-02T03:00", "2026-04-02T04:00", "2026-04-02T05:00", "2026-04-02T06:00", "2026-04-02T07:00", "2026-04-02T08:00", "2026-04-02T09:00", "2026-04-02T10:00", "2026-04-02T11:00", "2026-04-02T12:00", "2026-04-02T13:00", "2026-04-02T14:00", "2026-04-02T15:00", "2026-04-02T16:00", "2026-04-02T17:00", "2026-04-02T18:00", "2026-04-02T19:00", "2026-04-02T20:00", "2026-04-02T21:00", "2026-04-02T22:00", "2026-04-02T23:00", "2026-04-03T00:00", "2026-04-03T01:00", "2026-04-03T02:00", "2026-04-03T03:00", "2026-04-03T04:00", "2026-04-03T05:00", "2026-04-03T06:00", "2026-04-03T07:00", "2026-04-03T08:00", "2026-04-03T09:00", "2026-04-03T10:00", "2026-04-03T11:00", "2026-04-03T12:00", "2026-04-03T13:00", "2026-04-03T14:00", "2026-04-03T15:00", "2026-04-03T16:00", "2026-04-03T17:00", "2026-04-03T18:00", "2026-04-03T19:00", "2026-04-03T20:00", "2026-04-03T21:00", "2026-04-03T22:00", "2026-04-03T23:00", "2026-04-04T00:00", "2026-04-04T01:00", "2026-04-04T02:00", "2026-04-04T03:00", "2026-04-04T04:00", "2026-04-04T05:00", "2026-04-04T06:00", "2026-04-04T07:00", "2026-04-04T08:00", "2026-04-04T09:00", "2026-04-04T10:00", "2026-04-04T11:00", "2026-04-04T12:00", "2026-04-04T13:00", "2026-04-04T14:00", "2026-04-04T15:00", "2026-04-04T16:00", "2026-04-04T17:00", "2026-04-04T18:00", "2026-04-04T19:00", "2026-04-04T20:00", "2026-04-04T21:00", "2026-04-04T22:00", "2026-04-04T23:00", "2026-04-05T00:00", "2026-04-05T01:00", "2026-04-05T02:00", "2026-04-05T03:00", "2026-04-05T04:00", "2026-04-05T05:00", "2026-04-05T06:00", "2026-04-05T07:00", "2026-04-05T08:00", "2026-04-05T09:00", "2026-04-05T10:00", "2026-04-05T11:00", "2026-04-05T12:00", "2026-04-05T13:00", "2026-04-05T14:00", "2026-04-05T15:00", "2026-04-05T16:00", "2026-04-05T17:00", "2026-04-05T18:00", "2026-04-05T19:00", "2026-04-05T20:00", "2026-04-05T21:00", "2026-04-05T22:00", "2026-04-05T23:00", "2026-04-06T00:00", "2026-04-06T01:00", "2026-04-06T02:00", "2026-04-06T03:00", "2026-04-06T04:00", "2026-04-06T05:00", "2026-04-06T06:00", "2026-04-06T07:00", "2026-04-06T08:00", "2026-04-06T09:00", "2026-04-06T10:00", "2026-04-06T11:00", "2026-04-06T12:00", "2026-04-06T13:00", "2026-04-06T14:00", "2026-04-06T15:00", "2026-04-06T16:00", "2026-04-06T17:00", "2026-04-06T18:00", "2026-04-06T19:00", "2026-04-06T20:00", "2026-04-06T21:00", "2026-04-06T22:00", "2026-04-06T23:00"], "showers": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], "snowfall": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], "dew_point_2m": [1.4, 1.6, 1.6, 2.2, 3.1, 3.3, 3.5, 3.9, 4.4, 5.3, 6.2, 7, 7.7, 8, 8, 7.9, 8.1, 8.8, 9.3, 9.4, 9.3, 9.8, 9.4, 9.2, 7.5, 7.7, 6.7, 6.5, 6.3, 5.7, 5.8, 5.6, 6.6, 6.9, 7.2, 6.6, 6.1, 4.8, 4.6, 4.5, 4.7, 4.4, 4.3, 5.1, 5.4, 5.3, 4.8, 5.4, 6.6, 7.8, 4.5, 2.8, 2.4, 2.3, 2.4, 2.3, 2.4, 1.7, 1.3, 0.4, 0, -0.7, -1.5, -2.1, -2.5, -2, -0.7, 1.2, 2, 0.8, 0.1, 0.8, 2.3, 3.4, 3.7, 3.7, 3.6, 3.4, 3, 3, 3.2, 3.7, 4.3, 5, 5.6, 6.4, 7.6, 8.9, 10, 10.4, 10.5, 10.3, 10.1, 9.8, 9.6, 9.5, 9.4, 9.2, 9, 8.8, 8.6, 8.4, 8.4, 8.3, 8.2, 8.1, 8.1, 8.2, 8.4, 8.4, 8.3, 8.1, 7.9, 7.8, 7.9, 7.9, 8.2, 8.6, 8.9, 8.6, 8.1, 7.3, 5.8, 3.8, 2.2, 1.7, 1.9, 1.9, 1.6, 1.2, 0.8, 0.2, -0.7, -1.7, -2.2, -2.6, -2.6, -2.8, -2.5, -1.8, -0.2, 1.5, 2.5, 1.1, 1.7, 2.1, 2.6, 3.1, 3.5, 3.9, 4.4, 5.1, 5.9, 6.6, 7.4, 8.1, 8.7, 9.1, 9.4, 10, 10.2, 10.5, 10.7, 10.7, 10.5, 10.1, 9.6, 9.1], "weather_code": [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 0, 3, 3, 1, 1, 0, 0, 0, 0, 2, 45, 3, 2, 2, 1, 1, 0, 2, 2, 3, 3, 3, 1, 2, 2, 3, 1, 1, 2, 3, 51, 3, 0, 3, 2, 2, 1, 2, 2, 3, 2, 1, 2, 1, 1, 1, 2, 2, 0, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 3, 3, 3, 3, 3, 3, 3, 3, 51, 51, 51, 51, 51, 51, 3, 3, 3, 3, 3, 3, 3, 3, 3, 51, 51, 51, 51, 51, 51, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 51, 51, 51, 2, 0, 0, 1, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 3, 3, 3, 3, 3, 51, 51, 51, 51, 51, 51, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 1, 1, 1, 1, 2, 2], "temperature_2m": [7.8, 7.3, 7.5, 7.7, 7.6, 7.5, 7.4, 7.4, 8, 8.6, 9.3, 10.5, 11.4, 12.7, 13.5, 14.6, 13.9, 13.7, 13.2, 12.4, 11.6, 11.7, 10.4, 10.1, 8.6, 8.6, 7.3, 6.6, 6.5, 5.7, 5.8, 5.8, 7.2, 8.2, 9.7, 11.1, 12.2, 13.1, 13.2, 13.7, 13.5, 13.5, 12.9, 11.7, 10.7, 8.9, 9, 9, 9.1, 8.7, 7.9, 6.4, 5.9, 5.3, 5.1, 4.6, 5.2, 5.9, 6.5, 7.5, 8.2, 9.1, 9.9, 10.3, 10.5, 10.1, 9.3, 8.3, 7.7, 7.4, 7.1, 7, 7, 6.9, 6.8, 6.6, 6.4, 6.4, 6.3, 6.5, 7, 7.7, 8.3, 9, 9.6, 10.3, 11.1, 11.9, 12.4, 12.5, 12.2, 11.9, 11.5, 11.1, 10.7, 10.4, 10.3, 10.1, 10.1, 10, 10, 9.8, 9.6, 9.5, 9.5, 9.5, 9.6, 10.1, 10.8, 11.2, 11.2, 11, 10.9, 11, 11.2, 11.4, 11.7, 11.9, 12, 11.7, 11.3, 10.8, 10.4, 10, 9.6, 8.8, 7.9, 7.4, 7.5, 8, 8.6, 9.3, 10.1, 10.7, 11.2, 11.6, 11.6, 11, 10.1, 9.2, 8.3, 7.4, 6.6, 5.9, 5.2, 4.8, 4.6, 4.6, 4.7, 5, 5.5, 6.2, 7.2, 8.6, 10.2, 11.8, 13.2, 14.3, 15.1, 15.7, 16.1, 16.4, 16.6, 16.7, 16.7, 16.5, 16.2, 15.9], "wind_speed_10m": [11.5, 8.3, 9.4, 12.2, 11.2, 9.7, 8.6, 8.3, 9.7, 11.5, 9.4, 11.9, 11.2, 9.4, 9.4, 9.7, 8.6, 6.5, 4.7, 2.9, 7.2, 7.2, 7.2, 6.5, 5.4, 7.9, 5.4, 5.8, 5.4, 5, 4.7, 4, 5.8, 6.1, 6.5, 6.5, 4.7, 6.5, 6.8, 8.3, 11.2, 10.4, 11.9, 11.9, 8.6, 5.4, 7.6, 11.9, 12.6, 11.2, 15.5, 14, 16.2, 16.6, 13.3, 9.7, 13.7, 16.9, 17.3, 15.5, 14, 11.9, 9.7, 7.6, 7.6, 6.6, 6.5, 3.9, 5, 7.2, 9.4, 10.8, 11.5, 12.2, 12.2, 12.2, 12.6, 13.7, 15.1, 16.9, 19.4, 22.3, 24.5, 25.9, 27.4, 27.4, 26.3, 24.1, 22, 20.2, 18.4, 17.3, 16.6, 16.6, 16.6, 16.9, 17.6, 18.4, 18.7, 19.1, 19.4, 19.4, 19.1, 19.4, 20.5, 22.3, 23.8, 25.2, 27, 28.1, 28.8, 29.5, 29.2, 27.4, 25.2, 24.1, 25.6, 28.4, 31, 32.4, 33.5, 34.2, 35.3, 36, 35.3, 32, 27.4, 23.8, 22, 20.9, 19.8, 18.7, 17.3, 16.6, 16.2, 16.6, 16.6, 16.2, 15.8, 15.1, 13.3, 11.2, 9.4, 9.4, 8.3, 7.9, 8.3, 9.4, 10.8, 12.2, 13.7, 14.8, 15.5, 16.6, 17.3, 17.6, 18, 18.4, 18.4, 17.6, 16.9, 16.2, 15.8, 15.8, 16.6, 17.6, 19.4, 20.9], "wind_direction_10m": [322, 296, 298, 296, 302, 288, 288, 290, 280, 276, 292, 294, 304, 332, 322, 334, 322, 356, 78, 138, 188, 224, 208, 178, 226, 272, 278, 270, 276, 270, 288, 296, 298, 302, 314, 328, 330, 314, 296, 280, 282, 288, 288, 288, 296, 256, 282, 288, 302, 300, 332, 332, 336, 338, 346, 338, 342, 360, 2, 6, 2, 4, 10, 4, 360, 248, 156, 98, 192, 185, 179, 188, 197, 206, 204, 203, 201, 196, 191, 186, 190, 194, 198, 201, 203, 206, 212, 217, 223, 221, 219, 217, 219, 221, 223, 226, 228, 231, 230, 230, 229, 230, 230, 231, 230, 228, 227, 222, 217, 212, 211, 210, 209, 205, 200, 196, 200, 205, 209, 210, 210, 211, 218, 225, 232, 239, 246, 253, 258, 263, 268, 264, 260, 256, 246, 236, 226, 222, 219, 215, 212, 210, 207, 192, 177, 162, 154, 146, 139, 131, 123, 115, 117, 119, 121, 122, 124, 126, 128, 130, 132, 133, 135, 137, 140, 143, 146, 149], "relative_humidity_2m": [64, 67, 66, 68, 73, 75, 76, 78, 78, 80, 81, 79, 78, 73, 69, 64, 68, 72, 77, 82, 86, 88, 93, 94, 93, 94, 96, 99, 99, 100, 100, 99, 96, 91, 84, 74, 66, 57, 56, 54, 55, 54, 56, 64, 70, 78, 75, 78, 84, 94, 79, 78, 78, 81, 83, 85, 82, 74, 69, 61, 56, 50, 45, 42, 40, 43, 50, 61, 67, 63, 61, 65, 72, 78, 81, 82, 82, 81, 79, 78, 77, 76, 76, 76, 76, 77, 79, 82, 85, 87, 89, 90, 91, 92, 93, 94, 94, 94, 93, 92, 91, 91, 92, 92, 92, 91, 90, 88, 85, 83, 82, 82, 82, 81, 80, 79, 79, 80, 81, 81, 81, 79, 73, 65, 60, 61, 66, 68, 66, 62, 58, 53, 47, 42, 39, 37, 37, 38, 41, 46, 55, 66, 75, 71, 78, 83, 87, 90, 92, 93, 93, 93, 91, 87, 83, 78, 74, 71, 69, 69, 68, 68, 68, 68, 67, 66, 65, 64], "soil_temperature_6cm": [6.7, 6.6, 6.4, 6.3, 6.4, 6.3, 6.4, 6.7, 6.9, 7.2, 7.6, 8.4, 9.6, 10.2, 11, 12.1, 12.5, 12.3, 12, 11.8, 11, 10.1, 9.4, 9, 8.9, 8.6, 8.1, 7.9, 7.8, 7.5, 7.3, 7.3, 7.4, 8.3, 9.5, 10.7, 11.8, 12.6, 12.7, 12.8, 12.8, 12.4, 11.7, 11.1, 10.4, 10, 9.5, 9.1, 8.8, 8.8, 8.8, 8.7, 8.1, 7.3, 6.8, 6.5, 6.3, 6.6, 7.5, 8.9, 10.1, 11.3, 12.4, 13, 13.3, 13.1, 12.3, 11.1, 10, 9.3, 8.7, 8.3, 7.8, 7.6, 7.4, 7.4, 7.3, 7.3, 7.3, 7.4, 7.6, 7.8, 8.2, 8.8, 9.8, 10.4, 11.1, 11.4, 11.4, 11.2, 11.2, 11.2, 10.9, 10.5, 10.1, 9.8, 9.4, 9.2, 9.1, 9.2, 9.3, 9.4, 9.6, 9.7, 9.9, 10.1, 10.5, 11.1, 11.8, 12.4, 12.7, 12.8, 12.8, 12.7, 12.4, 12.2, 11.9, 11.5, 11.2, 10.9, 10.8, 10.5, 10.1, 9.6, 9, 8.3, 7.5, 7.1, 7.3, 7.9, 8.7, 9.8, 10.9, 11.8, 12.1, 12.2, 12.1, 11.7, 11.2, 10.5, 9.6, 8.6, 7.7, 7, 6.5, 6, 5.6, 5.2, 5, 4.8, 4.7, 5, 5.8, 7, 8.1, 9.2, 10.2, 11.1, 12, 12.8, 13.2, 13.3, 13, 12.6, 12.1, 11.5, 10.9, 10.6], "soil_moisture_0_to_1cm": [0.295, 0.294, 0.295, 0.295, 0.295, 0.295, 0.295, 0.296, 0.296, 0.298, 0.299, 0.298, 0.297, 0.297, 0.296, 0.296, 0.296, 0.297, 0.299, 0.299, 0.299, 0.299, 0.299, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.299, 0.299, 0.298, 0.298, 0.298, 0.298, 0.299, 0.302, 0.301, 0.302, 0.301, 0.301, 0.301, 0.302, 0.302, 0.302, 0.302, 0.302, 0.302, 0.302, 0.302, 0.302, 0.301, 0.301, 0.3, 0.3, 0.299, 0.298, 0.298, 0.298, 0.298, 0.298, 0.298, 0.299, 0.299, 0.299, 0.3, 0.3, 0.301, 0.302, 0.304, 0.304, 0.304, 0.305, 0.306, 0.308, 0.309, 0.307, 0.306, 0.305, 0.305, 0.304, 0.304, 0.304, 0.304, 0.304, 0.304, 0.304, 0.304, 0.304, 0.304, 0.305, 0.305, 0.305, 0.305, 0.305, 0.305, 0.305, 0.305, 0.305, 0.304, 0.304, 0.304, 0.303, 0.303, 0.303, 0.302, 0.302, 0.302, 0.302, 0.302, 0.302, 0.303, 0.303, 0.303, 0.303, 0.303, 0.303, 0.303, 0.303, 0.303, 0.304, 0.304, 0.304, 0.304, 0.303, 0.3, 0.298, 0.295, 0.294, 0.293, 0.293, 0.293, 0.293, 0.293, 0.294, 0.294, 0.295, 0.295, 0.296, 0.296, 0.296, 0.296, 0.296, 0.296, 0.297, 0.297, 0.297, 0.296, 0.296, 0.296, 0.295, 0.295, 0.294, 0.293, 0.293, 0.293, 0.294, 0.294, 0.294, 0.295, 0.295, 0.295], "precipitation_probability": [0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 4, 6, 8, 12, 20, 29, 33, 27, 16, 8, 5, 5, 4, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 5, 6, 5, 2, 0, 0, 0, 0, 0, 0, 0, 8, 18, 24, 22, 15, 10, 8, 7, 6, 4, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 5, 8, 12, 18, 24, 32, 42, 49, 53, 54, 55, 57, 57, 53, 40, 22, 8, 3, 2, 2, 1, 0, 0, 0, 0, 0, 1, 2, 4, 6, 9, 12, 17, 22, 25, 24, 21, 18, 15, 11, 8, 7, 7, 8, 10, 13, 16, 21, 27, 29, 24, 16, 10, 8, 9, 10, 12, 15, 16, 15, 14, 12, 11, 11, 10, 7, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 6, 5, 4, 3, 3, 4, 7, 10, 14, 18]}, "latitude": 51.31183, "timezone": "Europe/London", "elevation": 184, "longitude": -0.054901123, "daily_units": {"time": "iso8601", "rain_sum": "mm", "showers_sum": "mm", "snowfall_sum": "cm", "uv_index_max": "", "weather_code": "wmo code", "temperature_2m_max": "°C", "temperature_2m_min": "°C"}, "hourly_units": {"rain": "mm", "time": "iso8601", "showers": "mm", "snowfall": "cm", "dew_point_2m": "°C", "weather_code": "wmo code", "temperature_2m": "°C", "wind_speed_10m": "km/h", "wind_direction_10m": "%", "relative_humidity_2m": "%", "soil_temperature_6cm": "°C", "soil_moisture_0_to_1cm": "m³/m³", "precipitation_probability": "%"}, "generationtime_ms": 0.7140636444091797, "utc_offset_seconds": 3600, "timezone_abbreviation": "GMT+1"}', '2026-03-31 17:08:46.378+00');


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE SET; Schema: auth; Owner: supabase_auth_admin
--

SELECT pg_catalog.setval('"auth"."refresh_tokens_id_seq"', 63, true);


--
-- PostgreSQL database dump complete
--

-- \unrestrict Qtmzdydlxhh5czc9Ifs7v8VEjZFpXJBYUh3ZXqqXS6uL2j0uNH4hcl0FIqCXx1d

RESET ALL;
