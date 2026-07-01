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
      catalog_items: {
        Row: {
          buy_price: number
          code: string | null
          created_at: string
          id: string
          is_active: boolean
          is_custom: boolean
          kind: string
          lifetime_months: number | null
          module: string
          name: string
          sell_price: number
          sort_order: number
          unit: string
          updated_at: string
        }
        Insert: {
          buy_price?: number
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_custom?: boolean
          kind: string
          lifetime_months?: number | null
          module: string
          name: string
          sell_price?: number
          sort_order?: number
          unit: string
          updated_at?: string
        }
        Update: {
          buy_price?: number
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_custom?: boolean
          kind?: string
          lifetime_months?: number | null
          module?: string
          name?: string
          sell_price?: number
          sort_order?: number
          unit?: string
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
          title?: string
          updated_at?: string
        }
        Relationships: []
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
      estimates: {
        Row: {
          address: string | null
          area: number | null
          calculation_json: Json | null
          client_id: string | null
          client_lines: Json | null
          client_name: string | null
          client_phone: string | null
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
          area?: number | null
          calculation_json?: Json | null
          client_id?: string | null
          client_lines?: Json | null
          client_name?: string | null
          client_phone?: string | null
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
          area?: number | null
          calculation_json?: Json | null
          client_id?: string | null
          client_lines?: Json | null
          client_name?: string | null
          client_phone?: string | null
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
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "director" | "manager" | "finance"
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
      app_role: ["admin", "director", "manager", "finance"],
    },
  },
} as const
