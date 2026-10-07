/**
 * Formatting utilities for consistent number and text display across the application
 */
import { useSafeLocale } from '@/composables/i18nHelpers';
/**
 * Format a number with abbreviated suffixes for large values
 * @param num - The number to format
 * @returns Formatted string (e.g., "1.5M", "25k", "999")
 */
export function formatCompactNumber(num: number): string {
  const sign = num < 0 ? '-' : '';
  const abs = Math.abs(num);
  if (abs >= 999_500) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)}k`;
  return `${sign}${abs.toString()}`;
}
/**
 * Format a number with locale-specific separators (pure utility)
 * @param num - The number to format
 * @param locale - Optional locale string (e.g., "en-US"). Falls back to browser default if not provided
 * @returns Locale-formatted string (e.g., "1,234,567")
 */
function formatLocaleNumber(num: number, locale?: string): string {
  return num.toLocaleString(locale);
}
/**
 * Formatter factory for formatLocaleNumber that uses the current i18n locale
 * @returns Function that formats numbers using the current locale
 */
export function useLocaleNumberFormatter(): (num: number) => string {
  const locale = useSafeLocale();
  return (num: number) => formatLocaleNumber(num, locale.value);
}
/**
 * Calculate percentage as a number
 * @param completed - Number of completed items
 * @param total - Total number of items
 * @returns Percentage as a number (0-100), or 0 if total is 0
 */
export function calculatePercentageNum(completed: number, total: number): number {
  return total > 0 ? (completed / total) * 100 : 0;
}
