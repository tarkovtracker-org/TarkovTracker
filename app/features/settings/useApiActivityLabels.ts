export function useApiActivityLabels() {
  const { t, locale } = useI18n();
  const text = (key: string, params: Record<string, string> = {}) =>
    t(`page.settings.card.apitokens.activity.${key}`, params);
  const number = (value: number) => value.toLocaleString(locale.value);
  const utcTime = computed(
    () =>
      new Intl.DateTimeFormat(locale.value, {
        dateStyle: 'medium',
        timeStyle: 'medium',
        timeZone: 'UTC',
      })
  );
  const timestamp = (value: string) => utcTime.value.format(new Date(value));
  return { text, number, timestamp, locale };
}
