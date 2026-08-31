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
      app_settings: {
        Row: {
          card_payment_provider: string
          current_wait_time: string
          flatbread_addon_enabled: boolean
          google_review_url: string | null
          id: number
          is_store_open: boolean
          loyalty_enabled: boolean
          loyalty_points_per_order: number
          loyalty_reward_cost: number
          loyalty_reward_label: string
          marketing_banner_enabled: boolean | null
          marketing_banner_text: string | null
          online_payments_enabled: boolean
          opening_hours: Json | null
          pay_on_collection_enabled: boolean
          preorder_hours: Json
          preorder_kitchen_lead_minutes: number
          preorder_max_days: number
          preorder_min_notice_minutes: number
          preorder_slot_capacity: number
          preorder_slot_interval_minutes: number
          preorders_enabled: boolean
          updated_at: string | null
        }
        Insert: {
          card_payment_provider?: string
          current_wait_time?: string
          flatbread_addon_enabled?: boolean
          google_review_url?: string | null
          id?: number
          is_store_open?: boolean
          loyalty_enabled?: boolean
          loyalty_points_per_order?: number
          loyalty_reward_cost?: number
          loyalty_reward_label?: string
          marketing_banner_enabled?: boolean | null
          marketing_banner_text?: string | null
          online_payments_enabled?: boolean
          opening_hours?: Json | null
          pay_on_collection_enabled?: boolean
          preorder_hours?: Json
          preorder_kitchen_lead_minutes?: number
          preorder_max_days?: number
          preorder_min_notice_minutes?: number
          preorder_slot_capacity?: number
          preorder_slot_interval_minutes?: number
          preorders_enabled?: boolean
          updated_at?: string | null
        }
        Update: {
          card_payment_provider?: string
          current_wait_time?: string
          flatbread_addon_enabled?: boolean
          google_review_url?: string | null
          id?: number
          is_store_open?: boolean
          loyalty_enabled?: boolean
          loyalty_points_per_order?: number
          loyalty_reward_cost?: number
          loyalty_reward_label?: string
          marketing_banner_enabled?: boolean | null
          marketing_banner_text?: string | null
          online_payments_enabled?: boolean
          opening_hours?: Json | null
          pay_on_collection_enabled?: boolean
          preorder_hours?: Json
          preorder_kitchen_lead_minutes?: number
          preorder_max_days?: number
          preorder_min_notice_minutes?: number
          preorder_slot_capacity?: number
          preorder_slot_interval_minutes?: number
          preorders_enabled?: boolean
          updated_at?: string | null
        }
        Relationships: []
      }
      broadcasts: {
        Row: {
          created_at: string
          id: string
          image_url: string | null
          message: string
          open_rate: number | null
          recipients_count: number | null
          revenue_generated: number | null
          sent_at: string
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url?: string | null
          message: string
          open_rate?: number | null
          recipients_count?: number | null
          revenue_generated?: number | null
          sent_at?: string
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string | null
          message?: string
          open_rate?: number | null
          recipients_count?: number | null
          revenue_generated?: number | null
          sent_at?: string
          title?: string
        }
        Relationships: []
      }
      cart_items: {
        Row: {
          created_at: string
          id: string
          product_id: string
          quantity: number
          removed_ingredients: Json | null
          selected_modifiers: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          quantity?: number
          removed_ingredients?: Json | null
          selected_modifiers?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          removed_ingredients?: Json | null
          selected_modifiers?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      community_votes: {
        Row: {
          closing_date: string
          created_at: string
          id: string
          is_active: boolean
          option_a: string
          option_b: string
          title: string
          updated_at: string
          votes_a: number
          votes_b: number
          winner: string | null
        }
        Insert: {
          closing_date: string
          created_at?: string
          id?: string
          is_active?: boolean
          option_a: string
          option_b: string
          title: string
          updated_at?: string
          votes_a?: number
          votes_b?: number
          winner?: string | null
        }
        Update: {
          closing_date?: string
          created_at?: string
          id?: string
          is_active?: boolean
          option_a?: string
          option_b?: string
          title?: string
          updated_at?: string
          votes_a?: number
          votes_b?: number
          winner?: string | null
        }
        Relationships: []
      }
      competitor_profiles: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          google_maps_url: string | null
          id: string
          name: string
          notes: string | null
          updated_at: string
          website_url: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          google_maps_url?: string | null
          id?: string
          name: string
          notes?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          google_maps_url?: string | null
          id?: string
          name?: string
          notes?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      competitor_snapshots: {
        Row: {
          average_main_price: number | null
          average_rating: number | null
          competitor_id: string
          created_at: string
          entry_price: number | null
          evidence_url: string | null
          id: string
          menu_item_count: number | null
          notes: string | null
          observed_at: string
          offer_summary: string | null
          recorded_by: string | null
          review_count: number | null
          source_type: string
        }
        Insert: {
          average_main_price?: number | null
          average_rating?: number | null
          competitor_id: string
          created_at?: string
          entry_price?: number | null
          evidence_url?: string | null
          id?: string
          menu_item_count?: number | null
          notes?: string | null
          observed_at?: string
          offer_summary?: string | null
          recorded_by?: string | null
          review_count?: number | null
          source_type: string
        }
        Update: {
          average_main_price?: number | null
          average_rating?: number | null
          competitor_id?: string
          created_at?: string
          entry_price?: number | null
          evidence_url?: string | null
          id?: string
          menu_item_count?: number | null
          notes?: string | null
          observed_at?: string
          offer_summary?: string | null
          recorded_by?: string | null
          review_count?: number | null
          source_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "competitor_snapshots_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "competitor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_notes: {
        Row: {
          created_at: string
          customer_phone: string
          dietary_notes: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_phone: string
          dietary_notes?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_phone?: string
          dietary_notes?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      food_safety_logs: {
        Row: {
          checkpoint: string
          corrective_action: string | null
          created_at: string
          id: string
          log_type: string
          notes: string | null
          numeric_value: number | null
          recorded_at: string
          recorded_by: string
          status: string
          unit: string | null
        }
        Insert: {
          checkpoint: string
          corrective_action?: string | null
          created_at?: string
          id?: string
          log_type: string
          notes?: string | null
          numeric_value?: number | null
          recorded_at?: string
          recorded_by?: string
          status: string
          unit?: string | null
        }
        Update: {
          checkpoint?: string
          corrective_action?: string | null
          created_at?: string
          id?: string
          log_type?: string
          notes?: string | null
          numeric_value?: number | null
          recorded_at?: string
          recorded_by?: string
          status?: string
          unit?: string | null
        }
        Relationships: []
      }
      foodos_module_settings: {
        Row: {
          description: string
          display_order: number
          domain: string
          enabled: boolean
          label: string
          lifecycle_status: string
          module_key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          description: string
          display_order?: number
          domain: string
          enabled?: boolean
          label: string
          lifecycle_status?: string
          module_key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          description?: string
          display_order?: number
          domain?: string
          enabled?: boolean
          label?: string
          lifecycle_status?: string
          module_key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      inventory_items: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          opening_quantity: number
          par_level: number | null
          reorder_level: number
          sku: string | null
          unit: string
          unit_cost: number | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          opening_quantity?: number
          par_level?: number | null
          reorder_level?: number
          sku?: string | null
          unit: string
          unit_cost?: number | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          opening_quantity?: number
          par_level?: number | null
          reorder_level?: number
          sku?: string | null
          unit?: string
          unit_cost?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      inventory_movements: {
        Row: {
          created_at: string
          id: string
          inventory_item_id: string
          movement_type: string
          note: string | null
          occurred_at: string
          order_id: string | null
          quantity_delta: number
          recorded_by: string | null
          unit_cost: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          inventory_item_id: string
          movement_type: string
          note?: string | null
          occurred_at?: string
          order_id?: string | null
          quantity_delta: number
          recorded_by?: string | null
          unit_cost?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          inventory_item_id?: string
          movement_type?: string
          note?: string | null
          occurred_at?: string
          order_id?: string | null
          quantity_delta?: number
          recorded_by?: string | null
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_metrics: {
        Row: {
          campaign_external_id: string | null
          campaign_name: string | null
          channel: string
          created_at: string
          external_event_id: string | null
          id: string
          metric_name: string
          metric_value: number
          period_end: string
          period_start: string
          provenance: string
          provider: string
          verified_at: string
        }
        Insert: {
          campaign_external_id?: string | null
          campaign_name?: string | null
          channel: string
          created_at?: string
          external_event_id?: string | null
          id?: string
          metric_name: string
          metric_value: number
          period_end: string
          period_start: string
          provenance: string
          provider: string
          verified_at?: string
        }
        Update: {
          campaign_external_id?: string | null
          campaign_name?: string | null
          channel?: string
          created_at?: string
          external_event_id?: string | null
          id?: string
          metric_name?: string
          metric_value?: number
          period_end?: string
          period_start?: string
          provenance?: string
          provider?: string
          verified_at?: string
        }
        Relationships: []
      }
      roster_shifts: {
        Row: {
          break_minutes: number
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          role_label: string
          shift_end: string
          shift_start: string
          staff_user_id: string
          status: string
          updated_at: string
        }
        Insert: {
          break_minutes?: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          role_label?: string
          shift_end: string
          shift_start: string
          staff_user_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          break_minutes?: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          role_label?: string
          shift_end?: string
          shift_start?: string
          staff_user_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roster_shifts_staff_user_id_fkey"
            columns: ["staff_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string
          email: string | null
          last_order_date: string | null
          name: string | null
          phone_number: string
          total_spend: number
          updated_at: string
          visit_count: number
        }
        Insert: {
          created_at?: string
          email?: string | null
          last_order_date?: string | null
          name?: string | null
          phone_number: string
          total_spend?: number
          updated_at?: string
          visit_count?: number
        }
        Update: {
          created_at?: string
          email?: string | null
          last_order_date?: string | null
          name?: string | null
          phone_number?: string
          total_spend?: number
          updated_at?: string
          visit_count?: number
        }
        Relationships: []
      }
      feedback_tokens: {
        Row: {
          created_at: string
          expires_at: string
          order_id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          expires_at?: string
          order_id: string
          token?: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          order_id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_tokens_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_tokens_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_paid_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_tokens_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_review_request_queue"
            referencedColumns: ["order_id"]
          },
        ]
      }
      ingredients: {
        Row: {
          addon_price: number
          addon_price_kids: number
          created_at: string
          id: string
          in_stock: boolean
          ingredient_type: string
          name: string
        }
        Insert: {
          addon_price?: number
          addon_price_kids?: number
          created_at?: string
          id?: string
          in_stock?: boolean
          ingredient_type?: string
          name: string
        }
        Update: {
          addon_price?: number
          addon_price_kids?: number
          created_at?: string
          id?: string
          in_stock?: boolean
          ingredient_type?: string
          name?: string
        }
        Relationships: []
      }
      loyalty_events: {
        Row: {
          created_at: string
          created_by: string | null
          event_type: string
          id: string
          note: string | null
          order_id: string | null
          points_delta: number
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_type: string
          id?: string
          note?: string | null
          order_id?: string | null
          points_delta: number
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_type?: string
          id?: string
          note?: string | null
          order_id?: string | null
          points_delta?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_posts: {
        Row: {
          content: string
          created_at: string | null
          id: string
          image_generated_url: string | null
          platform: Database["public"]["Enums"]["post_platform"]
          product_id: string | null
          status: Database["public"]["Enums"]["post_status"] | null
          updated_at: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          image_generated_url?: string | null
          platform: Database["public"]["Enums"]["post_platform"]
          product_id?: string | null
          status?: Database["public"]["Enums"]["post_status"] | null
          updated_at?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          image_generated_url?: string | null
          platform?: Database["public"]["Enums"]["post_platform"]
          product_id?: string | null
          status?: Database["public"]["Enums"]["post_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_posts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      modifier_groups: {
        Row: {
          created_at: string | null
          id: string
          max_selection: number | null
          min_selection: number | null
          name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          max_selection?: number | null
          min_selection?: number | null
          name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          max_selection?: number | null
          min_selection?: number | null
          name?: string
        }
        Relationships: []
      }
      modifiers: {
        Row: {
          created_at: string | null
          group_id: string | null
          id: string
          name: string
          price_adjustment: number | null
        }
        Insert: {
          created_at?: string | null
          group_id?: string | null
          id?: string
          name: string
          price_adjustment?: number | null
        }
        Update: {
          created_at?: string | null
          group_id?: string | null
          id?: string
          name?: string
          price_adjustment?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "modifiers_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "modifier_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      order_feedback: {
        Row: {
          alerted_at: string | null
          comment: string | null
          created_at: string
          customer_phone: string | null
          id: string
          order_id: string | null
          rating: number | null
          requested_at: string
          resolution_note: string | null
          resolved_at: string | null
          responded_at: string | null
          review_link_sent_at: string | null
          source: string
          updated_at: string
        }
        Insert: {
          alerted_at?: string | null
          comment?: string | null
          created_at?: string
          customer_phone?: string | null
          id?: string
          order_id?: string | null
          rating?: number | null
          requested_at?: string
          resolution_note?: string | null
          resolved_at?: string | null
          responded_at?: string | null
          review_link_sent_at?: string | null
          source?: string
          updated_at?: string
        }
        Update: {
          alerted_at?: string | null
          comment?: string | null
          created_at?: string
          customer_phone?: string | null
          id?: string
          order_id?: string | null
          rating?: number | null
          requested_at?: string
          resolution_note?: string | null
          resolved_at?: string | null
          responded_at?: string | null
          review_link_sent_at?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_feedback_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_feedback_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "v_paid_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_feedback_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "v_review_request_queue"
            referencedColumns: ["order_id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string | null
          id: string
          order_id: string | null
          product_id: string | null
          product_name: string | null
          quantity: number | null
          selected_modifiers: Json | null
          unit_price: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          order_id?: string | null
          product_id?: string | null
          product_name?: string | null
          quantity?: number | null
          selected_modifiers?: Json | null
          unit_price: number
        }
        Update: {
          created_at?: string | null
          id?: string
          order_id?: string | null
          product_id?: string | null
          product_name?: string | null
          quantity?: number | null
          selected_modifiers?: Json | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_paid_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_review_request_queue"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          cash_tendered: number | null
          change_due: number | null
          completed_at: string | null
          created_at: string | null
          customer_name: string | null
          customer_phone: string | null
          display_id: number
          fulfillment_type: string
          id: string
          kitchen_release_at: string | null
          order_channel: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          payment_status: string | null
          review_sms_sent: boolean
          review_sms_sent_at: string | null
          review_sms_sid: string | null
          released_to_kitchen_at: string | null
          scheduled_for: string | null
          special_notes: string | null
          status: Database["public"]["Enums"]["order_status"] | null
          total: number
          updated_at: string | null
          user_id: string | null
          voice_call_id: string | null
          viva_order_code: string | null
          viva_transaction_id: string | null
        }
        Insert: {
          cash_tendered?: number | null
          change_due?: number | null
          completed_at?: string | null
          created_at?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          display_id?: number
          fulfillment_type?: string
          id?: string
          kitchen_release_at?: string | null
          order_channel?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_status?: string | null
          review_sms_sent?: boolean
          review_sms_sent_at?: string | null
          review_sms_sid?: string | null
          released_to_kitchen_at?: string | null
          scheduled_for?: string | null
          special_notes?: string | null
          status?: Database["public"]["Enums"]["order_status"] | null
          total: number
          updated_at?: string | null
          user_id?: string | null
          voice_call_id?: string | null
          viva_order_code?: string | null
          viva_transaction_id?: string | null
        }
        Update: {
          cash_tendered?: number | null
          change_due?: number | null
          completed_at?: string | null
          created_at?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          display_id?: number
          fulfillment_type?: string
          id?: string
          kitchen_release_at?: string | null
          order_channel?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_status?: string | null
          review_sms_sent?: boolean
          review_sms_sent_at?: string | null
          review_sms_sid?: string | null
          released_to_kitchen_at?: string | null
          scheduled_for?: string | null
          special_notes?: string | null
          status?: Database["public"]["Enums"]["order_status"] | null
          total?: number
          updated_at?: string | null
          user_id?: string | null
          voice_call_id?: string | null
          viva_order_code?: string | null
          viva_transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_ingestion_locks: {
        Row: {
          branch: string | null
          created_at: string
          id: string
          order_code: string | null
          order_id: string | null
          provider: string
          retry_count: number | null
          status: string
          transaction_id: string
          updated_at: string
        }
        Insert: {
          branch?: string | null
          created_at?: string
          id?: string
          order_code?: string | null
          order_id?: string | null
          provider: string
          retry_count?: number | null
          status?: string
          transaction_id: string
          updated_at?: string
        }
        Update: {
          branch?: string | null
          created_at?: string
          id?: string
          order_code?: string | null
          order_id?: string | null
          provider?: string
          retry_count?: number | null
          status?: string
          transaction_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_allergens: {
        Row: {
          allergen_numbers: number[]
          created_at: string | null
          id: string
          product_id: string
          updated_at: string | null
        }
        Insert: {
          allergen_numbers?: number[]
          created_at?: string | null
          id?: string
          product_id: string
          updated_at?: string | null
        }
        Update: {
          allergen_numbers?: number[]
          created_at?: string | null
          id?: string
          product_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_allergens_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_ingredients: {
        Row: {
          created_at: string
          id: string
          ingredient_id: string | null
          is_addable: boolean
          is_default: boolean
          is_removable: boolean
          product_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          ingredient_id?: string | null
          is_addable?: boolean
          is_default?: boolean
          is_removable?: boolean
          product_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          ingredient_id?: string | null
          is_addable?: boolean
          is_default?: boolean
          is_removable?: boolean
          product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_ingredients_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_ingredients_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_modifiers: {
        Row: {
          group_id: string | null
          id: string
          product_id: string | null
        }
        Insert: {
          group_id?: string | null
          id?: string
          product_id?: string | null
        }
        Update: {
          group_id?: string | null
          id?: string
          product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_modifiers_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "modifier_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_modifiers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category: Database["public"]["Enums"]["product_category"]
          created_at: string | null
          description: string | null
          fries_large_price: number | null
          id: string
          image_url: string | null
          is_available: boolean | null
          is_featured: boolean | null
          is_sold_out: boolean | null
          is_visible: boolean
          name: string
          price: number
          stock_count: number | null
          updated_at: string | null
        }
        Insert: {
          category: Database["public"]["Enums"]["product_category"]
          created_at?: string | null
          description?: string | null
          fries_large_price?: number | null
          id?: string
          image_url?: string | null
          is_available?: boolean | null
          is_featured?: boolean | null
          is_sold_out?: boolean | null
          is_visible?: boolean
          name: string
          price: number
          stock_count?: number | null
          updated_at?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["product_category"]
          created_at?: string | null
          description?: string | null
          fries_large_price?: number | null
          id?: string
          image_url?: string | null
          is_available?: boolean | null
          is_featured?: boolean | null
          is_sold_out?: boolean | null
          is_visible?: boolean
          name?: string
          price?: number
          stock_count?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string | null
          full_name: string | null
          id: string
          loyalty_points: number | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"] | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          full_name?: string | null
          id: string
          loyalty_points?: number | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          full_name?: string | null
          id?: string
          loyalty_points?: number | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      promotions: {
        Row: {
          code: string
          created_at: string | null
          discount_type: string
          discount_value: number
          expiry_date: string | null
          id: string
          is_active: boolean
          max_uses: number | null
          min_order_value: number | null
          updated_at: string | null
          usage_count: number | null
        }
        Insert: {
          code: string
          created_at?: string | null
          discount_type: string
          discount_value: number
          expiry_date?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          min_order_value?: number | null
          updated_at?: string | null
          usage_count?: number | null
        }
        Update: {
          code?: string
          created_at?: string | null
          discount_type?: string
          discount_value?: number
          expiry_date?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          min_order_value?: number | null
          updated_at?: string | null
          usage_count?: number | null
        }
        Relationships: []
      }
      social_media_posts: {
        Row: {
          ai_preference: string | null
          brief: string | null
          content_idea: string | null
          created_at: string
          generated_caption: string | null
          id: string
          idea: string | null
          media_urls: string[] | null
          post_type: string
          scheduled_for: string | null
          status: string
          visual_prompt: string | null
        }
        Insert: {
          ai_preference?: string | null
          brief?: string | null
          content_idea?: string | null
          created_at?: string
          generated_caption?: string | null
          id?: string
          idea?: string | null
          media_urls?: string[] | null
          post_type: string
          scheduled_for?: string | null
          status?: string
          visual_prompt?: string | null
        }
        Update: {
          ai_preference?: string | null
          brief?: string | null
          content_idea?: string | null
          created_at?: string
          generated_caption?: string | null
          id?: string
          idea?: string | null
          media_urls?: string[] | null
          post_type?: string
          scheduled_for?: string | null
          status?: string
          visual_prompt?: string | null
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
    }
    Views: {
      v_inventory_balances: {
        Row: {
          active: boolean | null
          id: string | null
          last_movement_at: string | null
          low_stock: boolean | null
          name: string | null
          par_level: number | null
          quantity_on_hand: number | null
          reorder_level: number | null
          sku: string | null
          unit: string | null
          unit_cost: number | null
        }
        Relationships: []
      }
      v_addon_catalogue: {
        Row: {
          addable_to_products: number | null
          addon: string | null
          addon_price: number | null
          addon_price_kids: number | null
          in_stock: boolean | null
          ingredient_type: string | null
        }
        Relationships: []
      }
      v_channel_mix: {
        Row: {
          avg_order_value: number | null
          channel: string | null
          order_share_pct: number | null
          orders: number | null
          revenue: number | null
        }
        Relationships: []
      }
      v_daily_sales: {
        Row: {
          avg_order_value: number | null
          card_orders: number | null
          cash_orders: number | null
          largest_order: number | null
          orders: number | null
          revenue: number | null
          trade_date: string | null
        }
        Relationships: []
      }
      v_data_health: {
        Row: {
          issue: string | null
          rows_affected: number | null
        }
        Relationships: []
      }
      v_feedback_by_item: {
        Row: {
          avg_rating: number | null
          detractor_orders: number | null
          product_name: string | null
          rated_orders: number | null
        }
        Relationships: []
      }
      v_feedback_callbacks: {
        Row: {
          alerted_at: string | null
          comment: string | null
          display_id: number | null
          hours_waiting: number | null
          id: string | null
          order_id: string | null
          rating: number | null
          responded_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_feedback_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_feedback_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "v_paid_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_feedback_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "v_review_request_queue"
            referencedColumns: ["order_id"]
          },
        ]
      }
      v_feedback_summary: {
        Row: {
          avg_rating: number | null
          detractors: number | null
          passives: number | null
          promoters: number | null
          requests_sent: number | null
          responded_without_link: number | null
          response_rate_pct: number | null
          responses: number | null
          unresolved_complaints: number | null
        }
        Relationships: []
      }
      v_feedback_trend: {
        Row: {
          avg_rating: number | null
          detractors: number | null
          responses: number | null
          trade_date: string | null
        }
        Relationships: []
      }
      v_ingredient_par_levels: {
        Row: {
          avg_per_day: number | null
          busiest_day: number | null
          ingredient: string | null
          ingredient_type: string | null
          p90_per_day: number | null
          trading_days: number | null
        }
        Relationships: []
      }
      v_ingredient_usage_daily: {
        Row: {
          ingredient: string | null
          ingredient_type: string | null
          orders_containing: number | null
          portions_used: number | null
          trade_date: string | null
        }
        Relationships: []
      }
      v_item_mix: {
        Row: {
          appeared_in_orders: number | null
          avg_unit_price: number | null
          product_name: string | null
          revenue: number | null
          revenue_share_pct: number | null
          units_sold: number | null
        }
        Relationships: []
      }
      v_loyalty_balances: {
        Row: {
          last_activity_at: string | null
          lifetime_points: number | null
          points_balance: number | null
          rewards_redeemed: number | null
          user_id: string | null
        }
        Relationships: []
      }
      v_modifier_attach: {
        Row: {
          attach_rate_pct: number | null
          item_lines: number | null
          lines_with_modifiers: number | null
        }
        Relationships: []
      }
      v_paid_orders: {
        Row: {
          completed_at: string | null
          created_at: string | null
          display_id: number | null
          id: string | null
          order_channel: string | null
          payment_method: string | null
          payment_status: string | null
          status: string | null
          total: number | null
          trade_date: string | null
          trade_dow: number | null
          trade_hour: number | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          display_id?: number | null
          id?: string | null
          order_channel?: string | null
          payment_method?: never
          payment_status?: string | null
          status?: never
          total?: number | null
          trade_date?: never
          trade_dow?: never
          trade_hour?: never
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          display_id?: number | null
          id?: string | null
          order_channel?: string | null
          payment_method?: never
          payment_status?: string | null
          status?: never
          total?: number | null
          trade_date?: never
          trade_dow?: never
          trade_hour?: never
        }
        Relationships: []
      }
      v_payment_integrity: {
        Row: {
          action: string | null
          created_at: string | null
          display_id: number | null
          issue: string | null
          payment_method: string | null
          payment_status: string | null
          reference: string | null
          severity: string | null
          severity_rank: number | null
          total: number | null
        }
        Relationships: []
      }
      v_payment_integrity_summary: {
        Row: {
          issue: string | null
          occurrences: number | null
          severity: string | null
          value: number | null
        }
        Relationships: []
      }
      v_payments_stuck: {
        Row: {
          created_at: string | null
          display_id: number | null
          minutes_stuck: number | null
          payment_status: string | null
          total: number | null
          viva_order_code: string | null
        }
        Insert: {
          created_at?: string | null
          display_id?: number | null
          minutes_stuck?: never
          payment_status?: string | null
          total?: number | null
          viva_order_code?: string | null
        }
        Update: {
          created_at?: string | null
          display_id?: number | null
          minutes_stuck?: never
          payment_status?: string | null
          total?: number | null
          viva_order_code?: string | null
        }
        Relationships: []
      }
      v_prep_time: {
        Row: {
          avg_prep_mins: number | null
          completed_orders: number | null
          median_prep_mins: number | null
          p90_prep_mins: number | null
          trade_date: string | null
        }
        Relationships: []
      }
      v_qa_summary: {
        Row: {
          failing_checks: string | null
          failures: number | null
          p0_failures: number | null
          passes: number | null
        }
        Relationships: []
      }
      v_review_coverage: {
        Row: {
          ask_rate_pct: number | null
          asked: number | null
          completed_orders: number | null
          responded: number | null
          response_rate_pct: number | null
          trade_date: string | null
        }
        Relationships: []
      }
      v_review_request_queue: {
        Row: {
          completed_at: string | null
          customer_name: string | null
          customer_phone: string | null
          display_id: number | null
          minutes_since_collection: number | null
          order_id: string | null
          send_after: string | null
          total: number | null
        }
        Relationships: []
      }
      v_stock_conflicts: {
        Row: {
          is_removable: boolean | null
          out_of_stock_ingredient: string | null
          price: number | null
          still_orderable_product: string | null
        }
        Relationships: []
      }
      v_trading_rhythm: {
        Row: {
          day_name: string | null
          orders: number | null
          revenue: number | null
          trade_dow: number | null
          trade_hour: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      apply_assistant_product_proposal: {
        Args: { p_proposal_id: string }
        Returns: Json
      }
      apply_assistant_setting_proposal: {
        Args: { p_proposal_id: string }
        Returns: Json
      }
      consume_management_assistant_quota: {
        Args: { p_limit?: number; p_window_seconds?: number }
        Returns: boolean
      }
      create_assistant_product_proposal: {
        Args: { p_changes: Json; p_product_id: string }
        Returns: Json
      }
      create_assistant_setting_proposal: {
        Args: { p_setting_key: string; p_value: Json }
        Returns: Json
      }
      get_feedback_context: { Args: { p_token: string }; Returns: Json }
      get_management_business_snapshot: {
        Args: { p_days?: number; p_meal_period?: string }
        Returns: Json
      }
      get_user_role: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      issue_feedback_token: { Args: { p_order_id: string }; Returns: string }
      mark_review_sent: {
        Args: { p_order_id: string; p_sid?: string }
        Returns: Json
      }
      redeem_loyalty_reward: {
        Args: { p_note?: string; p_user_id: string }
        Returns: string
      }
      qa_checks: {
        Args: never
        Returns: {
          actual: string
          category: string
          check_id: string
          detail: string
          expected: string
          severity: string
          status: string
        }[]
      }
      record_feedback: {
        Args: {
          p_comment?: string
          p_phone: string
          p_rating: number
          p_source?: string
        }
        Returns: Json
      }
      set_foodos_module_enabled: {
        Args: { p_enabled: boolean; p_module_key: string }
        Returns: Json
      }
      submit_feedback_by_token: {
        Args: { p_comment?: string; p_rating: number; p_token: string }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "staff" | "customer"
      order_status:
        | "pending"
        | "cooking"
        | "ready"
        | "completed"
        | "pending_payment"
      payment_method: "card" | "cash" | "split"
      post_platform: "Instagram" | "SMS"
      post_status: "draft" | "published"
      product_category:
        | "Burgers"
        | "Flatbreads"
        | "Fries"
        | "Drinks"
        | "Specials"
        | "Sauces"
        | "Kids Menu"
      user_role: "customer" | "staff" | "admin"
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
      app_role: ["admin", "staff", "customer"],
      order_status: [
        "pending",
        "cooking",
        "ready",
        "completed",
        "pending_payment",
      ],
      payment_method: ["card", "cash", "split"],
      post_platform: ["Instagram", "SMS"],
      post_status: ["draft", "published"],
      product_category: [
        "Burgers",
        "Flatbreads",
        "Fries",
        "Drinks",
        "Specials",
        "Sauces",
        "Kids Menu",
      ],
      user_role: ["customer", "staff", "admin"],
    },
  },
} as const
