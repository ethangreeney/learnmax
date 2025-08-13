'use client';

import { create } from 'zustand';

export type MeState = {
  id?: string | null;
  name?: string | null;
  username?: string | null;
  image?: string | null;
  setMe: (partial: Partial<MeState>) => void;
  reset: () => void;
};

export const useMeStore = create<MeState>((set) => ({
  id: null,
  name: null,
  username: null,
  image: null,
  setMe: (partial) => set((s) => ({ ...s, ...partial })),
  reset: () => set({ id: null, name: null, username: null, image: null }),
}));


