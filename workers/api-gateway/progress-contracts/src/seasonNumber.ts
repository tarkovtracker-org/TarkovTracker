export const isSeasonNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;
