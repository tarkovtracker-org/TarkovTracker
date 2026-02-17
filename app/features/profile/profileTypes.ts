export type TimelineTone = 'error' | 'info' | 'primary' | 'success';
export interface TimelineEvent {
  key: string;
  icon: string;
  subtitle: string;
  timestamp: number;
  title: string;
  tone: TimelineTone;
}
export interface AchievementRow {
  barClass: string;
  completed: number;
  icon: string;
  iconClass: string;
  id: string;
  percentage: number;
  title: string;
  total: number;
}
export interface KappaProjection {
  confidence: 'high' | 'low' | 'medium' | null;
  daysRemaining: number | null;
  detail: string;
  etaTimestamp: number | null;
  headline: string;
  state: 'completed' | 'projected' | 'unknown';
}
