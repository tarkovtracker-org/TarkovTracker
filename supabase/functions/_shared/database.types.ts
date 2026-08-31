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
          claim_token: string | null
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
          claim_token?: string | null
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
          claim_token?: string | null
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
      account_ip_audit: {
        Row: {
          first_seen_at: string
          ip_hash: string
          last_seen_at: string
          last_user_agent: string | null
          seen_count: number
          user_id: string
        }
        Insert: {
          first_seen_at?: string
          ip_hash: string
          last_seen_at?: string
          last_user_agent?: string | null
          seen_count?: number
          user_id: string
        }
        Update: {
          first_seen_at?: string
          ip_hash?: string
          last_seen_at?: string
          last_user_agent?: string | null
          seen_count?: number
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
      api_usage_daily: {
        Row: {
          day: string
          reads: number
          throttled: number
          tier: string
          token_id: string
          updated_at: string
          user_agent: string | null
          user_id: string
          writes: number
        }
        Insert: {
          day: string
          reads?: number
          throttled?: number
          tier?: string
          token_id: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
          writes?: number
        }
        Update: {
          day?: string
          reads?: number
          throttled?: number
          tier?: string
          token_id?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
          writes?: number
        }
        Relationships: []
      }
      discord_account_links: {
        Row: {
          discord_display_name: string | null
          discord_user_id: string
          discord_username: string
          linked_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          discord_display_name?: string | null
          discord_user_id: string
          discord_username: string
          linked_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          discord_display_name?: string | null
          discord_user_id?: string
          discord_username?: string
          linked_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      mutation_rate_limits: {
        Row: {
          count: number
          reset_at: string
          scope: string
          subject: string
          updated_at: string
        }
        Insert: {
          count?: number
          reset_at: string
          scope: string
          subject: string
          updated_at?: string
        }
        Update: {
          count?: number
          reset_at?: string
          scope?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      stripe_events: {
        Row: {
          event_id: string
          event_type: string
          received_at: string
        }
        Insert: {
          event_id: string
          event_type: string
          received_at?: string
        }
        Update: {
          event_id?: string
          event_type?: string
          received_at?: string
        }
        Relationships: []
      }
      supporters: {
        Row: {
          amount_total: number
          discord_user_id: string | null
          expires_at: string | null
          has_ever_supported: boolean
          started_at: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          tier: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_total?: number
          discord_user_id?: string | null
          expires_at?: string | null
          has_ever_supported?: boolean
          started_at?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier?: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_total?: number
          discord_user_id?: string | null
          expires_at?: string | null
          has_ever_supported?: boolean
          started_at?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier?: string
          type?: string
          updated_at?: string
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
      user_game_mode_progress: {
        Row: {
          created_at: string
          game_mode: string
          profile_public: boolean
          progress_data: Json
          season_number: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          game_mode: string
          profile_public?: boolean
          progress_data?: Json
          season_number?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          game_mode?: string
          profile_public?: boolean
          progress_data?: Json
          season_number?: number
          updated_at?: string
          user_id?: string
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
          map_marker_colors: Json
          map_pan_speed: number | null
          map_show_pinned_objectives: boolean
          map_show_self_objectives: boolean
          map_show_team_objectives: boolean
          map_team_hide_all: boolean | null
          map_zone_opacity: number
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
          profile_share_pve_public: boolean
          profile_share_pvp_public: boolean
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
          tasks_require_trader_levels: boolean
          team_hide: Json | null
          trader_sort_direction: string | null
          trader_sort_mode: string | null
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
          map_marker_colors?: Json
          map_pan_speed?: number | null
          map_show_pinned_objectives?: boolean
          map_show_self_objectives?: boolean
          map_show_team_objectives?: boolean
          map_team_hide_all?: boolean | null
          map_zone_opacity?: number
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
          profile_share_pve_public?: boolean
          profile_share_pvp_public?: boolean
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
          tasks_require_trader_levels?: boolean
          team_hide?: Json | null
          trader_sort_direction?: string | null
          trader_sort_mode?: string | null
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
          map_marker_colors?: Json
          map_pan_speed?: number | null
          map_show_pinned_objectives?: boolean
          map_show_self_objectives?: boolean
          map_show_team_objectives?: boolean
          map_team_hide_all?: boolean | null
          map_zone_opacity?: number
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
          profile_share_pve_public?: boolean
          profile_share_pvp_public?: boolean
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
          tasks_require_trader_levels?: boolean
          team_hide?: Json | null
          trader_sort_direction?: string | null
          trader_sort_mode?: string | null
          updated_at?: string | null
          use_automatic_level_calculation?: boolean | null
          user_id?: string
        }
        Relationships: []
      }
      user_prestige_runs: {
        Row: {
          archived_progress: Json
          created_at: string
          id: string
          mode: string
          prestige_from: number
          prestige_to: number
          summary: Json
          user_id: string
        }
        Insert: {
          archived_progress?: Json
          created_at?: string
          id?: string
          mode: string
          prestige_from: number
          prestige_to: number
          summary?: Json
          user_id: string
        }
        Update: {
          archived_progress?: Json
          created_at?: string
          id?: string
          mode?: string
          prestige_from?: number
          prestige_to?: number
          summary?: Json
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
          tarkov_uid: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          current_game_mode?: string | null
          game_edition?: number | null
          pve_data?: Json | null
          pvp_data?: Json | null
          tarkov_uid?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          current_game_mode?: string | null
          game_edition?: number | null
          pve_data?: Json | null
          pvp_data?: Json | null
          tarkov_uid?: number | null
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
          seasonal_team_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          api_tokens?: string[] | null
          created_at?: string | null
          is_admin?: boolean
          pve_team_id?: string | null
          pvp_team_id?: string | null
          seasonal_team_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          api_tokens?: string[] | null
          created_at?: string | null
          is_admin?: boolean
          pve_team_id?: string | null
          pvp_team_id?: string | null
          seasonal_team_id?: string | null
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
          {
            foreignKeyName: "user_system_seasonal_team_id_fkey"
            columns: ["seasonal_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      team_member_mode_summary: {
        Row: {
          display_name: string | null
          game_mode: string | null
          level: number | null
          season_number: number | null
          tasks_completed: number | null
          user_id: string | null
        }
        Insert: {
          display_name?: never
          game_mode?: string | null
          level?: never
          season_number?: number | null
          tasks_completed?: never
          user_id?: string | null
        }
        Update: {
          display_name?: never
          game_mode?: string | null
          level?: never
          season_number?: number | null
          tasks_completed?: never
          user_id?: string | null
        }
        Relationships: []
      }
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
      archive_prestige_run_and_reset_progress: {
        Args: {
          p_archived_progress: Json
          p_created_at: string
          p_current_game_mode: string
          p_game_edition: number
          p_mode: string
          p_prestige_from: number
          p_prestige_to: number
          p_pve_data?: Json
          p_pvp_data: Json
          p_summary: Json
          p_tarkov_uid: number | null
        }
        Returns: undefined
      }
      claim_account_deletion_job: {
        Args: { p_create_if_missing?: boolean; p_user_id: string }
        Returns: {
          claim_token: string | null
          claimed: boolean
          status: string
        }[]
      }
      cleanup_old_deletion_attempts: {
        Args: { retention_days?: number }
        Returns: {
          deleted_count: number
          oldest_remaining: string
        }[]
      }
      consume_account_deletion_attempt: {
        Args: {
          p_ip_address: string
          p_user_agent: string
          p_user_id: string
        }
        Returns: {
          allowed: boolean
          retry_after_seconds: number
        }[]
      }
      consume_mutation_rate_limit: {
        Args: {
          p_limit: number
          p_scope: string
          p_subject: string
          p_window_seconds: number
        }
        Returns: {
          allowed: boolean
          remaining: number
          reset_at: string
        }[]
      }
      disband_team: {
        Args: { p_owner_id: string; p_team_id: string }
        Returns: boolean
      }
      get_api_usage_summary: {
        Args: { p_limit?: number; p_since: string }
        Returns: {
          reads: number
          throttled: number
          tier: string
          token_id: string
          user_agent: string
          user_id: string
          writes: number
        }[]
      }
      increment_token_usage: {
        Args: { p_token_id: string }
        Returns: undefined
      }
      merge_api_update_history: {
        Args: { max_entries?: number; payload: Json; previous_payload: Json }
        Returns: Json
      }
      merge_progress_data: {
        Args: {
          p_field: string
          p_set?: Json
          p_task_completions?: Json
          p_task_objectives?: Json
          p_user_id: string
        }
        Returns: number
      }
      record_api_usage: {
        Args: {
          p_reads: number
          p_throttled: number
          p_tier: string
          p_token_id: string
          p_user_agent?: string
          p_user_id: string
          p_writes: number
        }
        Returns: undefined
      }
      sanitize_user_progress_api_task_updates: {
        Args: { payload: Json }
        Returns: Json
      }
      sanitize_user_progress_api_update_history: {
        Args: { payload: Json }
        Returns: Json
      }
      sanitize_user_progress_api_update_meta: {
        Args: { payload: Json }
        Returns: Json
      }
      sanitize_user_progress_mode_data: {
        Args: { payload: Json }
        Returns: Json
      }
      set_game_mode_profile_visibility: {
        Args: {
          p_game_mode: string
          p_profile_public: boolean
          p_season_number: number
        }
        Returns: undefined
      }
      sync_user_game_mode_progress: {
        Args: {
          p_current_game_mode: string
          p_game_edition: number
          p_modes: Json
          p_seasonal_season_number?: number | null
          p_tarkov_uid: number | null
        }
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
