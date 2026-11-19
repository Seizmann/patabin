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
      agent_conversations: {
        Row: {
          created_at: string
          id: string
          last_activity_at: string
          owner_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_activity_at?: string
          owner_id?: string
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_activity_at?: string
          owner_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      agent_messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          event: Json | null
          id: string
          model_id: string | null
          provider_id: string | null
          role: string
          seq: number
          tool_call_id: string | null
          tool_calls: Json | null
          tool_name: string | null
          usage: Json | null
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          event?: Json | null
          id?: string
          model_id?: string | null
          provider_id?: string | null
          role: string
          seq: number
          tool_call_id?: string | null
          tool_calls?: Json | null
          tool_name?: string | null
          usage?: Json | null
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          event?: Json | null
          id?: string
          model_id?: string | null
          provider_id?: string | null
          role?: string
          seq?: number
          tool_call_id?: string | null
          tool_calls?: Json | null
          tool_name?: string | null
          usage?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "agent_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_models: {
        Row: {
          created_at: string
          created_by: string | null
          display_name: string
          fallback_position: number | null
          id: string
          is_active: boolean
          is_default: boolean
          max_output_tokens: number | null
          model_id: string
          provider_id: string
          supports_streaming: boolean
          supports_tools: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          display_name: string
          fallback_position?: number | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          max_output_tokens?: number | null
          model_id: string
          provider_id: string
          supports_streaming?: boolean
          supports_tools?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          display_name?: string
          fallback_position?: number | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          max_output_tokens?: number | null
          model_id?: string
          provider_id?: string
          supports_streaming?: boolean
          supports_tools?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_models_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "agent_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_pending_actions: {
        Row: {
          conversation_id: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          defaults_used: string[]
          error: string | null
          expires_at: string
          id: string
          message_id: string | null
          model_id: string
          payload: Json
          payload_hash: string
          preview: Json | null
          preview_hash: string
          result_id: string | null
          result_table: string | null
          status: string
          tool: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          defaults_used?: string[]
          error?: string | null
          expires_at?: string
          id?: string
          message_id?: string | null
          model_id: string
          payload: Json
          payload_hash: string
          preview?: Json | null
          preview_hash: string
          result_id?: string | null
          result_table?: string | null
          status?: string
          tool: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          defaults_used?: string[]
          error?: string | null
          expires_at?: string
          id?: string
          message_id?: string | null
          model_id?: string
          payload?: Json
          payload_hash?: string
          preview?: Json | null
          preview_hash?: string
          result_id?: string | null
          result_table?: string | null
          status?: string
          tool?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_pending_actions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "agent_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_pending_actions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "agent_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_providers: {
        Row: {
          base_url: string
          created_at: string
          created_by: string | null
          extra_headers: Json
          id: string
          is_active: boolean
          key_last4: string | null
          name: string
          updated_at: string
          vault_secret_id: string | null
        }
        Insert: {
          base_url: string
          created_at?: string
          created_by?: string | null
          extra_headers?: Json
          id?: string
          is_active?: boolean
          key_last4?: string | null
          name: string
          updated_at?: string
          vault_secret_id?: string | null
        }
        Update: {
          base_url?: string
          created_at?: string
          created_by?: string | null
          extra_headers?: Json
          id?: string
          is_active?: boolean
          key_last4?: string | null
          name?: string
          updated_at?: string
          vault_secret_id?: string | null
        }
        Relationships: []
      }
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
      chalan_close_snapshots: {
        Row: {
          chalan_id: string
          closed_at: string
          closed_by: string | null
          data: Json
        }
        Insert: {
          chalan_id: string
          closed_at?: string
          closed_by?: string | null
          data: Json
        }
        Update: {
          chalan_id?: string
          closed_at?: string
          closed_by?: string | null
          data?: Json
        }
        Relationships: [
          {
            foreignKeyName: "chalan_close_snapshots_chalan_id_fkey"
            columns: ["chalan_id"]
            isOneToOne: true
            referencedRelation: "chalans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chalan_close_snapshots_chalan_id_fkey"
            columns: ["chalan_id"]
            isOneToOne: true
            referencedRelation: "v_chalan_summary"
            referencedColumns: ["chalan_id"]
          },
        ]
      }
      chalan_purchases: {
        Row: {
          amount_paid: number
          chalan_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          partner_id: string
          qty: number
          updated_at: string
        }
        Insert: {
          amount_paid: number
          chalan_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          partner_id: string
          qty: number
          updated_at?: string
        }
        Update: {
          amount_paid?: number
          chalan_id?: string
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
            foreignKeyName: "chalan_purchases_chalan_id_fkey"
            columns: ["chalan_id"]
            isOneToOne: false
            referencedRelation: "chalans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chalan_purchases_chalan_id_fkey"
            columns: ["chalan_id"]
            isOneToOne: false
            referencedRelation: "v_chalan_summary"
            referencedColumns: ["chalan_id"]
          },
          {
            foreignKeyName: "chalan_purchases_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chalan_purchases_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "v_partner_balance"
            referencedColumns: ["partner_id"]
          },
        ]
      }
      chalans: {
        Row: {
          buy_rate: number
          closed_at: string | null
          closed_by: string | null
          code: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          note: string | null
          pcs_per_packet: number
          purchase_date: string
          status: string
          updated_at: string
        }
        Insert: {
          buy_rate?: number
          closed_at?: string | null
          closed_by?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          note?: string | null
          pcs_per_packet?: number
          purchase_date?: string
          status?: string
          updated_at?: string
        }
        Update: {
          buy_rate?: number
          closed_at?: string | null
          closed_by?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          note?: string | null
          pcs_per_packet?: number
          purchase_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      customer_payment_allocations: {
        Row: {
          amount: number
          created_at: string
          id: string
          packet_id: string
          payment_id: string
          sale_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          packet_id: string
          payment_id: string
          sale_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          packet_id?: string
          payment_id?: string
          sale_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_payment_allocations_packet_id_fkey"
            columns: ["packet_id"]
            isOneToOne: false
            referencedRelation: "packets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payment_allocations_packet_id_fkey"
            columns: ["packet_id"]
            isOneToOne: false
            referencedRelation: "v_packet_stock"
            referencedColumns: ["packet_id"]
          },
          {
            foreignKeyName: "customer_payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "customer_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payment_allocations_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payment_allocations_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "v_sales_agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payment_allocations_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "v_sales_enriched"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_payments: {
        Row: {
          amount: number
          at: string
          created_at: string
          created_by: string | null
          customer_id: string
          deleted_at: string | null
          id: string
          note: string | null
          updated_at: string
          wallet_account_id: string
        }
        Insert: {
          amount: number
          at?: string
          created_at?: string
          created_by?: string | null
          customer_id: string
          deleted_at?: string | null
          id?: string
          note?: string | null
          updated_at?: string
          wallet_account_id: string
        }
        Update: {
          amount?: number
          at?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string
          deleted_at?: string | null
          id?: string
          note?: string | null
          updated_at?: string
          wallet_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_balance"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_payments_wallet_account_id_fkey"
            columns: ["wallet_account_id"]
            isOneToOne: false
            referencedRelation: "v_wallet_balance"
            referencedColumns: ["wallet_id"]
          },
          {
            foreignKeyName: "customer_payments_wallet_account_id_fkey"
            columns: ["wallet_account_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      expense_categories: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          agent_model: string | null
          amount: number
          attributed_to_partner_id: string
          category_id: string
          chalan_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          note: string | null
          paid_by_partner_id: string
          pending_action_id: string | null
          source: string
          spent_at: string
          updated_at: string
          wallet_account_id: string | null
        }
        Insert: {
          agent_model?: string | null
          amount: number
          attributed_to_partner_id: string
          category_id: string
          chalan_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          note?: string | null
          paid_by_partner_id: string
          pending_action_id?: string | null
          source?: string
          spent_at?: string
          updated_at?: string
          wallet_account_id?: string | null
        }
        Update: {
          agent_model?: string | null
          amount?: number
          attributed_to_partner_id?: string
          category_id?: string
          chalan_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          note?: string | null
          paid_by_partner_id?: string
          pending_action_id?: string | null
          source?: string
          spent_at?: string
          updated_at?: string
          wallet_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_attributed_to_partner_id_fkey"
            columns: ["attributed_to_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_attributed_to_partner_id_fkey"
            columns: ["attributed_to_partner_id"]
            isOneToOne: false
            referencedRelation: "v_partner_balance"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_chalan_id_fkey"
            columns: ["chalan_id"]
            isOneToOne: false
            referencedRelation: "chalans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_chalan_id_fkey"
            columns: ["chalan_id"]
            isOneToOne: false
            referencedRelation: "v_chalan_summary"
            referencedColumns: ["chalan_id"]
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
          {
            foreignKeyName: "expenses_pending_action_fkey"
            columns: ["pending_action_id"]
            isOneToOne: false
            referencedRelation: "agent_pending_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_wallet_account_id_fkey"
            columns: ["wallet_account_id"]
            isOneToOne: false
            referencedRelation: "v_wallet_balance"
            referencedColumns: ["wallet_id"]
          },
          {
            foreignKeyName: "expenses_wallet_account_id_fkey"
            columns: ["wallet_account_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      packets: {
        Row: {
          chalan_id: string
          code: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          owner_partner_id: string
          packed_at: string
          total_pcs: number
          updated_at: string
        }
        Insert: {
          chalan_id: string
          code: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          owner_partner_id: string
          packed_at?: string
          total_pcs: number
          updated_at?: string
        }
        Update: {
          chalan_id?: string
          code?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          owner_partner_id?: string
          packed_at?: string
          total_pcs?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "packets_chalan_id_fkey"
            columns: ["chalan_id"]
            isOneToOne: false
            referencedRelation: "chalans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packets_chalan_id_fkey"
            columns: ["chalan_id"]
            isOneToOne: false
            referencedRelation: "v_chalan_summary"
            referencedColumns: ["chalan_id"]
          },
          {
            foreignKeyName: "packets_owner_partner_id_fkey"
            columns: ["owner_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packets_owner_partner_id_fkey"
            columns: ["owner_partner_id"]
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
      permissions: {
        Row: {
          key: string
          label_bn: string
          sort: number
        }
        Insert: {
          key: string
          label_bn: string
          sort?: number
        }
        Update: {
          key?: string
          label_bn?: string
          sort?: number
        }
        Relationships: []
      }
      personal_uses: {
        Row: {
          agent_model: string | null
          at: string
          chalan_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          eater_partner_id: string
          id: string
          note: string | null
          packet_id: string | null
          pending_action_id: string | null
          qty: number
          source: string
          unit_value: number
          updated_at: string
        }
        Insert: {
          agent_model?: string | null
          at?: string
          chalan_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          eater_partner_id: string
          id?: string
          note?: string | null
          packet_id?: string | null
          pending_action_id?: string | null
          qty: number
          source?: string
          unit_value: number
          updated_at?: string
        }
        Update: {
          agent_model?: string | null
          at?: string
          chalan_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          eater_partner_id?: string
          id?: string
          note?: string | null
          packet_id?: string | null
          pending_action_id?: string | null
          qty?: number
          source?: string
          unit_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "personal_uses_chalan_id_fkey"
            columns: ["chalan_id"]
            isOneToOne: false
            referencedRelation: "chalans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personal_uses_chalan_id_fkey"
            columns: ["chalan_id"]
            isOneToOne: false
            referencedRelation: "v_chalan_summary"
            referencedColumns: ["chalan_id"]
          },
          {
            foreignKeyName: "personal_uses_eater_partner_id_fkey"
            columns: ["eater_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personal_uses_eater_partner_id_fkey"
            columns: ["eater_partner_id"]
            isOneToOne: false
            referencedRelation: "v_partner_balance"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "personal_uses_packet_id_fkey"
            columns: ["packet_id"]
            isOneToOne: false
            referencedRelation: "packets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personal_uses_packet_id_fkey"
            columns: ["packet_id"]
            isOneToOne: false
            referencedRelation: "v_packet_stock"
            referencedColumns: ["packet_id"]
          },
          {
            foreignKeyName: "personal_uses_pending_action_fkey"
            columns: ["pending_action_id"]
            isOneToOne: false
            referencedRelation: "agent_pending_actions"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_permissions: {
        Row: {
          allowed: boolean
          permission_key: string
          profile_id: string
        }
        Insert: {
          allowed: boolean
          permission_key: string
          profile_id: string
        }
        Update: {
          allowed?: boolean
          permission_key?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "profile_permissions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
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
      role_permissions: {
        Row: {
          permission_key: string
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          permission_key: string
          role: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          permission_key?: string
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
        ]
      }
      sale_allocations: {
        Row: {
          created_at: string
          packet_id: string
          qty: number
          sale_id: string
        }
        Insert: {
          created_at?: string
          packet_id: string
          qty: number
          sale_id: string
        }
        Update: {
          created_at?: string
          packet_id?: string
          qty?: number
          sale_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_allocations_packet_id_fkey"
            columns: ["packet_id"]
            isOneToOne: false
            referencedRelation: "packets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_allocations_packet_id_fkey"
            columns: ["packet_id"]
            isOneToOne: false
            referencedRelation: "v_packet_stock"
            referencedColumns: ["packet_id"]
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
            referencedRelation: "v_sales_agent"
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
      sale_receives: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          sale_id: string
          wallet_account_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          sale_id: string
          wallet_account_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          sale_id?: string
          wallet_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_receives_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_receives_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "v_sales_agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_receives_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "v_sales_enriched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_receives_wallet_account_id_fkey"
            columns: ["wallet_account_id"]
            isOneToOne: false
            referencedRelation: "v_wallet_balance"
            referencedColumns: ["wallet_id"]
          },
          {
            foreignKeyName: "sale_receives_wallet_account_id_fkey"
            columns: ["wallet_account_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          agent_model: string | null
          amount_received: number
          created_at: string
          created_by: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          deleted_at: string | null
          discount: number | null
          due_amount: number
          id: string
          list_unit_price: number
          note: string | null
          pending_action_id: string | null
          qty: number
          sold_at: string
          source: string
          updated_at: string
          wallet_account_id: string
        }
        Insert: {
          agent_model?: string | null
          amount_received: number
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          deleted_at?: string | null
          discount?: number | null
          due_amount?: number
          id?: string
          list_unit_price: number
          note?: string | null
          pending_action_id?: string | null
          qty: number
          sold_at?: string
          source?: string
          updated_at?: string
          wallet_account_id: string
        }
        Update: {
          agent_model?: string | null
          amount_received?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          deleted_at?: string | null
          discount?: number | null
          due_amount?: number
          id?: string
          list_unit_price?: number
          note?: string | null
          pending_action_id?: string | null
          qty?: number
          sold_at?: string
          source?: string
          updated_at?: string
          wallet_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_balance"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "sales_pending_action_fkey"
            columns: ["pending_action_id"]
            isOneToOne: false
            referencedRelation: "agent_pending_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_wallet_account_id_fkey"
            columns: ["wallet_account_id"]
            isOneToOne: false
            referencedRelation: "v_wallet_balance"
            referencedColumns: ["wallet_id"]
          },
          {
            foreignKeyName: "sales_wallet_account_id_fkey"
            columns: ["wallet_account_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      sell_priority: {
        Row: {
          packet_id: string
          position: number
        }
        Insert: {
          packet_id: string
          position: number
        }
        Update: {
          packet_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "sell_priority_packet_id_fkey"
            columns: ["packet_id"]
            isOneToOne: true
            referencedRelation: "packets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sell_priority_packet_id_fkey"
            columns: ["packet_id"]
            isOneToOne: true
            referencedRelation: "v_packet_stock"
            referencedColumns: ["packet_id"]
          },
        ]
      }
      settings: {
        Row: {
          default_buy_rate: number
          default_packet_size: number
          default_sell_price: number
          id: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          default_buy_rate?: number
          default_packet_size?: number
          default_sell_price?: number
          id?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          default_buy_rate?: number
          default_packet_size?: number
          default_sell_price?: number
          id?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      stock_adjustments: {
        Row: {
          agent_model: string | null
          at: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          note: string | null
          packet_id: string
          pending_action_id: string | null
          person: string | null
          qty: number
          reason: string
          source: string
          updated_at: string
        }
        Insert: {
          agent_model?: string | null
          at?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          note?: string | null
          packet_id: string
          pending_action_id?: string | null
          person?: string | null
          qty: number
          reason: string
          source?: string
          updated_at?: string
        }
        Update: {
          agent_model?: string | null
          at?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          note?: string | null
          packet_id?: string
          pending_action_id?: string | null
          person?: string | null
          qty?: number
          reason?: string
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_adjustments_packet_id_fkey"
            columns: ["packet_id"]
            isOneToOne: false
            referencedRelation: "packets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_packet_id_fkey"
            columns: ["packet_id"]
            isOneToOne: false
            referencedRelation: "v_packet_stock"
            referencedColumns: ["packet_id"]
          },
          {
            foreignKeyName: "stock_adjustments_pending_action_fkey"
            columns: ["pending_action_id"]
            isOneToOne: false
            referencedRelation: "agent_pending_actions"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_transfers: {
        Row: {
          amount: number
          at: string
          attributed_to_partner_id: string
          charge: number
          created_at: string
          created_by: string | null
          deleted_at: string | null
          from_wallet_id: string
          id: string
          note: string | null
          to_wallet_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          at?: string
          attributed_to_partner_id: string
          charge?: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          from_wallet_id: string
          id?: string
          note?: string | null
          to_wallet_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          at?: string
          attributed_to_partner_id?: string
          charge?: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          from_wallet_id?: string
          id?: string
          note?: string | null
          to_wallet_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transfers_attributed_to_partner_id_fkey"
            columns: ["attributed_to_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transfers_attributed_to_partner_id_fkey"
            columns: ["attributed_to_partner_id"]
            isOneToOne: false
            referencedRelation: "v_partner_balance"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "wallet_transfers_from_wallet_id_fkey"
            columns: ["from_wallet_id"]
            isOneToOne: false
            referencedRelation: "v_wallet_balance"
            referencedColumns: ["wallet_id"]
          },
          {
            foreignKeyName: "wallet_transfers_from_wallet_id_fkey"
            columns: ["from_wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transfers_to_wallet_id_fkey"
            columns: ["to_wallet_id"]
            isOneToOne: false
            referencedRelation: "v_wallet_balance"
            referencedColumns: ["wallet_id"]
          },
          {
            foreignKeyName: "wallet_transfers_to_wallet_id_fkey"
            columns: ["to_wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          label: string
          name: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          label: string
          name?: string
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          label?: string
          name?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      withdrawals: {
        Row: {
          amount: number
          at: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          note: string | null
          partner_id: string
          updated_at: string
          wallet_account_id: string
        }
        Insert: {
          amount: number
          at?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          note?: string | null
          partner_id: string
          updated_at?: string
          wallet_account_id: string
        }
        Update: {
          amount?: number
          at?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          note?: string | null
          partner_id?: string
          updated_at?: string
          wallet_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "withdrawals_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "withdrawals_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "v_partner_balance"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "withdrawals_wallet_account_id_fkey"
            columns: ["wallet_account_id"]
            isOneToOne: false
            referencedRelation: "v_wallet_balance"
            referencedColumns: ["wallet_id"]
          },
          {
            foreignKeyName: "withdrawals_wallet_account_id_fkey"
            columns: ["wallet_account_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_adjustments_enriched: {
        Row: {
          agent_model: string | null
          at: string | null
          cost_borne: number | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          id: string | null
          note: string | null
          owner_name: string | null
          packet_code: string | null
          packet_id: string | null
          person: string | null
          qty: number | null
          reason: string | null
          source: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_adjustments_packet_id_fkey"
            columns: ["packet_id"]
            isOneToOne: false
            referencedRelation: "packets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_packet_id_fkey"
            columns: ["packet_id"]
            isOneToOne: false
            referencedRelation: "v_packet_stock"
            referencedColumns: ["packet_id"]
          },
        ]
      }
      v_chalan_summary: {
        Row: {
          adjusted_pcs: number | null
          bought_pcs: number | null
          capital: number | null
          chalan_id: string | null
          code: string | null
          expenses: number | null
          personal_pcs: number | null
          remaining: number | null
          sold_pcs: number | null
          status: string | null
        }
        Insert: {
          adjusted_pcs?: never
          bought_pcs?: never
          capital?: never
          chalan_id?: string | null
          code?: string | null
          expenses?: never
          personal_pcs?: never
          remaining?: never
          sold_pcs?: never
          status?: string | null
        }
        Update: {
          adjusted_pcs?: never
          bought_pcs?: never
          capital?: never
          chalan_id?: string | null
          code?: string | null
          expenses?: never
          personal_pcs?: never
          remaining?: never
          sold_pcs?: never
          status?: string | null
        }
        Relationships: []
      }
      v_customer_balance: {
        Row: {
          balance: number | null
          customer_id: string | null
          name: string | null
          phone: string | null
        }
        Insert: {
          balance?: never
          customer_id?: string | null
          name?: string | null
          phone?: string | null
        }
        Update: {
          balance?: never
          customer_id?: string | null
          name?: string | null
          phone?: string | null
        }
        Relationships: []
      }
      v_expenses_enriched: {
        Row: {
          agent_model: string | null
          amount: number | null
          attributed_to_name: string | null
          category_name: string | null
          chalan_code: string | null
          chalan_id: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          id: string | null
          note: string | null
          paid_by_name: string | null
          source: string | null
          spent_at: string | null
          wallet_label: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_chalan_id_fkey"
            columns: ["chalan_id"]
            isOneToOne: false
            referencedRelation: "chalans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_chalan_id_fkey"
            columns: ["chalan_id"]
            isOneToOne: false
            referencedRelation: "v_chalan_summary"
            referencedColumns: ["chalan_id"]
          },
        ]
      }
      v_packet_stock: {
        Row: {
          chalan_code: string | null
          chalan_id: string | null
          chalan_status: string | null
          owner_name: string | null
          owner_partner_id: string | null
          packet_code: string | null
          packet_id: string | null
          position: number | null
          remaining: number | null
          total_pcs: number | null
        }
        Relationships: [
          {
            foreignKeyName: "packets_chalan_id_fkey"
            columns: ["chalan_id"]
            isOneToOne: false
            referencedRelation: "chalans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packets_chalan_id_fkey"
            columns: ["chalan_id"]
            isOneToOne: false
            referencedRelation: "v_chalan_summary"
            referencedColumns: ["chalan_id"]
          },
          {
            foreignKeyName: "packets_owner_partner_id_fkey"
            columns: ["owner_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packets_owner_partner_id_fkey"
            columns: ["owner_partner_id"]
            isOneToOne: false
            referencedRelation: "v_partner_balance"
            referencedColumns: ["partner_id"]
          },
        ]
      }
      v_partner_balance: {
        Row: {
          balance: number | null
          balance_closed: number | null
          balance_open: number | null
          partner_id: string | null
          partner_name: string | null
        }
        Relationships: []
      }
      v_partner_chalan_settlement: {
        Row: {
          capital: number | null
          chalan_id: string | null
          consumption_due: number | null
          cost: number | null
          entitlement: number | null
          expenses_attributed: number | null
          ext_rev: number | null
          internal_rev: number | null
          partner_id: string | null
          partner_name: string | null
          pcs_out: number | null
          pocket_paid: number | null
          profit: number | null
        }
        Relationships: []
      }
      v_personal_uses_enriched: {
        Row: {
          agent_model: string | null
          at: string | null
          chalan_id: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          eater_name: string | null
          id: string | null
          note: string | null
          owner_name: string | null
          packet_code: string | null
          packet_id: string | null
          qty: number | null
          source: string | null
          unit_value: number | null
          value_owed: number | null
        }
        Relationships: [
          {
            foreignKeyName: "personal_uses_chalan_id_fkey"
            columns: ["chalan_id"]
            isOneToOne: false
            referencedRelation: "chalans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personal_uses_chalan_id_fkey"
            columns: ["chalan_id"]
            isOneToOne: false
            referencedRelation: "v_chalan_summary"
            referencedColumns: ["chalan_id"]
          },
          {
            foreignKeyName: "personal_uses_packet_id_fkey"
            columns: ["packet_id"]
            isOneToOne: false
            referencedRelation: "packets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personal_uses_packet_id_fkey"
            columns: ["packet_id"]
            isOneToOne: false
            referencedRelation: "v_packet_stock"
            referencedColumns: ["packet_id"]
          },
        ]
      }
      v_sales_agent: {
        Row: {
          agent_model: string | null
          amount_received: number | null
          created_at: string | null
          created_by: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          discount: number | null
          discount_pct: number | null
          due_amount: number | null
          entered_by: string | null
          id: string | null
          list_unit_price: number | null
          note: string | null
          owner_names: string | null
          owner_partner_ids: string[] | null
          packet_codes: string | null
          qty: number | null
          sold_at: string | null
          source: string | null
          wallet_account_id: string | null
          wallet_details: string | null
          wallet_label: string | null
          wallet_name: string | null
          wallet_type: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_balance"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "sales_wallet_account_id_fkey"
            columns: ["wallet_account_id"]
            isOneToOne: false
            referencedRelation: "v_wallet_balance"
            referencedColumns: ["wallet_id"]
          },
          {
            foreignKeyName: "sales_wallet_account_id_fkey"
            columns: ["wallet_account_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      v_sales_enriched: {
        Row: {
          amount_received: number | null
          created_at: string | null
          created_by: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          discount: number | null
          discount_pct: number | null
          due_amount: number | null
          entered_by: string | null
          id: string | null
          list_unit_price: number | null
          note: string | null
          owner_names: string | null
          owner_partner_ids: string[] | null
          packet_codes: string | null
          qty: number | null
          sold_at: string | null
          wallet_account_id: string | null
          wallet_details: string | null
          wallet_label: string | null
          wallet_name: string | null
          wallet_type: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_balance"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "sales_wallet_account_id_fkey"
            columns: ["wallet_account_id"]
            isOneToOne: false
            referencedRelation: "v_wallet_balance"
            referencedColumns: ["wallet_id"]
          },
          {
            foreignKeyName: "sales_wallet_account_id_fkey"
            columns: ["wallet_account_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      v_wallet_balance: {
        Row: {
          balance: number | null
          is_active: boolean | null
          label: string | null
          name: string | null
          type: string | null
          wallet_id: string | null
        }
        Insert: {
          balance?: never
          is_active?: boolean | null
          label?: string | null
          name?: string | null
          type?: string | null
          wallet_id?: string | null
        }
        Update: {
          balance?: never
          is_active?: boolean | null
          label?: string | null
          name?: string | null
          type?: string | null
          wallet_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      adjust_chalan_purchase: {
        Args: {
          p_chalan_id: string
          p_delta: number
          p_packets?: Json
          p_partner_id: string
        }
        Returns: undefined
      }
      agent_approve_action: {
        Args: { p_action_id: string; p_expected_preview_hash: string }
        Returns: Json
      }
      agent_assert_allowed: { Args: never; Returns: undefined }
      agent_clear_provider_key: {
        Args: { p_provider_id: string }
        Returns: undefined
      }
      agent_create_action: {
        Args: {
          p_conversation_id: string
          p_defaults_used: string[]
          p_message_id: string
          p_model_id: string
          p_payload: Json
          p_tool: string
        }
        Returns: Json
      }
      agent_deltas: { Args: { p_after: Json; p_before: Json }; Returns: Json }
      agent_fix_payload: {
        Args: { p_payload: Json; p_tool: string }
        Returns: Json
      }
      agent_get_provider_key: {
        Args: { p_provider_id: string }
        Returns: string
      }
      agent_hash: { Args: { p_data: Json }; Returns: string }
      agent_preview_action: {
        Args: { p_payload: Json; p_tool: string }
        Returns: Json
      }
      agent_purge_history: { Args: never; Returns: number }
      agent_purge_history_impl: { Args: never; Returns: number }
      agent_reject_action: { Args: { p_action_id: string }; Returns: Json }
      agent_set_provider_key: {
        Args: { p_key: string; p_provider_id: string }
        Returns: undefined
      }
      agent_snapshot: { Args: never; Returns: Json }
      allocate_by_priority: {
        Args: { p_qty: number; p_sale_id: string }
        Returns: undefined
      }
      assert_writeable: { Args: { p_perm?: string }; Returns: undefined }
      can_write: { Args: never; Returns: boolean }
      close_chalan: { Args: { p_chalan_id: string }; Returns: undefined }
      complete_password_change: { Args: never; Returns: undefined }
      create_adjustment: { Args: { p_adj: Json }; Returns: string }
      create_chalan: { Args: { p_payload: Json }; Returns: string }
      create_customer_payment: { Args: { p_pay: Json }; Returns: string }
      create_expense: { Args: { p_exp: Json }; Returns: string }
      create_packets: { Args: { p_payload: Json }; Returns: undefined }
      create_personal_use: { Args: { p_use: Json }; Returns: string }
      create_sale: { Args: { p_sale: Json }; Returns: string }
      create_transfer: { Args: { p_t: Json }; Returns: string }
      create_withdrawal: { Args: { p_w: Json }; Returns: string }
      dashboard_totals: {
        Args: { p_end?: string; p_start?: string }
        Returns: {
          cash_received: number
          discount_total: number
          expenses: number
          income: number
          list_value: number
          net_profit: number
          realized_cost: number
          stock_current: number
        }[]
      }
      delete_chalan: { Args: { p_id: string }; Returns: undefined }
      delete_expense: { Args: { p_id: string }; Returns: undefined }
      delete_personal_use: { Args: { p_id: string }; Returns: undefined }
      delete_sale: { Args: { p_id: string }; Returns: undefined }
      has_permission: { Args: { p_key: string }; Returns: boolean }
      income_by_period_breakdown: {
        Args: { p_end: string; p_start: string }
        Returns: {
          amount: number
          slice: string
        }[]
      }
      is_active_user: { Args: never; Returns: boolean }
      is_su_admin: { Args: never; Returns: boolean }
      my_permissions: { Args: never; Returns: string[] }
      packet_remaining: { Args: { p_packet_id: string }; Returns: number }
      partner_balance_flows: {
        Args: { p_end: string; p_start: string }
        Returns: {
          balance: number
          partner_id: string
          partner_name: string
        }[]
      }
      partner_sell_summary: {
        Args: { p_end: string; p_start: string }
        Returns: {
          balance: number
          khoroch: number
          partner_id: string
          partner_name: string
          personal_use: number
          remaining_pcs: number
          sell_revenue: number
        }[]
      }
      password_gate: { Args: never; Returns: boolean }
      reopen_chalan: { Args: { p_chalan_id: string }; Returns: undefined }
      server_now: { Args: never; Returns: string }
      set_sell_priority: { Args: { p_ordered: string[] }; Returns: undefined }
      update_expense: {
        Args: { p_exp: Json; p_id: string }
        Returns: undefined
      }
      update_sale: { Args: { p_id: string; p_sale: Json }; Returns: undefined }
      wallet_flows: {
        Args: { p_end: string; p_start: string }
        Returns: {
          amount: number
          is_active: boolean
          label: string
          name: string
          type: string
          wallet_id: string
        }[]
      }
    }
    Enums: {
      user_role:
        | "su_admin"
        | "patabin_admin"
        | "patabin_partner"
        | "patabin_demo_admin"
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
      user_role: [
        "su_admin",
        "patabin_admin",
        "patabin_partner",
        "patabin_demo_admin",
      ],
    },
  },
} as const
