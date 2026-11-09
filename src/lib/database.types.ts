
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "beat_daily_stats": {
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
                },"beats": {
                  Row: {
                    "admin_locked": boolean,"approved_at": string | null,"bpm": number,"cover_path": string | null,"created_at": string,"description": string | null,"duration_seconds": number | null,"exclusive_buyer_id": string | null,"exclusive_sold_at": string | null,"favorites_count": number,"featured_at": string | null,"genre": string,"has_exclusive": boolean,"has_free": boolean,"id": string,"is_featured": boolean,"key_group": number | null,"key_mode": string,"key_note": number,"min_price_eur": number | null,"min_price_pln": number | null,"min_price_usd": number | null,"moods": (string)[],"mp3_path": string | null,"plays_count": number,"preview_path": string | null,"producer_id": string,"published_at": string | null,"rating_avg": number | null,"rating_count": number,"rejection_reason": string | null,"sales_count": number,"search_vector": unknown,"slug": string,"status": Database["public"]['Enums']["beat_status"],"stems_path": string | null,"submitted_at": string | null,"tags": (string)[],"title": string,"updated_at": string,"wav_path": string | null,"waveform": Json | null
                  }
                  ComputedFields: never
                  Insert: {
                    "admin_locked"?: boolean,"approved_at"?: string | null,"bpm": number,"cover_path"?: string | null,"created_at"?: string,"description"?: string | null,"duration_seconds"?: number | null,"exclusive_buyer_id"?: string | null,"exclusive_sold_at"?: string | null,"favorites_count"?: number,"featured_at"?: string | null,"genre": string,"has_exclusive"?: boolean,"has_free"?: boolean,"id"?: string,"is_featured"?: boolean,"key_group"?: never,"key_mode": string,"key_note": number,"min_price_eur"?: number | null,"min_price_pln"?: number | null,"min_price_usd"?: number | null,"moods"?: (string)[],"mp3_path"?: string | null,"plays_count"?: number,"preview_path"?: string | null,"producer_id": string,"published_at"?: string | null,"rating_avg"?: number | null,"rating_count"?: number,"rejection_reason"?: string | null,"sales_count"?: number,"search_vector"?: never,"slug": string,"status"?: Database["public"]['Enums']["beat_status"],"stems_path"?: string | null,"submitted_at"?: string | null,"tags"?: (string)[],"title": string,"updated_at"?: string,"wav_path"?: string | null,"waveform"?: Json | null
                  }
                  Update: {
                    "admin_locked"?: boolean,"approved_at"?: string | null,"bpm"?: number,"cover_path"?: string | null,"created_at"?: string,"description"?: string | null,"duration_seconds"?: number | null,"exclusive_buyer_id"?: string | null,"exclusive_sold_at"?: string | null,"favorites_count"?: number,"featured_at"?: string | null,"genre"?: string,"has_exclusive"?: boolean,"has_free"?: boolean,"id"?: string,"is_featured"?: boolean,"key_group"?: never,"key_mode"?: string,"key_note"?: number,"min_price_eur"?: number | null,"min_price_pln"?: number | null,"min_price_usd"?: number | null,"moods"?: (string)[],"mp3_path"?: string | null,"plays_count"?: number,"preview_path"?: string | null,"producer_id"?: string,"published_at"?: string | null,"rating_avg"?: number | null,"rating_count"?: number,"rejection_reason"?: string | null,"sales_count"?: number,"search_vector"?: never,"slug"?: string,"status"?: Database["public"]['Enums']["beat_status"],"stems_path"?: string | null,"submitted_at"?: string | null,"tags"?: (string)[],"title"?: string,"updated_at"?: string,"wav_path"?: string | null,"waveform"?: Json | null
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
                    "cleared_at": string,"conversation_id": string,"last_read_at": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cleared_at"?: string,"conversation_id": string,"last_read_at"?: string | null,"user_id": string
                  }
                  Update: {
                    "cleared_at"?: string,"conversation_id"?: string,"last_read_at"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
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
                },"conversations": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"last_message_at": string | null,"last_sender_id": string | null,"user_a": string,"user_b": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"last_message_at"?: string | null,"last_sender_id"?: string | null,"user_a": string,"user_b": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"last_message_at"?: string | null,"last_sender_id"?: string | null,"user_a"?: string,"user_b"?: string
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
                },"messages": {
                  Row: {
                    "body": string,"conversation_id": string,"created_at": string,"id": string,"sender_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"conversation_id": string,"created_at"?: string,"id"?: string,"sender_id": string
                  }
                  Update: {
                    "body"?: string,"conversation_id"?: string,"created_at"?: string,"id"?: string,"sender_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "messages_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "messages_sender_id_fkey"
      columns: ["sender_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"order_items": {
                  Row: {
                    "beat_id": string | null,"beat_title": string,"buyer_id": string | null,"created_at": string,"currency": Database["public"]['Enums']["currency_code"],"id": string,"license_id": string | null,"license_name": string,"license_snapshot": NonNullable<Json>,"license_type": Database["public"]['Enums']["license_type"],"order_id": string,"platform_fee": number,"price": number,"producer_name": string,"seller_amount": number,"seller_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "beat_id"?: string | null,"beat_title": string,"buyer_id"?: string | null,"created_at"?: string,"currency": Database["public"]['Enums']["currency_code"],"id"?: string,"license_id"?: string | null,"license_name": string,"license_snapshot"?: NonNullable<Json>,"license_type": Database["public"]['Enums']["license_type"],"order_id": string,"platform_fee"?: number,"price": number,"producer_name": string,"seller_amount"?: number,"seller_id"?: string | null
                  }
                  Update: {
                    "beat_id"?: string | null,"beat_title"?: string,"buyer_id"?: string | null,"created_at"?: string,"currency"?: Database["public"]['Enums']["currency_code"],"id"?: string,"license_id"?: string | null,"license_name"?: string,"license_snapshot"?: NonNullable<Json>,"license_type"?: Database["public"]['Enums']["license_type"],"order_id"?: string,"platform_fee"?: number,"price"?: number,"producer_name"?: string,"seller_amount"?: number,"seller_id"?: string | null
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
      foreignKeyName: "order_items_seller_id_fkey"
      columns: ["seller_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"orders": {
                  Row: {
                    "buyer_email": string,"buyer_id": string | null,"confirmation_sent_at": string | null,"created_at": string,"currency": Database["public"]['Enums']["currency_code"],"id": string,"order_number": number,"paid_at": string | null,"refunded_amount": number,"status": Database["public"]['Enums']["order_status"],"stripe_charge_id": string | null,"stripe_checkout_session_id": string | null,"stripe_payment_intent_id": string | null,"subtotal": number,"total": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "buyer_email": string,"buyer_id"?: string | null,"confirmation_sent_at"?: string | null,"created_at"?: string,"currency": Database["public"]['Enums']["currency_code"],"id"?: string,"order_number"?: never,"paid_at"?: string | null,"refunded_amount"?: number,"status"?: Database["public"]['Enums']["order_status"],"stripe_charge_id"?: string | null,"stripe_checkout_session_id"?: string | null,"stripe_payment_intent_id"?: string | null,"subtotal"?: number,"total"?: number,"updated_at"?: string
                  }
                  Update: {
                    "buyer_email"?: string,"buyer_id"?: string | null,"confirmation_sent_at"?: string | null,"created_at"?: string,"currency"?: Database["public"]['Enums']["currency_code"],"id"?: string,"order_number"?: never,"paid_at"?: string | null,"refunded_amount"?: number,"status"?: Database["public"]['Enums']["order_status"],"stripe_charge_id"?: string | null,"stripe_checkout_session_id"?: string | null,"stripe_payment_intent_id"?: string | null,"subtotal"?: number,"total"?: number,"updated_at"?: string
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
                    "eur_to_pln": number,"eur_to_usd": number,"id": boolean,"platform_fee_percent": number,"require_beat_approval": boolean,"seller_signups_open": boolean,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "eur_to_pln"?: number,"eur_to_usd"?: number,"id"?: boolean,"platform_fee_percent"?: number,"require_beat_approval"?: boolean,"seller_signups_open"?: boolean,"updated_at"?: string
                  }
                  Update: {
                    "eur_to_pln"?: number,"eur_to_usd"?: number,"id"?: boolean,"platform_fee_percent"?: number,"require_beat_approval"?: boolean,"seller_signups_open"?: boolean,"updated_at"?: string
                  }
                  Relationships: [
                    
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
isOneToOne: true
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
                    "beat_id": string | null,"created_at": string,"currency": Database["public"]['Enums']["currency_code"],"gross": number,"id": string,"net": number,"order_id": string,"order_item_id": string,"paid_at": string | null,"platform_fee": number,"seller_id": string,"status": Database["public"]['Enums']["earning_status"],"stripe_transfer_id": string | null,"transfer_amount": number | null,"transfer_currency": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "beat_id"?: string | null,"created_at"?: string,"currency": Database["public"]['Enums']["currency_code"],"gross": number,"id"?: string,"net": number,"order_id": string,"order_item_id": string,"paid_at"?: string | null,"platform_fee": number,"seller_id": string,"status"?: Database["public"]['Enums']["earning_status"],"stripe_transfer_id"?: string | null,"transfer_amount"?: number | null,"transfer_currency"?: string | null
                  }
                  Update: {
                    "beat_id"?: string | null,"created_at"?: string,"currency"?: Database["public"]['Enums']["currency_code"],"gross"?: number,"id"?: string,"net"?: number,"order_id"?: string,"order_item_id"?: string,"paid_at"?: string | null,"platform_fee"?: number,"seller_id"?: string,"status"?: Database["public"]['Enums']["earning_status"],"stripe_transfer_id"?: string | null,"transfer_amount"?: number | null,"transfer_currency"?: string | null
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
      foreignKeyName: "seller_earnings_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "seller_earnings_order_item_id_fkey"
      columns: ["order_item_id"]
isOneToOne: true
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
                    "bpm": number,"cover_path": string | null,"created_at": string,"duration_seconds": number | null,"exclusive_sold_at": string | null,"favorites_count": number,"featured_at": string | null,"genre": string,"genre_name": string | null,"has_exclusive": boolean,"has_free": boolean,"id": string,"is_featured": boolean,"key_group": number | null,"key_mode": string,"key_note": number,"min_price_eur": number | null,"min_price_pln": number | null,"min_price_usd": number | null,"moods": (string)[],"plays_count": number,"preview_path": string | null,"producer_avatar_path": string | null,"producer_id": string,"producer_name": string | null,"producer_username": string,"producer_verified": boolean,"published_at": string | null,"rating_avg": number | null,"rating_count": number,"sales_count": number,"search_vector": unknown,"slug": string,"status": Database["public"]['Enums']["beat_status"],"tags": (string)[],"title": string,"waveform": Json | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
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
                }
          }
          Functions: {
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
"beat_path_ok":
{ Args: { "p_path": string,"p_producer": string }; Returns: boolean
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
"clean_message_body":
{ Args: { "p_body": string }; Returns: string
                           },
"create_pending_order":
{ Args: { "p_buyer_email": string,"p_buyer_id": string,"p_currency": Database["public"]['Enums']["currency_code"],"p_license_ids": (string)[] }; Returns: Json
                           },
"delete_conversation":
{ Args: { "p_conversation": string }; Returns: undefined
                           },
"escape_like":
{ Args: { "value": string }; Returns: string
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
"mark_conversation_read":
{ Args: { "p_conversation": string }; Returns: undefined
                           },
"mark_order_failed":
{ Args: { "p_order_id": string,"p_status": Database["public"]['Enums']["order_status"] }; Returns: undefined
                           },
"mfa_satisfied":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"prefix_tsquery":
{ Args: { "q": string }; Returns: unknown
                           },
"record_play":
{ Args: { "p_beat_id": string }; Returns: undefined
                           },
"refresh_beat_price_summary":
{ Args: { "p_beat_id": string }; Returns: undefined
                           },
"save_beat":
{ Args: { "p_beat": Json,"p_licenses": Json,"p_save_defaults"?: boolean,"p_status"?: Database["public"]['Enums']["beat_status"] }; Returns: {
              "admin_locked": boolean,
"approved_at": string | null,
"bpm": number,
"cover_path": string | null,
"created_at": string,
"description": string | null,
"duration_seconds": number | null,
"exclusive_buyer_id": string | null,
"exclusive_sold_at": string | null,
"favorites_count": number,
"featured_at": string | null,
"genre": string,
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
"search_beats":
{ Args: { "p_bpm_max"?: number,"p_bpm_min"?: number,"p_currency"?: Database["public"]['Enums']["currency_code"],"p_exclude_id"?: string,"p_exclusive_only"?: boolean,"p_featured_only"?: boolean,"p_free_only"?: boolean,"p_genres"?: (string)[],"p_keys"?: (number)[],"p_limit"?: number,"p_moods"?: (string)[],"p_offset"?: number,"p_price_max"?: number,"p_price_min"?: number,"p_producer_id"?: string,"p_query"?: string,"p_sort"?: string }; Returns: Json
                           },
"seller_dashboard":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"seller_sales":
{ Args: { "p_limit"?: number,"p_offset"?: number }; Returns: Json
                           },
"send_message":
{ Args: { "p_body": string,"p_conversation": string }; Returns: Json
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
"unread_conversation_count":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"valid_moods":
{ Args: { "moods": (string)[] }; Returns: boolean
                           },
"valid_tags":
{ Args: { "tags": (string)[] }; Returns: boolean
                           }
          }
          Enums: {
            "beat_status": "draft"|"pending"|"published"|"rejected"|"archived","currency_code": "eur"|"pln"|"usd","earning_status": "pending"|"paid"|"retained"|"reversed","license_type": "free"|"basic"|"premium"|"trackout"|"unlimited"|"exclusive","order_status": "pending"|"paid"|"failed"|"canceled"|"refunded"|"partially_refunded","user_role": "buyer"|"seller"|"admin"
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
            "beat_status": ["draft", "pending", "published", "rejected", "archived"],"currency_code": ["eur", "pln", "usd"],"earning_status": ["pending", "paid", "retained", "reversed"],"license_type": ["free", "basic", "premium", "trackout", "unlimited", "exclusive"],"order_status": ["pending", "paid", "failed", "canceled", "refunded", "partially_refunded"],"user_role": ["buyer", "seller", "admin"]
          }
        }
} as const
