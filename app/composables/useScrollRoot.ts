export const useScrollRoot = () => {
  const route = useRoute();
  const usesWindowScroll = computed(() => Boolean(route.meta?.usesWindowScroll));
  const getScrollContainer = (): HTMLElement | null => {
    const containerCandidate = document.getElementById('main-content')?.firstElementChild;
    return containerCandidate instanceof HTMLElement ? containerCandidate : null;
  };
  return { getScrollContainer, usesWindowScroll };
};
