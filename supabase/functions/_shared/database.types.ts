export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
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
      account_deletion_attempts: {
        Row: {
          attempted_at: string
          id: string
          ip_address: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          attempted_at?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          attempted_at?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      account_deletion_jobs: {
        Row: {
          attempts: number
          completed_at: string | null
          created_at: string | null
          dead_lettered_at: string | null
          last_error: string | null
          last_error_at: string | null
          last_error_details: Json | null
          max_attempts: number
          next_run_at: string | null
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          created_at?: string | null
          dead_lettered_at?: string | null
          last_error?: string | null
          last_error_at?: string | null
          last_error_details?: Json | null
          max_attempts?: number
          next_run_at?: string | null
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          created_at?: string | null
          dead_lettered_at?: string | null
          last_error?: string | null
          last_error_at?: string | null
          last_error_details?: Json | null
          max_attempts?: number
          next_run_at?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      admin_audit_log: {
        Row: {
          action: string
          admin_user_id: string
          created_at: string | null
          details: Json | null
          id: string
          ip_address: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          admin_user_id: string
          created_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          admin_user_id?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      api_tokens: {
        Row: {
          created_at: string | null
          expires_at: string | null
          game_mode: string
          is_active: boolean | null
          last_used_at: string | null
          note: string | null
          permissions: string[]
          token_hash: string
          token_id: string
          token_value: string | null
          usage_count: number | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          game_mode: string
          is_active?: boolean | null
          last_used_at?: string | null
          note?: string | null
          permissions?: string[]
          token_hash: string
          token_id?: string
          token_value?: string | null
          usage_count?: number | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          game_mode?: string
          is_active?: boolean | null
          last_used_at?: string | null
          note?: string | null
          permissions?: string[]
          token_hash?: string
          token_id?: string
          token_value?: string | null
          usage_count?: number | null
          user_id?: string
        }
        Relationships: []
      }
      team_events: {
        Row: {
          created_at: string | null
          event_data: Json | null
          event_type: string
          id: string
          initiated_by: string | null
          target_user: string | null
          team_id: string | null
        }
        Insert: {
          created_at?: string | null
          event_data?: Json | null
          event_type: string
          id?: string
          initiated_by?: string | null
          target_user?: string | null
          team_id?: string | null
        }
        Update: {
          created_at?: string | null
          event_data?: Json | null
          event_type?: string
          id?: string
          initiated_by?: string | null
          target_user?: string | null
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_events_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_memberships: {
        Row: {
          game_mode: string
          joined_at: string | null
          role: string
          team_id: string
          user_id: string
        }
        Insert: {
          game_mode?: string
          joined_at?: string | null
          role?: string
          team_id: string
          user_id: string
        }
        Update: {
          game_mode?: string
          joined_at?: string | null
          role?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_memberships_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string | null
          game_mode: string
          id: string
          join_code: string | null
          max_members: number | null
          members: Json | null
          name: string | null
          owner_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          game_mode?: string
          id?: string
          join_code?: string | null
          max_members?: number | null
          members?: Json | null
          name?: string | null
          owner_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          game_mode?: string
          id?: string
          join_code?: string | null
          max_members?: number | null
          members?: Json | null
          name?: string | null
          owner_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          created_at: string | null
          dashboard_notice_dismissed: boolean
          enable_holiday_effects: boolean | null
          enable_manual_task_fail: boolean | null
          hide_completed_map_objectives: boolean | null
          hide_completed_task_objectives: boolean | null
          hide_global_tasks: boolean | null
          hide_non_kappa_tasks: boolean | null
          hideout_collapse_completed: boolean
          hideout_primary_view: string | null
          hideout_require_skill_levels: boolean
          hideout_require_station_levels: boolean
          hideout_require_trader_loyalty: boolean
          hideout_sort_ready_first: boolean
          items_hide_non_fir: boolean | null
          items_team_hide_all: boolean | null
          items_team_hide_hideout: boolean | null
          items_team_hide_non_fir: boolean | null
          locale_override: string | null
          map_team_hide_all: boolean | null
          map_zoom_speed: number | null
          needed_items_card_style: string | null
          needed_items_fir_filter: string | null
          needed_items_group_by_item: boolean | null
          needed_items_hide_non_fir_special_equipment: boolean | null
          needed_items_hide_owned: boolean
          needed_items_kappa_only: boolean | null
          needed_items_sort_by: string | null
          needed_items_sort_direction: string | null
          needed_items_view_mode: string | null
          needed_type_view: string | null
          neededitems_style: string | null
          only_tasks_with_required_keys: boolean
          pinned_task_ids: Json | null
          respect_task_filters_for_impact: boolean
          show_all_filter: boolean | null
          show_available_filter: boolean | null
          show_completed_filter: boolean | null
          show_experience_rewards: boolean | null
          show_failed_filter: boolean | null
          show_lightkeeper_tasks: boolean | null
          show_locked_filter: boolean | null
          show_map_extracts: boolean | null
          show_next_quests: boolean | null
          show_non_special_tasks: boolean | null
          show_not_required_labels: boolean | null
          show_previous_quests: boolean | null
          show_required_labels: boolean | null
          show_task_ids: boolean | null
          skill_sort_mode: string | null
          streamer_mode: boolean | null
          task_card_density: string | null
          task_filter_presets: Json | null
          task_map_view: string | null
          task_primary_view: string | null
          task_secondary_view: string | null
          task_shared_by_all_only: boolean | null
          task_sort_direction: string | null
          task_sort_mode: string | null
          task_team_hide_all: boolean | null
          task_trader_view: string | null
          task_user_view: string | null
          team_hide: Json | null
          updated_at: string | null
          use_automatic_level_calculation: boolean | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          dashboard_notice_dismissed?: boolean
          enable_holiday_effects?: boolean | null
          enable_manual_task_fail?: boolean | null
          hide_completed_map_objectives?: boolean | null
          hide_completed_task_objectives?: boolean | null
          hide_global_tasks?: boolean | null
          hide_non_kappa_tasks?: boolean | null
          hideout_collapse_completed?: boolean
          hideout_primary_view?: string | null
          hideout_require_skill_levels?: boolean
          hideout_require_station_levels?: boolean
          hideout_require_trader_loyalty?: boolean
          hideout_sort_ready_first?: boolean
          items_hide_non_fir?: boolean | null
          items_team_hide_all?: boolean | null
          items_team_hide_hideout?: boolean | null
          items_team_hide_non_fir?: boolean | null
          locale_override?: string | null
          map_team_hide_all?: boolean | null
          map_zoom_speed?: number | null
          needed_items_card_style?: string | null
          needed_items_fir_filter?: string | null
          needed_items_group_by_item?: boolean | null
          needed_items_hide_non_fir_special_equipment?: boolean | null
          needed_items_hide_owned?: boolean
          needed_items_kappa_only?: boolean | null
          needed_items_sort_by?: string | null
          needed_items_sort_direction?: string | null
          needed_items_view_mode?: string | null
          needed_type_view?: string | null
          neededitems_style?: string | null
          only_tasks_with_required_keys?: boolean
          pinned_task_ids?: Json | null
          respect_task_filters_for_impact?: boolean
          show_all_filter?: boolean | null
          show_available_filter?: boolean | null
          show_completed_filter?: boolean | null
          show_experience_rewards?: boolean | null
          show_failed_filter?: boolean | null
          show_lightkeeper_tasks?: boolean | null
          show_locked_filter?: boolean | null
          show_map_extracts?: boolean | null
          show_next_quests?: boolean | null
          show_non_special_tasks?: boolean | null
          show_not_required_labels?: boolean | null
          show_previous_quests?: boolean | null
          show_required_labels?: boolean | null
          show_task_ids?: boolean | null
          skill_sort_mode?: string | null
          streamer_mode?: boolean | null
          task_card_density?: string | null
          task_filter_presets?: Json | null
          task_map_view?: string | null
          task_primary_view?: string | null
          task_secondary_view?: string | null
          task_shared_by_all_only?: boolean | null
          task_sort_direction?: string | null
          task_sort_mode?: string | null
          task_team_hide_all?: boolean | null
          task_trader_view?: string | null
          task_user_view?: string | null
          team_hide?: Json | null
          updated_at?: string | null
          use_automatic_level_calculation?: boolean | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          dashboard_notice_dismissed?: boolean
          enable_holiday_effects?: boolean | null
          enable_manual_task_fail?: boolean | null
          hide_completed_map_objectives?: boolean | null
          hide_completed_task_objectives?: boolean | null
          hide_global_tasks?: boolean | null
          hide_non_kappa_tasks?: boolean | null
          hideout_collapse_completed?: boolean
          hideout_primary_view?: string | null
          hideout_require_skill_levels?: boolean
          hideout_require_station_levels?: boolean
          hideout_require_trader_loyalty?: boolean
          hideout_sort_ready_first?: boolean
          items_hide_non_fir?: boolean | null
          items_team_hide_all?: boolean | null
          items_team_hide_hideout?: boolean | null
          items_team_hide_non_fir?: boolean | null
          locale_override?: string | null
          map_team_hide_all?: boolean | null
          map_zoom_speed?: number | null
          needed_items_card_style?: string | null
          needed_items_fir_filter?: string | null
          needed_items_group_by_item?: boolean | null
          needed_items_hide_non_fir_special_equipment?: boolean | null
          needed_items_hide_owned?: boolean
          needed_items_kappa_only?: boolean | null
          needed_items_sort_by?: string | null
          needed_items_sort_direction?: string | null
          needed_items_view_mode?: string | null
          needed_type_view?: string | null
          neededitems_style?: string | null
          only_tasks_with_required_keys?: boolean
          pinned_task_ids?: Json | null
          respect_task_filters_for_impact?: boolean
          show_all_filter?: boolean | null
          show_available_filter?: boolean | null
          show_completed_filter?: boolean | null
          show_experience_rewards?: boolean | null
          show_failed_filter?: boolean | null
          show_lightkeeper_tasks?: boolean | null
          show_locked_filter?: boolean | null
          show_map_extracts?: boolean | null
          show_next_quests?: boolean | null
          show_non_special_tasks?: boolean | null
          show_not_required_labels?: boolean | null
          show_previous_quests?: boolean | null
          show_required_labels?: boolean | null
          show_task_ids?: boolean | null
          skill_sort_mode?: string | null
          streamer_mode?: boolean | null
          task_card_density?: string | null
          task_filter_presets?: Json | null
          task_map_view?: string | null
          task_primary_view?: string | null
          task_secondary_view?: string | null
          task_shared_by_all_only?: boolean | null
          task_sort_direction?: string | null
          task_sort_mode?: string | null
          task_team_hide_all?: boolean | null
          task_trader_view?: string | null
          task_user_view?: string | null
          team_hide?: Json | null
          updated_at?: string | null
          use_automatic_level_calculation?: boolean | null
          user_id?: string
        }
        Relationships: []
      }
      user_progress: {
        Row: {
          created_at: string | null
          current_game_mode: string | null
          game_edition: number | null
          pve_data: Json | null
          pvp_data: Json | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          current_game_mode?: string | null
          game_edition?: number | null
          pve_data?: Json | null
          pvp_data?: Json | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          current_game_mode?: string | null
          game_edition?: number | null
          pve_data?: Json | null
          pvp_data?: Json | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_system: {
        Row: {
          api_tokens: string[] | null
          created_at: string | null
          is_admin: boolean
          pve_team_id: string | null
          pvp_team_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          api_tokens?: string[] | null
          created_at?: string | null
          is_admin?: boolean
          pve_team_id?: string | null
          pvp_team_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          api_tokens?: string[] | null
          created_at?: string | null
          is_admin?: boolean
          pve_team_id?: string | null
          pvp_team_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_system_pve_team_id_fkey"
            columns: ["pve_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_system_team_id_fkey"
            columns: ["pvp_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      team_member_summary: {
        Row: {
          current_game_mode: string | null
          pve_display_name: string | null
          pve_level: number | null
          pve_tasks_completed: number | null
          pvp_display_name: string | null
          pvp_level: number | null
          pvp_tasks_completed: number | null
          user_id: string | null
        }
        Insert: {
          current_game_mode?: string | null
          pve_display_name?: never
          pve_level?: never
          pve_tasks_completed?: never
          pvp_display_name?: never
          pvp_level?: never
          pvp_tasks_completed?: never
          user_id?: string | null
        }
        Update: {
          current_game_mode?: string | null
          pve_display_name?: never
          pve_level?: never
          pve_tasks_completed?: never
          pvp_display_name?: never
          pvp_level?: never
          pvp_tasks_completed?: never
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      cleanup_old_deletion_attempts: {
        Args: { retention_days?: number }
        Returns: {
          deleted_count: number
          oldest_remaining: string
        }[]
      }
      increment_token_usage: {
        Args: { p_token_id: string }
        Returns: undefined
      }
      transfer_team_ownership: {
        Args: {
          p_new_owner_id: string
          p_old_owner_id: string
          p_team_id: string
        }
        Returns: undefined
      }
      update_task_completion: {
        Args: {
          p_complete: boolean
          p_failed: boolean
          p_game_mode: string
          p_task_id: string
          p_timestamp: number
          p_user_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
