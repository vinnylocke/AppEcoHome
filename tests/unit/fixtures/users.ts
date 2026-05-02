import type { UserProfile, Home, HomeMember, Location, Area } from "../../../src/types";

let _seq = 0;
const uid = (prefix: string) => `${prefix}-${++_seq}`;

export function makeHome(overrides: Partial<Home> = {}): Home {
  return {
    id: uid("home"),
    name: "Test Garden",
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

export function makeUserProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    uid: uid("user"),
    email: "tester@example.com",
    display_name: "Test User",
    home_id: uid("home"),
    ai_enabled: false,
    notification_interval_hours: 24,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

export function makeHomeMember(overrides: Partial<HomeMember> = {}): HomeMember {
  return {
    id: uid("member"),
    home_id: uid("home"),
    user_id: uid("user"),
    role: "owner",
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

export function makeLocation(overrides: Partial<Location> = {}): Location {
  return {
    id: uid("loc"),
    home_id: uid("home"),
    name: "Back Garden",
    placement: "outdoor",
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

export function makeArea(overrides: Partial<Area> = {}): Area {
  return {
    id: uid("area"),
    location_id: uid("loc"),
    name: "Raised Bed A",
    is_outside: true,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}
