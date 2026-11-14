export class SupabaseCallbackPendingError extends Error {
  constructor() {
    super('OAuth callback is still pending');
    this.name = 'SupabaseCallbackPendingError';
  }
}
