export const isMembershipConflict = (
  error: {
    code?: string;
    details?: string | null;
    message?: string;
  } | null
): boolean => {
  if (error?.code === 'P0001') {
    return error.message === 'You are already a member of a team for this game mode';
  }
  if (error?.code !== '23505') return false;
  return [error.message, error.details].some((value) =>
    value?.includes('team_memberships_user_mode_unique')
  );
};
