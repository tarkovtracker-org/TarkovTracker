const failures: Record<string, { message: string; status: number }> = {
  not_found: { message: 'Team not found', status: 404 },
  not_member: { message: 'Member not found in team or already removed', status: 404 },
  not_owner: { message: 'Only team owners can kick members', status: 403 },
  self: { message: 'Cannot kick yourself from the team', status: 400 },
  cooldown: { message: 'Must wait 5 minutes between kicks', status: 429 },
};
export const kickTeamResponse = (result: unknown) => {
  if (result === 'kicked') return null;
  return failures[String(result)] ?? { message: 'Failed to kick team member', status: 500 };
};
