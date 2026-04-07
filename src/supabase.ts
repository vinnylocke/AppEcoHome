export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      areas: {
        Row: {
          created_at: string | null
          growing_medium: string | null
          id: string
          light_intensity_lux: number | null
          location_id: string
          medium_ph: number | null
          medium_texture: string | null
          name: string
          nutrient_source: string | null
          water_movement: string | null
        }
        Insert: {
          created_at?: string | null
          growing_medium?: string | null
          id?: string
          light_intensity_lux?: number | null
          location_id: string
          medium_ph?: number | null
          medium_texture?: string | null
          name: string
          nutrient_source?: string | null
          water_movement?: string | null
        }
        Update: {
          created_at?: string | null
          growing_medium?: string | null
          id?: string
          light_intensity_lux?: number | null
          location_id?: string
          medium_ph?: number | null
          medium_texture?: string | null
          name?: string
          nutrient_source?: string | null
          water_movement?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "areas_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_history: {
        Row: {
          home_id: string | null
          id: string
          images: string[] | null
          inventory_item_id: string | null
          plant_name: string
          result: string
          scientific_name: string | null
          timestamp: string | null
          type: string
        }
        Insert: {
          home_id?: string | null
          id?: string
          images?: string[] | null
          inventory_item_id?: string | null
          plant_name: string
          result: string
          scientific_name?: string | null
          timestamp?: string | null
          type: string
        }
        Update: {
          home_id?: string | null
          id?: string
          images?: string[] | null
          inventory_item_id?: string | null
          plant_name?: string
          result?: string
          scientific_name?: string | null
          timestamp?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_history_home_id_fkey"
            columns: ["home_id"]
            isOneToOne: false
            referencedRelation: "homes"
            referencedColumns: ["id"]
          },
        ]
      }
      guides: {
        Row: {
          category: string
          content: string
          created_at: string | null
          description: string | null
          id: string
          image_url: string | null
          tags: string[] | null
          title: string
          video_url: string | null
        }
        Insert: {
          category: string
          content: string
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          tags?: string[] | null
          title: string
          video_url?: string | null
        }
        Update: {
          category?: string
          content?: string
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          tags?: string[] | null
          title?: string
          video_url?: string | null
        }
        Relationships: []
      }
      home_members: {
        Row: {
          created_at: string | null
          home_id: string
          id: string
          role: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          home_id: string
          id?: string
          role?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          home_id?: string
          id?: string
          role?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "home_members_home_id_fkey"
            columns: ["home_id"]
            isOneToOne: false
            referencedRelation: "homes"
            referencedColumns: ["id"]
          },
        ]
      }
      homes: {
        Row: {
          address: string | null
          created_at: string | null
          id: string
          lat: number | null
          lng: number | null
          name: string
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          name: string
        }
        Update: {
          address?: string | null
          created_at?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          name?: string
        }
        Relationships: []
      }
      inventory_items: {
        Row: {
          area_id: string | null
          area_name: string | null
          created_at: string | null
          environment: string | null
          growth_state: string | null
          home_id: string | null
          id: string
          identifier: string | null
          is_established: boolean | null
          location_id: string | null
          location_name: string | null
          nickname: string | null
          plant_code: string | null
          plant_id: number | null
          plant_name: string | null
          planted_at: string | null
          species_id: number | null
          status: string | null
          yield_data: Json | null
        }
        Insert: {
          area_id?: string | null
          area_name?: string | null
          created_at?: string | null
          environment?: string | null
          growth_state?: string | null
          home_id?: string | null
          id?: string
          identifier?: string | null
          is_established?: boolean | null
          location_id?: string | null
          location_name?: string | null
          nickname?: string | null
          plant_code?: string | null
          plant_id?: number | null
          plant_name?: string | null
          planted_at?: string | null
          species_id?: number | null
          status?: string | null
          yield_data?: Json | null
        }
        Update: {
          area_id?: string | null
          area_name?: string | null
          created_at?: string | null
          environment?: string | null
          growth_state?: string | null
          home_id?: string | null
          id?: string
          identifier?: string | null
          is_established?: boolean | null
          location_id?: string | null
          location_name?: string | null
          nickname?: string | null
          plant_code?: string | null
          plant_id?: number | null
          plant_name?: string | null
          planted_at?: string | null
          species_id?: number | null
          status?: string | null
          yield_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_home"
            columns: ["home_id"]
            isOneToOne: false
            referencedRelation: "homes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_inventory_area"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_inventory_location"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_plants"
            columns: ["plant_id"]
            isOneToOne: false
            referencedRelation: "plants"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          created_at: string | null
          home_id: string | null
          id: string
          is_outside: boolean
          name: string
          placement: string
        }
        Insert: {
          created_at?: string | null
          home_id?: string | null
          id?: string
          is_outside?: boolean
          name: string
          placement?: string
        }
        Update: {
          created_at?: string | null
          home_id?: string | null
          id?: string
          is_outside?: boolean
          name?: string
          placement?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_home_id_fkey"
            columns: ["home_id"]
            isOneToOne: false
            referencedRelation: "homes"
            referencedColumns: ["id"]
          },
        ]
      }
      plant_instances: {
        Row: {
          area_id: string | null
          created_at: string | null
          home_id: string | null
          id: string
          notes: string | null
          plant_id: number | null
          planted_at: string | null
          quantity: number | null
        }
        Insert: {
          area_id?: string | null
          created_at?: string | null
          home_id?: string | null
          id?: string
          notes?: string | null
          plant_id?: number | null
          planted_at?: string | null
          quantity?: number | null
        }
        Update: {
          area_id?: string | null
          created_at?: string | null
          home_id?: string | null
          id?: string
          notes?: string | null
          plant_id?: number | null
          planted_at?: string | null
          quantity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "plant_instances_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plant_instances_home_id_fkey"
            columns: ["home_id"]
            isOneToOne: false
            referencedRelation: "homes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plant_instances_plant_id_fkey"
            columns: ["plant_id"]
            isOneToOne: false
            referencedRelation: "plants"
            referencedColumns: ["id"]
          },
        ]
      }
      plants: {
        Row: {
          attracts: Json | null
          care_level: string | null
          common_name: string
          cones: boolean | null
          created_at: string | null
          cuisine: boolean | null
          cycle: string | null
          description: string | null
          dimensions: Json | null
          drought_tolerant: boolean | null
          edible_leaf: boolean | null
          family: string | null
          flowering_season: string | null
          flowers: boolean | null
          fruits: boolean | null
          growth_rate: string | null
          hardiness_max: string | null
          hardiness_min: string | null
          harvest_season: string | null
          home_id: string | null
          id: number
          image_url: string | null
          indoor: boolean | null
          invasive: boolean | null
          is_archived: boolean | null
          is_edible: boolean | null
          is_toxic_humans: boolean | null
          is_toxic_pets: boolean | null
          leaf: boolean | null
          maintenance: string | null
          maintenance_notes: string | null
          medicinal: boolean | null
          origin: Json | null
          other_names: Json | null
          perenual_id: number | null
          pest_susceptibility: Json | null
          plant_type: string | null
          propagation: Json | null
          pruning_count: Json | null
          pruning_month: Json | null
          salt_tolerant: boolean | null
          scientific_name: Json | null
          seeds: boolean | null
          soil: Json | null
          source: string | null
          sunlight: Json | null
          thorny: boolean | null
          thumbnail_url: string | null
          tropical: boolean | null
          watering: string | null
          watering_benchmark: Json | null
          watering_max_days: number | null
          watering_min_days: number | null
        }
        Insert: {
          attracts?: Json | null
          care_level?: string | null
          common_name: string
          cones?: boolean | null
          created_at?: string | null
          cuisine?: boolean | null
          cycle?: string | null
          description?: string | null
          dimensions?: Json | null
          drought_tolerant?: boolean | null
          edible_leaf?: boolean | null
          family?: string | null
          flowering_season?: string | null
          flowers?: boolean | null
          fruits?: boolean | null
          growth_rate?: string | null
          hardiness_max?: string | null
          hardiness_min?: string | null
          harvest_season?: string | null
          home_id?: string | null
          id: number
          image_url?: string | null
          indoor?: boolean | null
          invasive?: boolean | null
          is_archived?: boolean | null
          is_edible?: boolean | null
          is_toxic_humans?: boolean | null
          is_toxic_pets?: boolean | null
          leaf?: boolean | null
          maintenance?: string | null
          maintenance_notes?: string | null
          medicinal?: boolean | null
          origin?: Json | null
          other_names?: Json | null
          perenual_id?: number | null
          pest_susceptibility?: Json | null
          plant_type?: string | null
          propagation?: Json | null
          pruning_count?: Json | null
          pruning_month?: Json | null
          salt_tolerant?: boolean | null
          scientific_name?: Json | null
          seeds?: boolean | null
          soil?: Json | null
          source?: string | null
          sunlight?: Json | null
          thorny?: boolean | null
          thumbnail_url?: string | null
          tropical?: boolean | null
          watering?: string | null
          watering_benchmark?: Json | null
          watering_max_days?: number | null
          watering_min_days?: number | null
        }
        Update: {
          attracts?: Json | null
          care_level?: string | null
          common_name?: string
          cones?: boolean | null
          created_at?: string | null
          cuisine?: boolean | null
          cycle?: string | null
          description?: string | null
          dimensions?: Json | null
          drought_tolerant?: boolean | null
          edible_leaf?: boolean | null
          family?: string | null
          flowering_season?: string | null
          flowers?: boolean | null
          fruits?: boolean | null
          growth_rate?: string | null
          hardiness_max?: string | null
          hardiness_min?: string | null
          harvest_season?: string | null
          home_id?: string | null
          id?: number
          image_url?: string | null
          indoor?: boolean | null
          invasive?: boolean | null
          is_archived?: boolean | null
          is_edible?: boolean | null
          is_toxic_humans?: boolean | null
          is_toxic_pets?: boolean | null
          leaf?: boolean | null
          maintenance?: string | null
          maintenance_notes?: string | null
          medicinal?: boolean | null
          origin?: Json | null
          other_names?: Json | null
          perenual_id?: number | null
          pest_susceptibility?: Json | null
          plant_type?: string | null
          propagation?: Json | null
          pruning_count?: Json | null
          pruning_month?: Json | null
          salt_tolerant?: boolean | null
          scientific_name?: Json | null
          seeds?: boolean | null
          soil?: Json | null
          source?: string | null
          sunlight?: Json | null
          thorny?: boolean | null
          thumbnail_url?: string | null
          tropical?: boolean | null
          watering?: string | null
          watering_benchmark?: Json | null
          watering_max_days?: number | null
          watering_min_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "plants_home_id_fkey"
            columns: ["home_id"]
            isOneToOne: false
            referencedRelation: "homes"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string | null
          description: string
          guide_id: string | null
          guide_title: string | null
          id: string
          status: string | null
          user_email: string | null
        }
        Insert: {
          created_at?: string | null
          description: string
          guide_id?: string | null
          guide_title?: string | null
          id?: string
          status?: string | null
          user_email?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string
          guide_id?: string | null
          guide_title?: string | null
          id?: string
          status?: string | null
          user_email?: string | null
        }
        Relationships: []
      }
      species_cache: {
        Row: {
          care_level: string | null
          common_name: string | null
          created_at: string | null
          cycle: string | null
          description: string | null
          flowering_season: string | null
          fruiting_season: string | null
          growth_rate: string | null
          id: string
          image_url: string | null
          pruning_month: string[] | null
          scientific_name: string[] | null
          sunlight: string[] | null
          watering_freq: string | null
        }
        Insert: {
          care_level?: string | null
          common_name?: string | null
          created_at?: string | null
          cycle?: string | null
          description?: string | null
          flowering_season?: string | null
          fruiting_season?: string | null
          growth_rate?: string | null
          id: string
          image_url?: string | null
          pruning_month?: string[] | null
          scientific_name?: string[] | null
          sunlight?: string[] | null
          watering_freq?: string | null
        }
        Update: {
          care_level?: string | null
          common_name?: string | null
          created_at?: string | null
          cycle?: string | null
          description?: string | null
          flowering_season?: string | null
          fruiting_season?: string | null
          growth_rate?: string | null
          id?: string
          image_url?: string | null
          pruning_month?: string[] | null
          scientific_name?: string[] | null
          sunlight?: string[] | null
          watering_freq?: string | null
        }
        Relationships: []
      }
      task_blueprints: {
        Row: {
          end_month: number | null
          frequency_days: number | null
          id: string
          inventory_item_id: string | null
          is_recurring: boolean | null
          last_completed_at: string | null
          priority: string | null
          start_month: number | null
          task_type: string
        }
        Insert: {
          end_month?: number | null
          frequency_days?: number | null
          id?: string
          inventory_item_id?: string | null
          is_recurring?: boolean | null
          last_completed_at?: string | null
          priority?: string | null
          start_month?: number | null
          task_type: string
        }
        Update: {
          end_month?: number | null
          frequency_days?: number | null
          id?: string
          inventory_item_id?: string | null
          is_recurring?: boolean | null
          last_completed_at?: string | null
          priority?: string | null
          start_month?: number | null
          task_type?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          completed_at: string | null
          created_at: string | null
          description: string | null
          due_date: string
          home_id: string | null
          id: string
          inventory_item_id: string | null
          is_virtual: boolean | null
          plant_id: string | null
          start_date: string | null
          status: string | null
          title: string
          type: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          due_date: string
          home_id?: string | null
          id?: string
          inventory_item_id?: string | null
          is_virtual?: boolean | null
          plant_id?: string | null
          start_date?: string | null
          status?: string | null
          title: string
          type: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string
          home_id?: string | null
          id?: string
          inventory_item_id?: string | null
          is_virtual?: boolean | null
          plant_id?: string | null
          start_date?: string | null
          status?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_home_id_fkey"
            columns: ["home_id"]
            isOneToOne: false
            referencedRelation: "homes"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          ai_enabled: boolean | null
          created_at: string | null
          display_name: string | null
          email: string
          fcm_token: string | null
          home_id: string | null
          notification_interval_hours: number | null
          uid: string
        }
        Insert: {
          ai_enabled?: boolean | null
          created_at?: string | null
          display_name?: string | null
          email: string
          fcm_token?: string | null
          home_id?: string | null
          notification_interval_hours?: number | null
          uid: string
        }
        Update: {
          ai_enabled?: boolean | null
          created_at?: string | null
          display_name?: string | null
          email?: string
          fcm_token?: string | null
          home_id?: string | null
          notification_interval_hours?: number | null
          uid?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_home_id_fkey"
            columns: ["home_id"]
            isOneToOne: false
            referencedRelation: "homes"
            referencedColumns: ["id"]
          },
        ]
      }
      weather_alerts: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          location_id: string | null
          message: string
          severity: string | null
          starts_at: string
          type: Database["public"]["Enums"]["weather_alert_type"]
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          location_id?: string | null
          message: string
          severity?: string | null
          starts_at: string
          type: Database["public"]["Enums"]["weather_alert_type"]
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          location_id?: string | null
          message?: string
          severity?: string | null
          starts_at?: string
          type?: Database["public"]["Enums"]["weather_alert_type"]
        }
        Relationships: [
          {
            foreignKeyName: "weather_alerts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      weather_snapshots: {
        Row: {
          data: Json
          home_id: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          data: Json
          home_id?: string | null
          id?: string
          updated_at?: string | null
        }
        Update: {
          data?: Json
          home_id?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "weather_snapshots_home_id_fkey"
            columns: ["home_id"]
            isOneToOne: true
            referencedRelation: "homes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      active_species_details: {
        Row: {
          care_level: string | null
          common_name: string | null
          created_at: string | null
          cycle: string | null
          description: string | null
          flowering_season: string | null
          fruiting_season: string | null
          growth_rate: string | null
          id: string | null
          image_url: string | null
          pruning_month: string[] | null
          scientific_name: string[] | null
          sunlight: string[] | null
          watering_freq: string | null
        }
        Insert: {
          care_level?: string | null
          common_name?: string | null
          created_at?: string | null
          cycle?: string | null
          description?: string | null
          flowering_season?: string | null
          fruiting_season?: string | null
          growth_rate?: string | null
          id?: string | null
          image_url?: string | null
          pruning_month?: string[] | null
          scientific_name?: string[] | null
          sunlight?: string[] | null
          watering_freq?: string | null
        }
        Update: {
          care_level?: string | null
          common_name?: string | null
          created_at?: string | null
          cycle?: string | null
          description?: string | null
          flowering_season?: string | null
          fruiting_season?: string | null
          growth_rate?: string | null
          id?: string | null
          image_url?: string | null
          pruning_month?: string[] | null
          scientific_name?: string[] | null
          sunlight?: string[] | null
          watering_freq?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      check_home_membership: {
        Args: { target_home_id: string }
        Returns: boolean
      }
      create_home_bundle: {
        Args: { home_name_input: string; user_id_input: string }
        Returns: string
      }
      create_new_home: {
        Args: { home_name: string; postcode: string }
        Returns: string
      }
      delete_home_entirely: {
        Args: { home_id_param: string }
        Returns: undefined
      }
      is_home_member: { Args: { target_home_id: string }; Returns: boolean }
      is_member_of: { Args: { h_id: string }; Returns: boolean }
      join_home_bundle: {
        Args: { target_home_id: string; target_user_id: string }
        Returns: undefined
      }
      leave_home: { Args: { home_id_param: string }; Returns: string }
      leave_home_bundle: {
        Args: { target_home_id: string; target_user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      weather_alert_type: "rain" | "snow" | "heat" | "frost" | "wind"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      weather_alert_type: ["rain", "snow", "heat", "frost", "wind"],
    },
  },
} as const

