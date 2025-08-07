export type QuizQuestion = {
  id: string;
  prompt: string;
  options: string[];
  answerIndex: number;
  explanation: string;
};

export type LearnSubtopic = {
  id: string;
  order: number;
  title: string;
  importance: string;
  difficulty: number;
  overview: string;
  explanation: string;
  mastered: boolean;
  questions: QuizQuestion[];
};

export type LearnLecture = {
  id: string;
  title: string;
  originalContent: string;
  subtopics: LearnSubtopic[];
};

export function deriveUnlockedIndex(subtopics: LearnSubtopic[]): number {
  // Highest mastered index + 1 (at least 0)
  const lastMastered = subtopics.reduce((acc, s, i) => (s.mastered ? i : acc), -1);
  return Math.min(lastMastered + 1, Math.max(0, subtopics.length - 1));
}
