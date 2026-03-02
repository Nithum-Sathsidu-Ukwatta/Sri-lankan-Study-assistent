
export type Language = 'si' | 'en';

export enum Difficulty {
  Easy = 'Easy',
  Medium = 'Medium',
  Hard = 'Hard',
}

export interface Subject {
  id: string;
  name: string;
  difficulty: Difficulty;
}

export interface BusySlot {
  id: string;
  day: string;
  startTime: string;
  endTime: string;
  label: string;
}

export interface UserRoutine {
  schoolEndTime: string;
  bedTime: string;
  examDate: string;
}

export interface StudySession {
  day: string; // e.g., "Monday"
  date?: string; // e.g., "2023-10-27"
  subject: string;
  topic: string;
  unitNumber?: string;
  technique: string;
  durationMinutes: number;
  startTime?: string;
  isCompleted?: boolean; // New field for progress tracking
}

export interface WeeklySchedule {
  weekNumber: number;
  startDate: string;
  endDate: string;
  phase: string; // e.g., "Foundation", "Revision"
  goal: string;
  sessions: StudySession[];
  isUnlocked?: boolean; // Track if this specific week has been unlocked via Ad
}

export interface StudyPlan {
  examDate: string;
  weeks: WeeklySchedule[];
  tips: string[];
  sourceUrls?: string[];
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface Flashcard {
  front: string;
  back: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
}
