export interface PurgeCacheResponse {
  success: boolean;
  message: string;
  purgeType: 'all' | 'tarkov-data';
  cloudflareResultId?: string;
  timestamp: string;
  auditWriteFailed?: true;
}
