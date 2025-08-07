import { create } from 'zustand';

type UIState = {
  currentIndex: number;
  unlockedIndex: number;
  setCurrentIndex: (i: number) => void;
  setUnlockedIndex: (i: number) => void;
};

export const createLearnUIStore = (initial: {
  currentIndex: number;
  unlockedIndex: number;
}) =>
  create<UIState>((set) => ({
    currentIndex: initial.currentIndex,
    unlockedIndex: initial.unlockedIndex,
    setCurrentIndex: (i) => set({ currentIndex: i }),
    setUnlockedIndex: (i) => set({ unlockedIndex: i }),
  }));
