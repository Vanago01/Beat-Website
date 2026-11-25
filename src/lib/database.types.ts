
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "beat_collaborations": {
                  Row: {
                    "beat_id": string,"collaborator_id": string,"created_at": string,"ended_at": string | null,"id": string,"owner_id": string,"responded_at": string | null,"share_percent": number,"status": Database["public"]['Enums']["collab_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "beat_id": string,"collaborator_id": string,"created_at"?: string,"ended_at"?: string | null,"id"?: string,"owner_id": string,"responded_at"?: string | null,"share_percent"?: number,"status"?: Database["public"]['Enums']["collab_status"]
                  }
                  Update: {
                    "beat_id"?: string,"collaborator_id"?: string,"created_at"?: string,"ended_at"?: string | null,"id"?: string,"owner_id"?: string,"responded_at"?: string | null,"share_percent"?: number,"status"?: Database["public"]['Enums']["collab_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "beat_collaborations_beat_id_fkey"
      columns: ["beat_id"]
isOneToOne: false
      referencedRelation: "beat_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "beat_collaborations_beat_id_fkey"
      columns: ["beat_id"]
isOneToOne: false
      referencedRelation: "beats"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "beat_collaborations_collaborator_id_fkey"
      columns: ["collaborator_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "beat_collaborations_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"beat_daily_stats": {
                  Row: {
                    "beat_id": string,"day": string,"plays": number,"sales": number
                  }
                  ComputedFields: never
                  Insert: {
                    "beat_id": string,"day": string,"plays"?: number,"sales"?: number
                  }
                  Update: {
                    "beat_id"?: string,"day"?: string,"plays"?: number,"sales"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "beat_daily_stats_beat_id_fkey"
      columns: ["beat_id"]
isOneToOne: false
      referencedRelation: "beat_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "beat_daily_stats_beat_id_fkey"
      columns: ["beat_id"]
isOneToOne: false
      referencedRelation: "beats"
      referencedColumns: ["id"]
    }
                  ]
                },"beat_licenses": {
                  Row: {
                    "allow_for_profit": boolean,"allow_live_performances": boolean,"beat_id": string,"created_at": string,"distribution_limit": number | null,"enabled": boolean,"id": string,"includes_mp3": boolean,"includes_stems": boolean,"includes_wav": boolean,"music_videos": number | null,"name": string,"price_eur": number,"price_pln": number,"price_usd": number,"radio_stations": number | null,"sort_order": number,"streams_limit": number | null,"terms": string | null,"type": Database["public"]['Enums']["license_type"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "allow_for_profit"?: boolean,"allow_live_performances"?: boolean,"beat_id": string,"created_at"?: string,"distribution_limit"?: number | null,"enabled"?: boolean,"id"?: string,"includes_mp3"?: boolean,"includes_stems"?: boolean,"includes_wav"?: boolean,"music_videos"?: number | null,"name": string,"price_eur": number,"price_pln": number,"price_usd": number,"radio_stations"?: number | null,"sort_order"?: number,"streams_limit"?: number | null,"terms"?: string | null,"type": Database["public"]['Enums']["license_type"],"updated_at"?: string
                  }
                  Update: {
                    "allow_for_profit"?: boolean,"allow_live_performances"?: boolean,"beat_id"?: string,"created_at"?: string,"distribution_limit"?: number | null,"enabled"?: boolean,"id"?: string,"includes_mp3"?: boolean,"includes_stems"?: boolean,"includes_wav"?: boolean,"music_videos"?: number | null,"name"?: string,"price_eur"?: number,"price_pln"?: number,"price_usd"?: number,"radio_stations"?: number | null,"sort_order"?: number,"streams_limit"?: number | null,"terms"?: string | null,"type"?: Database["public"]['Enums']["license_type"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "beat_licenses_beat_id_fkey"
      columns: ["beat_id"]
isOneToOne: false
      referencedRelation: "beat_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "beat_licenses_beat_id_fkey"
      columns: ["beat_id"]
isOneToOne: false
      referencedRelation: "beats"
      referencedColumns: ["id"]
    }
                  ]
                },"beat_pack_items": {
                  Row: {
                    "beat_id": string,"pack_id": string,"position": number
                  }
                  ComputedFields: never
                  Insert: {
                    "beat_id": string,"pack_id": string,"position"?: number
                  }
                  Update: {
                    "beat_id"?: string,"pack_id"?: string,"position"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "beat_pack_items_beat_id_fkey"
      columns: ["beat_id"]
isOneToOne: false
      referencedRelation: "beat_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "beat_pack_items_beat_id_fkey"
      columns: ["beat_id"]
isOneToOne: false
      referencedRelation: "beats"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "beat_pack_items_pack_id_fkey"
      columns: ["pack_id"]
isOneToOne: false
      referencedRelation: "beat_packs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "beat_pack_items_pack_id_fkey"
      columns: ["pack_id"]
isOneToOne: false
      referencedRelation: "live_pack_beats"
      referencedColumns: ["pack_id"]
    },{
      foreignKeyName: "beat_pack_items_pack_id_fkey"
      columns: ["pack_id"]
isOneToOne: false
      referencedRelation: "pack_cards"
      referencedColumns: ["id"]
    }
                  ]
                },"beat_pack_licenses": {
                  Row: {
                    "allow_for_profit": boolean,"allow_live_performances": boolean,"created_at": string,"distribution_limit": number | null,"enabled": boolean,"id": string,"includes_mp3": boolean,"includes_stems": boolean,"includes_wav": boolean,"music_videos": number | null,"name": string,"pack_id": string,"price_eur": number,"price_pln": number,"price_usd": number,"radio_stations": number | null,"sort_order": number,"streams_limit": number | null,"terms": string | null,"type": Database["public"]['Enums']["license_type"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "allow_for_profit"?: boolean,"allow_live_performances"?: boolean,"created_at"?: string,"distribution_limit"?: number | null,"enabled"?: boolean,"id"?: string,"includes_mp3"?: boolean,"includes_stems"?: boolean,"includes_wav"?: boolean,"music_videos"?: number | null,"name": string,"pack_id": string,"price_eur": number,"price_pln": number,"price_usd": number,"radio_stations"?: number | null,"sort_order"?: number,"streams_limit"?: number | null,"terms"?: string | null,"type": Database["public"]['Enums']["license_type"],"updated_at"?: string
                  }
                  Update: {
                    "allow_for_profit"?: boolean,"allow_live_performances"?: boolean,"created_at"?: string,"distribution_limit"?: number | null,"enabled"?: boolean,"id"?: string,"includes_mp3"?: boolean,"includes_stems"?: boolean,"includes_wav"?: boolean,"music_videos"?: number | null,"name"?: string,"pack_id"?: string,"price_eur"?: number,"price_pln"?: number,"price_usd"?: number,"radio_stations"?: number | null,"sort_order"?: number,"streams_limit"?: number | null,"terms"?: string | null,"type"?: Database["public"]['Enums']["license_type"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "beat_pack_licenses_pack_id_fkey"
      columns: ["pack_id"]
isOneToOne: false
      referencedRelation: "beat_packs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "beat_pack_licenses_pack_id_fkey"
      columns: ["pack_id"]
isOneToOne: false
      referencedRelation: "live_pack_beats"
      referencedColumns: ["pack_id"]
    },{
      foreignKeyName: "beat_pack_licenses_pack_id_fkey"
      columns: ["pack_id"]
isOneToOne: false
      referencedRelation: "pack_cards"
      referencedColumns: ["id"]
    }
                  ]
                },"beat_packs": {
                  Row: {
                    "approved_at": string | null,"cover_path": string | null,"created_at": string,"description": string | null,"id": string,"is_featured": boolean,"producer_id": string,"published_at": string | null,"rejection_reason": string | null,"sales_count": number,"slug": string,"status": Database["public"]['Enums']["beat_status"],"submitted_at": string | null,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_at"?: string | null,"cover_path"?: string | null,"created_at"?: string,"description"?: string | null,"id"?: string,"is_featured"?: boolean,"producer_id": string,"published_at"?: string | null,"rejection_reason"?: string | null,"sales_count"?: number,"slug": string,"status"?: Database["public"]['Enums']["beat_status"],"submitted_at"?: string | null,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "approved_at"?: string | null,"cover_path"?: string | null,"created_at"?: string,"description"?: string | null,"id"?: string,"is_featured"?: boolean,"producer_id"?: string,"published_at"?: string | null,"rejection_reason"?: string | null,"sales_count"?: number,"slug"?: string,"status"?: Database["public"]['Enums']["beat_status"],"submitted_at"?: string | null,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "beat_packs_producer_id_fkey"
      columns: ["producer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"beats": {
                  Row: {
                    "admin_locked": boolean,"approved_at": string | null,"bpm": number | null,"cover_path": string | null,"created_at": string,"description": string | null,"duration_seconds": number | null,"exclusive_buyer_id": string | null,"exclusive_sold_at": string | null,"favorites_count": number,"featured_at": string | null,"genre": string | null,"has_exclusive": boolean,"has_free": boolean,"id": string,"is_featured": boolean,"key_group": number | null,"key_mode": string,"key_note": number,"min_price_eur": number | null,"min_price_pln": number | null,"min_price_usd": number | null,"moods": (string)[],"mp3_path": string | null,"plays_count": number,"preview_path": string | null,"producer_id": string,"published_at": string | null,"rating_avg": number | null,"rating_count": number,"rejection_reason": string | null,"sales_count": number,"search_vector": unknown,"slug": string,"status": Database["public"]['Enums']["beat_status"],"stems_path": string | null,"submitted_at": string | null,"tags": (string)[],"title": string,"updated_at": string,"wav_path": string | null,"waveform": Json | null
                  }
                  ComputedFields: never
                  Insert: {
                    "admin_locked"?: boolean,"approved_at"?: string | null,"bpm"?: number | null,"cover_path"?: string | null,"created_at"?: string,"description"?: string | null,"duration_seconds"?: number | null,"exclusive_buyer_id"?: string | null,"exclusive_sold_at"?: string | null,"favorites_count"?: number,"featured_at"?: string | null,"genre"?: string | null,"has_exclusive"?: boolean,"has_free"?: boolean,"id"?: string,"is_featured"?: boolean,"key_group"?: never,"key_mode": string,"key_note": number,"min_price_eur"?: number | null,"min_price_pln"?: number | null,"min_price_usd"?: number | null,"moods"?: (string)[],"mp3_path"?: string | null,"plays_count"?: number,"preview_path"?: string | null,"producer_id": string,"published_at"?: string | null,"rating_avg"?: number | null,"rating_count"?: number,"rejection_reason"?: string | null,"sales_count"?: number,"search_vector"?: never,"slug": string,"status"?: Database["public"]['Enums']["beat_status"],"stems_path"?: string | null,"submitted_at"?: string | null,"tags"?: (string)[],"title": string,"updated_at"?: string,"wav_path"?: string | null,"waveform"?: Json | null
                  }
                  Update: {
                    "admin_locked"?: boolean,"approved_at"?: string | null,"bpm"?: number | null,"cover_path"?: string | null,"created_at"?: string,"description"?: string | null,"duration_seconds"?: number | null,"exclusive_buyer_id"?: string | null,"exclusive_sold_at"?: string | null,"favorites_count"?: number,"featured_at"?: string | null,"genre"?: string | null,"has_exclusive"?: boolean,"has_free"?: boolean,"id"?: string,"is_featured"?: boolean,"key_group"?: never,"key_mode"?: string,"key_note"?: number,"min_price_eur"?: number | null,"min_price_pln"?: number | null,"min_price_usd"?: number | null,"moods"?: (string)[],"mp3_path"?: string | null,"plays_count"?: number,"preview_path"?: string | null,"producer_id"?: string,"published_at"?: string | null,"rating_avg"?: number | null,"rating_count"?: number,"rejection_reason"?: string | null,"sales_count"?: number,"search_vector"?: never,"slug"?: string,"status"?: Database["public"]['Enums']["beat_status"],"stems_path"?: string | null,"submitted_at"?: string | null,"tags"?: (string)[],"title"?: string,"updated_at"?: string,"wav_path"?: string | null,"waveform"?: Json | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "beats_exclusive_buyer_id_fkey"
      columns: ["exclusive_buyer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "beats_genre_fkey"
      columns: ["genre"]
isOneToOne: false
      referencedRelation: "genres"
      referencedColumns: ["slug"]
    },{
      foreignKeyName: "beats_producer_id_fkey"
      columns: ["producer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"conversation_members": {
                  Row: {
                    "added_by": string | null,"cleared_at": string,"conversation_id": string,"delivered_at": string | null,"joined_at": string,"last_read_at": string | null,"pinned_at": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "added_by"?: string | null,"cleared_at"?: string,"conversation_id": string,"delivered_at"?: string | null,"joined_at"?: string,"last_read_at"?: string | null,"pinned_at"?: string | null,"user_id": string
                  }
                  Update: {
                    "added_by"?: string | null,"cleared_at"?: string,"conversation_id"?: string,"delivered_at"?: string | null,"joined_at"?: string,"last_read_at"?: string | null,"pinned_at"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "conversation_members_added_by_fkey"
      columns: ["added_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conversation_members_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conversation_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"conversation_receipts": {
                  Row: {
                    "conversation_id": string,"delivered_at": string | null,"read_at": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "conversation_id": string,"delivered_at"?: string | null,"read_at"?: string | null,"user_id": string
                  }
                  Update: {
                    "conversation_id"?: string,"delivered_at"?: string | null,"read_at"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "conversation_receipts_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conversation_receipts_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"conversations": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"is_group": boolean,"last_message_at": string | null,"last_sender_id": string | null,"photo_path": string | null,"title": string | null,"user_a": string | null,"user_b": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"is_group"?: boolean,"last_message_at"?: string | null,"last_sender_id"?: string | null,"photo_path"?: string | null,"title"?: string | null,"user_a"?: string | null,"user_b"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"is_group"?: boolean,"last_message_at"?: string | null,"last_sender_id"?: string | null,"photo_path"?: string | null,"title"?: string | null,"user_a"?: string | null,"user_b"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "conversations_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conversations_user_a_fkey"
      columns: ["user_a"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conversations_user_b_fkey"
      columns: ["user_b"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"favorites": {
                  Row: {
                    "beat_id": string,"created_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "beat_id": string,"created_at"?: string,"user_id": string
                  }
                  Update: {
                    "beat_id"?: string,"created_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "favorites_beat_id_fkey"
      columns: ["beat_id"]
isOneToOne: false
      referencedRelation: "beat_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "favorites_beat_id_fkey"
      columns: ["beat_id"]
isOneToOne: false
      referencedRelation: "beats"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "favorites_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"follows": {
                  Row: {
                    "created_at": string,"followee_id": string,"follower_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"followee_id": string,"follower_id": string
                  }
                  Update: {
                    "created_at"?: string,"followee_id"?: string,"follower_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "follows_followee_id_fkey"
      columns: ["followee_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "follows_follower_id_fkey"
      columns: ["follower_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"genres": {
                  Row: {
                    "created_at": string,"name": string,"slug": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"name": string,"slug": string,"sort_order"?: number
                  }
                  Update: {
                    "created_at"?: string,"name"?: string,"slug"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    
                  ]
                },"message_reactions": {
                  Row: {
                    "emoji": string | null,"message_id": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "emoji"?: string | null,"message_id": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "emoji"?: string | null,"message_id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "message_reactions_message_id_fkey"
      columns: ["message_id"]
isOneToOne: false
      referencedRelation: "messages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "message_reactions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"messages": {
                  Row: {
                    "attachments": NonNullable<Json>,"beat_id": string | null,"body": string,"conversation_id": string,"created_at": string,"event": Json | null,"id": string,"kind": string,"pinned_at": string | null,"pinned_by": string | null,"sender_id": string,"message_preview_text": string | null
                  }
                  ComputedFields: "message_preview_text"
                  Insert: {
                    "attachments"?: NonNullable<Json>,"beat_id"?: string | null,"body": string,"conversation_id": string,"created_at"?: string,"event"?: Json | null,"id"?: string,"kind"?: string,"pinned_at"?: string | null,"pinned_by"?: string | null,"sender_id": string
                  }
                  Update: {
                    "attachments"?: NonNullable<Json>,"beat_id"?: string | null,"body"?: string,"conversation_id"?: string,"created_at"?: string,"event"?: Json | null,"id"?: string,"kind"?: string,"pinned_at"?: string | null,"pinned_by"?: string | null,"sender_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "messages_beat_id_fkey"
      columns: ["beat_id"]
isOneToOne: false
      referencedRelation: "beat_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "messages_beat_id_fkey"
      columns: ["beat_id"]
isOneToOne: false
      referencedRelation: "beats"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "messages_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "messages_pinned_by_fkey"
      columns: ["pinned_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "messages_sender_id_fkey"
      columns: ["sender_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "actor_id": string | null,"beat_id": string | null,"created_at": string,"data": NonNullable<Json>,"id": string,"order_item_id": string | null,"pack_id": string | null,"read_at": string | null,"type": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"beat_id"?: string | null,"created_at"?: string,"data"?: NonNullable<Json>,"id"?: string,"order_item_id"?: string | null,"pack_id"?: string | null,"read_at"?: string | null,"type": string,"user_id": string
                  }
                  Update: {
                    "actor_id"?: string | null,"beat_id"?: string | null,"created_at"?: string,"data"?: NonNullable<Json>,"id"?: string,"order_item_id"?: string | null,"pack_id"?: string | null,"read_at"?: string | null,"type"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_beat_id_fkey"
      columns: ["beat_id"]
isOneToOne: false
      referencedRelation: "beat_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_beat_id_fkey"
      columns: ["beat_id"]
isOneToOne: false
      referencedRelation: "beats"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_order_item_id_fkey"
      columns: ["order_item_id"]
isOneToOne: false
      referencedRelation: "order_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_pack_id_fkey"
      columns: ["pack_id"]
isOneToOne: false
      referencedRelation: "beat_packs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_pack_id_fkey"
      columns: ["pack_id"]
isOneToOne: false
      referencedRelation: "live_pack_beats"
      referencedColumns: ["pack_id"]
    },{
      foreignKeyName: "notifications_pack_id_fkey"
      columns: ["pack_id"]
isOneToOne: false
      referencedRelation: "pack_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"order_items": {
                  Row: {
                    "beat_id": string | null,"beat_title": string,"buyer_id": string | null,"created_at": string,"currency": Database["public"]['Enums']["currency_code"],"id": string,"license_id": string | null,"license_name": string,"license_snapshot": NonNullable<Json>,"license_type": Database["public"]['Enums']["license_type"],"order_id": string,"pack_id": string | null,"pack_license_id": string | null,"platform_fee": number,"price": number,"producer_name": string,"seller_amount": number,"seller_id": string | null,"service_fee": number
                  }
                  ComputedFields: never
                  Insert: {
                    "beat_id"?: string | null,"beat_title": string,"buyer_id"?: string | null,"created_at"?: string,"currency": Database["public"]['Enums']["currency_code"],"id"?: string,"license_id"?: string | null,"license_name": string,"license_snapshot"?: NonNullable<Json>,"license_type": Database["public"]['Enums']["license_type"],"order_id": string,"pack_id"?: string | null,"pack_license_id"?: string | null,"platform_fee"?: number,"price": number,"producer_name": string,"seller_amount"?: number,"seller_id"?: string | null,"service_fee"?: number
                  }
                  Update: {
                    "beat_id"?: string | null,"beat_title"?: string,"buyer_id"?: string | null,"created_at"?: string,"currency"?: Database["public"]['Enums']["currency_code"],"id"?: string,"license_id"?: string | null,"license_name"?: string,"license_snapshot"?: NonNullable<Json>,"license_type"?: Database["public"]['Enums']["license_type"],"order_id"?: string,"pack_id"?: string | null,"pack_license_id"?: string | null,"platform_fee"?: number,"price"?: number,"producer_name"?: string,"seller_amount"?: number,"seller_id"?: string | null,"service_fee"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_items_beat_id_fkey"
      columns: ["beat_id"]
isOneToOne: false
      referencedRelation: "beat_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_beat_id_fkey"
      columns: ["beat_id"]
isOneToOne: false
      referencedRelation: "beats"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_buyer_id_fkey"
      columns: ["buyer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_license_id_fkey"
      columns: ["license_id"]
isOneToOne: false
      referencedRelation: "beat_licenses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_pack_id_fkey"
      columns: ["pack_id"]
isOneToOne: false
      referencedRelation: "beat_packs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_pack_id_fkey"
      columns: ["pack_id"]
isOneToOne: false
      referencedRelation: "live_pack_beats"
      referencedColumns: ["pack_id"]
    },{
      foreignKeyName: "order_items_pack_id_fkey"
      columns: ["pack_id"]
isOneToOne: false
      referencedRelation: "pack_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_pack_license_id_fkey"
      columns: ["pack_license_id"]
isOneToOne: false
      referencedRelation: "beat_pack_licenses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_seller_id_fkey"
      columns: ["seller_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"orders": {
                  Row: {
                    "buyer_email": string,"buyer_id": string | null,"confirmation_sent_at": string | null,"created_at": string,"currency": Database["public"]['Enums']["currency_code"],"id": string,"order_number": number,"paid_at": string | null,"refunded_amount": number,"service_fee": number,"status": Database["public"]['Enums']["order_status"],"stripe_charge_id": string | null,"stripe_checkout_session_id": string | null,"stripe_payment_intent_id": string | null,"subtotal": number,"total": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "buyer_email": string,"buyer_id"?: string | null,"confirmation_sent_at"?: string | null,"created_at"?: string,"currency": Database["public"]['Enums']["currency_code"],"id"?: string,"order_number"?: never,"paid_at"?: string | null,"refunded_amount"?: number,"service_fee"?: number,"status"?: Database["public"]['Enums']["order_status"],"stripe_charge_id"?: string | null,"stripe_checkout_session_id"?: string | null,"stripe_payment_intent_id"?: string | null,"subtotal"?: number,"total"?: number,"updated_at"?: string
                  }
                  Update: {
                    "buyer_email"?: string,"buyer_id"?: string | null,"confirmation_sent_at"?: string | null,"created_at"?: string,"currency"?: Database["public"]['Enums']["currency_code"],"id"?: string,"order_number"?: never,"paid_at"?: string | null,"refunded_amount"?: number,"service_fee"?: number,"status"?: Database["public"]['Enums']["order_status"],"stripe_charge_id"?: string | null,"stripe_checkout_session_id"?: string | null,"stripe_payment_intent_id"?: string | null,"subtotal"?: number,"total"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "orders_buyer_id_fkey"
      columns: ["buyer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"platform_settings": {
                  Row: {
                    "buyer_fee_percent": number,"eur_to_pln": number,"eur_to_usd": number,"id": boolean,"platform_fee_percent": number,"require_beat_approval": boolean,"seller_signups_open": boolean,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "buyer_fee_percent"?: number,"eur_to_pln"?: number,"eur_to_usd"?: number,"id"?: boolean,"platform_fee_percent"?: number,"require_beat_approval"?: boolean,"seller_signups_open"?: boolean,"updated_at"?: string
                  }
                  Update: {
                    "buyer_fee_percent"?: number,"eur_to_pln"?: number,"eur_to_usd"?: number,"id"?: boolean,"platform_fee_percent"?: number,"require_beat_approval"?: boolean,"seller_signups_open"?: boolean,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"plugin_downloads": {
                  Row: {
                    "created_at": string,"download_number": number,"email": string | null,"id": string,"platform": string,"plugin": string,"user_id": string,"version": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"download_number"?: never,"email"?: string | null,"id"?: string,"platform": string,"plugin": string,"user_id": string,"version"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"download_number"?: never,"email"?: string | null,"id"?: string,"platform"?: string,"plugin"?: string,"user_id"?: string,"version"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "plugin_downloads_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "avatar_path": string | null,"banner_path": string | null,"bio": string | null,"created_at": string,"display_name": string | null,"id": string,"is_featured": boolean,"is_verified": boolean,"license_defaults": Json | null,"location": string | null,"producer_name": string | null,"role": Database["public"]['Enums']["user_role"],"seller_since": string | null,"social_links": NonNullable<Json>,"updated_at": string,"username": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_path"?: string | null,"banner_path"?: string | null,"bio"?: string | null,"created_at"?: string,"display_name"?: string | null,"id": string,"is_featured"?: boolean,"is_verified"?: boolean,"license_defaults"?: Json | null,"location"?: string | null,"producer_name"?: string | null,"role"?: Database["public"]['Enums']["user_role"],"seller_since"?: string | null,"social_links"?: NonNullable<Json>,"updated_at"?: string,"username": string
                  }
                  Update: {
                    "avatar_path"?: string | null,"banner_path"?: string | null,"bio"?: string | null,"created_at"?: string,"display_name"?: string | null,"id"?: string,"is_featured"?: boolean,"is_verified"?: boolean,"license_defaults"?: Json | null,"location"?: string | null,"producer_name"?: string | null,"role"?: Database["public"]['Enums']["user_role"],"seller_since"?: string | null,"social_links"?: NonNullable<Json>,"updated_at"?: string,"username"?: string
                  }
                  Relationships: [
                    
                  ]
                },"purchases": {
                  Row: {
                    "beat_id": string,"buyer_id": string,"created_at": string,"id": string,"includes_mp3": boolean,"includes_stems": boolean,"includes_wav": boolean,"license_id": string | null,"license_number": string,"license_snapshot": NonNullable<Json>,"license_type": Database["public"]['Enums']["license_type"],"order_id": string,"order_item_id": string,"revoked_at": string | null,"seller_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "beat_id": string,"buyer_id": string,"created_at"?: string,"id"?: string,"includes_mp3"?: boolean,"includes_stems"?: boolean,"includes_wav"?: boolean,"license_id"?: string | null,"license_number": string,"license_snapshot"?: NonNullable<Json>,"license_type": Database["public"]['Enums']["license_type"],"order_id": string,"order_item_id": string,"revoked_at"?: string | null,"seller_id"?: string | null
                  }
                  Update: {
                    "beat_id"?: string,"buyer_id"?: string,"created_at"?: string,"id"?: string,"includes_mp3"?: boolean,"includes_stems"?: boolean,"includes_wav"?: boolean,"license_id"?: string | null,"license_number"?: string,"license_snapshot"?: NonNullable<Json>,"license_type"?: Database["public"]['Enums']["license_type"],"order_id"?: string,"order_item_id"?: string,"revoked_at"?: string | null,"seller_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "purchases_beat_id_fkey"
      columns: ["beat_id"]
isOneToOne: false
      referencedRelation: "beat_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchases_beat_id_fkey"
      columns: ["beat_id"]
isOneToOne: false
      referencedRelation: "beats"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchases_buyer_id_fkey"
      columns: ["buyer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchases_license_id_fkey"
      columns: ["license_id"]
isOneToOne: false
      referencedRelation: "beat_licenses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchases_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchases_order_item_id_fkey"
      columns: ["order_item_id"]
isOneToOne: false
      referencedRelation: "order_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchases_seller_id_fkey"
      columns: ["seller_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"reviews": {
                  Row: {
                    "beat_id": string,"comment": string | null,"created_at": string,"id": string,"rating": number,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "beat_id": string,"comment"?: string | null,"created_at"?: string,"id"?: string,"rating": number,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "beat_id"?: string,"comment"?: string | null,"created_at"?: string,"id"?: string,"rating"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reviews_beat_id_fkey"
      columns: ["beat_id"]
isOneToOne: false
      referencedRelation: "beat_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reviews_beat_id_fkey"
      columns: ["beat_id"]
isOneToOne: false
      referencedRelation: "beats"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reviews_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"seller_accounts": {
                  Row: {
                    "charges_enabled": boolean,"country": string | null,"created_at": string,"details_submitted": boolean,"payouts_enabled": boolean,"stripe_account_id": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "charges_enabled"?: boolean,"country"?: string | null,"created_at"?: string,"details_submitted"?: boolean,"payouts_enabled"?: boolean,"stripe_account_id": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "charges_enabled"?: boolean,"country"?: string | null,"created_at"?: string,"details_submitted"?: boolean,"payouts_enabled"?: boolean,"stripe_account_id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "seller_accounts_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"seller_earnings": {
                  Row: {
                    "beat_id": string | null,"collab_of": string | null,"created_at": string,"currency": Database["public"]['Enums']["currency_code"],"gross": number,"id": string,"net": number,"order_id": string,"order_item_id": string,"paid_at": string | null,"platform_fee": number,"seller_id": string,"status": Database["public"]['Enums']["earning_status"],"stripe_transfer_id": string | null,"transfer_amount": number | null,"transfer_currency": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "beat_id"?: string | null,"collab_of"?: string | null,"created_at"?: string,"currency": Database["public"]['Enums']["currency_code"],"gross": number,"id"?: string,"net": number,"order_id": string,"order_item_id": string,"paid_at"?: string | null,"platform_fee": number,"seller_id": string,"status"?: Database["public"]['Enums']["earning_status"],"stripe_transfer_id"?: string | null,"transfer_amount"?: number | null,"transfer_currency"?: string | null
                  }
                  Update: {
                    "beat_id"?: string | null,"collab_of"?: string | null,"created_at"?: string,"currency"?: Database["public"]['Enums']["currency_code"],"gross"?: number,"id"?: string,"net"?: number,"order_id"?: string,"order_item_id"?: string,"paid_at"?: string | null,"platform_fee"?: number,"seller_id"?: string,"status"?: Database["public"]['Enums']["earning_status"],"stripe_transfer_id"?: string | null,"transfer_amount"?: number | null,"transfer_currency"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "seller_earnings_beat_id_fkey"
      columns: ["beat_id"]
isOneToOne: false
      referencedRelation: "beat_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "seller_earnings_beat_id_fkey"
      columns: ["beat_id"]
isOneToOne: false
      referencedRelation: "beats"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "seller_earnings_collab_of_fkey"
      columns: ["collab_of"]
isOneToOne: false
      referencedRelation: "seller_earnings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "seller_earnings_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "seller_earnings_order_item_id_fkey"
      columns: ["order_item_id"]
isOneToOne: false
      referencedRelation: "order_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "seller_earnings_seller_id_fkey"
      columns: ["seller_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"user_blocks": {
                  Row: {
                    "blocked_id": string,"blocker_id": string,"created_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "blocked_id": string,"blocker_id": string,"created_at"?: string
                  }
                  Update: {
                    "blocked_id"?: string,"blocker_id"?: string,"created_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_blocks_blocked_id_fkey"
      columns: ["blocked_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_blocks_blocker_id_fkey"
      columns: ["blocker_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "beat_cards": {
                  Row: {
                    "bpm": number | null,"collaborator_avatar_path": string | null,"collaborator_id": string | null,"collaborator_name": string | null,"collaborator_username": string | null,"collaborator_verified": boolean | null,"cover_path": string | null,"created_at": string,"duration_seconds": number | null,"exclusive_sold_at": string | null,"favorites_count": number,"featured_at": string | null,"genre": string | null,"genre_name": string | null,"has_exclusive": boolean,"has_free": boolean,"id": string,"is_featured": boolean,"key_group": number | null,"key_mode": string,"key_note": number,"min_price_eur": number | null,"min_price_pln": number | null,"min_price_usd": number | null,"moods": (string)[],"plays_count": number,"preview_path": string | null,"producer_avatar_path": string | null,"producer_id": string,"producer_name": string | null,"producer_username": string,"producer_verified": boolean,"published_at": string | null,"rating_avg": number | null,"rating_count": number,"sales_count": number,"search_vector": unknown,"slug": string,"status": Database["public"]['Enums']["beat_status"],"tags": (string)[],"title": string,"waveform": Json | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "beat_collaborations_collaborator_id_fkey"
      columns: ["collaborator_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "beats_genre_fkey"
      columns: ["genre"]
isOneToOne: false
      referencedRelation: "genres"
      referencedColumns: ["slug"]
    },{
      foreignKeyName: "beats_producer_id_fkey"
      columns: ["producer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"live_pack_beats": {
                  Row: {
                    "beat_id": string,"pack_id": string,"pack_slug": string,"pack_title": string,"producer_id": string,"published_at": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "beat_pack_items_beat_id_fkey"
      columns: ["beat_id"]
isOneToOne: false
      referencedRelation: "beat_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "beat_pack_items_beat_id_fkey"
      columns: ["beat_id"]
isOneToOne: false
      referencedRelation: "beats"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "beat_packs_producer_id_fkey"
      columns: ["producer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"pack_cards": {
                  Row: {
                    "available": boolean | null,"available_count": number | null,"beats_count": number | null,"cover_path": string | null,"created_at": string,"description": string | null,"genres": (string)[] | null,"id": string,"is_featured": boolean,"min_price_eur": number | null,"min_price_pln": number | null,"min_price_usd": number | null,"producer_avatar_path": string | null,"producer_id": string,"producer_name": string | null,"producer_username": string,"producer_verified": boolean,"published_at": string | null,"rejection_reason": string | null,"sales_count": number,"slug": string,"status": Database["public"]['Enums']["beat_status"],"title": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "beat_packs_producer_id_fkey"
      columns: ["producer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "add_group_members":
{ Args: { "p_conversation": string,"p_members": (string)[] }; Returns: number
                           },
"admin_dashboard":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"admin_list_users":
{ Args: { "p_limit"?: number,"p_offset"?: number,"p_query"?: string,"p_role"?: Database["public"]['Enums']["user_role"] }; Returns: Json
                           },
"apply_order_refund":
{ Args: { "p_order_id": string,"p_refunded_amount": number }; Returns: Json
                           },
"assert_beat_publishable":
{ Args: { "p_beat_id": string }; Returns: undefined
                           },
"assert_message_rate":
{ Args: { "p_user": string }; Returns: undefined
                           },
"assert_pack_publishable":
{ Args: { "p_pack_id": string }; Returns: undefined
                           },
"beat_likes":
{ Args: { "p_beat"?: string,"p_before"?: string,"p_limit"?: number }; Returns: {
              "avatar_path": string,"beat_id": string,"beat_title": string,"is_verified": boolean,"liked_at": string,"name": string,"user_id": string,"username": string
            }[]
                           },
"beat_path_ok":
{ Args: { "p_path": string,"p_producer": string }; Returns: boolean
                           },
"beat_producers":
{ Args: { "p_beat": string }; Returns: string[]
                           },
"become_seller":
{ Args: { "p_producer_name": string }; Returns: {
              "avatar_path": string | null,
"banner_path": string | null,
"bio": string | null,
"created_at": string,
"display_name": string | null,
"id": string,
"is_featured": boolean,
"is_verified": boolean,
"license_defaults": Json | null,
"location": string | null,
"producer_name": string | null,
"role": Database["public"]['Enums']["user_role"],
"seller_since": string | null,
"social_links": NonNullable<Json>,
"updated_at": string,
"username": string
            }
                          SetofOptions: {
        from: "*"
        to: "profiles"
        isOneToOne: true
        isSetofReturn: false
      } },
"blocked_between":
{ Args: { "p_a": string,"p_b": string }; Returns: boolean
                           },
"can_follow":
{ Args: { "p_followee": string }; Returns: boolean
                           },
"can_use_typing_channel":
{ Args: { "p_topic": string }; Returns: boolean
                           },
"clean_message_body":
{ Args: { "p_body": string }; Returns: string
                           },
"create_group":
{ Args: { "p_members": (string)[],"p_photo_path"?: string,"p_title": string }; Returns: string
                           },
"create_pending_order":
{ Args: { "p_buyer_email": string,"p_buyer_id": string,"p_currency": Database["public"]['Enums']["currency_code"],"p_license_ids": (string)[],"p_pack_license_ids"?: (string)[] }; Returns: Json
                           },
"delete_conversation":
{ Args: { "p_conversation": string }; Returns: undefined
                           },
"display_name_of":
{ Args: { "p_user": string }; Returns: string
                           },
"end_collaboration":
{ Args: { "p_id": string }; Returns: Json
                           },
"escape_like":
{ Args: { "value": string }; Returns: string
                           },
"following_beats":
{ Args: { "p_limit"?: number }; Returns: Json
                           },
"fulfill_order":
{ Args: { "p_charge_id"?: string,"p_order_id": string,"p_payment_intent"?: string,"p_session_id"?: string }; Returns: Json
                           },
"get_conversation":
{ Args: { "p_conversation": string }; Returns: Json
                           },
"get_genre_stats":
{ Args: Record<PropertyKey, never>; Returns: {
              "beats_count": number,"cover_path": string,"name": string,"slug": string,"sort_order": number
            }[]
                           },
"get_marketplace_stats":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_producer_stats":
{ Args: { "p_producer_id": string }; Returns: Json
                           },
"get_producers":
{ Args: { "p_limit"?: number,"p_offset"?: number,"p_query"?: string }; Returns: Json
                           },
"immutable_array_to_string":
{ Args: { "arr": (string)[],"sep": string }; Returns: string
                           },
"invite_collaborator":
{ Args: { "p_beat_id": string,"p_share_percent"?: number,"p_username": string }; Returns: Json
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_seller":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_trusted_context":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_username_available":
{ Args: { "p_username": string }; Returns: boolean
                           },
"list_conversations":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"list_notifications":
{ Args: { "p_before"?: string,"p_limit"?: number }; Returns: Json
                           },
"mark_conversation_read":
{ Args: { "p_conversation": string }; Returns: undefined
                           },
"mark_messages_delivered":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"mark_notifications_read":
{ Args: { "p_ids"?: (string)[] }; Returns: number
                           },
"mark_order_failed":
{ Args: { "p_order_id": string,"p_status": Database["public"]['Enums']["order_status"] }; Returns: undefined
                           },
"message_preview_text":
{ Args: { "p_message": Omit<Database["public"]['Tables']["messages"]['Row'], Database["public"]['Tables']["messages"]['ComputedFields']> }; Returns: string
                           },
"mfa_satisfied":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"my_collaborations":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"pin_conversation":
{ Args: { "p_conversation": string,"p_pinned": boolean }; Returns: boolean
                           },
"pin_message":
{ Args: { "p_message": string,"p_pinned": boolean }; Returns: boolean
                           },
"plugin_download_stats":
{ Args: Record<PropertyKey, never>; Returns: {
              "downloads": number,"people": number,"plugin": string
            }[]
                           },
"post_conversation_event":
{ Args: { "p_actor": string,"p_conversation": string,"p_event": Json }; Returns: undefined
                           },
"prefix_tsquery":
{ Args: { "q": string }; Returns: unknown
                           },
"react_to_message":
{ Args: { "p_emoji": string,"p_message": string }; Returns: string
                           },
"record_play":
{ Args: { "p_beat_id": string }; Returns: undefined
                           },
"refresh_beat_price_summary":
{ Args: { "p_beat_id": string }; Returns: undefined
                           },
"remove_group_member":
{ Args: { "p_conversation": string,"p_user": string }; Returns: undefined
                           },
"respond_to_collaboration":
{ Args: { "p_accept": boolean,"p_id": string }; Returns: Json
                           },
"save_beat":
{ Args: { "p_beat": Json,"p_licenses": Json,"p_save_defaults"?: boolean,"p_status"?: Database["public"]['Enums']["beat_status"] }; Returns: {
              "admin_locked": boolean,
"approved_at": string | null,
"bpm": number | null,
"cover_path": string | null,
"created_at": string,
"description": string | null,
"duration_seconds": number | null,
"exclusive_buyer_id": string | null,
"exclusive_sold_at": string | null,
"favorites_count": number,
"featured_at": string | null,
"genre": string | null,
"has_exclusive": boolean,
"has_free": boolean,
"id": string,
"is_featured": boolean,
"key_group": number | null,
"key_mode": string,
"key_note": number,
"min_price_eur": number | null,
"min_price_pln": number | null,
"min_price_usd": number | null,
"moods": (string)[],
"mp3_path": string | null,
"plays_count": number,
"preview_path": string | null,
"producer_id": string,
"published_at": string | null,
"rating_avg": number | null,
"rating_count": number,
"rejection_reason": string | null,
"sales_count": number,
"search_vector": unknown,
"slug": string,
"status": Database["public"]['Enums']["beat_status"],
"stems_path": string | null,
"submitted_at": string | null,
"tags": (string)[],
"title": string,
"updated_at": string,
"wav_path": string | null,
"waveform": Json | null
            }
                          SetofOptions: {
        from: "*"
        to: "beats"
        isOneToOne: true
        isSetofReturn: false
      } },
"save_pack":
{ Args: { "p_apply_cover"?: boolean,"p_beat_ids": (string)[],"p_licenses": Json,"p_pack": Json,"p_status"?: Database["public"]['Enums']["beat_status"] }; Returns: {
              "approved_at": string | null,
"cover_path": string | null,
"created_at": string,
"description": string | null,
"id": string,
"is_featured": boolean,
"producer_id": string,
"published_at": string | null,
"rejection_reason": string | null,
"sales_count": number,
"slug": string,
"status": Database["public"]['Enums']["beat_status"],
"submitted_at": string | null,
"title": string,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "beat_packs"
        isOneToOne: true
        isSetofReturn: false
      } },
"search_beats":
{ Args: { "p_bpm_max"?: number,"p_bpm_min"?: number,"p_currency"?: Database["public"]['Enums']["currency_code"],"p_exclude_id"?: string,"p_exclusive_only"?: boolean,"p_featured_only"?: boolean,"p_free_only"?: boolean,"p_genres"?: (string)[],"p_keys"?: (number)[],"p_limit"?: number,"p_moods"?: (string)[],"p_offset"?: number,"p_price_max"?: number,"p_price_min"?: number,"p_producer_id"?: string,"p_query"?: string,"p_sort"?: string }; Returns: Json
                           },
"search_packs":
{ Args: { "p_limit"?: number,"p_query": string }; Returns: {
              "beats_count": number,"cover_path": string,"id": string,"matched_beat": string,"producer_name": string,"slug": string,"title": string
            }[]
                           },
"seller_dashboard":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"seller_sales":
{ Args: { "p_limit"?: number,"p_offset"?: number }; Returns: Json
                           },
"send_message":
{ Args: { "p_attachments"?: Json,"p_beat"?: string,"p_body": string,"p_conversation": string }; Returns: Json
                           },
"slugify":
{ Args: { "value": string }; Returns: string
                           },
"start_conversation":
{ Args: { "p_user": string }; Returns: string
                           },
"suggest_usd_price":
{ Args: { "p_eur": number,"p_rate": number }; Returns: number
                           },
"unique_beat_slug":
{ Args: { "p_id": string,"p_title": string }; Returns: string
                           },
"unique_pack_slug":
{ Args: { "p_id": string,"p_title": string }; Returns: string
                           },
"unread_conversation_count":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"unread_notification_count":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"update_group":
{ Args: { "p_conversation": string,"p_photo_path"?: string,"p_remove_photo"?: boolean,"p_title"?: string }; Returns: Json
                           },
"valid_group_photo":
{ Args: { "p_path": string,"p_user": string }; Returns: boolean
                           },
"valid_moods":
{ Args: { "moods": (string)[] }; Returns: boolean
                           },
"valid_tags":
{ Args: { "tags": (string)[] }; Returns: boolean
                           }
          }
          Enums: {
            "beat_status": "draft"|"pending"|"published"|"rejected"|"archived","collab_status": "pending"|"accepted"|"declined"|"cancelled"|"ended","currency_code": "eur"|"pln"|"usd","earning_status": "pending"|"paid"|"retained"|"reversed","license_type": "free"|"basic"|"premium"|"trackout"|"unlimited"|"exclusive","order_status": "pending"|"paid"|"failed"|"canceled"|"refunded"|"partially_refunded","user_role": "buyer"|"seller"|"admin"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "beat_status": ["draft", "pending", "published", "rejected", "archived"],"collab_status": ["pending", "accepted", "declined", "cancelled", "ended"],"currency_code": ["eur", "pln", "usd"],"earning_status": ["pending", "paid", "retained", "reversed"],"license_type": ["free", "basic", "premium", "trackout", "unlimited", "exclusive"],"order_status": ["pending", "paid", "failed", "canceled", "refunded", "partially_refunded"],"user_role": ["buyer", "seller", "admin"]
          }
        }
} as const
