export type Role = 'owner' | 'admin' | 'member' | 'viewer';

export type PermissionKey =
  | 'shed.add' | 'shed.edit' | 'shed.delete'
  | 'locations.create' | 'locations.edit' | 'locations.delete'
  | 'areas.create' | 'areas.edit' | 'areas.delete'
  | 'tasks.create_home' | 'tasks.create_personal'
  | 'tasks.edit_own' | 'tasks.edit_any'
  | 'tasks.delete_own' | 'tasks.delete_any'
  | 'tasks.view_home' | 'tasks.view_members'
  | 'ailments.add' | 'ailments.edit' | 'ailments.delete'
  | 'plans.create' | 'plans.edit' | 'plans.delete'
  | 'layout.edit'
  | 'shopping.create_list' | 'shopping.add_items' | 'shopping.edit_items'
  | 'shopping.delete_items' | 'shopping.delete_list'
  | 'members.manage'
  | 'integrations.view'
  | 'integrations.control'
  | 'integrations.manage';

export type PermissionSet = Record<PermissionKey, boolean>;

const ALL_OFF: PermissionSet = {
  'shed.add': false, 'shed.edit': false, 'shed.delete': false,
  'locations.create': false, 'locations.edit': false, 'locations.delete': false,
  'areas.create': false, 'areas.edit': false, 'areas.delete': false,
  'tasks.create_home': false, 'tasks.create_personal': false,
  'tasks.edit_own': false, 'tasks.edit_any': false,
  'tasks.delete_own': false, 'tasks.delete_any': false,
  'tasks.view_home': false, 'tasks.view_members': false,
  'ailments.add': false, 'ailments.edit': false, 'ailments.delete': false,
  'plans.create': false, 'plans.edit': false, 'plans.delete': false,
  'layout.edit': false,
  'shopping.create_list': false, 'shopping.add_items': false,
  'shopping.edit_items': false, 'shopping.delete_items': false, 'shopping.delete_list': false,
  'members.manage': false,
  'integrations.view': false,
  'integrations.control': false,
  'integrations.manage': false,
};

const ALL_ON: PermissionSet = Object.fromEntries(
  Object.keys(ALL_OFF).map(k => [k, true])
) as PermissionSet;

export const ROLE_DEFAULTS: Record<Role, PermissionSet> = {
  owner: ALL_ON,
  admin: ALL_ON,
  member: {
    ...ALL_OFF,
    'shed.add': true, 'shed.edit': true,
    'locations.create': true, 'locations.edit': true,
    'areas.create': true, 'areas.edit': true,
    'tasks.create_home': true, 'tasks.create_personal': true,
    'tasks.edit_own': true, 'tasks.delete_own': true,
    'tasks.view_home': true, 'tasks.view_members': true,
    'ailments.add': true, 'ailments.edit': true,
    'plans.create': true, 'plans.edit': true,
    'layout.edit': true,
    'shopping.create_list': true, 'shopping.add_items': true,
    'shopping.edit_items': true, 'shopping.delete_items': true,
    'integrations.view': true,
  },
  viewer: {
    ...ALL_OFF,
    'tasks.create_personal': true,
    'tasks.edit_own': true, 'tasks.delete_own': true,
    'tasks.view_home': true,
    'integrations.view': true,
  },
};

export function resolvePermissions(
  role: Role,
  overrides: Partial<PermissionSet>
): PermissionSet {
  if (role === 'owner') return ALL_ON;
  return { ...ROLE_DEFAULTS[role], ...overrides } as PermissionSet;
}

export function hasPermission(permissions: PermissionSet, key: PermissionKey): boolean {
  return permissions[key] === true;
}
