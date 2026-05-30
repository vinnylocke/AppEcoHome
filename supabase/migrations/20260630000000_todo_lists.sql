-- ─── To-Do Lists ─────────────────────────────────────────────────────────────
--
-- A "to-do list" is a named group of `tasks` rows that share a due_date. The
-- user creates one via the Add To-Do List modal (global date + N task lines);
-- each task line lands in `public.tasks` as a normal row with a back-link to
-- the parent list. Everything downstream (calendar, agenda, blueprints,
-- offline queue, automations) treats those rows exactly like any other task.
--
-- List "status" is derived, not stored — see the Manage modal: a list is
-- complete iff every linked task is Completed. No trigger, no drift.

CREATE TABLE IF NOT EXISTS public.todo_lists (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id     uuid NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  -- Optional. UI shows "To-do for <due_date>" when null so the create flow
  -- stays one-tap.
  name        text,
  due_date    date NOT NULL,
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.todo_lists IS
  'A user-created group of tasks sharing a due_date. Child tasks link back via tasks.todo_list_id; "status" is derived (complete iff every linked task is Completed).';

-- Newest-first listing per home is the dominant query.
CREATE INDEX IF NOT EXISTS todo_lists_home_created_idx
  ON public.todo_lists (home_id, created_at DESC);

-- Back-link from tasks → list. SET NULL so deleting a list (when the user
-- chooses "keep the tasks") leaves the tasks intact as standalone rows.
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS todo_list_id uuid REFERENCES public.todo_lists(id) ON DELETE SET NULL;

-- Partial index — only the small subset of tasks that belong to a list.
CREATE INDEX IF NOT EXISTS tasks_todo_list_idx
  ON public.tasks (todo_list_id)
  WHERE todo_list_id IS NOT NULL;

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.todo_lists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "todo_lists members read"   ON public.todo_lists;
DROP POLICY IF EXISTS "todo_lists members insert" ON public.todo_lists;
DROP POLICY IF EXISTS "todo_lists members update" ON public.todo_lists;
DROP POLICY IF EXISTS "todo_lists members delete" ON public.todo_lists;

CREATE POLICY "todo_lists members read"
  ON public.todo_lists FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.home_members hm
      WHERE hm.home_id = todo_lists.home_id AND hm.user_id = auth.uid()
    )
  );

CREATE POLICY "todo_lists members insert"
  ON public.todo_lists FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.home_members hm
      WHERE hm.home_id = todo_lists.home_id AND hm.user_id = auth.uid()
    )
  );

CREATE POLICY "todo_lists members update"
  ON public.todo_lists FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.home_members hm
      WHERE hm.home_id = todo_lists.home_id AND hm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.home_members hm
      WHERE hm.home_id = todo_lists.home_id AND hm.user_id = auth.uid()
    )
  );

CREATE POLICY "todo_lists members delete"
  ON public.todo_lists FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.home_members hm
      WHERE hm.home_id = todo_lists.home_id AND hm.user_id = auth.uid()
    )
  );

-- ─── Data API grants ────────────────────────────────────────────────────────
-- Required because Supabase stops auto-exposing newly-created public tables
-- to PostgREST from 30 Oct 2026 (see CLAUDE.md).
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.todo_lists TO authenticated;
