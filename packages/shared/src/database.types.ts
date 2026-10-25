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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          at: string
          id: number
          new_data: Json | null
          old_data: Json | null
          row_id: string | null
          table_name: string
          user_id: string | null
        }
        Insert: {
          action: string
          at?: string
          id?: never
          new_data?: Json | null
          old_data?: Json | null
          row_id?: string | null
          table_name: string
          user_id?: string | null
        }
        Update: {
          action?: string
          at?: string
          id?: never
          new_data?: Json | null
          old_data?: Json | null
          row_id?: string | null
          table_name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      batch_close_snapshots: {
        Row: {
          batch_id: string
          closed_at: string
          closed_by: string | null
          data: Json
        }
        Insert: {
          batch_id: string
          closed_at?: string
          closed_by?: string | null
          data: Json
        }
        Update: {
          batch_id?: string
          closed_at?: string
          closed_by?: string | null
          data?: Json
        }
        Relationships: [
          {
            foreignKeyName: "batch_close_snapshots_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: true
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_close_snapshots_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: true
            referencedRelation: "v_batch_profit"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "batch_close_snapshots_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: true
            referencedRelation: "v_batch_stock"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "batch_close_snapshots_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: true
            referencedRelation: "v_batch_summary"
            referencedColumns: ["batch_id"]
          },
        ]
      }
      batch_contributions: {
        Row: {
          amount_paid: number
          batch_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          partner_id: string
          qty: number
          updated_at: string
        }
        Insert: {
          amount_paid?: number
          batch_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          partner_id: string
          qty?: number
          updated_at?: string
        }
        Update: {
          amount_paid?: number
          batch_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          partner_id?: string
          qty?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_contributions_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_contributions_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_batch_profit"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "batch_contributions_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_batch_stock"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "batch_contributions_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_batch_summary"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "batch_contributions_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_contributions_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "v_partner_balance"
            referencedColumns: ["partner_id"]
          },
        ]
      }
      batches: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          code: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          note: string | null
          pcs_per_packet: number | null
          purchase_date: string
          status: string
          unit_cost: number
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          note?: string | null
          pcs_per_packet?: number | null
          purchase_date?: string
          status?: string
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          note?: string | null
          pcs_per_packet?: number | null
          purchase_date?: string
          status?: string
          unit_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "batches_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          batch_id: string
          category: string
          cost_type: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          funding: string
          id: string
          note: string | null
          paid_by_partner_id: string | null
          spent_on: string
          updated_at: string
        }
        Insert: {
          amount: number
          batch_id: string
          category: string
          cost_type: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          funding: string
          id?: string
          note?: string | null
          paid_by_partner_id?: string | null
          spent_on?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          batch_id?: string
          category?: string
          cost_type?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          funding?: string
          id?: string
          note?: string | null
          paid_by_partner_id?: string | null
          spent_on?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_batch_profit"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "expenses_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_batch_stock"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "expenses_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_batch_summary"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "expenses_paid_by_partner_id_fkey"
            columns: ["paid_by_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_paid_by_partner_id_fkey"
            columns: ["paid_by_partner_id"]
            isOneToOne: false
            referencedRelation: "v_partner_balance"
            referencedColumns: ["partner_id"]
          },
        ]
      }
      partners: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partners_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
          is_active: boolean
          must_change_password: boolean
          password_hash_snapshot: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string
          id: string
          is_active?: boolean
          must_change_password?: boolean
          password_hash_snapshot?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          is_active?: boolean
          must_change_password?: boolean
          password_hash_snapshot?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      sale_allocations: {
        Row: {
          batch_id: string
          created_at: string
          qty: number
          sale_id: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          qty: number
          sale_id: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          qty?: number
          sale_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_allocations_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_allocations_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_batch_profit"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "sale_allocations_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_batch_stock"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "sale_allocations_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_batch_summary"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "sale_allocations_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_allocations_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "v_sales_enriched"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          amount_received: number
          created_at: string
          created_by: string | null
          customer_name: string | null
          deleted_at: string | null
          discount: number | null
          id: string
          kind: string
          list_unit_price: number
          note: string | null
          partner_id: string | null
          payment_method: string | null
          qty: number
          received_by_partner_id: string | null
          sold_at: string
          updated_at: string
        }
        Insert: {
          amount_received: number
          created_at?: string
          created_by?: string | null
          customer_name?: string | null
          deleted_at?: string | null
          discount?: number | null
          id?: string
          kind: string
          list_unit_price: number
          note?: string | null
          partner_id?: string | null
          payment_method?: string | null
          qty: number
          received_by_partner_id?: string | null
          sold_at?: string
          updated_at?: string
        }
        Update: {
          amount_received?: number
          created_at?: string
          created_by?: string | null
          customer_name?: string | null
          deleted_at?: string | null
          discount?: number | null
          id?: string
          kind?: string
          list_unit_price?: number
          note?: string | null
          partner_id?: string | null
          payment_method?: string | null
          qty?: number
          received_by_partner_id?: string | null
          sold_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "v_partner_balance"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "sales_received_by_partner_id_fkey"
            columns: ["received_by_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_received_by_partner_id_fkey"
            columns: ["received_by_partner_id"]
            isOneToOne: false
            referencedRelation: "v_partner_balance"
            referencedColumns: ["partner_id"]
          },
        ]
      }
      settings: {
        Row: {
          default_buy_rate: number
          default_sell_price: number
          id: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          default_buy_rate?: number
          default_sell_price?: number
          id?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          default_buy_rate?: number
          default_sell_price?: number
          id?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      stock_adjustments: {
        Row: {
          adjusted_on: string
          batch_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          note: string | null
          qty: number
          reason: string
          updated_at: string
        }
        Insert: {
          adjusted_on?: string
          batch_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          note?: string | null
          qty: number
          reason: string
          updated_at?: string
        }
        Update: {
          adjusted_on?: string
          batch_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          note?: string | null
          qty?: number
          reason?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_adjustments_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_batch_profit"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "stock_adjustments_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_batch_stock"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "stock_adjustments_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_batch_summary"
            referencedColumns: ["batch_id"]
          },
        ]
      }
      transfers: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          deleted_at: string | null
          from_partner_id: string
          id: string
          method: string
          note: string | null
          to_partner_id: string
          transferred_on: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          from_partner_id: string
          id?: string
          method?: string
          note?: string | null
          to_partner_id: string
          transferred_on?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          from_partner_id?: string
          id?: string
          method?: string
          note?: string | null
          to_partner_id?: string
          transferred_on?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transfers_from_partner_id_fkey"
            columns: ["from_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_from_partner_id_fkey"
            columns: ["from_partner_id"]
            isOneToOne: false
            referencedRelation: "v_partner_balance"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "transfers_to_partner_id_fkey"
            columns: ["to_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_to_partner_id_fkey"
            columns: ["to_partner_id"]
            isOneToOne: false
            referencedRelation: "v_partner_balance"
            referencedColumns: ["partner_id"]
          },
        ]
      }
    }
    Views: {
      v_batch_profit: {
        Row: {
          batch_id: string | null
          operating_expenses: number | null
          profit: number | null
          realized_cost: number | null
          revenue: number | null
          unsold_cost: number | null
        }
        Relationships: []
      }
      v_batch_stock: {
        Row: {
          batch_id: string | null
          damaged: number | null
          personal: number | null
          remaining: number | null
          sold_ext: number | null
          total_pcs: number | null
        }
        Insert: {
          batch_id?: string | null
          damaged?: never
          personal?: never
          remaining?: never
          sold_ext?: never
          total_pcs?: never
        }
        Update: {
          batch_id?: string | null
          damaged?: never
          personal?: never
          remaining?: never
          sold_ext?: never
          total_pcs?: never
        }
        Relationships: []
      }
      v_batch_summary: {
        Row: {
          batch_id: string | null
          damaged: number | null
          landed_cost_per_pc: number | null
          landed_pool: number | null
          operating_expenses: number | null
          personal: number | null
          remaining: number | null
          revenue_external: number | null
          revenue_internal: number | null
          sold_ext: number | null
          total_pcs: number | null
        }
        Relationships: []
      }
      v_dashboard_day: {
        Row: {
          day: string | null
          income: number | null
        }
        Relationships: []
      }
      v_partner_balance: {
        Row: {
          balance: number | null
          cash_held: number | null
          entitlement: number | null
          partner_id: string | null
          partner_name: string | null
        }
        Insert: {
          balance?: never
          cash_held?: never
          entitlement?: never
          partner_id?: string | null
          partner_name?: string | null
        }
        Update: {
          balance?: never
          cash_held?: never
          entitlement?: never
          partner_id?: string | null
          partner_name?: string | null
        }
        Relationships: []
      }
      v_partner_batch_payout: {
        Row: {
          batch_id: string | null
          contribution: number | null
          contribution_share: number | null
          partner_id: string | null
          partner_name: string | null
          payout: number | null
          personal_value: number | null
        }
        Relationships: []
      }
      v_sales_enriched: {
        Row: {
          allocation_complete: boolean | null
          amount_received: number | null
          batch_codes: string | null
          created_at: string | null
          customer_name: string | null
          customer_partner_name: string | null
          discount: number | null
          discount_pct: number | null
          id: string | null
          kind: string | null
          list_unit_price: number | null
          note: string | null
          payment_method: string | null
          qty: number | null
          received_by_name: string | null
          sold_at: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      assert_writeable: { Args: never; Returns: undefined }
      available_pcs: { Args: never; Returns: number }
      close_batch: { Args: { p_batch_id: string }; Returns: undefined }
      complete_password_change: { Args: never; Returns: undefined }
      create_batch: { Args: { p_batch: Json }; Returns: string }
      create_sale: { Args: { p_sale: Json }; Returns: string }
      dashboard_totals: {
        Args: { p_end?: string; p_start?: string }
        Returns: {
          cash_received: number
          discount_total: number
          expenses: number
          income: number
          landed_expenses: number
          list_value: number
          realized_profit: number
          sold_cost: number
          stock_current: number
        }[]
      }
      delete_sale: { Args: { p_id: string }; Returns: undefined }
      income_by_period_breakdown: {
        Args: { p_end: string; p_start: string }
        Returns: {
          amount: number
          slice: string
        }[]
      }
      is_active_user: { Args: never; Returns: boolean }
      is_su_admin: { Args: never; Returns: boolean }
      password_gate: { Args: never; Returns: boolean }
      reopen_batch: { Args: { p_batch_id: string }; Returns: undefined }
      update_sale: { Args: { p_id: string; p_sale: Json }; Returns: undefined }
    }
    Enums: {
      user_role: "su_admin" | "patabin_admin"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      user_role: ["su_admin", "patabin_admin"],
    },
  },
} as const
