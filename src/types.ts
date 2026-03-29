export interface UserProfile {
  uid: string;
  email: string;
  display_name: string | null;
  home_id: string | null;
  ai_enabled: boolean;
  notification_interval_hours: number;
  created_at: string;
}

export interface Home {
  id: string;
  name: string;
  created_at: string;
  // Note: We don't need 'created_by' here because
  // permissions are handled in the home_members table.
}

export interface HomeMember {
  id: string;
  home_id: string;
  user_id: string;
  role: "owner" | "member";
  created_at: string;
}
export interface Location {
  id: string;
  home_id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  created_at: string;
}

export interface Area {
  id: string;
  location_id: string;
  name: string;
  is_outside: boolean;
  created_at: string;
}
