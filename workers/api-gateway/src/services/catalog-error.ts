/** A required public rules catalog could not be fetched or validated. */
export class CatalogUnavailableError extends Error {
  constructor() {
    super('Game data temporarily unavailable');
    this.name = 'CatalogUnavailableError';
  }
}
