type ActionMessages = {
  default: { page: { tasks: { questcard: { hand_over_fir: unknown } } } };
};
// These modules are loaded only while generating a language bundle.
const HAND_OVER_LOCALES: Record<string, () => Promise<ActionMessages>> = {
  cs: () => import('@/locales/cs.json'),
  de: () => import('@/locales/de.json'),
  es: () => import('@/locales/es.json'),
  fr: () => import('@/locales/fr.json'),
  it: () => import('@/locales/it.json'),
  ja: () => import('@/locales/ja.json'),
  ko: () => import('@/locales/ko.json'),
  pl: () => import('@/locales/pl.json'),
  pt: () => import('@/locales/pt.json'),
  ru: () => import('@/locales/ru.json'),
  tr: () => import('@/locales/tr.json'),
  zh: () => import('@/locales/zh.json'),
};
function actionText(value: unknown): string | undefined {
  // Nuxt compiles message JSON into ASTs, while the standalone producer reads plain JSON.
  const message = value as
    { body?: { static?: string }; b?: { s?: string }; loc?: { source?: string } } | undefined;
  return [value, message?.body?.static, message?.b?.s, message?.loc?.source].find(
    (candidate): candidate is string => typeof candidate === 'string'
  );
}
async function localizedHandOverAction(language: string): Promise<string | undefined> {
  const load = Object.hasOwn(HAND_OVER_LOCALES, language) ? HAND_OVER_LOCALES[language] : undefined;
  if (!load) return undefined;
  const [messages, english] = await Promise.all([load(), import('@/locales/en.json')]);
  const action = actionText(messages.default.page.tasks.questcard.hand_over_fir);
  const englishAction = actionText(english.default.page.tasks.questcard.hand_over_fir);
  return action === englishAction ? undefined : action;
}
export async function handOverDescription(language: string, itemName: string): Promise<string> {
  const action = await localizedHandOverAction(language);
  return action ? `${action}: ${itemName}` : `Hand over the found in raid item: ${itemName}`;
}
