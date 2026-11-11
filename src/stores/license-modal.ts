"use client";

import { create } from "zustand";

export interface LicenseModalBeat {
  id: string;
  title: string;
  slug: string;
  cover_path: string | null;
  producer_name: string;
  producer_id?: string;
  exclusive_sold_at?: string | null;
  /** false: don't link the title to the beat's page (opened from inside a pack). */
  linkToBeat?: boolean;
}

interface LicenseModalState {
  beat: LicenseModalBeat | null;
  openFor: (beat: LicenseModalBeat) => void;
  close: () => void;
}

export const useLicenseModal = create<LicenseModalState>((set) => ({
  beat: null,
  openFor: (beat) => set({ beat }),
  close: () => set({ beat: null }),
}));
