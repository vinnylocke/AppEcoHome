


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."weather_alert_type" AS ENUM (
    'rain',
    'snow',
    'heat',
    'frost',
    'wind'
);


ALTER TYPE "public"."weather_alert_type" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_home_membership"("target_home_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.home_members 
    WHERE home_id = target_home_id 
    AND user_id = auth.uid()
  );
END;
$$;


ALTER FUNCTION "public"."check_home_membership"("target_home_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_home_bundle"("user_id_input" "uuid", "home_name_input" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    new_home_id UUID;
BEGIN
    -- 1. Create the Home
    INSERT INTO public.homes (name)
    VALUES (home_name_input)
    RETURNING id INTO new_home_id;

    -- 2. Add the creator as the 'owner'
    INSERT INTO public.home_members (home_id, user_id, role)
    VALUES (new_home_id, user_id_input, 'owner');

    -- 3. UPDATE THE PROFILE'S ACTIVE HOME (This was missing!)
    UPDATE public.user_profiles
    SET home_id = new_home_id, onboarded = true
    WHERE uid = user_id_input;

    RETURN new_home_id;
END;
$$;


ALTER FUNCTION "public"."create_home_bundle"("user_id_input" "uuid", "home_name_input" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_new_home"("home_name" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  new_home_id uuid;
BEGIN
  -- 1. Create the home
  INSERT INTO homes (name)
  VALUES (home_name)
  RETURNING id INTO new_home_id;

  -- 2. Create the membership (current user is auth.uid())
  INSERT INTO home_members (home_id, user_id, role)
  VALUES (new_home_id, auth.uid(), 'owner');

  -- 3. Update the user's active home profile
  UPDATE user_profiles
  SET home_id = new_home_id
  WHERE uid = auth.uid();

  RETURN new_home_id;
END;
$$;


ALTER FUNCTION "public"."create_new_home"("home_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_home_entirely"("home_id_param" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Security check: Ensure the caller is an owner
  IF EXISTS (
    SELECT 1 FROM home_members 
    WHERE home_id = home_id_param AND user_id = auth.uid() AND role = 'owner'
  ) THEN
    DELETE FROM homes WHERE id = home_id_param;
    
    -- Clear anyone's active home who was in that home
    UPDATE user_profiles SET home_id = NULL WHERE home_id = home_id_param;
  ELSE
    RAISE EXCEPTION 'Only owners can delete a home.';
  END IF;
END;
$$;


ALTER FUNCTION "public"."delete_home_entirely"("home_id_param" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- We are ONLY inserting uid and email now. 
  -- No 'mode', no 'onboarded'.
  INSERT INTO public.user_profiles (uid, email)
  VALUES (new.id, new.email);
  
  RETURN new;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_home_member"("target_home_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.home_members 
    WHERE home_id = target_home_id AND user_id = auth.uid()
  );
END;
$$;


ALTER FUNCTION "public"."is_home_member"("target_home_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_member_of"("h_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.home_members
    WHERE home_id = h_id 
    AND user_id = (SELECT auth.uid())
  );
END;
$$;


ALTER FUNCTION "public"."is_member_of"("h_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."join_home_bundle"("target_home_id" "uuid", "target_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    -- Add to membership
    INSERT INTO public.home_members (home_id, user_id, role)
    VALUES (target_home_id, target_user_id, 'member')
    ON CONFLICT (home_id, user_id) DO NOTHING; -- Prevent double-joining

    -- Set as active home in profile
    UPDATE public.user_profiles
    SET home_id = target_home_id, onboarded = true
    WHERE uid = target_user_id;
END;
$$;


ALTER FUNCTION "public"."join_home_bundle"("target_home_id" "uuid", "target_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."leave_home"("home_id_param" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  leaving_user_role text;
  remaining_member_count int;
  next_owner_id uuid;
  fallback_home_id uuid;
BEGIN
  -- 1. Capture the role before we delete the membership
  SELECT role INTO leaving_user_role 
  FROM home_members 
  WHERE home_id = home_id_param AND user_id = auth.uid();

  -- 2. Delete the membership record first
  DELETE FROM home_members 
  WHERE home_id = home_id_param AND user_id = auth.uid();

  -- 3. Check how many people are left now
  SELECT count(*) INTO remaining_member_count 
  FROM home_members 
  WHERE home_id = home_id_param;

  -- 4. DECISION TREE
  IF remaining_member_count = 0 THEN
    -- Nobody is left. Delete the home.
    DELETE FROM homes WHERE id = home_id_param;
  ELSIF leaving_user_role = 'owner' THEN
    -- People are left, but the owner just walked out. 
    -- We MUST promote the next person in line to owner.
    SELECT user_id INTO next_owner_id 
    FROM home_members 
    WHERE home_id = home_id_param 
    ORDER BY created_at ASC LIMIT 1;

    UPDATE home_members SET role = 'owner' WHERE home_id = home_id_param AND user_id = next_owner_id;
  END IF;

  -- 5. SMART SWITCH: Find the next available home for the user's profile
  SELECT home_id INTO fallback_home_id 
  FROM home_members 
  WHERE user_id = auth.uid() 
  LIMIT 1;

  UPDATE user_profiles 
  SET home_id = fallback_home_id 
  WHERE uid = auth.uid();

  RETURN fallback_home_id;
END;
$$;


ALTER FUNCTION "public"."leave_home"("home_id_param" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."leave_home_bundle"("target_home_id" "uuid", "target_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    -- Remove from membership
    DELETE FROM public.home_members 
    WHERE home_id = target_home_id AND user_id = target_user_id;

    -- Clear active home if it was this one
    UPDATE public.user_profiles
    SET home_id = NULL
    WHERE uid = target_user_id AND home_id = target_home_id;
END;
$$;


ALTER FUNCTION "public"."leave_home_bundle"("target_home_id" "uuid", "target_user_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."species_cache" (
    "id" "text" NOT NULL,
    "common_name" "text",
    "scientific_name" "text"[],
    "image_url" "text",
    "description" "text",
    "watering_freq" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "sunlight" "text"[],
    "cycle" "text",
    "care_level" "text",
    "pruning_month" "text"[],
    "flowering_season" "text",
    "fruiting_season" "text",
    "growth_rate" "text"
);


ALTER TABLE "public"."species_cache" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."active_species_details" WITH ("security_invoker"='true') AS
 SELECT "id",
    "common_name",
    "scientific_name",
    "image_url",
    "description",
    "watering_freq",
    "created_at",
    "sunlight",
    "cycle",
    "care_level",
    "pruning_month",
    "flowering_season",
    "fruiting_season",
    "growth_rate"
   FROM "public"."species_cache";


ALTER VIEW "public"."active_species_details" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."areas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "location_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "is_outside" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."areas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."doctor_history" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "home_id" "uuid",
    "timestamp" timestamp with time zone DEFAULT "now"(),
    "type" "text" NOT NULL,
    "plant_name" "text" NOT NULL,
    "scientific_name" "text",
    "result" "text" NOT NULL,
    "images" "text"[] DEFAULT '{}'::"text"[],
    "inventory_item_id" "uuid",
    CONSTRAINT "doctor_history_type_check" CHECK (("type" = ANY (ARRAY['identify'::"text", 'diagnose'::"text"])))
);


ALTER TABLE "public"."doctor_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."guides" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "content" "text" NOT NULL,
    "video_url" "text",
    "category" "text" NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "image_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "guides_category_check" CHECK (("category" = ANY (ARRAY['Propagation'::"text", 'Pruning'::"text", 'Planting'::"text", 'Harvesting'::"text", 'General'::"text"])))
);


ALTER TABLE "public"."guides" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."home_members" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "home_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."home_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."homes" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "address" "text",
    "lat" double precision,
    "lng" double precision
);


ALTER TABLE "public"."homes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_items" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "home_id" "uuid",
    "plant_name" "text",
    "status" "text" DEFAULT 'In Shed'::"text",
    "location_id" "text",
    "location_name" "text",
    "area_id" "text",
    "area_name" "text",
    "planted_at" timestamp with time zone,
    "yield_data" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "environment" "text" DEFAULT 'Outdoors'::"text",
    "is_established" boolean DEFAULT false,
    "plant_code" "text",
    "plant_id" "text",
    "nickname" "text",
    "species_id" integer,
    "identifier" "text",
    CONSTRAINT "inventory_items_status_check" CHECK (("status" = ANY (ARRAY['In Shed'::"text", 'Planted'::"text"])))
);


ALTER TABLE "public"."inventory_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."locations" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "home_id" "uuid",
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "placement" "text" DEFAULT 'Outside'::"text" NOT NULL
);


ALTER TABLE "public"."locations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plants" (
    "id" integer NOT NULL,
    "common_name" "text" NOT NULL,
    "scientific_name" "jsonb" DEFAULT '[]'::"jsonb",
    "other_names" "jsonb" DEFAULT '[]'::"jsonb",
    "family" "text",
    "plant_type" "text",
    "cycle" "text",
    "image_url" "text",
    "thumbnail_url" "text",
    "watering" "text",
    "watering_benchmark" "jsonb",
    "sunlight" "jsonb" DEFAULT '[]'::"jsonb",
    "care_level" "text",
    "hardiness_min" "text",
    "hardiness_max" "text",
    "is_edible" boolean DEFAULT false,
    "is_toxic_pets" boolean DEFAULT false,
    "is_toxic_humans" boolean DEFAULT false,
    "attracts" "jsonb" DEFAULT '[]'::"jsonb",
    "description" "text",
    "maintenance_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."plants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reports" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "guide_id" "uuid",
    "guide_title" "text",
    "description" "text" NOT NULL,
    "user_email" "text",
    "status" "text" DEFAULT 'new'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_blueprints" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "inventory_item_id" "uuid",
    "task_type" "text" NOT NULL,
    "frequency_days" integer,
    "start_month" integer,
    "end_month" integer,
    "is_recurring" boolean DEFAULT true,
    "priority" "text" DEFAULT 'Medium'::"text",
    "last_completed_at" timestamp with time zone
);


ALTER TABLE "public"."task_blueprints" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tasks" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "home_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'Pending'::"text",
    "due_date" timestamp with time zone NOT NULL,
    "type" "text" NOT NULL,
    "plant_id" "uuid",
    "inventory_item_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone,
    "is_virtual" boolean DEFAULT false,
    "start_date" timestamp with time zone,
    CONSTRAINT "tasks_status_check" CHECK (("status" = ANY (ARRAY['Pending'::"text", 'Completed'::"text", 'Postponed - Rain Expected'::"text"]))),
    CONSTRAINT "tasks_type_check" CHECK (("type" = ANY (ARRAY['Watering'::"text", 'Feeding'::"text", 'Pruning'::"text", 'Harvesting'::"text"])))
);


ALTER TABLE "public"."tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_profiles" (
    "uid" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "display_name" "text",
    "fcm_token" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "home_id" "uuid",
    "notification_interval_hours" integer DEFAULT 8,
    "ai_enabled" boolean DEFAULT true
);


ALTER TABLE "public"."user_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."weather_alerts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "location_id" "uuid",
    "type" "public"."weather_alert_type" NOT NULL,
    "message" "text" NOT NULL,
    "severity" "text" DEFAULT 'info'::"text",
    "starts_at" timestamp with time zone NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."weather_alerts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."weather_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "home_id" "uuid",
    "data" "jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."weather_snapshots" OWNER TO "postgres";


ALTER TABLE ONLY "public"."areas"
    ADD CONSTRAINT "areas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."doctor_history"
    ADD CONSTRAINT "doctor_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."guides"
    ADD CONSTRAINT "guides_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."home_members"
    ADD CONSTRAINT "home_members_home_id_user_id_key" UNIQUE ("home_id", "user_id");



ALTER TABLE ONLY "public"."home_members"
    ADD CONSTRAINT "home_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."homes"
    ADD CONSTRAINT "homes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plants"
    ADD CONSTRAINT "plants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."species_cache"
    ADD CONSTRAINT "species_cache_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_blueprints"
    ADD CONSTRAINT "task_blueprints_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."weather_snapshots"
    ADD CONSTRAINT "unique_home_weather" UNIQUE ("home_id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("uid");



ALTER TABLE ONLY "public"."weather_alerts"
    ADD CONSTRAINT "weather_alerts_location_id_type_key" UNIQUE ("location_id", "type");



ALTER TABLE ONLY "public"."weather_alerts"
    ADD CONSTRAINT "weather_alerts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."weather_snapshots"
    ADD CONSTRAINT "weather_snapshots_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_weather_home" ON "public"."weather_snapshots" USING "btree" ("home_id");



ALTER TABLE ONLY "public"."areas"
    ADD CONSTRAINT "areas_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."doctor_history"
    ADD CONSTRAINT "doctor_history_home_id_fkey" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."doctor_history"
    ADD CONSTRAINT "doctor_history_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "fk_home" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "fk_species_cache" FOREIGN KEY ("plant_id") REFERENCES "public"."species_cache"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."home_members"
    ADD CONSTRAINT "home_members_home_id_fkey" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."home_members"
    ADD CONSTRAINT "home_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_home_id_fkey" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_blueprints"
    ADD CONSTRAINT "task_blueprints_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_home_id_fkey" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_home_id_fkey" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_uid_fkey" FOREIGN KEY ("uid") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."weather_alerts"
    ADD CONSTRAINT "weather_alerts_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."weather_snapshots"
    ADD CONSTRAINT "weather_snapshots_home_id_fkey" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE CASCADE;



CREATE POLICY "Allow authenticated users to insert plants" ON "public"."plants" FOR INSERT WITH CHECK (true);



CREATE POLICY "Allow authenticated users to update plants" ON "public"."plants" FOR UPDATE USING (true);



CREATE POLICY "Allow public read access on species_cache" ON "public"."species_cache" FOR SELECT USING (true);



CREATE POLICY "Allow public read access to global plants" ON "public"."plants" FOR SELECT USING (true);



CREATE POLICY "Home members can delete locations" ON "public"."locations" FOR DELETE TO "authenticated" USING ("public"."is_home_member"("home_id"));



CREATE POLICY "Home members can delete tasks" ON "public"."tasks" FOR DELETE TO "authenticated" USING ("public"."is_home_member"("home_id"));



CREATE POLICY "Home members can insert locations" ON "public"."locations" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_home_member"("home_id"));



CREATE POLICY "Home members can insert tasks" ON "public"."tasks" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_home_member"("home_id"));



CREATE POLICY "Home members can update locations" ON "public"."locations" FOR UPDATE TO "authenticated" USING ("public"."is_home_member"("home_id"));



CREATE POLICY "Home members can update tasks" ON "public"."tasks" FOR UPDATE TO "authenticated" USING ("public"."is_home_member"("home_id"));



CREATE POLICY "Home members can view locations" ON "public"."locations" FOR SELECT USING ("public"."is_home_member"("home_id"));



CREATE POLICY "Home members can view tasks" ON "public"."tasks" FOR SELECT USING ("public"."is_home_member"("home_id"));



CREATE POLICY "Manage species cache" ON "public"."species_cache" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Users can create homes" ON "public"."homes" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Users can delete areas" ON "public"."areas" FOR DELETE USING (("location_id" IN ( SELECT "locations"."id"
   FROM "public"."locations")));



CREATE POLICY "Users can delete locations" ON "public"."locations" FOR DELETE USING (("home_id" IN ( SELECT "home_members"."home_id"
   FROM "public"."home_members"
  WHERE ("home_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can insert areas" ON "public"."areas" FOR INSERT WITH CHECK (("location_id" IN ( SELECT "locations"."id"
   FROM "public"."locations")));



CREATE POLICY "Users can join/create memberships" ON "public"."home_members" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own blueprints" ON "public"."task_blueprints" TO "authenticated" USING (("inventory_item_id" IN ( SELECT "inventory_items"."id"
   FROM "public"."inventory_items"
  WHERE ("inventory_items"."home_id" IN ( SELECT "user_profiles"."home_id"
           FROM "public"."user_profiles"
          WHERE ("user_profiles"."uid" = "auth"."uid"()))))));



CREATE POLICY "Users can update areas" ON "public"."areas" FOR UPDATE USING (("location_id" IN ( SELECT "locations"."id"
   FROM "public"."locations")));



CREATE POLICY "Users can update locations" ON "public"."locations" FOR UPDATE USING (("home_id" IN ( SELECT "home_members"."home_id"
   FROM "public"."home_members"
  WHERE ("home_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can update own profile" ON "public"."user_profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "uid")) WITH CHECK (("auth"."uid"() = "uid"));



CREATE POLICY "Users can view alerts for their locations" ON "public"."weather_alerts" FOR SELECT TO "authenticated" USING (("location_id" IN ( SELECT "locations"."id"
   FROM "public"."locations"
  WHERE ("locations"."home_id" IN ( SELECT "user_profiles"."home_id"
           FROM "public"."user_profiles"
          WHERE ("user_profiles"."uid" = "auth"."uid"()))))));



CREATE POLICY "Users can view areas in their locations" ON "public"."areas" FOR SELECT USING (("location_id" IN ( SELECT "locations"."id"
   FROM "public"."locations")));



CREATE POLICY "Users can view homes they are members of" ON "public"."homes" FOR SELECT USING (("id" IN ( SELECT "home_members"."home_id"
   FROM "public"."home_members"
  WHERE ("home_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view own profile" ON "public"."user_profiles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "uid"));



CREATE POLICY "Users can view their own memberships" ON "public"."home_members" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view weather for their joined homes" ON "public"."weather_snapshots" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."home_members"
  WHERE (("home_members"."home_id" = "weather_snapshots"."home_id") AND ("home_members"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."areas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "authenticated_user_access" ON "public"."inventory_items" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."doctor_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."guides" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."home_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."homes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "homes_select_policy" ON "public"."homes" FOR SELECT TO "authenticated" USING ("public"."is_member_of"("id"));



ALTER TABLE "public"."inventory_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."locations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "members_group_select" ON "public"."home_members" FOR SELECT TO "authenticated" USING ("public"."is_member_of"("home_id"));



CREATE POLICY "members_self_select" ON "public"."home_members" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."plants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."species_cache" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."task_blueprints" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."weather_alerts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."weather_snapshots" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."home_members";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."homes";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."user_profiles";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

















































































































































































GRANT ALL ON FUNCTION "public"."check_home_membership"("target_home_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."check_home_membership"("target_home_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_home_membership"("target_home_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_home_bundle"("user_id_input" "uuid", "home_name_input" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_home_bundle"("user_id_input" "uuid", "home_name_input" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_home_bundle"("user_id_input" "uuid", "home_name_input" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_new_home"("home_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_new_home"("home_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_new_home"("home_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_home_entirely"("home_id_param" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_home_entirely"("home_id_param" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_home_entirely"("home_id_param" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_home_member"("target_home_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_home_member"("target_home_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_home_member"("target_home_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_member_of"("h_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_member_of"("h_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_member_of"("h_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."join_home_bundle"("target_home_id" "uuid", "target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."join_home_bundle"("target_home_id" "uuid", "target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."join_home_bundle"("target_home_id" "uuid", "target_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."leave_home"("home_id_param" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."leave_home"("home_id_param" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."leave_home"("home_id_param" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."leave_home_bundle"("target_home_id" "uuid", "target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."leave_home_bundle"("target_home_id" "uuid", "target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."leave_home_bundle"("target_home_id" "uuid", "target_user_id" "uuid") TO "service_role";
























GRANT ALL ON TABLE "public"."species_cache" TO "anon";
GRANT ALL ON TABLE "public"."species_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."species_cache" TO "service_role";



GRANT ALL ON TABLE "public"."active_species_details" TO "anon";
GRANT ALL ON TABLE "public"."active_species_details" TO "authenticated";
GRANT ALL ON TABLE "public"."active_species_details" TO "service_role";



GRANT ALL ON TABLE "public"."areas" TO "anon";
GRANT ALL ON TABLE "public"."areas" TO "authenticated";
GRANT ALL ON TABLE "public"."areas" TO "service_role";



GRANT ALL ON TABLE "public"."doctor_history" TO "anon";
GRANT ALL ON TABLE "public"."doctor_history" TO "authenticated";
GRANT ALL ON TABLE "public"."doctor_history" TO "service_role";



GRANT ALL ON TABLE "public"."guides" TO "anon";
GRANT ALL ON TABLE "public"."guides" TO "authenticated";
GRANT ALL ON TABLE "public"."guides" TO "service_role";



GRANT ALL ON TABLE "public"."home_members" TO "anon";
GRANT ALL ON TABLE "public"."home_members" TO "authenticated";
GRANT ALL ON TABLE "public"."home_members" TO "service_role";



GRANT ALL ON TABLE "public"."homes" TO "anon";
GRANT ALL ON TABLE "public"."homes" TO "authenticated";
GRANT ALL ON TABLE "public"."homes" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_items" TO "anon";
GRANT ALL ON TABLE "public"."inventory_items" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_items" TO "service_role";



GRANT ALL ON TABLE "public"."locations" TO "anon";
GRANT ALL ON TABLE "public"."locations" TO "authenticated";
GRANT ALL ON TABLE "public"."locations" TO "service_role";



GRANT ALL ON TABLE "public"."plants" TO "anon";
GRANT ALL ON TABLE "public"."plants" TO "authenticated";
GRANT ALL ON TABLE "public"."plants" TO "service_role";



GRANT ALL ON TABLE "public"."reports" TO "anon";
GRANT ALL ON TABLE "public"."reports" TO "authenticated";
GRANT ALL ON TABLE "public"."reports" TO "service_role";



GRANT ALL ON TABLE "public"."task_blueprints" TO "anon";
GRANT ALL ON TABLE "public"."task_blueprints" TO "authenticated";
GRANT ALL ON TABLE "public"."task_blueprints" TO "service_role";



GRANT ALL ON TABLE "public"."tasks" TO "anon";
GRANT ALL ON TABLE "public"."tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."tasks" TO "service_role";



GRANT ALL ON TABLE "public"."user_profiles" TO "anon";
GRANT ALL ON TABLE "public"."user_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."weather_alerts" TO "anon";
GRANT ALL ON TABLE "public"."weather_alerts" TO "authenticated";
GRANT ALL ON TABLE "public"."weather_alerts" TO "service_role";



GRANT ALL ON TABLE "public"."weather_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."weather_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."weather_snapshots" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































drop extension if exists "pg_net";

create extension if not exists "pg_net" with schema "public";

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();



