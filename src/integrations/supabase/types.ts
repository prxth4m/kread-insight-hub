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
      alerts: {
        Row: {
          acknowledged: boolean
          acknowledged_at: string | null
          acknowledged_by: string | null
          current_value: number | null
          detected_at: string
          id: string
          message: string | null
          metric_name: string
          pct_change: number | null
          previous_value: number | null
          restaurant_id: string
          severity: Database["public"]["Enums"]["alert_severity"]
        }
        Insert: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          current_value?: number | null
          detected_at?: string
          id?: string
          message?: string | null
          metric_name: string
          pct_change?: number | null
          previous_value?: number | null
          restaurant_id: string
          severity: Database["public"]["Enums"]["alert_severity"]
        }
        Update: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          current_value?: number | null
          detected_at?: string
          id?: string
          message?: string | null
          metric_name?: string
          pct_change?: number | null
          previous_value?: number | null
          restaurant_id?: string
          severity?: Database["public"]["Enums"]["alert_severity"]
        }
        Relationships: [
          {
            foreignKeyName: "alerts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"]
          created_at: string
          id: string
          metadata: Json | null
          target_id: string | null
          target_type: string | null
          user_id: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["audit_action"]
          created_at?: string
          id?: string
          metadata?: Json | null
          target_id?: string | null
          target_type?: string | null
          user_id?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["audit_action"]
          created_at?: string
          id?: string
          metadata?: Json | null
          target_id?: string | null
          target_type?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      daily_metrics: {
        Row: {
          ad_ctr: number | null
          ads_impressions: number | null
          ads_orders: number | null
          ads_roi: number | null
          ads_spend: number | null
          average_order_value: number | null
          cart_to_order: number | null
          created_at: string
          date: string
          delivered_orders: number | null
          discount_given: number | null
          effective_discount: number | null
          gross_sales_from_offers: number | null
          id: string
          impressions: number | null
          menu_to_cart: number | null
          menu_to_order: number | null
          orders_with_offers: number | null
          restaurant_id: string
          sales: number | null
          sales_from_ads: number | null
          updated_at: string
        }
        Insert: {
          ad_ctr?: number | null
          ads_impressions?: number | null
          ads_orders?: number | null
          ads_roi?: number | null
          ads_spend?: number | null
          average_order_value?: number | null
          cart_to_order?: number | null
          created_at?: string
          date: string
          delivered_orders?: number | null
          discount_given?: number | null
          effective_discount?: number | null
          gross_sales_from_offers?: number | null
          id?: string
          impressions?: number | null
          menu_to_cart?: number | null
          menu_to_order?: number | null
          orders_with_offers?: number | null
          restaurant_id: string
          sales?: number | null
          sales_from_ads?: number | null
          updated_at?: string
        }
        Update: {
          ad_ctr?: number | null
          ads_impressions?: number | null
          ads_orders?: number | null
          ads_roi?: number | null
          ads_spend?: number | null
          average_order_value?: number | null
          cart_to_order?: number | null
          created_at?: string
          date?: string
          delivered_orders?: number | null
          discount_given?: number | null
          effective_discount?: number | null
          gross_sales_from_offers?: number | null
          id?: string
          impressions?: number | null
          menu_to_cart?: number | null
          menu_to_order?: number | null
          orders_with_offers?: number | null
          restaurant_id?: string
          sales?: number | null
          sales_from_ads?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_metrics_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      raw_imports: {
        Row: {
          created_at: string
          date: string | null
          id: string
          raw_row: Json
          restaurant_id: string | null
          uploaded_file_id: string | null
        }
        Insert: {
          created_at?: string
          date?: string | null
          id?: string
          raw_row: Json
          restaurant_id?: string | null
          uploaded_file_id?: string | null
        }
        Update: {
          created_at?: string
          date?: string | null
          id?: string
          raw_row?: Json
          restaurant_id?: string | null
          uploaded_file_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "raw_imports_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raw_imports_uploaded_file_id_fkey"
            columns: ["uploaded_file_id"]
            isOneToOne: false
            referencedRelation: "uploaded_files"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          format: Database["public"]["Enums"]["report_format"]
          generated_at: string
          generated_by: string | null
          id: string
          period_end: string
          period_start: string
          report_type: Database["public"]["Enums"]["report_type"]
          restaurant_ids: string[]
          storage_path: string | null
        }
        Insert: {
          format: Database["public"]["Enums"]["report_format"]
          generated_at?: string
          generated_by?: string | null
          id?: string
          period_end: string
          period_start: string
          report_type: Database["public"]["Enums"]["report_type"]
          restaurant_ids?: string[]
          storage_path?: string | null
        }
        Update: {
          format?: Database["public"]["Enums"]["report_format"]
          generated_at?: string
          generated_by?: string | null
          id?: string
          period_end?: string
          period_start?: string
          report_type?: Database["public"]["Enums"]["report_type"]
          restaurant_ids?: string[]
          storage_path?: string | null
        }
        Relationships: []
      }
      restaurants: {
        Row: {
          archive_reason: string | null
          archived_at: string | null
          archived_by: string | null
          created_at: string
          display_name: string
          id: string
          is_archived: boolean
          name: string
          platform: Database["public"]["Enums"]["platform_type"]
          updated_at: string
        }
        Insert: {
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          display_name: string
          id?: string
          is_archived?: boolean
          name: string
          platform?: Database["public"]["Enums"]["platform_type"]
          updated_at?: string
        }
        Update: {
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          display_name?: string
          id?: string
          is_archived?: boolean
          name?: string
          platform?: Database["public"]["Enums"]["platform_type"]
          updated_at?: string
        }
        Relationships: []
      }
      uploaded_files: {
        Row: {
          created_at: string
          error_details: Json | null
          file_name: string
          file_size: number | null
          id: string
          row_count: number | null
          status: Database["public"]["Enums"]["upload_status"]
          summary: Json | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          error_details?: Json | null
          file_name: string
          file_size?: number | null
          id?: string
          row_count?: number | null
          status?: Database["public"]["Enums"]["upload_status"]
          summary?: Json | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          error_details?: Json | null
          file_name?: string
          file_size?: number | null
          id?: string
          row_count?: number | null
          status?: Database["public"]["Enums"]["upload_status"]
          summary?: Json | null
          uploaded_by?: string | null
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
      alert_severity: "critical" | "warning" | "info"
      app_role: "admin" | "viewer"
      audit_action:
        | "restaurant_created"
        | "restaurant_edited"
        | "restaurant_archived"
        | "restaurant_restored"
        | "restaurant_deleted"
        | "file_uploaded"
        | "report_generated"
        | "alert_acknowledged"
        | "user_role_changed"
      platform_type: "zomato" | "swiggy"
      report_format: "pdf" | "xlsx" | "csv"
      report_type: "daily" | "weekly" | "fortnightly" | "monthly"
      upload_status: "pending" | "processing" | "processed" | "failed"
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
      alert_severity: ["critical", "warning", "info"],
      app_role: ["admin", "viewer"],
      audit_action: [
        "restaurant_created",
        "restaurant_edited",
        "restaurant_archived",
        "restaurant_restored",
        "restaurant_deleted",
        "file_uploaded",
        "report_generated",
        "alert_acknowledged",
        "user_role_changed",
      ],
      platform_type: ["zomato", "swiggy"],
      report_format: ["pdf", "xlsx", "csv"],
      report_type: ["daily", "weekly", "fortnightly", "monthly"],
      upload_status: ["pending", "processing", "processed", "failed"],
    },
  },
} as const
