export type PageHelpKey = 'dashboard' | 'tasks' | 'needed_items' | 'hideout';
export type PageHelpRoute = string | { path: string; query?: Record<string, string> };
export interface PageHelpAction {
  color?: 'error' | 'info' | 'neutral' | 'primary' | 'secondary' | 'success' | 'warning';
  icon?: string;
  label: string;
  to: PageHelpRoute;
  variant?: 'ghost' | 'link' | 'outline' | 'soft' | 'solid' | 'subtle';
}
export interface PageHelpSection {
  bullets?: string[];
  description: string;
  title: string;
}
export interface PageHelpContent {
  actions: PageHelpAction[];
  hintDescription: string;
  sections: PageHelpSection[];
  summary: string;
  title: string;
}
export const usePageHelpContent = () => {
  const { t } = useI18n({ useScope: 'global' });
  const pageHelpContent = computed<Record<PageHelpKey, PageHelpContent>>(() => ({
    dashboard: {
      title: t('page_help.dashboard.title'),
      summary: t('page_help.dashboard.summary'),
      hintDescription: t('page_help.dashboard.hint'),
      sections: [
        {
          title: t('page_help.dashboard.sections.focus.title'),
          description: t('page_help.dashboard.sections.focus.description'),
          bullets: [
            t('page_help.dashboard.sections.focus.bullet_one'),
            t('page_help.dashboard.sections.focus.bullet_two'),
          ],
        },
        {
          title: t('page_help.dashboard.sections.progress.title'),
          description: t('page_help.dashboard.sections.progress.description'),
          bullets: [
            t('page_help.dashboard.sections.progress.bullet_one'),
            t('page_help.dashboard.sections.progress.bullet_two'),
          ],
        },
        {
          title: t('page_help.dashboard.sections.review.title'),
          description: t('page_help.dashboard.sections.review.description'),
          bullets: [
            t('page_help.dashboard.sections.review.bullet_one'),
            t('page_help.dashboard.sections.review.bullet_two'),
          ],
        },
      ],
      actions: [
        {
          label: t('common.open_tasks'),
          to: '/tasks',
          icon: 'i-mdi-checkbox-multiple-marked',
        },
        {
          label: t('page_help.dashboard.actions.needed_items'),
          to: { path: '/needed-items', query: { type: 'tasks' } },
          icon: 'i-mdi-package-variant',
          color: 'neutral',
        },
      ],
    },
    tasks: {
      title: t('page_help.tasks.title'),
      summary: t('page_help.tasks.summary'),
      hintDescription: t('page_help.tasks.hint'),
      sections: [
        {
          title: t('page_help.tasks.sections.views.title'),
          description: t('page_help.tasks.sections.views.description'),
          bullets: [
            t('page_help.tasks.sections.views.bullet_one'),
            t('page_help.tasks.sections.views.bullet_two'),
          ],
        },
        {
          title: t('page_help.tasks.sections.filters.title'),
          description: t('page_help.tasks.sections.filters.description'),
          bullets: [
            t('page_help.tasks.sections.filters.bullet_one'),
            t('page_help.tasks.sections.filters.bullet_two'),
          ],
        },
        {
          title: t('page_help.tasks.sections.settings.title'),
          description: t('page_help.tasks.sections.settings.description'),
          bullets: [
            t('page_help.tasks.sections.settings.bullet_one'),
            t('page_help.tasks.sections.settings.bullet_two'),
          ],
        },
      ],
      actions: [
        {
          label: t('page_help.tasks.actions.needed_items'),
          to: { path: '/needed-items', query: { type: 'tasks' } },
          icon: 'i-mdi-package-variant',
        },
        {
          label: t('common.open_hideout'),
          to: '/hideout',
          icon: 'i-mdi-home-city-outline',
          color: 'neutral',
        },
      ],
    },
    needed_items: {
      title: t('page_help.needed_items.title'),
      summary: t('page_help.needed_items.summary'),
      hintDescription: t('page_help.needed_items.hint'),
      sections: [
        {
          title: t('page_help.needed_items.sections.scopes.title'),
          description: t('page_help.needed_items.sections.scopes.description'),
          bullets: [
            t('page_help.needed_items.sections.scopes.bullet_one'),
            t('page_help.needed_items.sections.scopes.bullet_two'),
          ],
        },
        {
          title: t('page_help.needed_items.sections.views.title'),
          description: t('page_help.needed_items.sections.views.description'),
          bullets: [
            t('page_help.needed_items.sections.views.bullet_one'),
            t('page_help.needed_items.sections.views.bullet_two'),
          ],
        },
        {
          title: t('page_help.needed_items.sections.filters.title'),
          description: t('page_help.needed_items.sections.filters.description'),
          bullets: [
            t('page_help.needed_items.sections.filters.bullet_one'),
            t('page_help.needed_items.sections.filters.bullet_two'),
          ],
        },
      ],
      actions: [
        {
          label: t('common.open_tasks'),
          to: '/tasks',
          icon: 'i-mdi-checkbox-multiple-marked',
        },
        {
          label: t('common.open_hideout'),
          to: '/hideout',
          icon: 'i-mdi-home-city-outline',
          color: 'neutral',
        },
      ],
    },
    hideout: {
      title: t('page_help.hideout.title'),
      summary: t('page_help.hideout.summary'),
      hintDescription: t('page_help.hideout.hint'),
      sections: [
        {
          title: t('page_help.hideout.sections.statuses.title'),
          description: t('page_help.hideout.sections.statuses.description'),
          bullets: [
            t('page_help.hideout.sections.statuses.bullet_one'),
            t('page_help.hideout.sections.statuses.bullet_two'),
          ],
        },
        {
          title: t('page_help.hideout.sections.requirements.title'),
          description: t('page_help.hideout.sections.requirements.description'),
          bullets: [
            t('page_help.hideout.sections.requirements.bullet_one'),
            t('page_help.hideout.sections.requirements.bullet_two'),
          ],
        },
        {
          title: t('page_help.hideout.sections.materials.title'),
          description: t('page_help.hideout.sections.materials.description'),
          bullets: [
            t('page_help.hideout.sections.materials.bullet_one'),
            t('page_help.hideout.sections.materials.bullet_two'),
          ],
        },
      ],
      actions: [
        {
          label: t('page_help.hideout.actions.needed_items'),
          to: { path: '/needed-items', query: { type: 'hideout' } },
          icon: 'i-mdi-package-variant',
        },
        {
          label: t('common.open_tasks'),
          to: '/tasks',
          icon: 'i-mdi-checkbox-multiple-marked',
          color: 'neutral',
        },
      ],
    },
  }));
  const getPageHelpContent = (pageKey: PageHelpKey): PageHelpContent => {
    return pageHelpContent.value[pageKey];
  };
  return {
    getPageHelpContent,
  };
};
