export const isMembershipConflict = (
  error: {
    code?: string;
    details?: string | null;
    message?: string;
  } | null
): boolean => {
  switch (error?.code) {
    case 'P0001':
      return error.message === 'You are already a member of a team for this game mode';
    case '23505':
      return [error.message, error.details].some((value) =>
        value?.includes('team_memberships_user_mode_unique')
      );
    default:
      return false;
  }
};
