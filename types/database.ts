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
      activities_catalog: {
        Row: {
          category: string | null
          code: string
          color: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          min_photos: number
          name: string
          requires_photo: boolean
          service_id: string
          unit_id: string | null
          updated_at: string
          yield_per_day: number | null
        }
        Insert: {
          category?: string | null
          code: string
          color?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          min_photos?: number
          name: string
          requires_photo?: boolean
          service_id: string
          unit_id?: string | null
          updated_at?: string
          yield_per_day?: number | null
        }
        Update: {
          category?: string | null
          code?: string
          color?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          min_photos?: number
          name?: string
          requires_photo?: boolean
          service_id?: string
          unit_id?: string | null
          updated_at?: string
          yield_per_day?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "activities_catalog_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_catalog_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_catalog_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_interventions: {
        Row: {
          action: string
          asset_id: string
          client_id: string
          condition_after: Database["public"]["Enums"]["asset_condition"] | null
          condition_before:
            | Database["public"]["Enums"]["asset_condition"]
            | null
          created_at: string
          created_by: string | null
          crew_id: string | null
          id: string
          intervened_on: string
          notes: string | null
          pci_item_id: string | null
          service_id: string
          work_entry_id: string | null
        }
        Insert: {
          action: string
          asset_id: string
          client_id?: string
          condition_after?:
            | Database["public"]["Enums"]["asset_condition"]
            | null
          condition_before?:
            | Database["public"]["Enums"]["asset_condition"]
            | null
          created_at?: string
          created_by?: string | null
          crew_id?: string | null
          id?: string
          intervened_on?: string
          notes?: string | null
          pci_item_id?: string | null
          service_id: string
          work_entry_id?: string | null
        }
        Update: {
          action?: string
          asset_id?: string
          client_id?: string
          condition_after?:
            | Database["public"]["Enums"]["asset_condition"]
            | null
          condition_before?:
            | Database["public"]["Enums"]["asset_condition"]
            | null
          created_at?: string
          created_by?: string | null
          crew_id?: string | null
          id?: string
          intervened_on?: string
          notes?: string | null
          pci_item_id?: string | null
          service_id?: string
          work_entry_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "asset_interventions_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "road_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_interventions_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "v_road_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_interventions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_interventions_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_interventions_pci_item_id_fkey"
            columns: ["pci_item_id"]
            isOneToOne: false
            referencedRelation: "pci_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_interventions_pci_item_id_fkey"
            columns: ["pci_item_id"]
            isOneToOne: false
            referencedRelation: "v_pci_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_interventions_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_interventions_work_entry_id_fkey"
            columns: ["work_entry_id"]
            isOneToOne: false
            referencedRelation: "v_work_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_interventions_work_entry_id_fkey"
            columns: ["work_entry_id"]
            isOneToOne: false
            referencedRelation: "work_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_types: {
        Row: {
          category: string | null
          code: string
          color: string | null
          created_at: string
          icon: string | null
          id: string
          is_active: boolean
          name: string
          schema: Json
          service_id: string | null
        }
        Insert: {
          category?: string | null
          code: string
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          schema?: Json
          service_id?: string | null
        }
        Update: {
          category?: string | null
          code?: string
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          schema?: Json
          service_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "asset_types_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      ats_iperc: {
        Row: {
          approved_at: string | null
          client_id: string
          created_at: string
          created_by: string | null
          crew_id: string | null
          deleted_at: string | null
          doc_date: string
          hazards: Json
          id: string
          lat: number | null
          lng: number | null
          location: string | null
          max_risk: Database["public"]["Enums"]["risk_level"] | null
          ppe: Json
          prog_start_m: number | null
          section_id: string | null
          service_id: string
          supervisor_id: string | null
          supervisor_signature_path: string | null
          task: string
          updated_at: string
          work_order_id: string | null
        }
        Insert: {
          approved_at?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          crew_id?: string | null
          deleted_at?: string | null
          doc_date?: string
          hazards?: Json
          id?: string
          lat?: number | null
          lng?: number | null
          location?: string | null
          max_risk?: Database["public"]["Enums"]["risk_level"] | null
          ppe?: Json
          prog_start_m?: number | null
          section_id?: string | null
          service_id: string
          supervisor_id?: string | null
          supervisor_signature_path?: string | null
          task: string
          updated_at?: string
          work_order_id?: string | null
        }
        Update: {
          approved_at?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          crew_id?: string | null
          deleted_at?: string | null
          doc_date?: string
          hazards?: Json
          id?: string
          lat?: number | null
          lng?: number | null
          location?: string | null
          max_risk?: Database["public"]["Enums"]["risk_level"] | null
          ppe?: Json
          prog_start_m?: number | null
          section_id?: string | null
          service_id?: string
          supervisor_id?: string | null
          supervisor_signature_path?: string | null
          task?: string
          updated_at?: string
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ats_iperc_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ats_iperc_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ats_iperc_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "road_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ats_iperc_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ats_iperc_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ats_iperc_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      ats_signatures: {
        Row: {
          ats_id: string
          dni: string | null
          full_name: string
          id: string
          signature_path: string | null
          signed_at: string
        }
        Insert: {
          ats_id: string
          dni?: string | null
          full_name: string
          id?: string
          signature_path?: string | null
          signed_at?: string
        }
        Update: {
          ats_id?: string
          dni?: string | null
          full_name?: string
          id?: string
          signature_path?: string | null
          signed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ats_signatures_ats_id_fkey"
            columns: ["ats_id"]
            isOneToOne: false
            referencedRelation: "ats_iperc"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          after_data: Json | null
          before_data: Json | null
          created_at: string
          id: number
          ip_address: string | null
          record_id: string | null
          service_id: string | null
          table_name: string
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          id?: number
          ip_address?: string | null
          record_id?: string | null
          service_id?: string | null
          table_name: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          id?: number
          ip_address?: string | null
          record_id?: string | null
          service_id?: string | null
          table_name?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      backups_log: {
        Row: {
          created_at: string
          id: string
          kind: string
          message: string | null
          rows_count: number | null
          size_bytes: number | null
          status: string
          storage_path: string | null
          tables_count: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          message?: string | null
          rows_count?: number | null
          size_bytes?: number | null
          status?: string
          storage_path?: string | null
          tables_count?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          message?: string | null
          rows_count?: number | null
          size_bytes?: number | null
          status?: string
          storage_path?: string | null
          tables_count?: number | null
        }
        Relationships: []
      }
      checklist_responses: {
        Row: {
          answers: Json
          client_id: string
          created_at: string
          created_by: string | null
          crew_id: string | null
          deleted_at: string | null
          findings: string | null
          has_findings: boolean
          id: string
          lat: number | null
          lng: number | null
          responded_on: string
          score: number | null
          service_id: string
          signature_path: string | null
          template_id: string
          updated_at: string
          work_order_id: string | null
        }
        Insert: {
          answers?: Json
          client_id?: string
          created_at?: string
          created_by?: string | null
          crew_id?: string | null
          deleted_at?: string | null
          findings?: string | null
          has_findings?: boolean
          id?: string
          lat?: number | null
          lng?: number | null
          responded_on?: string
          score?: number | null
          service_id: string
          signature_path?: string | null
          template_id: string
          updated_at?: string
          work_order_id?: string | null
        }
        Update: {
          answers?: Json
          client_id?: string
          created_at?: string
          created_by?: string | null
          crew_id?: string | null
          deleted_at?: string | null
          findings?: string | null
          has_findings?: boolean
          id?: string
          lat?: number | null
          lng?: number | null
          responded_on?: string
          score?: number | null
          service_id?: string
          signature_path?: string | null
          template_id?: string
          updated_at?: string
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checklist_responses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_responses_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_responses_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_responses_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_responses_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_templates: {
        Row: {
          category: string | null
          code: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          frequency: string | null
          id: string
          is_active: boolean
          name: string
          questions: Json
          service_id: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          frequency?: string | null
          id?: string
          is_active?: boolean
          name: string
          questions?: Json
          service_id: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          frequency?: string | null
          id?: string
          is_active?: boolean
          name?: string
          questions?: Json
          service_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_templates_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      crew_members: {
        Row: {
          created_at: string
          crew_id: string
          dni: string | null
          full_name: string
          id: string
          is_active: boolean
          position: string | null
          profile_id: string | null
        }
        Insert: {
          created_at?: string
          crew_id: string
          dni?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          position?: string | null
          profile_id?: string | null
        }
        Update: {
          created_at?: string
          crew_id?: string
          dni?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          position?: string | null
          profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crew_members_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      crews: {
        Row: {
          code: string
          color: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_active: boolean
          leader_id: string | null
          name: string
          plate: string | null
          service_id: string
          updated_at: string
          vehicle: string | null
        }
        Insert: {
          code: string
          color?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          leader_id?: string | null
          name: string
          plate?: string | null
          service_id: string
          updated_at?: string
          vehicle?: string | null
        }
        Update: {
          code?: string
          color?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          leader_id?: string | null
          name?: string
          plate?: string | null
          service_id?: string
          updated_at?: string
          vehicle?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crews_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crews_leader_id_fkey"
            columns: ["leader_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crews_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      evidences: {
        Row: {
          accuracy_m: number | null
          altitude_m: number | null
          asset_id: string | null
          caption: string | null
          client_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          device_id: string | null
          device_model: string | null
          geom: unknown
          heading: number | null
          height: number | null
          id: string
          lat: number
          lng: number
          mime_type: string
          pci_item_id: string | null
          phase: Database["public"]["Enums"]["evidence_phase"]
          progresiva_m: number | null
          section_id: string | null
          service_id: string
          sha256: string
          size_bytes: number | null
          storage_path: string
          taken_at: string
          talk_id: string | null
          thumb_path: string | null
          watermarked: boolean
          width: number | null
          work_entry_id: string | null
        }
        Insert: {
          accuracy_m?: number | null
          altitude_m?: number | null
          asset_id?: string | null
          caption?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          device_id?: string | null
          device_model?: string | null
          geom?: unknown
          heading?: number | null
          height?: number | null
          id?: string
          lat: number
          lng: number
          mime_type?: string
          pci_item_id?: string | null
          phase?: Database["public"]["Enums"]["evidence_phase"]
          progresiva_m?: number | null
          section_id?: string | null
          service_id: string
          sha256: string
          size_bytes?: number | null
          storage_path: string
          taken_at: string
          talk_id?: string | null
          thumb_path?: string | null
          watermarked?: boolean
          width?: number | null
          work_entry_id?: string | null
        }
        Update: {
          accuracy_m?: number | null
          altitude_m?: number | null
          asset_id?: string | null
          caption?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          device_id?: string | null
          device_model?: string | null
          geom?: unknown
          heading?: number | null
          height?: number | null
          id?: string
          lat?: number
          lng?: number
          mime_type?: string
          pci_item_id?: string | null
          phase?: Database["public"]["Enums"]["evidence_phase"]
          progresiva_m?: number | null
          section_id?: string | null
          service_id?: string
          sha256?: string
          size_bytes?: number | null
          storage_path?: string
          taken_at?: string
          talk_id?: string | null
          thumb_path?: string | null
          watermarked?: boolean
          width?: number | null
          work_entry_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evidences_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "road_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidences_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "v_road_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidences_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidences_pci_item_id_fkey"
            columns: ["pci_item_id"]
            isOneToOne: false
            referencedRelation: "pci_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidences_pci_item_id_fkey"
            columns: ["pci_item_id"]
            isOneToOne: false
            referencedRelation: "v_pci_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidences_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "road_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidences_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidences_talk_id_fkey"
            columns: ["talk_id"]
            isOneToOne: false
            referencedRelation: "safety_talks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidences_work_entry_id_fkey"
            columns: ["work_entry_id"]
            isOneToOne: false
            referencedRelation: "v_work_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidences_work_entry_id_fkey"
            columns: ["work_entry_id"]
            isOneToOne: false
            referencedRelation: "work_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batches: {
        Row: {
          created_at: string
          created_by: string | null
          error_rows: number
          errors: Json
          file_name: string | null
          file_path: string | null
          finished_at: string | null
          id: string
          kind: string
          mapping: Json
          ok_rows: number
          service_id: string
          status: string
          total_rows: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          error_rows?: number
          errors?: Json
          file_name?: string | null
          file_path?: string | null
          finished_at?: string | null
          id?: string
          kind: string
          mapping?: Json
          ok_rows?: number
          service_id: string
          status?: string
          total_rows?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          error_rows?: number
          errors?: Json
          file_name?: string | null
          file_path?: string | null
          finished_at?: string | null
          id?: string
          kind?: string
          mapping?: Json
          ok_rows?: number
          service_id?: string
          status?: string
          total_rows?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batches_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          data: Json
          id: string
          profile_id: string
          pushed_at: string | null
          read_at: string | null
          service_id: string | null
          severity: string
          title: string
          type: string
          url: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          data?: Json
          id?: string
          profile_id: string
          pushed_at?: string | null
          read_at?: string | null
          service_id?: string | null
          severity?: string
          title: string
          type: string
          url?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          data?: Json
          id?: string
          profile_id?: string
          pushed_at?: string | null
          read_at?: string | null
          service_id?: string | null
          severity?: string
          title?: string
          type?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          id: string
          legal_name: string | null
          logo_url: string | null
          name: string
          phone: string | null
          ruc: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          legal_name?: string | null
          logo_url?: string | null
          name: string
          phone?: string | null
          ruc?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          legal_name?: string | null
          logo_url?: string | null
          name?: string
          phone?: string | null
          ruc?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pci_items: {
        Row: {
          activity_id: string | null
          assigned_crew_id: string | null
          assigned_to: string | null
          client_id: string
          closed_at: string | null
          closed_by: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string
          due_date: string
          id: string
          item_number: number
          notes: string | null
          pci_id: string
          prog_end_m: number | null
          prog_start_m: number | null
          quantity: number | null
          reject_reason: string | null
          requires_evidence: boolean
          section_id: string | null
          service_id: string
          side: Database["public"]["Enums"]["road_side"] | null
          status: Database["public"]["Enums"]["pci_item_status"]
          term_days: number
          unit_id: string | null
          updated_at: string
          validated_at: string | null
          validated_by: string | null
        }
        Insert: {
          activity_id?: string | null
          assigned_crew_id?: string | null
          assigned_to?: string | null
          client_id?: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description: string
          due_date: string
          id?: string
          item_number: number
          notes?: string | null
          pci_id: string
          prog_end_m?: number | null
          prog_start_m?: number | null
          quantity?: number | null
          reject_reason?: string | null
          requires_evidence?: boolean
          section_id?: string | null
          service_id: string
          side?: Database["public"]["Enums"]["road_side"] | null
          status?: Database["public"]["Enums"]["pci_item_status"]
          term_days?: number
          unit_id?: string | null
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
        }
        Update: {
          activity_id?: string | null
          assigned_crew_id?: string | null
          assigned_to?: string | null
          client_id?: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string
          due_date?: string
          id?: string
          item_number?: number
          notes?: string | null
          pci_id?: string
          prog_end_m?: number | null
          prog_start_m?: number | null
          quantity?: number | null
          reject_reason?: string | null
          requires_evidence?: boolean
          section_id?: string | null
          service_id?: string
          side?: Database["public"]["Enums"]["road_side"] | null
          status?: Database["public"]["Enums"]["pci_item_status"]
          term_days?: number
          unit_id?: string | null
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pci_items_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pci_items_assigned_crew_id_fkey"
            columns: ["assigned_crew_id"]
            isOneToOne: false
            referencedRelation: "crews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pci_items_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pci_items_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pci_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pci_items_pci_id_fkey"
            columns: ["pci_id"]
            isOneToOne: false
            referencedRelation: "pcis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pci_items_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "road_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pci_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pci_items_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pci_items_validated_by_fkey"
            columns: ["validated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pcis: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          default_days: number
          deleted_at: string | null
          description: string | null
          document_path: string | null
          id: string
          items_done: number
          items_total: number
          notified_on: string
          priority: Database["public"]["Enums"]["pci_priority"]
          received_on: string | null
          service_id: string
          source: string | null
          status: Database["public"]["Enums"]["pci_status"]
          suspends_plan: boolean
          suspension_applied_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          default_days?: number
          deleted_at?: string | null
          description?: string | null
          document_path?: string | null
          id?: string
          items_done?: number
          items_total?: number
          notified_on: string
          priority?: Database["public"]["Enums"]["pci_priority"]
          received_on?: string | null
          service_id: string
          source?: string | null
          status?: Database["public"]["Enums"]["pci_status"]
          suspends_plan?: boolean
          suspension_applied_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          default_days?: number
          deleted_at?: string | null
          description?: string | null
          document_path?: string | null
          id?: string
          items_done?: number
          items_total?: number
          notified_on?: string
          priority?: Database["public"]["Enums"]["pci_priority"]
          received_on?: string | null
          service_id?: string
          source?: string | null
          status?: Database["public"]["Enums"]["pci_status"]
          suspends_plan?: boolean
          suspension_applied_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pcis_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pcis_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_items: {
        Row: {
          activity_id: string
          client_id: string | null
          created_at: string
          created_by: string | null
          crew_id: string | null
          deleted_at: string | null
          executed_qty: number
          id: string
          notes: string | null
          original_date: string | null
          plan_id: string
          priority: number
          prog_end_m: number
          prog_start_m: number
          rescheduled_to: string | null
          scheduled_on: string
          section_id: string
          service_id: string
          sort_order: number
          status: Database["public"]["Enums"]["plan_item_status"]
          suspended_by_pci_id: string | null
          target_qty: number
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          activity_id: string
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          crew_id?: string | null
          deleted_at?: string | null
          executed_qty?: number
          id?: string
          notes?: string | null
          original_date?: string | null
          plan_id: string
          priority?: number
          prog_end_m: number
          prog_start_m: number
          rescheduled_to?: string | null
          scheduled_on: string
          section_id: string
          service_id: string
          sort_order?: number
          status?: Database["public"]["Enums"]["plan_item_status"]
          suspended_by_pci_id?: string | null
          target_qty?: number
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          activity_id?: string
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          crew_id?: string | null
          deleted_at?: string | null
          executed_qty?: number
          id?: string
          notes?: string | null
          original_date?: string | null
          plan_id?: string
          priority?: number
          prog_end_m?: number
          prog_start_m?: number
          rescheduled_to?: string | null
          scheduled_on?: string
          section_id?: string
          service_id?: string
          sort_order?: number
          status?: Database["public"]["Enums"]["plan_item_status"]
          suspended_by_pci_id?: string | null
          target_qty?: number
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_items_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_items_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_items_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "weekly_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_items_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "road_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_items_suspended_by_pci_id_fkey"
            columns: ["suspended_by_pci_id"]
            isOneToOne: false
            referencedRelation: "pcis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_items_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_suspensions: {
        Row: {
          applied_at: string
          applied_by: string | null
          detail: Json
          id: string
          items_affected: number
          pci_id: string | null
          plan_id: string
          reason: string
          reverted_at: string | null
          reverted_by: string | null
          service_id: string
        }
        Insert: {
          applied_at?: string
          applied_by?: string | null
          detail?: Json
          id?: string
          items_affected?: number
          pci_id?: string | null
          plan_id: string
          reason: string
          reverted_at?: string | null
          reverted_by?: string | null
          service_id: string
        }
        Update: {
          applied_at?: string
          applied_by?: string | null
          detail?: Json
          id?: string
          items_affected?: number
          pci_id?: string | null
          plan_id?: string
          reason?: string
          reverted_at?: string | null
          reverted_by?: string | null
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_suspensions_applied_by_fkey"
            columns: ["applied_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_suspensions_pci_id_fkey"
            columns: ["pci_id"]
            isOneToOne: false
            referencedRelation: "pcis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_suspensions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "weekly_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_suspensions_reverted_by_fkey"
            columns: ["reverted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_suspensions_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          dni: string | null
          email: string
          full_name: string
          id: string
          is_active: boolean
          is_demo: boolean
          last_seen_at: string | null
          org_id: string | null
          phone: string | null
          position: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          dni?: string | null
          email: string
          full_name: string
          id: string
          is_active?: boolean
          is_demo?: boolean
          last_seen_at?: string | null
          org_id?: string | null
          phone?: string | null
          position?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          dni?: string | null
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          is_demo?: boolean
          last_seen_at?: string | null
          org_id?: string | null
          phone?: string | null
          position?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          device_label: string | null
          endpoint: string
          id: string
          is_active: boolean
          last_used_at: string | null
          p256dh: string
          profile_id: string
          user_agent: string | null
        }
        Insert: {
          auth: string
          created_at?: string
          device_label?: string | null
          endpoint: string
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          p256dh: string
          profile_id: string
          user_agent?: string | null
        }
        Update: {
          auth?: string
          created_at?: string
          device_label?: string | null
          endpoint?: string
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          p256dh?: string
          profile_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      road_assets: {
        Row: {
          attributes: Json
          client_id: string
          code: string
          condition: Database["public"]["Enums"]["asset_condition"]
          created_at: string
          created_by: string | null
          deleted_at: string | null
          geom: unknown
          id: string
          install_year: number | null
          last_inspected_on: string | null
          lat: number | null
          lng: number | null
          name: string | null
          next_inspection_on: string | null
          notes: string | null
          progresiva_m: number | null
          section_id: string | null
          service_id: string
          side: Database["public"]["Enums"]["road_side"]
          type_id: string
          updated_at: string
        }
        Insert: {
          attributes?: Json
          client_id?: string
          code: string
          condition?: Database["public"]["Enums"]["asset_condition"]
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          geom?: unknown
          id?: string
          install_year?: number | null
          last_inspected_on?: string | null
          lat?: number | null
          lng?: number | null
          name?: string | null
          next_inspection_on?: string | null
          notes?: string | null
          progresiva_m?: number | null
          section_id?: string | null
          service_id: string
          side?: Database["public"]["Enums"]["road_side"]
          type_id: string
          updated_at?: string
        }
        Update: {
          attributes?: Json
          client_id?: string
          code?: string
          condition?: Database["public"]["Enums"]["asset_condition"]
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          geom?: unknown
          id?: string
          install_year?: number | null
          last_inspected_on?: string | null
          lat?: number | null
          lng?: number | null
          name?: string | null
          next_inspection_on?: string | null
          notes?: string | null
          progresiva_m?: number | null
          section_id?: string | null
          service_id?: string
          side?: Database["public"]["Enums"]["road_side"]
          type_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "road_assets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "road_assets_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "road_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "road_assets_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "road_assets_type_id_fkey"
            columns: ["type_id"]
            isOneToOne: false
            referencedRelation: "asset_types"
            referencedColumns: ["id"]
          },
        ]
      }
      road_sections: {
        Row: {
          code: string
          color: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          geom: unknown
          id: string
          is_active: boolean
          lanes: number | null
          length_m: number | null
          name: string
          prog_end_m: number
          prog_start_m: number
          route_code: string | null
          service_id: string
          surface: string | null
          updated_at: string
        }
        Insert: {
          code: string
          color?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          geom?: unknown
          id?: string
          is_active?: boolean
          lanes?: number | null
          length_m?: number | null
          name: string
          prog_end_m: number
          prog_start_m?: number
          route_code?: string | null
          service_id: string
          surface?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          color?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          geom?: unknown
          id?: string
          is_active?: boolean
          lanes?: number | null
          length_m?: number | null
          name?: string
          prog_end_m?: number
          prog_start_m?: number
          route_code?: string | null
          service_id?: string
          surface?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "road_sections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "road_sections_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_talks: {
        Row: {
          attendees_count: number
          client_id: string
          content: string | null
          created_at: string
          created_by: string | null
          crew_id: string | null
          deleted_at: string | null
          duration_min: number | null
          id: string
          lat: number | null
          lng: number | null
          location: string | null
          service_id: string
          speaker_id: string | null
          speaker_name: string | null
          start_time: string | null
          talk_date: string
          topic: string
          updated_at: string
        }
        Insert: {
          attendees_count?: number
          client_id?: string
          content?: string | null
          created_at?: string
          created_by?: string | null
          crew_id?: string | null
          deleted_at?: string | null
          duration_min?: number | null
          id?: string
          lat?: number | null
          lng?: number | null
          location?: string | null
          service_id: string
          speaker_id?: string | null
          speaker_name?: string | null
          start_time?: string | null
          talk_date?: string
          topic: string
          updated_at?: string
        }
        Update: {
          attendees_count?: number
          client_id?: string
          content?: string | null
          created_at?: string
          created_by?: string | null
          crew_id?: string | null
          deleted_at?: string | null
          duration_min?: number | null
          id?: string
          lat?: number | null
          lng?: number | null
          location?: string | null
          service_id?: string
          speaker_id?: string | null
          speaker_name?: string | null
          start_time?: string | null
          talk_date?: string
          topic?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "safety_talks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_talks_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_talks_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_talks_speaker_id_fkey"
            columns: ["speaker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_members: {
        Row: {
          created_at: string
          id: string
          profile_id: string
          role: Database["public"]["Enums"]["user_role"]
          service_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id: string
          role?: Database["public"]["Enums"]["user_role"]
          service_id: string
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string
          role?: Database["public"]["Enums"]["user_role"]
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_members_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          client_name: string | null
          code: string
          color: string
          contract_code: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          ends_on: string | null
          id: string
          is_demo: boolean
          modules: Json
          name: string
          org_id: string
          starts_on: string | null
          status: Database["public"]["Enums"]["service_status"]
          updated_at: string
        }
        Insert: {
          client_name?: string | null
          code: string
          color?: string
          contract_code?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          ends_on?: string | null
          id?: string
          is_demo?: boolean
          modules?: Json
          name: string
          org_id: string
          starts_on?: string | null
          status?: Database["public"]["Enums"]["service_status"]
          updated_at?: string
        }
        Update: {
          client_name?: string | null
          code?: string
          color?: string
          contract_code?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          ends_on?: string | null
          id?: string
          is_demo?: boolean
          modules?: Json
          name?: string
          org_id?: string
          starts_on?: string | null
          status?: Database["public"]["Enums"]["service_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_sessions: {
        Row: {
          device_id: string
          device_label: string | null
          duration_ms: number | null
          failed_count: number
          finished_at: string | null
          id: string
          profile_id: string
          pulled_count: number
          pushed_count: number
          service_id: string | null
          started_at: string
        }
        Insert: {
          device_id: string
          device_label?: string | null
          duration_ms?: number | null
          failed_count?: number
          finished_at?: string | null
          id?: string
          profile_id: string
          pulled_count?: number
          pushed_count?: number
          service_id?: string | null
          started_at?: string
        }
        Update: {
          device_id?: string
          device_label?: string | null
          duration_ms?: number | null
          failed_count?: number
          finished_at?: string | null
          id?: string
          profile_id?: string
          pulled_count?: number
          pushed_count?: number
          service_id?: string | null
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_sessions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_sessions_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      talk_attendance: {
        Row: {
          client_id: string
          created_at: string
          crew_member_id: string | null
          dni: string | null
          full_name: string
          id: string
          position: string | null
          profile_id: string | null
          service_id: string
          signature_path: string | null
          signed_at: string | null
          talk_id: string
        }
        Insert: {
          client_id?: string
          created_at?: string
          crew_member_id?: string | null
          dni?: string | null
          full_name: string
          id?: string
          position?: string | null
          profile_id?: string | null
          service_id: string
          signature_path?: string | null
          signed_at?: string | null
          talk_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          crew_member_id?: string | null
          dni?: string | null
          full_name?: string
          id?: string
          position?: string | null
          profile_id?: string | null
          service_id?: string
          signature_path?: string | null
          signed_at?: string | null
          talk_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "talk_attendance_crew_member_id_fkey"
            columns: ["crew_member_id"]
            isOneToOne: false
            referencedRelation: "crew_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talk_attendance_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talk_attendance_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talk_attendance_talk_id_fkey"
            columns: ["talk_id"]
            isOneToOne: false
            referencedRelation: "safety_talks"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
          service_id: string | null
          symbol: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
          service_id?: string | null
          symbol: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
          service_id?: string | null
          symbol?: string
        }
        Relationships: [
          {
            foreignKeyName: "units_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_plans: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          ends_on: string
          id: string
          notes: string | null
          published_at: string | null
          published_by: string | null
          service_id: string
          starts_on: string
          status: Database["public"]["Enums"]["plan_status"]
          updated_at: string
          week: number
          year: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          ends_on: string
          id?: string
          notes?: string | null
          published_at?: string | null
          published_by?: string | null
          service_id: string
          starts_on: string
          status?: Database["public"]["Enums"]["plan_status"]
          updated_at?: string
          week: number
          year: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          ends_on?: string
          id?: string
          notes?: string | null
          published_at?: string | null
          published_by?: string | null
          service_id?: string
          starts_on?: string
          status?: Database["public"]["Enums"]["plan_status"]
          updated_at?: string
          week?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "weekly_plans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_plans_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_plans_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      work_entries: {
        Row: {
          activity_id: string
          client_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          finished_at: string | null
          geom: unknown
          id: string
          observation: string | null
          pci_item_id: string | null
          plan_item_id: string | null
          prog_end_m: number | null
          prog_start_m: number
          quantity: number
          section_id: string
          service_id: string
          side: Database["public"]["Enums"]["road_side"]
          started_at: string | null
          unit_id: string | null
          updated_at: string
          work_order_id: string
        }
        Insert: {
          activity_id: string
          client_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          finished_at?: string | null
          geom?: unknown
          id?: string
          observation?: string | null
          pci_item_id?: string | null
          plan_item_id?: string | null
          prog_end_m?: number | null
          prog_start_m: number
          quantity?: number
          section_id: string
          service_id: string
          side?: Database["public"]["Enums"]["road_side"]
          started_at?: string | null
          unit_id?: string | null
          updated_at?: string
          work_order_id: string
        }
        Update: {
          activity_id?: string
          client_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          finished_at?: string | null
          geom?: unknown
          id?: string
          observation?: string | null
          pci_item_id?: string | null
          plan_item_id?: string | null
          prog_end_m?: number | null
          prog_start_m?: number
          quantity?: number
          section_id?: string
          service_id?: string
          side?: Database["public"]["Enums"]["road_side"]
          started_at?: string | null
          unit_id?: string | null
          updated_at?: string
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_entries_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_entries_pci_item_id_fkey"
            columns: ["pci_item_id"]
            isOneToOne: false
            referencedRelation: "pci_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_entries_pci_item_id_fkey"
            columns: ["pci_item_id"]
            isOneToOne: false
            referencedRelation: "v_pci_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_entries_plan_item_id_fkey"
            columns: ["plan_item_id"]
            isOneToOne: false
            referencedRelation: "plan_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_entries_plan_item_id_fkey"
            columns: ["plan_item_id"]
            isOneToOne: false
            referencedRelation: "v_plan_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_entries_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "road_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_entries_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_entries_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_entries_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      work_orders: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          crew_id: string
          deleted_at: string | null
          device_id: string | null
          end_time: string | null
          headcount: number | null
          id: string
          notes: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          service_id: string
          start_time: string | null
          status: Database["public"]["Enums"]["work_order_status"]
          submitted_at: string | null
          synced_at: string
          updated_at: string
          weather: string | null
          work_date: string
        }
        Insert: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          crew_id: string
          deleted_at?: string | null
          device_id?: string | null
          end_time?: string | null
          headcount?: number | null
          id?: string
          notes?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          service_id: string
          start_time?: string | null
          status?: Database["public"]["Enums"]["work_order_status"]
          submitted_at?: string | null
          synced_at?: string
          updated_at?: string
          weather?: string | null
          work_date: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          crew_id?: string
          deleted_at?: string | null
          device_id?: string | null
          end_time?: string | null
          headcount?: number | null
          id?: string
          notes?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          service_id?: string
          start_time?: string | null
          status?: Database["public"]["Enums"]["work_order_status"]
          submitted_at?: string | null
          synced_at?: string
          updated_at?: string
          weather?: string | null
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_pci_items: {
        Row: {
          activity_id: string | null
          activity_name: string | null
          assigned_crew_id: string | null
          assigned_to: string | null
          assignee_name: string | null
          closed_at: string | null
          created_at: string | null
          crew_name: string | null
          days_left: number | null
          description: string | null
          due_date: string | null
          evidence_count: number | null
          id: string | null
          item_number: number | null
          notes: string | null
          pci_code: string | null
          pci_id: string | null
          pci_priority: Database["public"]["Enums"]["pci_priority"] | null
          pci_title: string | null
          prog_end_m: number | null
          prog_end_txt: string | null
          prog_start_m: number | null
          prog_start_txt: string | null
          quantity: number | null
          requires_evidence: boolean | null
          section_code: string | null
          section_id: string | null
          section_name: string | null
          semaforo: string | null
          service_id: string | null
          side: Database["public"]["Enums"]["road_side"] | null
          status: Database["public"]["Enums"]["pci_item_status"] | null
          term_days: number | null
          unit_symbol: string | null
          updated_at: string | null
          validated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pci_items_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pci_items_assigned_crew_id_fkey"
            columns: ["assigned_crew_id"]
            isOneToOne: false
            referencedRelation: "crews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pci_items_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pci_items_pci_id_fkey"
            columns: ["pci_id"]
            isOneToOne: false
            referencedRelation: "pcis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pci_items_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "road_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pci_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      v_plan_items: {
        Row: {
          activity_category: string | null
          activity_code: string | null
          activity_color: string | null
          activity_id: string | null
          activity_name: string | null
          created_at: string | null
          crew_color: string | null
          crew_id: string | null
          crew_name: string | null
          executed_qty: number | null
          id: string | null
          notes: string | null
          original_date: string | null
          pci_code: string | null
          plan_id: string | null
          plan_status: Database["public"]["Enums"]["plan_status"] | null
          priority: number | null
          prog_end_m: number | null
          prog_end_txt: string | null
          prog_start_m: number | null
          prog_start_txt: string | null
          progress_pct: number | null
          rescheduled_to: string | null
          scheduled_on: string | null
          section_code: string | null
          section_id: string | null
          section_name: string | null
          service_id: string | null
          sort_order: number | null
          status: Database["public"]["Enums"]["plan_item_status"] | null
          suspended_by_pci_id: string | null
          target_qty: number | null
          unit_symbol: string | null
          updated_at: string | null
          week: number | null
          year: number | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_items_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_items_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_items_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "weekly_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_items_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "road_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_items_suspended_by_pci_id_fkey"
            columns: ["suspended_by_pci_id"]
            isOneToOne: false
            referencedRelation: "pcis"
            referencedColumns: ["id"]
          },
        ]
      }
      v_road_assets: {
        Row: {
          attributes: Json | null
          code: string | null
          condition: Database["public"]["Enums"]["asset_condition"] | null
          created_at: string | null
          id: string | null
          install_year: number | null
          interventions_count: number | null
          last_inspected_on: string | null
          last_intervention_on: string | null
          lat: number | null
          lng: number | null
          name: string | null
          next_inspection_on: string | null
          notes: string | null
          progresiva_m: number | null
          progresiva_txt: string | null
          section_id: string | null
          section_name: string | null
          service_id: string | null
          side: Database["public"]["Enums"]["road_side"] | null
          type_category: string | null
          type_color: string | null
          type_icon: string | null
          type_id: string | null
          type_name: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "road_assets_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "road_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "road_assets_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "road_assets_type_id_fkey"
            columns: ["type_id"]
            isOneToOne: false
            referencedRelation: "asset_types"
            referencedColumns: ["id"]
          },
        ]
      }
      v_work_entries: {
        Row: {
          activity_category: string | null
          activity_color: string | null
          activity_id: string | null
          activity_name: string | null
          created_at: string | null
          created_by_name: string | null
          crew_color: string | null
          crew_id: string | null
          crew_name: string | null
          evidence_count: number | null
          finished_at: string | null
          id: string | null
          lat: number | null
          lng: number | null
          observation: string | null
          order_status: Database["public"]["Enums"]["work_order_status"] | null
          pci_item_id: string | null
          plan_item_id: string | null
          prog_end_m: number | null
          prog_end_txt: string | null
          prog_start_m: number | null
          prog_start_txt: string | null
          quantity: number | null
          section_id: string | null
          section_name: string | null
          service_id: string | null
          side: Database["public"]["Enums"]["road_side"] | null
          started_at: string | null
          unit_symbol: string | null
          work_date: string | null
          work_order_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_entries_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_entries_pci_item_id_fkey"
            columns: ["pci_item_id"]
            isOneToOne: false
            referencedRelation: "pci_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_entries_pci_item_id_fkey"
            columns: ["pci_item_id"]
            isOneToOne: false
            referencedRelation: "v_pci_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_entries_plan_item_id_fkey"
            columns: ["plan_item_id"]
            isOneToOne: false
            referencedRelation: "plan_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_entries_plan_item_id_fkey"
            columns: ["plan_item_id"]
            isOneToOne: false
            referencedRelation: "v_plan_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_entries_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "road_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_entries_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_entries_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crews"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      apply_pci_suspension: { Args: { p_pci_id: string }; Returns: Json }
      assets_geojson: {
        Args: {
          p_conditions?: string[]
          p_service_id: string
          p_type_codes?: string[]
        }
        Returns: Json
      }
      can_manage: { Args: { sid: string }; Returns: boolean }
      can_write: { Args: { sid: string }; Returns: boolean }
      dashboard_activity_production: {
        Args: { p_from?: string; p_service_id: string; p_to?: string }
        Returns: {
          activity_id: string
          activity_name: string
          category: string
          color: string
          meta: number
          metrado: number
          registros: number
          unit_symbol: string
        }[]
      }
      dashboard_crew_production: {
        Args: { p_from?: string; p_service_id: string; p_to?: string }
        Returns: {
          crew_color: string
          crew_id: string
          crew_name: string
          cumplimiento: number
          dias_trabajados: number
          evidencias: number
          metrado: number
          registros: number
        }[]
      }
      dashboard_daily_series: {
        Args: { p_from?: string; p_service_id: string; p_to?: string }
        Returns: {
          dia: string
          evidencias: number
          meta: number
          metrado: number
          registros: number
        }[]
      }
      dashboard_kpis: {
        Args: { p_from?: string; p_service_id: string; p_to?: string }
        Returns: Json
      }
      evaluate_pci_deadlines: { Args: never; Returns: Json }
      evidences_geojson: {
        Args: {
          p_from?: string
          p_limit?: number
          p_service_id: string
          p_to?: string
        }
        Returns: Json
      }
      fmt_progresiva: { Args: { m: number }; Returns: string }
      is_member: { Args: { sid: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      my_service_ids: { Args: never; Returns: string[] }
      parse_progresiva: { Args: { p: string }; Returns: number }
      pci_geojson: { Args: { p_service_id: string }; Returns: Json }
      pci_item_semaforo: {
        Args: {
          p_due: string
          p_status: Database["public"]["Enums"]["pci_item_status"]
          p_term_days: number
        }
        Returns: string
      }
      preview_pci_suspension: { Args: { p_pci_id: string }; Returns: Json }
      progresiva_from_point: {
        Args: { p_lat: number; p_lng: number; p_section_id: string }
        Returns: number
      }
      revert_pci_suspension: {
        Args: { p_suspension_id: string }
        Returns: Json
      }
      role_in: {
        Args: { sid: string }
        Returns: Database["public"]["Enums"]["user_role"]
      }
      sections_geojson: { Args: { p_service_id: string }; Returns: Json }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      storage_service_id: { Args: { p_name: string }; Returns: string }
      work_entries_geojson: {
        Args: {
          p_activity_ids?: string[]
          p_crew_ids?: string[]
          p_from?: string
          p_service_id: string
          p_to?: string
        }
        Returns: Json
      }
    }
    Enums: {
      asset_condition: "bueno" | "regular" | "malo" | "critico" | "no_evaluado"
      evidence_phase: "antes" | "durante" | "despues" | "general"
      pci_item_status:
        | "pendiente"
        | "en_atencion"
        | "levantado"
        | "validado"
        | "rechazado"
      pci_priority: "baja" | "media" | "alta" | "critica"
      pci_status:
        | "abierto"
        | "en_atencion"
        | "levantado"
        | "cerrado"
        | "vencido"
      plan_item_status:
        | "programado"
        | "en_curso"
        | "ejecutado"
        | "suspendido"
        | "reprogramado"
        | "cancelado"
      plan_status: "borrador" | "publicado" | "suspendido" | "cerrado"
      risk_level:
        | "trivial"
        | "tolerable"
        | "moderado"
        | "importante"
        | "intolerable"
      road_side: "derecho" | "izquierdo" | "ambos" | "eje"
      service_status: "activo" | "pausado" | "cerrado"
      user_role:
        | "admin"
        | "supervisor"
        | "jefe_cuadrilla"
        | "ing_seguridad"
        | "visor"
      work_order_status: "borrador" | "enviado" | "validado" | "observado"
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
      asset_condition: ["bueno", "regular", "malo", "critico", "no_evaluado"],
      evidence_phase: ["antes", "durante", "despues", "general"],
      pci_item_status: [
        "pendiente",
        "en_atencion",
        "levantado",
        "validado",
        "rechazado",
      ],
      pci_priority: ["baja", "media", "alta", "critica"],
      pci_status: ["abierto", "en_atencion", "levantado", "cerrado", "vencido"],
      plan_item_status: [
        "programado",
        "en_curso",
        "ejecutado",
        "suspendido",
        "reprogramado",
        "cancelado",
      ],
      plan_status: ["borrador", "publicado", "suspendido", "cerrado"],
      risk_level: [
        "trivial",
        "tolerable",
        "moderado",
        "importante",
        "intolerable",
      ],
      road_side: ["derecho", "izquierdo", "ambos", "eje"],
      service_status: ["activo", "pausado", "cerrado"],
      user_role: [
        "admin",
        "supervisor",
        "jefe_cuadrilla",
        "ing_seguridad",
        "visor",
      ],
      work_order_status: ["borrador", "enviado", "validado", "observado"],
    },
  },
} as const
