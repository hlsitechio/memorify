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
      agent_calls: {
        Row: {
          agent_id: string | null
          cost_cents: number | null
          created_at: string
          id: string
          kind: string
          latency_ms: number | null
          metadata: Json
          name: string
          status: string
          tokens_in: number | null
          tokens_out: number | null
          user_id: string
        }
        Insert: {
          agent_id?: string | null
          cost_cents?: number | null
          created_at?: string
          id?: string
          kind: string
          latency_ms?: number | null
          metadata?: Json
          name: string
          status?: string
          tokens_in?: number | null
          tokens_out?: number | null
          user_id: string
        }
        Update: {
          agent_id?: string | null
          cost_cents?: number | null
          created_at?: string
          id?: string
          kind?: string
          latency_ms?: number | null
          metadata?: Json
          name?: string
          status?: string
          tokens_in?: number | null
          tokens_out?: number | null
          user_id?: string
        }
        Relationships: []
      }
      agents: {
        Row: {
          created_at: string
          id: string
          kind: string
          last_seen_at: string | null
          metadata: Json
          name: string
          status: string
          token: string
          token_expires_at: string | null
          token_rotated_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          last_seen_at?: string | null
          metadata?: Json
          name: string
          status?: string
          token?: string
          token_expires_at?: string | null
          token_rotated_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          last_seen_at?: string | null
          metadata?: Json
          name?: string
          status?: string
          token?: string
          token_expires_at?: string | null
          token_rotated_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      api_keys: {
        Row: {
          created_at: string
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      collection_items: {
        Row: {
          ai_summary: string | null
          collection_id: string
          created_at: string
          data: Json
          id: string
          tags: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_summary?: string | null
          collection_id: string
          created_at?: string
          data?: Json
          id?: string
          tags?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_summary?: string | null
          collection_id?: string
          created_at?: string
          data?: Json
          id?: string
          tags?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_items_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          created_at: string
          description: string | null
          icon: string | null
          id: string
          item_count: number
          name: string
          schema: Json
          slug: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          item_count?: number
          name: string
          schema?: Json
          slug: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          item_count?: number
          name?: string
          schema?: Json
          slug?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      connectors: {
        Row: {
          config: Json | null
          created_at: string
          id: string
          kind: string
          name: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          config?: Json | null
          created_at?: string
          id?: string
          kind: string
          name: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          config?: Json | null
          created_at?: string
          id?: string
          kind?: string
          name?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          agent_id: string | null
          created_at: string
          id: string
          metadata: Json
          mime: string | null
          name: string
          size: number | null
          status: string
          storage_path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          mime?: string | null
          name: string
          size?: number | null
          status?: string
          storage_path: string
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          mime?: string | null
          name?: string
          size?: number | null
          status?: string
          storage_path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          created_at: string
          id: string
          kind: string
          payload: Json | null
          source: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          payload?: Json | null
          source?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          payload?: Json | null
          source?: string | null
          user_id?: string
        }
        Relationships: []
      }
      images: {
        Row: {
          created_at: string
          id: string
          kind: string
          model: string | null
          params: Json
          prompt: string | null
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          model?: string | null
          params?: Json
          prompt?: string | null
          url: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          model?: string | null
          params?: Json
          prompt?: string | null
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      mcp_oauth_states: {
        Row: {
          authorization_endpoint: string
          client_id: string
          client_secret: string | null
          code_verifier: string
          created_at: string
          redirect_uri: string
          scope: string | null
          server_name: string
          server_url: string
          state: string
          token_endpoint: string
          transport: string
          user_id: string
        }
        Insert: {
          authorization_endpoint: string
          client_id: string
          client_secret?: string | null
          code_verifier: string
          created_at?: string
          redirect_uri: string
          scope?: string | null
          server_name: string
          server_url: string
          state: string
          token_endpoint: string
          transport?: string
          user_id: string
        }
        Update: {
          authorization_endpoint?: string
          client_id?: string
          client_secret?: string | null
          code_verifier?: string
          created_at?: string
          redirect_uri?: string
          scope?: string | null
          server_name?: string
          server_url?: string
          state?: string
          token_endpoint?: string
          transport?: string
          user_id?: string
        }
        Relationships: []
      }
      mcp_servers: {
        Row: {
          auth: Json
          created_at: string
          enabled: boolean
          id: string
          last_error: string | null
          last_handshake_at: string | null
          name: string
          transport: string
          updated_at: string
          url: string
          user_id: string
        }
        Insert: {
          auth?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          last_error?: string | null
          last_handshake_at?: string | null
          name: string
          transport?: string
          updated_at?: string
          url: string
          user_id: string
        }
        Update: {
          auth?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          last_error?: string | null
          last_handshake_at?: string | null
          name?: string
          transport?: string
          updated_at?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      mcp_tools: {
        Row: {
          created_at: string
          description: string | null
          enabled: boolean
          id: string
          input_schema: Json
          mcp_server_id: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          input_schema?: Json
          mcp_server_id: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          input_schema?: Json
          mcp_server_id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcp_tools_mcp_server_id_fkey"
            columns: ["mcp_server_id"]
            isOneToOne: false
            referencedRelation: "mcp_servers"
            referencedColumns: ["id"]
          },
        ]
      }
      memories: {
        Row: {
          archived: boolean
          archived_at: string | null
          category: string
          content: string
          created_at: string
          id: string
          mem_id: string | null
          metadata: Json | null
          namespace: string
          tags: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          archived_at?: string | null
          category?: string
          content: string
          created_at?: string
          id?: string
          mem_id?: string | null
          metadata?: Json | null
          namespace?: string
          tags?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          archived?: boolean
          archived_at?: string | null
          category?: string
          content?: string
          created_at?: string
          id?: string
          mem_id?: string | null
          metadata?: Json | null
          namespace?: string
          tags?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      memory_versions: {
        Row: {
          category: string
          content: string
          created_at: string
          id: string
          memory_id: string
          metadata: Json | null
          namespace: string
          tags: string[] | null
          user_id: string
          version: number
        }
        Insert: {
          category?: string
          content: string
          created_at?: string
          id?: string
          memory_id: string
          metadata?: Json | null
          namespace: string
          tags?: string[] | null
          user_id: string
          version: number
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          id?: string
          memory_id?: string
          metadata?: Json | null
          namespace?: string
          tags?: string[] | null
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "memory_versions_memory_id_fkey"
            columns: ["memory_id"]
            isOneToOne: false
            referencedRelation: "memories"
            referencedColumns: ["id"]
          },
        ]
      }
      plugins: {
        Row: {
          config: Json
          created_at: string
          enabled: boolean
          id: string
          kind: string
          name: string
          position: number
          ref_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          kind: string
          name: string
          position?: number
          ref_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          kind?: string
          name?: string
          position?: number
          ref_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          current_workspace_agent_id: string | null
          current_workspace_id: string | null
          current_workspace_kind: string | null
          current_workspace_name: string | null
          current_workspace_subtitle: string | null
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
          vault_password_hash: string | null
          vault_password_salt: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          current_workspace_agent_id?: string | null
          current_workspace_id?: string | null
          current_workspace_kind?: string | null
          current_workspace_name?: string | null
          current_workspace_subtitle?: string | null
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
          vault_password_hash?: string | null
          vault_password_salt?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          current_workspace_agent_id?: string | null
          current_workspace_id?: string | null
          current_workspace_kind?: string | null
          current_workspace_name?: string | null
          current_workspace_subtitle?: string | null
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
          vault_password_hash?: string | null
          vault_password_salt?: string | null
        }
        Relationships: []
      }
      skills: {
        Row: {
          created_at: string
          description: string | null
          id: string
          model: string
          name: string
          prompt: string
          schema: Json
          slug: string
          source: Json
          status: string
          updated_at: string
          user_id: string
          version: number
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          model?: string
          name: string
          prompt?: string
          schema?: Json
          slug: string
          source?: Json
          status?: string
          updated_at?: string
          user_id: string
          version?: number
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          model?: string
          name?: string
          prompt?: string
          schema?: Json
          slug?: string
          source?: Json
          status?: string
          updated_at?: string
          user_id?: string
          version?: number
          workspace_id?: string | null
        }
        Relationships: []
      }
      vault_secrets: {
        Row: {
          created_at: string
          description: string | null
          id: string
          iv: string
          last_used_at: string | null
          last_used_by_agent_id: string | null
          metadata: Json
          name: string
          scope: string
          updated_at: string
          user_id: string
          value_encrypted: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          iv: string
          last_used_at?: string | null
          last_used_by_agent_id?: string | null
          metadata?: Json
          name: string
          scope?: string
          updated_at?: string
          user_id: string
          value_encrypted: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          iv?: string
          last_used_at?: string | null
          last_used_by_agent_id?: string | null
          metadata?: Json
          name?: string
          scope?: string
          updated_at?: string
          user_id?: string
          value_encrypted?: string
        }
        Relationships: []
      }
      voices: {
        Row: {
          action_items: Json
          created_at: string
          duration_sec: number | null
          id: string
          kind: string
          mime: string | null
          name: string
          params: Json
          recorded_at: string
          sample_url: string | null
          size: number | null
          status: string
          storage_path: string | null
          summary: string | null
          title: string | null
          transcript: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          action_items?: Json
          created_at?: string
          duration_sec?: number | null
          id?: string
          kind?: string
          mime?: string | null
          name: string
          params?: Json
          recorded_at?: string
          sample_url?: string | null
          size?: number | null
          status?: string
          storage_path?: string | null
          summary?: string | null
          title?: string | null
          transcript?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          action_items?: Json
          created_at?: string
          duration_sec?: number | null
          id?: string
          kind?: string
          mime?: string | null
          name?: string
          params?: Json
          recorded_at?: string
          sample_url?: string | null
          size?: number | null
          status?: string
          storage_path?: string | null
          summary?: string | null
          title?: string | null
          transcript?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      waitlist: {
        Row: {
          created_at: string
          email: string
          id: string
          use_case: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          use_case?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          use_case?: string | null
        }
        Relationships: []
      }
      workspace_prefs: {
        Row: {
          accent: Json | null
          created_at: string
          id: string
          layout: Json
          updated_at: string
          user_id: string
          visible_ids: Json
          workspace_id: string
        }
        Insert: {
          accent?: Json | null
          created_at?: string
          id?: string
          layout?: Json
          updated_at?: string
          user_id: string
          visible_ids?: Json
          workspace_id: string
        }
        Update: {
          accent?: Json | null
          created_at?: string
          id?: string
          layout?: Json
          updated_at?: string
          user_id?: string
          visible_ids?: Json
          workspace_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      agent_ping: {
        Args: { _meta?: Json; _token: string }
        Returns: {
          id: string
          name: string
          status: string
        }[]
      }
      memory_slug_for: {
        Args: { _namespace: string; _user_id: string }
        Returns: string
      }
      rotate_agent_token: {
        Args: { _agent_id: string; _expires_in_days?: number }
        Returns: {
          token: string
          token_expires_at: string
          token_rotated_at: string
        }[]
      }
      set_agent_token_expiry: {
        Args: { _agent_id: string; _expires_in_days?: number }
        Returns: string
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
  public: {
    Enums: {},
  },
} as const
