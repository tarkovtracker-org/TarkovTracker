// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { createI18n } from 'vue-i18n';
const translator = () =>
  createI18n({
    legacy: false,
    locale: 'en',
    escapeParameter: true,
    warnHtmlMessage: false,
    messages: {
      en: {
        mixed: '{0} {name}',
        named: '{name}',
        frame: '<iframe srcdoc="<b>nested document</b>"></iframe>',
      },
    },
  }).global.t;
describe('Vue I18n security patches', () => {
  it('escapes named and list values supplied in the same translation call', () => {
    const translated = translator()('mixed', ['<b>list</b>'], {
      named: { name: '<b>named</b>' },
    });
    const element = document.createElement('div');
    element.innerHTML = translated;
    expect(element.querySelector('b')).toBeNull();
    expect(element.textContent).toBe('<b>list</b> <b>named</b>');
  });
  it('neutralizes iframe srcdoc instead of preserving a nested HTML document', () => {
    const element = document.createElement('div');
    element.innerHTML = translator()('frame');
    const frame = element.querySelector('iframe');
    expect(frame).not.toBeNull();
    expect(frame?.hasAttribute('srcdoc')).toBe(false);
  });
  it('does not mutate or double-escape reused named parameters', () => {
    const t = translator();
    const named = { name: '<b>named</b>' };
    const first = t('named', named);
    const element = document.createElement('div');
    element.innerHTML = first;
    expect(element.querySelector('b')).toBeNull();
    expect(element.textContent).toBe('<b>named</b>');
    expect(named).toEqual({ name: '<b>named</b>' });
    expect(t('named', named)).toBe(first);
  });
});
