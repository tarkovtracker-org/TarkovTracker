export const useMainScrollContainer = (): HTMLElement | null => {
  const containerCandidate = document.getElementById('main-content')?.firstElementChild;
  return containerCandidate instanceof HTMLElement ? containerCandidate : null;
};
