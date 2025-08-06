import { create } from 'zustand';

type Progress = {
  completedLectures: number;
  masteredSubtopics: number;
  elo: number;
  streak: number;
  lastStudyISO?: string;
};

type State = {
  progress: Progress;
  incrementLecture: () => void;
  addMastery: (n: number) => void;
  tickStudy: (minutes: number) => void;
};

export const useProgressStore = create<State>((set) => ({
  progress: {
    completedLectures: 0,
    masteredSubtopics: 0,
    elo: 1000,
    streak: 0,
  },
  incrementLecture: () =>
    set((s) => ({
      progress: {
        ...s.progress,
        completedLectures: s.progress.completedLectures + 1,
        elo: s.progress.elo + 10,
      },
    })),
  addMastery: (n: number) =>
    set((s) => ({
      progress: {
        ...s.progress,
        masteredSubtopics: s.progress.masteredSubtopics + n,
        elo: s.progress.elo + n * 5,
      },
    })),
  tickStudy: (minutes: number) =>
    set((s) => {
      const now = new Date();
      const prev = s.progress.lastStudyISO
        ? new Date(s.progress.lastStudyISO)
        : undefined;
      let streak = s.progress.streak;
      if (minutes >= 10) {
        if (!prev) {
          streak = 1;
        } else {
          const diffDays =
            Math.floor(
              (Date.UTC(
                now.getUTCFullYear(),
                now.getUTCMonth(),
                now.getUTCDate()
              ) -
                Date.UTC(
                  prev.getUTCFullYear(),
                  prev.getUTCMonth(),
                  prev.getUTCDate()
                )) /
                (1000 * 60 * 60 * 24)
            );
          if (diffDays === 1) streak = s.progress.streak + 1;
          else if (diffDays > 1) streak = 1; // reset if broken
        }
      }
      return {
        progress: {
          ...s.progress,
          streak,
          lastStudyISO: now.toISOString(),
        },
      };
    }),
}));
