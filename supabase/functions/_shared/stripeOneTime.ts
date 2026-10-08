/** Use the successful checkout event time, which is stable across webhook retries. */
export function oneTimePaymentDate(created: number): string {
  if (!Number.isFinite(created) || created <= 0) {
    throw new Error('Successful checkout event has no valid creation time');
  }
  return new Date(created * 1000).toISOString();
}
