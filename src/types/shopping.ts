export interface ShoppingList {
  id: string;
  home_id: string;
  name: string;
  status: "active" | "completed";
  created_at: string;
  updated_at: string;
}

export interface ShoppingListItem {
  id: string;
  list_id: string;
  home_id: string;
  item_type: "plant" | "product";
  name: string;
  is_checked: boolean;
  perenual_id?: number | null;
  thumbnail_url?: string | null;
  source?: "shed" | "perenual" | "ai" | null;
  already_in_shed?: boolean | null;
  category?: string | null;
  doctor_session_id?: string | null;
  created_at: string;
}
