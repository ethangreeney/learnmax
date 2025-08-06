import { create } from 'zustand';

export type Subtopic = {
  title: string;
  importance: 'low' | 'med' | 'high';
  difficulty: number;
  overview?: string;
};

export type Question = {
  prompt: string;
  options: string[];
  answerIndex: number;
  explanation?: string;
  subtopicTitle?: string;
};

type State = {
  topic: string;
  subtopics: Subtopic[];
  unlockedIndex: number;
  currentIndex: number;
  content: string;
  explanation: string; // Changed from summary
  quiz: Question[];
  loading: boolean;
  error?: string;
  setContent: (v: string) => void;
  setBreakdown: (topic: string, subs: Subtopic[]) => void;
  setExplanation: (s: string) => void; // Changed from setSummary
  setQuiz: (q: Question[]) => void;
  setLoading: (v: boolean) => void;
  setError: (e?: string) => void;
  selectIndex: (i: number) => void;
  unlockNext: () => void;
  resetAll: () => void;
};

export const useLearnStore = create<State>((set, get) => ({
  topic: 'Untitled',
  subtopics: [],
  unlockedIndex: 0,
  currentIndex: 0,
  content: '',
  explanation: '', // Changed from summary
  quiz: [],
  loading: false,
  setContent: (v) => set({ content: v }),
  setBreakdown: (topic, subs) =>
    set({
      topic,
      subtopics: subs,
      unlockedIndex: 0,
      currentIndex: 0,
    }),
  setExplanation: (s) => set({ explanation: s }), // Changed from setSummary
  setQuiz: (q) => set({ quiz: q }),
  setLoading: (v) => set({ loading: v }),
  setError: (e) => set({ error: e }),
  selectIndex: (i) => {
    const { unlockedIndex } = get();
    if (i <= unlockedIndex) set({ currentIndex: i });
  },
  unlockNext: () => {
    const { unlockedIndex, subtopics } = get();
    if (unlockedIndex < subtopics.length - 1) {
      set({ unlockedIndex: unlockedIndex + 1, currentIndex: unlockedIndex + 1 });
    }
  },
  resetAll: () =>
    set({
      topic: 'Untitled',
      subtopics: [],
      unlockedIndex: 0,
      currentIndex: 0,
      content: '',
      explanation: '', // Changed from summary
      quiz: [],
      loading: false,
      error: undefined,
    }),
}));
