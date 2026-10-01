export interface EftLogImportLimits {
  inputBytes: number;
  expandedBytes: number;
  evidenceCount: number;
  evidenceChars: number;
  entries: number;
  nameChars: number;
}
// Preserve the 513 MiB streaming regression and allow several times the documented 1,121-file
// corpus. Evidence has separate ceilings: streaming text alone does not bound retained objects.
const DEFAULT_LIMITS: Readonly<EftLogImportLimits> = {
  inputBytes: 1024 * 1024 * 1024,
  expandedBytes: 1024 * 1024 * 1024,
  evidenceCount: 100000,
  evidenceChars: 16 * 1024 * 1024,
  entries: 8192,
  nameChars: 1024 * 1024,
};
export class EftLogImportBudgetError extends Error {
  constructor(readonly limit: keyof EftLogImportLimits) {
    super(
      'The selected logs exceed the safe import budget. Select fewer recent sessions or extract only the relevant log files. No progress was imported.'
    );
    this.name = 'EftLogImportBudgetError';
  }
}
/** One budget per selection, including every archive member and every retained evidence item. */
export function createEftLogImportBudget(overrides: Partial<EftLogImportLimits> = {}) {
  const limits = { ...DEFAULT_LIMITS, ...overrides };
  const used: EftLogImportLimits = {
    inputBytes: 0,
    expandedBytes: 0,
    evidenceCount: 0,
    evidenceChars: 0,
    entries: 0,
    nameChars: 0,
  };
  const charge = (key: keyof EftLogImportLimits, amount: number): void => {
    if (amount > limits[key] - used[key]) throw new EftLogImportBudgetError(key);
    used[key] += amount;
  };
  return {
    charge,
    retain(chars: number): void {
      charge('evidenceCount', 1);
      charge('evidenceChars', chars);
    },
    entry(name: string): void {
      charge('entries', 1);
      charge('nameChars', name.length);
    },
  };
}
export type EftLogImportBudget = ReturnType<typeof createEftLogImportBudget>;
