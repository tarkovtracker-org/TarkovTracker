import { readFileSync } from 'node:fs';
export const english = JSON.parse(
  readFileSync(new URL('../../../app/locales/en.json', import.meta.url), 'utf8')
);
export function readPreviewSeo(candidatePath) {
  if (!candidatePath) return english.seo;
  const { seo } = JSON.parse(readFileSync(candidatePath, 'utf8'));
  if (typeof seo?.site_name !== 'string' || !seo.routes) {
    throw new Error('Missing SEO copy in preview revision English locale');
  }
  return seo;
}
// Social titles omit the document title's site suffix.
export function socialTitle({ title }) {
  return title.replace(/ · TarkovTracker\.org$/, '');
}
