-- Supabase SQL Script for EcoHome

-- 1. Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Create tables

-- User Profiles
CREATE TABLE IF NOT EXISTS user_profiles (
  uid UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  mode TEXT CHECK (mode IN ('Novice', 'Expert')) DEFAULT 'Novice',
  onboarded BOOLEAN DEFAULT FALSE,
  home_id UUID,
  fcm_token TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Homes
CREATE TABLE IF NOT EXISTS homes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  member_ids UUID[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Plants (Global Library)
CREATE TABLE IF NOT EXISTS plants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  scientific_name TEXT,
  care_guide JSONB DEFAULT '{}'::jsonb,
  is_global BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Locations
CREATE TABLE IF NOT EXISTS locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  home_id UUID REFERENCES homes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  areas JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Inventory Items
CREATE TABLE IF NOT EXISTS inventory_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  home_id UUID REFERENCES homes(id) ON DELETE CASCADE,
  plant_id UUID REFERENCES plants(id),
  plant_name TEXT,
  status TEXT CHECK (status IN ('In Shed', 'Planted')) DEFAULT 'In Shed',
  location_id UUID REFERENCES locations(id),
  location_name TEXT,
  area_id TEXT,
  area_name TEXT,
  planted_at TIMESTAMP WITH TIME ZONE,
  yield_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Garden Tasks
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  home_id UUID REFERENCES homes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT CHECK (status IN ('Pending', 'Completed', 'Postponed - Rain Expected')) DEFAULT 'Pending',
  due_date TIMESTAMP WITH TIME ZONE NOT NULL,
  type TEXT CHECK (type IN ('Watering', 'Feeding', 'Pruning', 'Harvesting')) NOT NULL,
  plant_id UUID REFERENCES plants(id),
  inventory_item_id UUID REFERENCES inventory_items(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Plant Doctor History
CREATE TABLE IF NOT EXISTS doctor_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  home_id UUID REFERENCES homes(id) ON DELETE CASCADE,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  type TEXT CHECK (type IN ('identify', 'diagnose')) NOT NULL,
  plant_name TEXT NOT NULL,
  scientific_name TEXT,
  result TEXT NOT NULL,
  images TEXT[] DEFAULT '{}',
  inventory_item_id UUID REFERENCES inventory_items(id)
);

-- Garden Guides (Global)
CREATE TABLE IF NOT EXISTS guides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  content TEXT NOT NULL,
  video_url TEXT,
  category TEXT CHECK (category IN ('Propagation', 'Pruning', 'Planting', 'Harvesting', 'General')) NOT NULL,
  tags TEXT[] DEFAULT '{}',
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Reports
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  guide_id UUID,
  guide_title TEXT,
  description TEXT NOT NULL,
  user_email TEXT,
  status TEXT DEFAULT 'new',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE homes ENABLE ROW LEVEL SECURITY;
ALTER TABLE plants ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctor_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE guides ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- 4. Create Policies

-- User Profiles: Users can read and update their own profile
CREATE POLICY "Users can view own profile" ON user_profiles FOR SELECT USING (auth.uid() = uid);
CREATE POLICY "Users can update own profile" ON user_profiles FOR UPDATE USING (auth.uid() = uid);
CREATE POLICY "Users can insert own profile" ON user_profiles FOR INSERT WITH CHECK (auth.uid() = uid);

-- Homes: Members of a home can read and update it
CREATE POLICY "Members can view home" ON homes FOR SELECT USING (auth.uid() = ANY(member_ids));
CREATE POLICY "Members can update home" ON homes FOR UPDATE USING (auth.uid() = ANY(member_ids));

-- Plants: Everyone can read global plants
CREATE POLICY "Everyone can view plants" ON plants FOR SELECT USING (TRUE);
CREATE POLICY "Authenticated users can insert plants" ON plants FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Locations: Members of the associated home can read/write
CREATE POLICY "Home members can view locations" ON locations FOR SELECT USING (
  EXISTS (SELECT 1 FROM homes WHERE homes.id = locations.home_id AND auth.uid() = ANY(homes.member_ids))
);
CREATE POLICY "Home members can insert locations" ON locations FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM homes WHERE homes.id = locations.home_id AND auth.uid() = ANY(homes.member_ids))
);
CREATE POLICY "Home members can update locations" ON locations FOR UPDATE USING (
  EXISTS (SELECT 1 FROM homes WHERE homes.id = locations.home_id AND auth.uid() = ANY(homes.member_ids))
);

-- Inventory Items: Members of the associated home can read/write
CREATE POLICY "Home members can view inventory" ON inventory_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM homes WHERE homes.id = inventory_items.home_id AND auth.uid() = ANY(homes.member_ids))
);
CREATE POLICY "Home members can insert inventory" ON inventory_items FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM homes WHERE homes.id = inventory_items.home_id AND auth.uid() = ANY(homes.member_ids))
);
CREATE POLICY "Home members can update inventory" ON inventory_items FOR UPDATE USING (
  EXISTS (SELECT 1 FROM homes WHERE homes.id = inventory_items.home_id AND auth.uid() = ANY(homes.member_ids))
);

-- Tasks: Members of the associated home can read/write
CREATE POLICY "Home members can view tasks" ON tasks FOR SELECT USING (
  EXISTS (SELECT 1 FROM homes WHERE homes.id = tasks.home_id AND auth.uid() = ANY(homes.member_ids))
);
CREATE POLICY "Home members can insert tasks" ON tasks FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM homes WHERE homes.id = tasks.home_id AND auth.uid() = ANY(homes.member_ids))
);
CREATE POLICY "Home members can update tasks" ON tasks FOR UPDATE USING (
  EXISTS (SELECT 1 FROM homes WHERE homes.id = tasks.home_id AND auth.uid() = ANY(homes.member_ids))
);

-- Doctor History: Members of the associated home can read/write
CREATE POLICY "Home members can view doctor history" ON doctor_history FOR SELECT USING (
  EXISTS (SELECT 1 FROM homes WHERE homes.id = doctor_history.home_id AND auth.uid() = ANY(homes.member_ids))
);
CREATE POLICY "Home members can insert doctor history" ON doctor_history FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM homes WHERE homes.id = doctor_history.home_id AND auth.uid() = ANY(homes.member_ids))
);

-- Guides: Everyone can read global guides
CREATE POLICY "Everyone can view guides" ON guides FOR SELECT USING (TRUE);

-- Reports: Authenticated users can insert reports
CREATE POLICY "Authenticated users can insert reports" ON reports FOR INSERT WITH CHECK (auth.role() = 'authenticated');
