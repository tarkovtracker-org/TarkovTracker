const failures: Record<string, { message: string; status: number }> = {
  not_found: { message: 'Team not found', status: 404 },
  not_member: { message: 'You are not a member of this team', status: 404 },
  owner: {
    message: 'Team owners must disband their team through the confirmed disband action.',
    status: 400,
  },
  cooldown: { message: 'Must wait 5 minutes before leaving another team', status: 429 },
};
export const leaveTeamResponse = (result: unknown) => {
  if (result === 'left') return null;
  return failures[String(result)] ?? { message: 'Failed to leave team', status: 500 };
};
