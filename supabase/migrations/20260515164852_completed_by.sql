ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES auth.users(id);
