import type { GameMode } from '@/utils/constants';
/**
 * Team API response types
 */
export interface TeamData {
  id: string;
  name: string;
  maxMembers: number;
  ownerId: string;
  createdAt: string;
  gameMode?: GameMode;
  joinCode?: string;
}
export interface CreateTeamResponse {
  success: boolean;
  message: string;
  team: TeamData;
}
export interface LeaveTeamResponse {
  success: boolean;
  message: string;
}
export interface DisbandTeamResponse {
  success: boolean;
  message: string;
}
export interface JoinTeamResponse {
  success: boolean;
  message: string;
  team: TeamData;
}
export interface KickMemberResponse {
  success: boolean;
  message: string;
}
