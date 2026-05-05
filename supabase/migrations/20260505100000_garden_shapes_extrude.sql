alter table public.garden_shapes
  add column if not exists extrude_m  numeric(6,3),
  add column if not exists preset_id  text;

update public.garden_shapes
set extrude_m = case preset_id
  when 'raised-bed'      then 0.3
  when 'planter-box'     then 0.3
  when 'oval-bed'        then 0.3
  when 'round-planter'   then 0.3
  when 'greenhouse'      then 2.5
  when 'shed'            then 2.5
  when 'fence-panel'     then 1.2
  when 'wall'            then 1.2
  when 'gate'            then 2.0
  when 'door'            then 2.0
  when 'path'            then 0.02
  when 'tree-canopy'     then 2.0
  when 'pond'            then 0.0
  when 'garden-boundary' then 0.0
  when 'l-shape'         then 0.3
  else 0.3
end
where extrude_m is null;
