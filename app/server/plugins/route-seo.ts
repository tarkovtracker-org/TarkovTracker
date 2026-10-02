import { createRouteSeoHead, PUBLIC_SEO_ROUTES, resolveRouteSeo } from '@/utils/routeSeo';
const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
/** Client documents do not run Vue setup; give their initial HTML the same metadata. */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:html', (html, { event }) => {
    const rawPath = event.path.split(/[?#]/)[0] ?? '/';
    const path = rawPath.replace(/\/+$/, '') || '/';
    if (PUBLIC_SEO_ROUTES.includes(path)) return;
    const head = createRouteSeoHead(path);
    html.head.push(
      `<title>${escapeHtml(head.title)}</title>`,
      ...head.meta.map((tag) => {
        const attribute = 'property' in tag ? `property="${tag.property}"` : `name="${tag.name}"`;
        return `<meta ${attribute} content="${escapeHtml(tag.content)}">`;
      }),
      ...head.link.map((tag) => `<link rel="canonical" href="${escapeHtml(tag.href)}">`),
      ...head.script.map((tag) => `<script type="${tag.type}">${tag.innerHTML}</script>`)
    );
    if (path === '/404.html') {
      const seo = resolveRouteSeo(path);
      const content = `<main class="text-surface-50 p-8"><h1 class="text-2xl font-bold">${escapeHtml(seo.title)}</h1><p>${escapeHtml(seo.description)}</p></main>`;
      html.body = html.body.map((body) =>
        body.replace(
          /(<div\b[^>]*\bid="__nuxt"[^>]*>)<\/div>/,
          (_match, opening: string) => `${opening}${content}</div>`
        )
      );
    }
  });
});
