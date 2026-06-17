export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      body_weights: {
        Row: {
          created_at: string;
          id: string;
          log_date: string;
          user_id: string;
          weight_kg: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          log_date?: string;
          user_id: string;
          weight_kg: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          log_date?: string;
          user_id?: string;
          weight_kg?: number;
        };
        Relationships: [];
      };
      ai_settings: {
        Row: {
          created_at: string;
          groq_api_key: string | null;
          omniroute_api_key: string | null;
          omniroute_base_url: string | null;
          openrouter_api_key: string | null;
          provider: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          groq_api_key?: string | null;
          omniroute_api_key?: string | null;
          omniroute_base_url?: string | null;
          openrouter_api_key?: string | null;
          provider?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          groq_api_key?: string | null;
          omniroute_api_key?: string | null;
          omniroute_base_url?: string | null;
          openrouter_api_key?: string | null;
          provider?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_settings_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      chat_messages: {
        Row: {
          content: string;
          created_at: string;
          id: string;
          role: string;
          user_id: string;
        };
        Insert: {
          content: string;
          created_at?: string;
          id?: string;
          role: string;
          user_id: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          id?: string;
          role?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      exercises: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          notes: string | null;
          position: number;
          user_id: string;
          workout_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          notes?: string | null;
          position?: number;
          user_id: string;
          workout_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          notes?: string | null;
          position?: number;
          user_id?: string;
          workout_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "exercises_workout_id_fkey";
            columns: ["workout_id"];
            isOneToOne: false;
            referencedRelation: "workouts";
            referencedColumns: ["id"];
          },
        ];
      };
      favorite_foods: {
        Row: {
          calories: number;
          carbs_g: number;
          created_at: string;
          fat_g: number;
          grams: number;
          id: string;
          name: string;
          protein_g: number;
          user_id: string;
        };
        Insert: {
          calories?: number;
          carbs_g?: number;
          created_at?: string;
          fat_g?: number;
          grams?: number;
          id?: string;
          name: string;
          protein_g?: number;
          user_id: string;
        };
        Update: {
          calories?: number;
          carbs_g?: number;
          created_at?: string;
          fat_g?: number;
          grams?: number;
          id?: string;
          name?: string;
          protein_g?: number;
          user_id?: string;
        };
        Relationships: [];
      };
      goals: {
        Row: {
          calories: number;
          carbs_g: number;
          fat_g: number;
          protein_g: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          calories?: number;
          carbs_g?: number;
          fat_g?: number;
          protein_g?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          calories?: number;
          carbs_g?: number;
          fat_g?: number;
          protein_g?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      meal_items: {
        Row: {
          calories: number;
          carbs_g: number;
          created_at: string;
          fat_g: number;
          grams: number;
          id: string;
          meal_id: string;
          name: string;
          protein_g: number;
          user_id: string;
        };
        Insert: {
          calories?: number;
          carbs_g?: number;
          created_at?: string;
          fat_g?: number;
          grams?: number;
          id?: string;
          meal_id: string;
          name: string;
          protein_g?: number;
          user_id: string;
        };
        Update: {
          calories?: number;
          carbs_g?: number;
          created_at?: string;
          fat_g?: number;
          grams?: number;
          id?: string;
          meal_id?: string;
          name?: string;
          protein_g?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "meal_items_meal_id_fkey";
            columns: ["meal_id"];
            isOneToOne: false;
            referencedRelation: "meals";
            referencedColumns: ["id"];
          },
        ];
      };
      meals: {
        Row: {
          created_at: string;
          id: string;
          meal_date: string;
          meal_type: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          meal_date?: string;
          meal_type: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          meal_date?: string;
          meal_type?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          display_name: string | null;
          id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          display_name?: string | null;
          id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          display_name?: string | null;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      recipe_items: {
        Row: {
          calories: number;
          carbs_g: number;
          created_at: string;
          fat_g: number;
          grams: number;
          id: string;
          name: string;
          protein_g: number;
          recipe_id: string;
          user_id: string;
        };
        Insert: {
          calories?: number;
          carbs_g?: number;
          created_at?: string;
          fat_g?: number;
          grams?: number;
          id?: string;
          name: string;
          protein_g?: number;
          recipe_id: string;
          user_id: string;
        };
        Update: {
          calories?: number;
          carbs_g?: number;
          created_at?: string;
          fat_g?: number;
          grams?: number;
          id?: string;
          name?: string;
          protein_g?: number;
          recipe_id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      recipes: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          servings: number;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          servings?: number;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          servings?: number;
          user_id?: string;
        };
        Relationships: [];
      };
      reminders: {
        Row: {
          created_at: string;
          days_of_week: number[];
          enabled: boolean;
          id: string;
          kind: string;
          time_of_day: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          days_of_week?: number[];
          enabled?: boolean;
          id?: string;
          kind: string;
          time_of_day: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          days_of_week?: number[];
          enabled?: boolean;
          id?: string;
          kind?: string;
          time_of_day?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      sets: {
        Row: {
          created_at: string;
          exercise_id: string;
          id: string;
          reps: number;
          set_number: number;
          user_id: string;
          weight_kg: number;
        };
        Insert: {
          created_at?: string;
          exercise_id: string;
          id?: string;
          reps: number;
          set_number: number;
          user_id: string;
          weight_kg?: number;
        };
        Update: {
          created_at?: string;
          exercise_id?: string;
          id?: string;
          reps?: number;
          set_number?: number;
          user_id?: string;
          weight_kg?: number;
        };
        Relationships: [
          {
            foreignKeyName: "sets_exercise_id_fkey";
            columns: ["exercise_id"];
            isOneToOne: false;
            referencedRelation: "exercises";
            referencedColumns: ["id"];
          },
        ];
      };
      water_logs: {
        Row: {
          created_at: string;
          id: string;
          log_date: string;
          ml: number;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          log_date?: string;
          ml?: number;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          log_date?: string;
          ml?: number;
          user_id?: string;
        };
        Relationships: [];
      };
      workout_template_exercises: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          position: number;
          template_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          position?: number;
          template_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          position?: number;
          template_id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      workout_templates: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      workouts: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          notes: string | null;
          user_id: string;
          workout_date: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          notes?: string | null;
          user_id: string;
          workout_date?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          notes?: string | null;
          user_id?: string;
          workout_date?: string;
        };
        Relationships: [];
      };
      workout_sessions: {
        Row: {
          id: string;
          user_id: string;
          workout_id: string | null;
          name: string;
          completed_at: string;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          workout_id?: string | null;
          name: string;
          completed_at?: string;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          workout_id?: string | null;
          name?: string;
          completed_at?: string;
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workout_sessions_workout_id_fkey";
            columns: ["workout_id"];
            isOneToOne: false;
            referencedRelation: "workouts";
            referencedColumns: ["id"];
          }
        ];
      };
      workout_session_sets: {
        Row: {
          id: string;
          session_id: string;
          user_id: string;
          exercise_name: string;
          set_number: number;
          reps: number;
          weight_kg: number;
          completed: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          user_id: string;
          exercise_name: string;
          set_number: number;
          reps: number;
          weight_kg?: number;
          completed?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          user_id?: string;
          exercise_name?: string;
          set_number?: number;
          reps?: number;
          weight_kg?: number;
          completed?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workout_session_sets_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "workout_sessions";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
