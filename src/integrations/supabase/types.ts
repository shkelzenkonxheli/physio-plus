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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      appointment_holds: {
        Row: {
          created_at: string
          end_at: string
          expires_at: string
          id: string
          physiotherapist_id: string
          service_id: string | null
          session_id: string
          start_at: string
        }
        Insert: {
          created_at?: string
          end_at: string
          expires_at: string
          id?: string
          physiotherapist_id: string
          service_id?: string | null
          session_id: string
          start_at: string
        }
        Update: {
          created_at?: string
          end_at?: string
          expires_at?: string
          id?: string
          physiotherapist_id?: string
          service_id?: string | null
          session_id?: string
          start_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_holds_physiotherapist_id_fkey"
            columns: ["physiotherapist_id"]
            isOneToOne: false
            referencedRelation: "physiotherapists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_holds_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          cancellation_reason: string | null
          client_email: string
          client_first_name: string
          client_id: string | null
          client_last_name: string
          client_message: string | null
          client_phone: string
          created_at: string
          currency: string
          end_at: string
          id: string
          physiotherapist_id: string
          price: number
          service_id: string | null
          service_name: string
          start_at: string
          status: Database["public"]["Enums"]["appointment_status"]
          updated_at: string
        }
        Insert: {
          cancellation_reason?: string | null
          client_email?: string
          client_first_name?: string
          client_id?: string | null
          client_last_name?: string
          client_message?: string | null
          client_phone?: string
          created_at?: string
          currency?: string
          end_at: string
          id?: string
          physiotherapist_id: string
          price?: number
          service_id?: string | null
          service_name?: string
          start_at: string
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
        }
        Update: {
          cancellation_reason?: string | null
          client_email?: string
          client_first_name?: string
          client_id?: string | null
          client_last_name?: string
          client_message?: string | null
          client_phone?: string
          created_at?: string
          currency?: string
          end_at?: string
          id?: string
          physiotherapist_id?: string
          price?: number
          service_id?: string | null
          service_name?: string
          start_at?: string
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_physiotherapist_id_fkey"
            columns: ["physiotherapist_id"]
            isOneToOne: false
            referencedRelation: "physiotherapists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json
          user_id?: string | null
        }
        Relationships: []
      }
      availability_exceptions: {
        Row: {
          closed: boolean
          created_at: string
          date: string
          end_time: string | null
          id: string
          physiotherapist_id: string
          start_time: string | null
        }
        Insert: {
          closed?: boolean
          created_at?: string
          date: string
          end_time?: string | null
          id?: string
          physiotherapist_id: string
          start_time?: string | null
        }
        Update: {
          closed?: boolean
          created_at?: string
          date?: string
          end_time?: string | null
          id?: string
          physiotherapist_id?: string
          start_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "availability_exceptions_physiotherapist_id_fkey"
            columns: ["physiotherapist_id"]
            isOneToOne: false
            referencedRelation: "physiotherapists"
            referencedColumns: ["id"]
          },
        ]
      }
      blocked_times: {
        Row: {
          created_at: string
          end_at: string
          id: string
          physiotherapist_id: string
          reason: string | null
          start_at: string
        }
        Insert: {
          created_at?: string
          end_at: string
          id?: string
          physiotherapist_id: string
          reason?: string | null
          start_at: string
        }
        Update: {
          created_at?: string
          end_at?: string
          id?: string
          physiotherapist_id?: string
          reason?: string | null
          start_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocked_times_physiotherapist_id_fkey"
            columns: ["physiotherapist_id"]
            isOneToOne: false
            referencedRelation: "physiotherapists"
            referencedColumns: ["id"]
          },
        ]
      }
      cities: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          region_id: string
          slug: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          region_id: string
          slug: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          region_id?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cities_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_days_off: {
        Row: {
          clinic_id: string
          created_at: string
          date: string
          id: string
          reason: string | null
        }
        Insert: {
          clinic_id: string
          created_at?: string
          date: string
          id?: string
          reason?: string | null
        }
        Update: {
          clinic_id?: string
          created_at?: string
          date?: string
          id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clinic_days_off_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_service_categories: {
        Row: {
          active: boolean
          clinic_id: string
          created_at: string
          description: string | null
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          clinic_id: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          clinic_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_service_categories_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_services: {
        Row: {
          active: boolean
          category_id: string | null
          clinic_id: string
          created_at: string
          currency: string
          description: string | null
          duration_minutes: number
          id: string
          name: string
          price: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          category_id?: string | null
          clinic_id: string
          created_at?: string
          currency?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          name: string
          price?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          category_id?: string | null
          clinic_id?: string
          created_at?: string
          currency?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          name?: string
          price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_services_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "clinic_service_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinic_services_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_working_hours: {
        Row: {
          active: boolean
          break_end: string | null
          break_start: string | null
          clinic_id: string
          day_of_week: number
          end_time: string
          id: string
          start_time: string
        }
        Insert: {
          active?: boolean
          break_end?: string | null
          break_start?: string | null
          clinic_id: string
          day_of_week: number
          end_time: string
          id?: string
          start_time: string
        }
        Update: {
          active?: boolean
          break_end?: string | null
          break_start?: string | null
          clinic_id?: string
          day_of_week?: number
          end_time?: string
          id?: string
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_working_hours_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinics: {
        Row: {
          active: boolean
          address: string | null
          city_id: string | null
          created_at: string
          description: string | null
          email: string | null
          header_image_url: string | null
          id: string
          logo_url: string | null
          name: string
          phone: string | null
          phone2: string | null
          region_id: string | null
          slug: string
          updated_at: string
          website: string | null
          whatsapp: string | null
        }
        Insert: {
          active?: boolean
          address?: string | null
          city_id?: string | null
          created_at?: string
          description?: string | null
          email?: string | null
          header_image_url?: string | null
          id?: string
          logo_url?: string | null
          name: string
          phone?: string | null
          phone2?: string | null
          region_id?: string | null
          slug: string
          updated_at?: string
          website?: string | null
          whatsapp?: string | null
        }
        Update: {
          active?: boolean
          address?: string | null
          city_id?: string | null
          created_at?: string
          description?: string | null
          email?: string | null
          header_image_url?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          phone?: string | null
          phone2?: string | null
          region_id?: string | null
          slug?: string
          updated_at?: string
          website?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clinics_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinics_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          link: string | null
          message: string
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          link?: string | null
          message: string
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          link?: string | null
          message?: string
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      physiotherapist_specializations: {
        Row: {
          physiotherapist_id: string
          specialization_id: string
        }
        Insert: {
          physiotherapist_id: string
          specialization_id: string
        }
        Update: {
          physiotherapist_id?: string
          specialization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "physiotherapist_specializations_physiotherapist_id_fkey"
            columns: ["physiotherapist_id"]
            isOneToOne: false
            referencedRelation: "physiotherapists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "physiotherapist_specializations_specialization_id_fkey"
            columns: ["specialization_id"]
            isOneToOne: false
            referencedRelation: "specializations"
            referencedColumns: ["id"]
          },
        ]
      }
      physiotherapists: {
        Row: {
          address: string | null
          bio: string | null
          certifications: string | null
          city_id: string | null
          clinic_id: string | null
          created_at: string
          education: string | null
          experience: string | null
          first_name: string
          id: string
          last_name: string
          latitude: number | null
          license_number: string | null
          longitude: number | null
          min_cancellation_hours: number
          onboarding_step: number
          phone: string | null
          photo_url: string | null
          professional_title: string | null
          profile_views: number
          rating_avg: number
          rating_count: number
          region_id: string | null
          rejection_reason: string | null
          slug: string
          status: Database["public"]["Enums"]["profile_status"]
          updated_at: string
          user_id: string
          verification: Database["public"]["Enums"]["verification_status"]
        }
        Insert: {
          address?: string | null
          bio?: string | null
          certifications?: string | null
          city_id?: string | null
          clinic_id?: string | null
          created_at?: string
          education?: string | null
          experience?: string | null
          first_name?: string
          id?: string
          last_name?: string
          latitude?: number | null
          license_number?: string | null
          longitude?: number | null
          min_cancellation_hours?: number
          onboarding_step?: number
          phone?: string | null
          photo_url?: string | null
          professional_title?: string | null
          profile_views?: number
          rating_avg?: number
          rating_count?: number
          region_id?: string | null
          rejection_reason?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["profile_status"]
          updated_at?: string
          user_id: string
          verification?: Database["public"]["Enums"]["verification_status"]
        }
        Update: {
          address?: string | null
          bio?: string | null
          certifications?: string | null
          city_id?: string | null
          clinic_id?: string | null
          created_at?: string
          education?: string | null
          experience?: string | null
          first_name?: string
          id?: string
          last_name?: string
          latitude?: number | null
          license_number?: string | null
          longitude?: number | null
          min_cancellation_hours?: number
          onboarding_step?: number
          phone?: string | null
          photo_url?: string | null
          professional_title?: string | null
          profile_views?: number
          rating_avg?: number
          rating_count?: number
          region_id?: string | null
          rejection_reason?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["profile_status"]
          updated_at?: string
          user_id?: string
          verification?: Database["public"]["Enums"]["verification_status"]
        }
        Relationships: [
          {
            foreignKeyName: "physiotherapists_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "physiotherapists_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "physiotherapists_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          active: boolean
          code: string
          currency: string
          description: string | null
          features: Json
          id: string
          name: string
          price_monthly: number
          sort_order: number
        }
        Insert: {
          active?: boolean
          code: string
          currency?: string
          description?: string | null
          features?: Json
          id?: string
          name: string
          price_monthly?: number
          sort_order?: number
        }
        Update: {
          active?: boolean
          code?: string
          currency?: string
          description?: string | null
          features?: Json
          id?: string
          name?: string
          price_monthly?: number
          sort_order?: number
        }
        Relationships: []
      }
      profile_gallery_images: {
        Row: {
          alt: string | null
          created_at: string
          id: string
          owner_id: string
          owner_type: string
          sort_order: number
          url: string
        }
        Insert: {
          alt?: string | null
          created_at?: string
          id?: string
          owner_id: string
          owner_type: string
          sort_order?: number
          url: string
        }
        Update: {
          alt?: string | null
          created_at?: string
          id?: string
          owner_id?: string
          owner_type?: string
          sort_order?: number
          url?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          phone: string | null
          suspended: boolean
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          id: string
          last_name?: string | null
          phone?: string | null
          suspended?: boolean
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          suspended?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      regions: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          appointment_id: string
          client_id: string
          comment: string | null
          created_at: string
          hidden: boolean
          id: string
          physiotherapist_id: string
          rating: number
        }
        Insert: {
          appointment_id: string
          client_id: string
          comment?: string | null
          created_at?: string
          hidden?: boolean
          id?: string
          physiotherapist_id: string
          rating: number
        }
        Update: {
          appointment_id?: string
          client_id?: string
          comment?: string | null
          created_at?: string
          hidden?: boolean
          id?: string
          physiotherapist_id?: string
          rating?: number
        }
        Relationships: [
          {
            foreignKeyName: "reviews_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: true
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_physiotherapist_id_fkey"
            columns: ["physiotherapist_id"]
            isOneToOne: false
            referencedRelation: "physiotherapists"
            referencedColumns: ["id"]
          },
        ]
      }
      service_categories: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          name: string
          physiotherapist_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name: string
          physiotherapist_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          physiotherapist_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_categories_physiotherapist_id_fkey"
            columns: ["physiotherapist_id"]
            isOneToOne: false
            referencedRelation: "physiotherapists"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          active: boolean
          category_id: string | null
          created_at: string
          currency: string
          description: string | null
          duration_minutes: number
          id: string
          name: string
          physiotherapist_id: string
          price: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          category_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          name: string
          physiotherapist_id: string
          price?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          category_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          name?: string
          physiotherapist_id?: string
          price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_physiotherapist_id_fkey"
            columns: ["physiotherapist_id"]
            isOneToOne: false
            referencedRelation: "physiotherapists"
            referencedColumns: ["id"]
          },
        ]
      }
      specializations: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      subscription_events: {
        Row: {
          created_at: string
          event: string
          id: string
          metadata: Json
          subscription_id: string
        }
        Insert: {
          created_at?: string
          event: string
          id?: string
          metadata?: Json
          subscription_id: string
        }
        Update: {
          created_at?: string
          event?: string
          id?: string
          metadata?: Json
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_events_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          plan_id: string
          started_at: string
          status: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          plan_id: string
          started_at?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          plan_id?: string
          started_at?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
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
      verification_requests: {
        Row: {
          created_at: string
          document_url: string | null
          id: string
          note: string | null
          physiotherapist_id: string
          status: Database["public"]["Enums"]["verification_status"]
        }
        Insert: {
          created_at?: string
          document_url?: string | null
          id?: string
          note?: string | null
          physiotherapist_id: string
          status?: Database["public"]["Enums"]["verification_status"]
        }
        Update: {
          created_at?: string
          document_url?: string | null
          id?: string
          note?: string | null
          physiotherapist_id?: string
          status?: Database["public"]["Enums"]["verification_status"]
        }
        Relationships: [
          {
            foreignKeyName: "verification_requests_physiotherapist_id_fkey"
            columns: ["physiotherapist_id"]
            isOneToOne: false
            referencedRelation: "physiotherapists"
            referencedColumns: ["id"]
          },
        ]
      }
      working_hours: {
        Row: {
          active: boolean
          break_end: string | null
          break_start: string | null
          day_of_week: number
          end_time: string
          id: string
          physiotherapist_id: string
          start_time: string
        }
        Insert: {
          active?: boolean
          break_end?: string | null
          break_start?: string | null
          day_of_week: number
          end_time: string
          id?: string
          physiotherapist_id: string
          start_time: string
        }
        Update: {
          active?: boolean
          break_end?: string | null
          break_start?: string | null
          day_of_week?: number
          end_time?: string
          id?: string
          physiotherapist_id?: string
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "working_hours_physiotherapist_id_fkey"
            columns: ["physiotherapist_id"]
            isOneToOne: false
            referencedRelation: "physiotherapists"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_create_physio: {
        Args: {
          _city_id: string
          _clinic_id: string
          _email: string
          _first_name: string
          _last_name: string
          _phone: string
        }
        Returns: {
          address: string | null
          bio: string | null
          certifications: string | null
          city_id: string | null
          clinic_id: string | null
          created_at: string
          education: string | null
          experience: string | null
          first_name: string
          id: string
          last_name: string
          latitude: number | null
          license_number: string | null
          longitude: number | null
          min_cancellation_hours: number
          onboarding_step: number
          phone: string | null
          photo_url: string | null
          professional_title: string | null
          profile_views: number
          rating_avg: number
          rating_count: number
          region_id: string | null
          rejection_reason: string | null
          slug: string
          status: Database["public"]["Enums"]["profile_status"]
          updated_at: string
          user_id: string
          verification: Database["public"]["Enums"]["verification_status"]
        }
        SetofOptions: {
          from: "*"
          to: "physiotherapists"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_delete_clinic: { Args: { _id: string }; Returns: undefined }
      admin_delete_physio: { Args: { _id: string }; Returns: undefined }
      admin_delete_subscription: {
        Args: { _physio_id: string }
        Returns: undefined
      }
      admin_set_subscription: {
        Args: {
          _expires_at: string
          _physio_id: string
          _plan_code: string
          _status: Database["public"]["Enums"]["subscription_status"]
        }
        Returns: {
          created_at: string
          expires_at: string | null
          id: string
          plan_id: string
          started_at: string
          status: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "subscriptions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_upsert_clinic: {
        Args: {
          _active: boolean
          _address: string
          _city_id: string
          _description?: string
          _email: string
          _header_image_url?: string
          _id: string
          _logo_url?: string
          _name: string
          _phone: string
          _phone2?: string
          _slug?: string
          _website?: string
          _whatsapp?: string
        }
        Returns: {
          active: boolean
          address: string | null
          city_id: string | null
          created_at: string
          description: string | null
          email: string | null
          header_image_url: string | null
          id: string
          logo_url: string | null
          name: string
          phone: string | null
          phone2: string | null
          region_id: string | null
          slug: string
          updated_at: string
          website: string | null
          whatsapp: string | null
        }
        SetofOptions: {
          from: "*"
          to: "clinics"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      available_slots: {
        Args: {
          _clinic_id?: string
          _date: string
          _location_id?: string
          _physio_id: string
          _service_id: string
        }
        Returns: {
          slot: string
        }[]
      }
      book_appointment: {
        Args: {
          _clinic_id?: string
          _email: string
          _first_name: string
          _last_name: string
          _location_id?: string
          _message?: string
          _phone: string
          _physio_id: string
          _service_id: string
          _start_at: string
        }
        Returns: {
          cancellation_reason: string | null
          client_email: string
          client_first_name: string
          client_id: string | null
          client_last_name: string
          client_message: string | null
          client_phone: string
          created_at: string
          currency: string
          end_at: string
          id: string
          physiotherapist_id: string
          price: number
          service_id: string | null
          service_name: string
          start_at: string
          status: Database["public"]["Enums"]["appointment_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "appointments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      booking_locations: {
        Args: { _physio_id: string; _service_id: string }
        Returns: {
          clinic_id: string
          id: string
          is_default: boolean
          name: string
          address: string | null
        }[]
      }
      create_my_physio_profile: {
        Args: {
          _bio?: string
          _city_id: string
          _first_name: string
          _last_name: string
          _license_number?: string
          _phone: string
          _professional_title?: string
          _region_id: string
        }
        Returns: {
          address: string | null
          bio: string | null
          certifications: string | null
          city_id: string | null
          clinic_id: string | null
          created_at: string
          education: string | null
          experience: string | null
          first_name: string
          id: string
          last_name: string
          latitude: number | null
          license_number: string | null
          longitude: number | null
          min_cancellation_hours: number
          onboarding_step: number
          phone: string | null
          photo_url: string | null
          professional_title: string | null
          profile_views: number
          rating_avg: number
          rating_count: number
          region_id: string | null
          rejection_reason: string | null
          slug: string
          status: Database["public"]["Enums"]["profile_status"]
          updated_at: string
          user_id: string
          verification: Database["public"]["Enums"]["verification_status"]
        }
        SetofOptions: {
          from: "*"
          to: "physiotherapists"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_physio_id: { Args: never; Returns: string }
      generate_unique_clinic_slug:
        | { Args: { _base: string }; Returns: string }
        | { Args: { _base: string; _clinic_id?: string }; Returns: string }
      generate_unique_slug: { Args: { _base: string }; Returns: string }
      get_physio_private: {
        Args: { _physio_id: string }
        Returns: {
          id: string
          latitude: number
          license_number: string
          longitude: number
          phone: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      hold_slot: {
        Args: {
          _physio_id: string
          _service_id: string
          _session_id: string
          _start_at: string
        }
        Returns: string
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      set_my_physio_slug: { Args: { _slug: string }; Returns: string }
      slug_taken: {
        Args: { _clinic_id?: string; _physio_id?: string; _slug: string }
        Returns: boolean
      }
      slugify: { Args: { _input: string }; Returns: string }
    }
    Enums: {
      app_role: "CLIENT" | "PHYSIOTHERAPIST" | "ADMIN" | "SUPER_ADMIN"
      appointment_status:
        | "PENDING"
        | "CONFIRMED"
        | "REJECTED"
        | "CANCELLED"
        | "COMPLETED"
        | "NO_SHOW"
      profile_status:
        | "DRAFT"
        | "PENDING_APPROVAL"
        | "APPROVED"
        | "REJECTED"
        | "SUSPENDED"
      subscription_status:
        | "ACTIVE"
        | "TRIALING"
        | "PAST_DUE"
        | "CANCELLED"
        | "EXPIRED"
      verification_status: "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED"
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
      app_role: ["CLIENT", "PHYSIOTHERAPIST", "ADMIN", "SUPER_ADMIN"],
      appointment_status: [
        "PENDING",
        "CONFIRMED",
        "REJECTED",
        "CANCELLED",
        "COMPLETED",
        "NO_SHOW",
      ],
      profile_status: [
        "DRAFT",
        "PENDING_APPROVAL",
        "APPROVED",
        "REJECTED",
        "SUSPENDED",
      ],
      subscription_status: [
        "ACTIVE",
        "TRIALING",
        "PAST_DUE",
        "CANCELLED",
        "EXPIRED",
      ],
      verification_status: ["UNVERIFIED", "PENDING", "VERIFIED", "REJECTED"],
    },
  },
} as const
