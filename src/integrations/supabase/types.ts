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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      access_permissions: {
        Row: {
          action: string
          created_at: string
          id: string
          is_critical: boolean
          label: string | null
          module: string
          sort_order: number
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          is_critical?: boolean
          label?: string | null
          module: string
          sort_order?: number
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          is_critical?: boolean
          label?: string | null
          module?: string
          sort_order?: number
        }
        Relationships: []
      }
      access_requests: {
        Row: {
          created_at: string
          current_role_key: string | null
          display_name: string | null
          email: string | null
          id: string
          kind: Database["public"]["Enums"]["access_request_kind"]
          reason: string | null
          requested_action: string | null
          requested_module: string | null
          requested_role_key: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewed_by_name: string | null
          status: Database["public"]["Enums"]["access_request_status"]
          temporary_until: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          current_role_key?: string | null
          display_name?: string | null
          email?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["access_request_kind"]
          reason?: string | null
          requested_action?: string | null
          requested_module?: string | null
          requested_role_key?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_name?: string | null
          status?: Database["public"]["Enums"]["access_request_status"]
          temporary_until?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          current_role_key?: string | null
          display_name?: string | null
          email?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["access_request_kind"]
          reason?: string | null
          requested_action?: string | null
          requested_module?: string | null
          requested_role_key?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_name?: string | null
          status?: Database["public"]["Enums"]["access_request_status"]
          temporary_until?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      access_roles: {
        Row: {
          created_at: string
          default_scope: Database["public"]["Enums"]["access_scope"]
          description: string | null
          is_active: boolean
          is_system: boolean
          key: string
          name: string
          sort_order: number
          updated_at: string
          updated_by: string | null
          updated_by_name: string | null
        }
        Insert: {
          created_at?: string
          default_scope?: Database["public"]["Enums"]["access_scope"]
          description?: string | null
          is_active?: boolean
          is_system?: boolean
          key: string
          name: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
          updated_by_name?: string | null
        }
        Update: {
          created_at?: string
          default_scope?: Database["public"]["Enums"]["access_scope"]
          description?: string | null
          is_active?: boolean
          is_system?: boolean
          key?: string
          name?: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
          updated_by_name?: string | null
        }
        Relationships: []
      }
      additional_services: {
        Row: {
          code: string | null
          conditions: Json | null
          cost_price: number
          created_at: string
          direction_id: string
          id: string
          is_client_visible: boolean
          name: string
          quantity_formula: string | null
          sale_coef_key: string | null
          sort_order: number
          unit: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          conditions?: Json | null
          cost_price?: number
          created_at?: string
          direction_id: string
          id?: string
          is_client_visible?: boolean
          name: string
          quantity_formula?: string | null
          sale_coef_key?: string | null
          sort_order?: number
          unit: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          conditions?: Json | null
          cost_price?: number
          created_at?: string
          direction_id?: string
          id?: string
          is_client_visible?: boolean
          name?: string
          quantity_formula?: string | null
          sale_coef_key?: string | null
          sort_order?: number
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "additional_services_direction_id_fkey"
            columns: ["direction_id"]
            isOneToOne: false
            referencedRelation: "directions"
            referencedColumns: ["id"]
          },
        ]
      }
      archived_records: {
        Row: {
          archived_by: string | null
          archived_by_name: string | null
          created_at: string
          entity_id: string
          entity_label: string | null
          entity_type: string
          id: string
          reason: string | null
          restored_at: string | null
          restored_by: string | null
          snapshot: Json
        }
        Insert: {
          archived_by?: string | null
          archived_by_name?: string | null
          created_at?: string
          entity_id: string
          entity_label?: string | null
          entity_type: string
          id?: string
          reason?: string | null
          restored_at?: string | null
          restored_by?: string | null
          snapshot: Json
        }
        Update: {
          archived_by?: string | null
          archived_by_name?: string | null
          created_at?: string
          entity_id?: string
          entity_label?: string | null
          entity_type?: string
          id?: string
          reason?: string | null
          restored_at?: string | null
          restored_by?: string | null
          snapshot?: Json
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string | null
          actor_role: string | null
          auth_method: string | null
          client_id: string | null
          created_at: string
          device: string | null
          entity_id: string | null
          entity_label: string | null
          entity_type: string | null
          financial_impact: number | null
          id: string
          ip_address: string | null
          is_critical: boolean
          module: string
          new_value: Json | null
          object_id: string | null
          old_value: Json | null
          reason: string | null
          session_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string | null
          actor_role?: string | null
          auth_method?: string | null
          client_id?: string | null
          created_at?: string
          device?: string | null
          entity_id?: string | null
          entity_label?: string | null
          entity_type?: string | null
          financial_impact?: number | null
          id?: string
          ip_address?: string | null
          is_critical?: boolean
          module: string
          new_value?: Json | null
          object_id?: string | null
          old_value?: Json | null
          reason?: string | null
          session_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string | null
          actor_role?: string | null
          auth_method?: string | null
          client_id?: string | null
          created_at?: string
          device?: string | null
          entity_id?: string | null
          entity_label?: string | null
          entity_type?: string | null
          financial_impact?: number | null
          id?: string
          ip_address?: string | null
          is_critical?: boolean
          module?: string
          new_value?: Json | null
          object_id?: string | null
          old_value?: Json | null
          reason?: string | null
          session_id?: string | null
        }
        Relationships: []
      }
      calendar_events: {
        Row: {
          address: string | null
          all_day: boolean
          area: number | null
          booking_id: string | null
          category: string
          checklist: Json
          client_id: string | null
          client_name: string | null
          created_at: string
          created_by: string | null
          crew_key: string | null
          description: string | null
          direction: string | null
          employee_id: string | null
          ends_at: string
          estimate_id: string | null
          event_type: string
          id: string
          manager_id: string | null
          measurement_id: string | null
          metadata: Json
          object_id: string | null
          participants: string[]
          priority: string
          reminders: Json
          responsible_user_id: string | null
          source_id: string | null
          source_type: string | null
          starts_at: string
          status: string
          title: string
          updated_at: string
          zone: string | null
        }
        Insert: {
          address?: string | null
          all_day?: boolean
          area?: number | null
          booking_id?: string | null
          category?: string
          checklist?: Json
          client_id?: string | null
          client_name?: string | null
          created_at?: string
          created_by?: string | null
          crew_key?: string | null
          description?: string | null
          direction?: string | null
          employee_id?: string | null
          ends_at: string
          estimate_id?: string | null
          event_type?: string
          id?: string
          manager_id?: string | null
          measurement_id?: string | null
          metadata?: Json
          object_id?: string | null
          participants?: string[]
          priority?: string
          reminders?: Json
          responsible_user_id?: string | null
          source_id?: string | null
          source_type?: string | null
          starts_at: string
          status?: string
          title: string
          updated_at?: string
          zone?: string | null
        }
        Update: {
          address?: string | null
          all_day?: boolean
          area?: number | null
          booking_id?: string | null
          category?: string
          checklist?: Json
          client_id?: string | null
          client_name?: string | null
          created_at?: string
          created_by?: string | null
          crew_key?: string | null
          description?: string | null
          direction?: string | null
          employee_id?: string | null
          ends_at?: string
          estimate_id?: string | null
          event_type?: string
          id?: string
          manager_id?: string | null
          measurement_id?: string | null
          metadata?: Json
          object_id?: string | null
          participants?: string[]
          priority?: string
          reminders?: Json
          responsible_user_id?: string | null
          source_id?: string | null
          source_type?: string | null
          starts_at?: string
          status?: string
          title?: string
          updated_at?: string
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "crew_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_measurement_id_fkey"
            columns: ["measurement_id"]
            isOneToOne: false
            referencedRelation: "object_measurements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_object_id_fkey"
            columns: ["object_id"]
            isOneToOne: false
            referencedRelation: "objects"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_items: {
        Row: {
          buy_price: number
          client_group_key: string | null
          code: string | null
          created_at: string
          id: string
          is_active: boolean
          is_custom: boolean
          kind: string
          lifetime_months: number | null
          manual_t100: boolean
          manual_t250: boolean
          manual_t50: boolean
          manual_t500: boolean
          module: string
          name: string
          sell_price: number
          sell_price_t100: number | null
          sell_price_t250: number | null
          sell_price_t50: number | null
          sell_price_t500: number | null
          show_in_client: Database["public"]["Enums"]["show_in_client_mode"]
          sort_order: number
          unit: string
          updated_at: string
        }
        Insert: {
          buy_price?: number
          client_group_key?: string | null
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_custom?: boolean
          kind: string
          lifetime_months?: number | null
          manual_t100?: boolean
          manual_t250?: boolean
          manual_t50?: boolean
          manual_t500?: boolean
          module: string
          name: string
          sell_price?: number
          sell_price_t100?: number | null
          sell_price_t250?: number | null
          sell_price_t50?: number | null
          sell_price_t500?: number | null
          show_in_client?: Database["public"]["Enums"]["show_in_client_mode"]
          sort_order?: number
          unit: string
          updated_at?: string
        }
        Update: {
          buy_price?: number
          client_group_key?: string | null
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_custom?: boolean
          kind?: string
          lifetime_months?: number | null
          manual_t100?: boolean
          manual_t250?: boolean
          manual_t50?: boolean
          manual_t500?: boolean
          module?: string
          name?: string
          sell_price?: number
          sell_price_t100?: number | null
          sell_price_t250?: number | null
          sell_price_t50?: number | null
          sell_price_t500?: number | null
          show_in_client?: Database["public"]["Enums"]["show_in_client_mode"]
          sort_order?: number
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      catalog_tier_margins: {
        Row: {
          created_at: string
          id: string
          kind: string
          margin_percent: number
          module: string
          tier: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          margin_percent?: number
          module: string
          tier: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          margin_percent?: number
          module?: string
          tier?: string
          updated_at?: string
        }
        Relationships: []
      }
      client_groups: {
        Row: {
          created_at: string
          id: string
          key: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          owner_id: string
          phone: string | null
          status: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          owner_id: string
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          owner_id?: string
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      coefficients: {
        Row: {
          coef_group: string
          coef_key: string
          created_at: string
          description: string | null
          direction_id: string
          id: string
          updated_at: string
          value: number
        }
        Insert: {
          coef_group: string
          coef_key: string
          created_at?: string
          description?: string | null
          direction_id: string
          id?: string
          updated_at?: string
          value: number
        }
        Update: {
          coef_group?: string
          coef_key?: string
          created_at?: string
          description?: string | null
          direction_id?: string
          id?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "coefficients_direction_id_fkey"
            columns: ["direction_id"]
            isOneToOne: false
            referencedRelation: "directions"
            referencedColumns: ["id"]
          },
        ]
      }
      crew_bookings: {
        Row: {
          address: string | null
          brigade_key: string
          brigade_label: string
          client: string | null
          created_at: string
          created_by: string | null
          date: string
          id: string
          module: string
          notes: string | null
          object_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          brigade_key: string
          brigade_label: string
          client?: string | null
          created_at?: string
          created_by?: string | null
          date: string
          id?: string
          module: string
          notes?: string | null
          object_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          brigade_key?: string
          brigade_label?: string
          client?: string | null
          created_at?: string
          created_by?: string | null
          date?: string
          id?: string
          module?: string
          notes?: string | null
          object_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crew_bookings_object_id_fkey"
            columns: ["object_id"]
            isOneToOne: false
            referencedRelation: "objects"
            referencedColumns: ["id"]
          },
        ]
      }
      directions: {
        Row: {
          active: boolean
          category: string
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          category: string
          created_at?: string
          description?: string | null
          id: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      estimate_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string | null
          changes: Json
          created_at: string
          estimate_id: string
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string | null
          changes?: Json
          created_at?: string
          estimate_id: string
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string | null
          changes?: Json
          created_at?: string
          estimate_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "estimate_audit_log_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
        ]
      }
      estimate_sections: {
        Row: {
          client_visible: boolean
          created_at: string
          direction_id: string
          id: string
          internal_visible: boolean
          section_key: string
          section_name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          client_visible?: boolean
          created_at?: string
          direction_id: string
          id?: string
          internal_visible?: boolean
          section_key: string
          section_name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          client_visible?: boolean
          created_at?: string
          direction_id?: string
          id?: string
          internal_visible?: boolean
          section_key?: string
          section_name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "estimate_sections_direction_id_fkey"
            columns: ["direction_id"]
            isOneToOne: false
            referencedRelation: "directions"
            referencedColumns: ["id"]
          },
        ]
      }
      estimate_versions: {
        Row: {
          approved_by: string | null
          approved_by_name: string | null
          created_at: string
          engine_version: string | null
          estimate_id: string
          id: string
          note: string | null
          price_book_version: number | null
          snapshot: Json
          snapshot_kind: Database["public"]["Enums"]["snapshot_kind"]
          version_no: number
        }
        Insert: {
          approved_by?: string | null
          approved_by_name?: string | null
          created_at?: string
          engine_version?: string | null
          estimate_id: string
          id?: string
          note?: string | null
          price_book_version?: number | null
          snapshot: Json
          snapshot_kind?: Database["public"]["Enums"]["snapshot_kind"]
          version_no: number
        }
        Update: {
          approved_by?: string | null
          approved_by_name?: string | null
          created_at?: string
          engine_version?: string | null
          estimate_id?: string
          id?: string
          note?: string | null
          price_book_version?: number | null
          snapshot?: Json
          snapshot_kind?: Database["public"]["Enums"]["snapshot_kind"]
          version_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "estimate_versions_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
        ]
      }
      estimates: {
        Row: {
          address: string | null
          approved_at: string | null
          area: number | null
          calculation_json: Json | null
          client_id: string | null
          client_lines: Json | null
          client_name: string | null
          client_phone: string | null
          client_view_mode: string
          created_at: string
          direction_id: string | null
          duration_days: number | null
          duration_override_days: number | null
          engine_version: string | null
          gcal_calendar_id: string | null
          gcal_event_id: string | null
          gcal_synced_at: string | null
          gross_profit: number
          id: string
          internal_lines: Json | null
          manager: string | null
          margin_percent: number
          module: string
          number: string
          object_id: string | null
          owner_id: string
          payload: Json
          price_book_version: number | null
          schedule_end_at: string | null
          schedule_start_at: string | null
          status: string
          thickness_cm: number | null
          total_client: number
          total_cost: number
          updated_at: string
        }
        Insert: {
          address?: string | null
          approved_at?: string | null
          area?: number | null
          calculation_json?: Json | null
          client_id?: string | null
          client_lines?: Json | null
          client_name?: string | null
          client_phone?: string | null
          client_view_mode?: string
          created_at?: string
          direction_id?: string | null
          duration_days?: number | null
          duration_override_days?: number | null
          engine_version?: string | null
          gcal_calendar_id?: string | null
          gcal_event_id?: string | null
          gcal_synced_at?: string | null
          gross_profit?: number
          id?: string
          internal_lines?: Json | null
          manager?: string | null
          margin_percent?: number
          module: string
          number: string
          object_id?: string | null
          owner_id: string
          payload?: Json
          price_book_version?: number | null
          schedule_end_at?: string | null
          schedule_start_at?: string | null
          status?: string
          thickness_cm?: number | null
          total_client?: number
          total_cost?: number
          updated_at?: string
        }
        Update: {
          address?: string | null
          approved_at?: string | null
          area?: number | null
          calculation_json?: Json | null
          client_id?: string | null
          client_lines?: Json | null
          client_name?: string | null
          client_phone?: string | null
          client_view_mode?: string
          created_at?: string
          direction_id?: string | null
          duration_days?: number | null
          duration_override_days?: number | null
          engine_version?: string | null
          gcal_calendar_id?: string | null
          gcal_event_id?: string | null
          gcal_synced_at?: string | null
          gross_profit?: number
          id?: string
          internal_lines?: Json | null
          manager?: string | null
          margin_percent?: number
          module?: string
          number?: string
          object_id?: string | null
          owner_id?: string
          payload?: Json
          price_book_version?: number | null
          schedule_end_at?: string | null
          schedule_start_at?: string | null
          status?: string
          thickness_cm?: number | null
          total_client?: number
          total_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "estimates_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimates_direction_id_fkey"
            columns: ["direction_id"]
            isOneToOne: false
            referencedRelation: "directions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimates_object_id_fkey"
            columns: ["object_id"]
            isOneToOne: false
            referencedRelation: "objects"
            referencedColumns: ["id"]
          },
        ]
      }
      formulas: {
        Row: {
          created_at: string
          description: string | null
          direction_id: string
          expression: string
          formula_key: string
          id: string
          output_unit: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          direction_id: string
          expression: string
          formula_key: string
          id?: string
          output_unit?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          direction_id?: string
          expression?: string
          formula_key?: string
          id?: string
          output_unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "formulas_direction_id_fkey"
            columns: ["direction_id"]
            isOneToOne: false
            referencedRelation: "directions"
            referencedColumns: ["id"]
          },
        ]
      }
      input_fields: {
        Row: {
          affects_formula: boolean
          created_at: string
          default_value: Json | null
          direction_id: string
          enum_values: Json | null
          field_key: string
          help_text: string | null
          id: string
          label: string
          required: boolean
          sort_order: number
          type: string
          unit: string | null
          updated_at: string
          validation_rules: Json | null
        }
        Insert: {
          affects_formula?: boolean
          created_at?: string
          default_value?: Json | null
          direction_id: string
          enum_values?: Json | null
          field_key: string
          help_text?: string | null
          id?: string
          label: string
          required?: boolean
          sort_order?: number
          type?: string
          unit?: string | null
          updated_at?: string
          validation_rules?: Json | null
        }
        Update: {
          affects_formula?: boolean
          created_at?: string
          default_value?: Json | null
          direction_id?: string
          enum_values?: Json | null
          field_key?: string
          help_text?: string | null
          id?: string
          label?: string
          required?: boolean
          sort_order?: number
          type?: string
          unit?: string | null
          updated_at?: string
          validation_rules?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "input_fields_direction_id_fkey"
            columns: ["direction_id"]
            isOneToOne: false
            referencedRelation: "directions"
            referencedColumns: ["id"]
          },
        ]
      }
      logistics_items: {
        Row: {
          code: string | null
          conditions: Json | null
          cost_price: number
          created_at: string
          direction_id: string
          id: string
          name: string
          quantity_formula: string | null
          sale_coef_key: string | null
          sort_order: number
          unit: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          conditions?: Json | null
          cost_price?: number
          created_at?: string
          direction_id: string
          id?: string
          name: string
          quantity_formula?: string | null
          sale_coef_key?: string | null
          sort_order?: number
          unit: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          conditions?: Json | null
          cost_price?: number
          created_at?: string
          direction_id?: string
          id?: string
          name?: string
          quantity_formula?: string | null
          sale_coef_key?: string | null
          sort_order?: number
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "logistics_items_direction_id_fkey"
            columns: ["direction_id"]
            isOneToOne: false
            referencedRelation: "directions"
            referencedColumns: ["id"]
          },
        ]
      }
      material_items: {
        Row: {
          category: string | null
          code: string | null
          consumption_formula: string | null
          cost_price: number
          created_at: string
          direction_id: string
          id: string
          is_optional: boolean
          name: string
          sale_coef_key: string | null
          sort_order: number
          source_ref: string | null
          supplier: string | null
          unit: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          code?: string | null
          consumption_formula?: string | null
          cost_price?: number
          created_at?: string
          direction_id: string
          id?: string
          is_optional?: boolean
          name: string
          sale_coef_key?: string | null
          sort_order?: number
          source_ref?: string | null
          supplier?: string | null
          unit: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          code?: string | null
          consumption_formula?: string | null
          cost_price?: number
          created_at?: string
          direction_id?: string
          id?: string
          is_optional?: boolean
          name?: string
          sale_coef_key?: string | null
          sort_order?: number
          source_ref?: string | null
          supplier?: string | null
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_items_direction_id_fkey"
            columns: ["direction_id"]
            isOneToOne: false
            referencedRelation: "directions"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_rules: {
        Row: {
          channel: string
          created_at: string
          digest: string
          enabled: boolean
          event_key: string
          id: string
          name: string
          recipients: Json
          threshold: number | null
          updated_at: string
        }
        Insert: {
          channel?: string
          created_at?: string
          digest?: string
          enabled?: boolean
          event_key: string
          id?: string
          name: string
          recipients?: Json
          threshold?: number | null
          updated_at?: string
        }
        Update: {
          channel?: string
          created_at?: string
          digest?: string
          enabled?: boolean
          event_key?: string
          id?: string
          name?: string
          recipients?: Json
          threshold?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      object_assignments: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          object_id: string
          role: Database["public"]["Enums"]["object_assignment_role"]
          user_id: string | null
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          object_id: string
          role: Database["public"]["Enums"]["object_assignment_role"]
          user_id?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          object_id?: string
          role?: Database["public"]["Enums"]["object_assignment_role"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "object_assignments_object_id_fkey"
            columns: ["object_id"]
            isOneToOne: false
            referencedRelation: "objects"
            referencedColumns: ["id"]
          },
        ]
      }
      object_comments: {
        Row: {
          author_id: string | null
          author_name: string | null
          body: string
          created_at: string
          id: string
          mentions: Json | null
          object_id: string
          parent_id: string | null
          pinned: boolean | null
        }
        Insert: {
          author_id?: string | null
          author_name?: string | null
          body: string
          created_at?: string
          id?: string
          mentions?: Json | null
          object_id: string
          parent_id?: string | null
          pinned?: boolean | null
        }
        Update: {
          author_id?: string | null
          author_name?: string | null
          body?: string
          created_at?: string
          id?: string
          mentions?: Json | null
          object_id?: string
          parent_id?: string | null
          pinned?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "object_comments_object_id_fkey"
            columns: ["object_id"]
            isOneToOne: false
            referencedRelation: "objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "object_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "object_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      object_files: {
        Row: {
          category: string | null
          created_at: string
          file_name: string | null
          id: string
          note: string | null
          object_id: string
          uploaded_by: string | null
          url: string
          zone_id: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          file_name?: string | null
          id?: string
          note?: string | null
          object_id: string
          uploaded_by?: string | null
          url: string
          zone_id?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          file_name?: string | null
          id?: string
          note?: string | null
          object_id?: string
          uploaded_by?: string | null
          url?: string
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "object_files_object_id_fkey"
            columns: ["object_id"]
            isOneToOne: false
            referencedRelation: "objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "object_files_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "object_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      object_measurements: {
        Row: {
          area: number | null
          base: Json | null
          contact_on_site: string | null
          created_at: string
          files: Json | null
          id: string
          logistics: Json | null
          measured_at: string | null
          notes: string | null
          object_id: string
          perimeter: number | null
          photos: Json | null
          slopes: Json | null
          status: Database["public"]["Enums"]["object_measurement_status"]
          surveyor_id: string | null
          thicknesses: Json | null
          type: Database["public"]["Enums"]["object_measurement_type"]
          updated_at: string
        }
        Insert: {
          area?: number | null
          base?: Json | null
          contact_on_site?: string | null
          created_at?: string
          files?: Json | null
          id?: string
          logistics?: Json | null
          measured_at?: string | null
          notes?: string | null
          object_id: string
          perimeter?: number | null
          photos?: Json | null
          slopes?: Json | null
          status?: Database["public"]["Enums"]["object_measurement_status"]
          surveyor_id?: string | null
          thicknesses?: Json | null
          type?: Database["public"]["Enums"]["object_measurement_type"]
          updated_at?: string
        }
        Update: {
          area?: number | null
          base?: Json | null
          contact_on_site?: string | null
          created_at?: string
          files?: Json | null
          id?: string
          logistics?: Json | null
          measured_at?: string | null
          notes?: string | null
          object_id?: string
          perimeter?: number | null
          photos?: Json | null
          slopes?: Json | null
          status?: Database["public"]["Enums"]["object_measurement_status"]
          surveyor_id?: string | null
          thicknesses?: Json | null
          type?: Database["public"]["Enums"]["object_measurement_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "object_measurements_object_id_fkey"
            columns: ["object_id"]
            isOneToOne: false
            referencedRelation: "objects"
            referencedColumns: ["id"]
          },
        ]
      }
      object_services: {
        Row: {
          created_at: string
          id: string
          note: string | null
          object_id: string
          service: Database["public"]["Enums"]["object_service"]
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          object_id: string
          service: Database["public"]["Enums"]["object_service"]
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          object_id?: string
          service?: Database["public"]["Enums"]["object_service"]
        }
        Relationships: [
          {
            foreignKeyName: "object_services_object_id_fkey"
            columns: ["object_id"]
            isOneToOne: false
            referencedRelation: "objects"
            referencedColumns: ["id"]
          },
        ]
      }
      object_status_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          changed_by_name: string | null
          field: string
          id: string
          new_value: string | null
          object_id: string
          old_value: string | null
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          changed_by_name?: string | null
          field: string
          id?: string
          new_value?: string | null
          object_id: string
          old_value?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          changed_by_name?: string | null
          field?: string
          id?: string
          new_value?: string | null
          object_id?: string
          old_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "object_status_history_object_id_fkey"
            columns: ["object_id"]
            isOneToOne: false
            referencedRelation: "objects"
            referencedColumns: ["id"]
          },
        ]
      }
      object_zones: {
        Row: {
          archived: boolean | null
          area: number | null
          base_type: string | null
          complexity: string | null
          created_at: string
          crew_id: string | null
          id: string
          name: string
          object_id: string
          payload: Json | null
          perimeter: number | null
          planned_end: string | null
          planned_start: string | null
          service: Database["public"]["Enums"]["object_service"] | null
          slope_percent: number | null
          status: string | null
          thickness_cm: number | null
          updated_at: string
          volume: number | null
        }
        Insert: {
          archived?: boolean | null
          area?: number | null
          base_type?: string | null
          complexity?: string | null
          created_at?: string
          crew_id?: string | null
          id?: string
          name: string
          object_id: string
          payload?: Json | null
          perimeter?: number | null
          planned_end?: string | null
          planned_start?: string | null
          service?: Database["public"]["Enums"]["object_service"] | null
          slope_percent?: number | null
          status?: string | null
          thickness_cm?: number | null
          updated_at?: string
          volume?: number | null
        }
        Update: {
          archived?: boolean | null
          area?: number | null
          base_type?: string | null
          complexity?: string | null
          created_at?: string
          crew_id?: string | null
          id?: string
          name?: string
          object_id?: string
          payload?: Json | null
          perimeter?: number | null
          planned_end?: string | null
          planned_start?: string | null
          service?: Database["public"]["Enums"]["object_service"] | null
          slope_percent?: number | null
          status?: string | null
          thickness_cm?: number | null
          updated_at?: string
          volume?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "object_zones_object_id_fkey"
            columns: ["object_id"]
            isOneToOne: false
            referencedRelation: "objects"
            referencedColumns: ["id"]
          },
        ]
      }
      objects: {
        Row: {
          access_notes: string | null
          address: string | null
          client_id: string | null
          commercial_status: Database["public"]["Enums"]["object_commercial_status"]
          created_at: string
          crm_link: string | null
          distance_km: number | null
          district: string | null
          financial_status: Database["public"]["Enums"]["object_financial_status"]
          floor: number | null
          has_lift: boolean | null
          id: string
          latitude: number | null
          longitude: number | null
          manager_id: string | null
          name: string
          notes: string | null
          number: string
          object_type: string | null
          owner_id: string
          planned_end: string | null
          planned_start: string | null
          production_status: Database["public"]["Enums"]["object_production_status"]
          risk_level: Database["public"]["Enums"]["object_risk_level"]
          source: string | null
          updated_at: string
        }
        Insert: {
          access_notes?: string | null
          address?: string | null
          client_id?: string | null
          commercial_status?: Database["public"]["Enums"]["object_commercial_status"]
          created_at?: string
          crm_link?: string | null
          distance_km?: number | null
          district?: string | null
          financial_status?: Database["public"]["Enums"]["object_financial_status"]
          floor?: number | null
          has_lift?: boolean | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          manager_id?: string | null
          name: string
          notes?: string | null
          number: string
          object_type?: string | null
          owner_id?: string
          planned_end?: string | null
          planned_start?: string | null
          production_status?: Database["public"]["Enums"]["object_production_status"]
          risk_level?: Database["public"]["Enums"]["object_risk_level"]
          source?: string | null
          updated_at?: string
        }
        Update: {
          access_notes?: string | null
          address?: string | null
          client_id?: string | null
          commercial_status?: Database["public"]["Enums"]["object_commercial_status"]
          created_at?: string
          crm_link?: string | null
          distance_km?: number | null
          district?: string | null
          financial_status?: Database["public"]["Enums"]["object_financial_status"]
          floor?: number | null
          has_lift?: boolean | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          manager_id?: string | null
          name?: string
          notes?: string | null
          number?: string
          object_type?: string | null
          owner_id?: string
          planned_end?: string | null
          planned_start?: string | null
          production_status?: Database["public"]["Enums"]["object_production_status"]
          risk_level?: Database["public"]["Enums"]["object_risk_level"]
          source?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "objects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      price_history: {
        Row: {
          changed_by: string | null
          created_at: string
          direction_id: string | null
          field: string
          id: string
          item_id: string
          item_kind: string
          new_value: number | null
          old_value: number | null
          reason: string | null
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          direction_id?: string | null
          field: string
          id?: string
          item_id: string
          item_kind: string
          new_value?: number | null
          old_value?: number | null
          reason?: string | null
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          direction_id?: string | null
          field?: string
          id?: string
          item_id?: string
          item_kind?: string
          new_value?: number | null
          old_value?: number | null
          reason?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          department: string | null
          display_name: string | null
          email: string | null
          id: string
          is_active: boolean
          phone: string | null
          position: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          department?: string | null
          display_name?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          phone?: string | null
          position?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          department?: string | null
          display_name?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          phone?: string | null
          position?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      registration_approvals: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          note: string | null
          requested_at: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["registration_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          note?: string | null
          requested_at?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["registration_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          note?: string | null
          requested_at?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["registration_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          action: string
          allowed: boolean
          created_at: string
          id: string
          module: string
          role_key: string
          updated_at: string
        }
        Insert: {
          action: string
          allowed?: boolean
          created_at?: string
          id?: string
          module: string
          role_key: string
          updated_at?: string
        }
        Update: {
          action?: string
          allowed?: boolean
          created_at?: string
          id?: string
          module?: string
          role_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_role_key_fkey"
            columns: ["role_key"]
            isOneToOne: false
            referencedRelation: "access_roles"
            referencedColumns: ["key"]
          },
        ]
      }
      user_access: {
        Row: {
          access_expires_at: string | null
          admin_note: string | null
          blocked_at: string | null
          blocked_by: string | null
          created_at: string
          department: string | null
          id: string
          last_sign_in_at: string | null
          manager_id: string | null
          position: string | null
          role_key: string | null
          scope: Database["public"]["Enums"]["access_scope"]
          scope_modules: Json
          status: Database["public"]["Enums"]["access_status"]
          temporary: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          access_expires_at?: string | null
          admin_note?: string | null
          blocked_at?: string | null
          blocked_by?: string | null
          created_at?: string
          department?: string | null
          id?: string
          last_sign_in_at?: string | null
          manager_id?: string | null
          position?: string | null
          role_key?: string | null
          scope?: Database["public"]["Enums"]["access_scope"]
          scope_modules?: Json
          status?: Database["public"]["Enums"]["access_status"]
          temporary?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          access_expires_at?: string | null
          admin_note?: string | null
          blocked_at?: string | null
          blocked_by?: string | null
          created_at?: string
          department?: string | null
          id?: string
          last_sign_in_at?: string | null
          manager_id?: string | null
          position?: string | null
          role_key?: string | null
          scope?: Database["public"]["Enums"]["access_scope"]
          scope_modules?: Json
          status?: Database["public"]["Enums"]["access_status"]
          temporary?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_access_role_key_fkey"
            columns: ["role_key"]
            isOneToOne: false
            referencedRelation: "access_roles"
            referencedColumns: ["key"]
          },
        ]
      }
      user_invitations: {
        Row: {
          accepted_at: string | null
          accepted_user_id: string | null
          access_expires_at: string | null
          admin_note: string | null
          avatar_url: string | null
          created_at: string
          created_by: string | null
          department: string | null
          email: string
          expires_at: string
          first_name: string | null
          id: string
          last_name: string | null
          manager_id: string | null
          middle_name: string | null
          overrides: Json
          phone: string | null
          position: string | null
          role_key: string | null
          scope: Database["public"]["Enums"]["access_scope"]
          status: Database["public"]["Enums"]["invitation_status"]
          temporary: boolean
          token_hash: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          access_expires_at?: string | null
          admin_note?: string | null
          avatar_url?: string | null
          created_at?: string
          created_by?: string | null
          department?: string | null
          email: string
          expires_at?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          manager_id?: string | null
          middle_name?: string | null
          overrides?: Json
          phone?: string | null
          position?: string | null
          role_key?: string | null
          scope?: Database["public"]["Enums"]["access_scope"]
          status?: Database["public"]["Enums"]["invitation_status"]
          temporary?: boolean
          token_hash: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          access_expires_at?: string | null
          admin_note?: string | null
          avatar_url?: string | null
          created_at?: string
          created_by?: string | null
          department?: string | null
          email?: string
          expires_at?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          manager_id?: string | null
          middle_name?: string | null
          overrides?: Json
          phone?: string | null
          position?: string | null
          role_key?: string | null
          scope?: Database["public"]["Enums"]["access_scope"]
          status?: Database["public"]["Enums"]["invitation_status"]
          temporary?: boolean
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_invitations_role_key_fkey"
            columns: ["role_key"]
            isOneToOne: false
            referencedRelation: "access_roles"
            referencedColumns: ["key"]
          },
        ]
      }
      user_permission_overrides: {
        Row: {
          action: string
          created_at: string
          created_by: string | null
          effect: Database["public"]["Enums"]["permission_effect"]
          expires_at: string | null
          id: string
          module: string
          reason: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          created_by?: string | null
          effect: Database["public"]["Enums"]["permission_effect"]
          expires_at?: string | null
          id?: string
          module: string
          reason?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          created_by?: string | null
          effect?: Database["public"]["Enums"]["permission_effect"]
          expires_at?: string | null
          id?: string
          module?: string
          reason?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      work_items: {
        Row: {
          code: string | null
          cost_price: number
          created_at: string
          direction_id: string
          id: string
          is_client_visible: boolean
          is_optional: boolean
          name: string
          quantity_formula: string | null
          sale_coef_key: string | null
          section: string | null
          sort_order: number
          unit: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          cost_price?: number
          created_at?: string
          direction_id: string
          id?: string
          is_client_visible?: boolean
          is_optional?: boolean
          name: string
          quantity_formula?: string | null
          sale_coef_key?: string | null
          section?: string | null
          sort_order?: number
          unit: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          cost_price?: number
          created_at?: string
          direction_id?: string
          id?: string
          is_client_visible?: boolean
          is_optional?: boolean
          name?: string
          quantity_formula?: string | null
          sale_coef_key?: string | null
          section?: string | null
          sort_order?: number
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_items_direction_id_fkey"
            columns: ["direction_id"]
            isOneToOne: false
            referencedRelation: "directions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_manage_access: { Args: { _user_id: string }; Returns: boolean }
      can_manage_object: { Args: { _object_id: string }; Returns: boolean }
      can_view_object: { Args: { _object_id: string }; Returns: boolean }
      has_permission: {
        Args: { _action: string; _module: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_access_owner: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      access_request_kind:
        | "registration"
        | "recovery"
        | "elevation"
        | "temporary"
      access_request_status:
        | "pending"
        | "approved"
        | "rejected"
        | "info_requested"
      access_scope: "own" | "assigned" | "department" | "company" | "custom"
      access_status:
        | "invited"
        | "pending"
        | "active"
        | "suspended"
        | "blocked"
        | "dismissed"
        | "archived"
      app_role: "admin" | "director" | "manager" | "finance"
      client_view_mode: "detailed" | "condensed" | "turnkey"
      invitation_status: "sent" | "accepted" | "revoked" | "expired"
      object_assignment_role:
        | "manager"
        | "surveyor"
        | "estimator"
        | "foreman"
        | "brigadier"
        | "executor"
        | "accountant"
        | "buyer"
        | "qc"
      object_commercial_status:
        | "new"
        | "qualification"
        | "measurement_scheduled"
        | "measurement_done"
        | "calculation"
        | "estimate_sent"
        | "negotiation"
        | "contract"
        | "awaiting_prepayment"
        | "sold"
        | "refused"
        | "postponed"
      object_financial_status:
        | "no_invoice"
        | "awaiting_payment"
        | "partial_payment"
        | "prepayment_received"
        | "has_debt"
        | "paid"
        | "financially_closed"
      object_measurement_status: "draft" | "done" | "cancelled"
      object_measurement_type: "primary" | "repeat" | "control" | "as_built"
      object_production_status:
        | "not_planned"
        | "preparation"
        | "awaiting_materials"
        | "ready_to_plan"
        | "planned"
        | "crew_assigned"
        | "in_progress"
        | "paused"
        | "works_done"
        | "acceptance"
        | "remarks"
        | "handed_over"
        | "warranty"
      object_risk_level: "green" | "yellow" | "red"
      object_service:
        | "screed"
        | "roofing_pvc"
        | "roofing_ruberoid"
        | "insulation"
        | "demolition"
        | "plaster"
        | "polybeton"
        | "other"
      permission_effect: "allow" | "deny"
      registration_status: "pending" | "approved" | "rejected"
      show_in_client_mode:
        | "always"
        | "detailed_only"
        | "condensed_only"
        | "never"
      snapshot_kind: "approved" | "production"
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
  public: {
    Enums: {
      access_request_kind: [
        "registration",
        "recovery",
        "elevation",
        "temporary",
      ],
      access_request_status: [
        "pending",
        "approved",
        "rejected",
        "info_requested",
      ],
      access_scope: ["own", "assigned", "department", "company", "custom"],
      access_status: [
        "invited",
        "pending",
        "active",
        "suspended",
        "blocked",
        "dismissed",
        "archived",
      ],
      app_role: ["admin", "director", "manager", "finance"],
      client_view_mode: ["detailed", "condensed", "turnkey"],
      invitation_status: ["sent", "accepted", "revoked", "expired"],
      object_assignment_role: [
        "manager",
        "surveyor",
        "estimator",
        "foreman",
        "brigadier",
        "executor",
        "accountant",
        "buyer",
        "qc",
      ],
      object_commercial_status: [
        "new",
        "qualification",
        "measurement_scheduled",
        "measurement_done",
        "calculation",
        "estimate_sent",
        "negotiation",
        "contract",
        "awaiting_prepayment",
        "sold",
        "refused",
        "postponed",
      ],
      object_financial_status: [
        "no_invoice",
        "awaiting_payment",
        "partial_payment",
        "prepayment_received",
        "has_debt",
        "paid",
        "financially_closed",
      ],
      object_measurement_status: ["draft", "done", "cancelled"],
      object_measurement_type: ["primary", "repeat", "control", "as_built"],
      object_production_status: [
        "not_planned",
        "preparation",
        "awaiting_materials",
        "ready_to_plan",
        "planned",
        "crew_assigned",
        "in_progress",
        "paused",
        "works_done",
        "acceptance",
        "remarks",
        "handed_over",
        "warranty",
      ],
      object_risk_level: ["green", "yellow", "red"],
      object_service: [
        "screed",
        "roofing_pvc",
        "roofing_ruberoid",
        "insulation",
        "demolition",
        "plaster",
        "polybeton",
        "other",
      ],
      permission_effect: ["allow", "deny"],
      registration_status: ["pending", "approved", "rejected"],
      show_in_client_mode: [
        "always",
        "detailed_only",
        "condensed_only",
        "never",
      ],
      snapshot_kind: ["approved", "production"],
    },
  },
} as const
