alter table "public"."task_blueprints" add column "is_auto_generated" boolean not null default false;

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.generate_daily_tasks()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  INSERT INTO public.tasks (
    home_id, 
    blueprint_id, 
    title, 
    description, 
    type, 
    due_date, 
    status, 
    location_id, 
    area_id, 
    inventory_item_id
  )
  SELECT
    b.home_id, 
    b.id, 
    b.title, 
    b.description, 
    b.task_type, 
    CURRENT_DATE, 
    'Pending', 
    b.location_id, 
    b.area_id, 
    b.inventory_item_id
  FROM public.task_blueprints b
  WHERE 
    b.is_recurring = true
    -- 1. Ensure the blueprint has started and hasn't expired
    AND b.start_date <= CURRENT_DATE
    AND (b.end_date IS NULL OR b.end_date >= CURRENT_DATE)
    -- 2. Mathematical check: Does today align with the frequency rhythm?
    AND (CURRENT_DATE - b.start_date) % b.frequency_days = 0
    -- 3. Safety check: Ensure we haven't already generated a task for this blueprint today
    AND NOT EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.blueprint_id = b.id AND t.due_date = CURRENT_DATE
    );
END;
$function$
;


