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
  placement: string;
  created_at: string;
}

export interface Area {
  id: string;
  location_id: string;
  name: string;
  is_outside: boolean;
  created_at: string;
}
