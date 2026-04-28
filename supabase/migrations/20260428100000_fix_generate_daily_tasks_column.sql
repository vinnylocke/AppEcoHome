-- Fix generate_daily_tasks: task_blueprints uses inventory_item_ids (jsonb array),
-- not inventory_item_id. Pass the column through directly instead of wrapping it.
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
    inventory_item_ids
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
    b.inventory_item_ids
  FROM public.task_blueprints b
  WHERE
    b.is_recurring = true
    AND b.start_date <= CURRENT_DATE
    AND (b.end_date IS NULL OR b.end_date >= CURRENT_DATE)
    AND (CURRENT_DATE - b.start_date) % b.frequency_days = 0
    AND NOT EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.blueprint_id = b.id AND t.due_date = CURRENT_DATE
    );
END;
$function$;
