(() => {
  const storageKey = 'weekend-studio-theme-v1';
  const choices = ['light', 'dark', 'system'];
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
  let preference = 'system';

  try {
    const saved = localStorage.getItem(storageKey);
    if (choices.includes(saved)) preference = saved;
  } catch {
    // Theme switching still works when browser storage is unavailable.
  }

  function applyTheme() {
    document.documentElement.dataset.theme = preference === 'system'
      ? (systemTheme.matches ? 'dark' : 'light')
      : preference;
    document.querySelectorAll('[data-theme-choice]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.themeChoice === preference));
    });
  }

  // Apply before styles load to avoid flashing the wrong theme on refresh.
  applyTheme();
  systemTheme.addEventListener('change', applyTheme);
  window.addEventListener('storage', event => {
    if (event.key !== storageKey && event.key !== null) return;
    preference = choices.includes(event.newValue) ? event.newValue : 'system';
    applyTheme();
  });
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-theme-choice]').forEach(button => {
      button.addEventListener('click', () => {
        preference = button.dataset.themeChoice;
        applyTheme();
        try {
          localStorage.setItem(storageKey, preference);
        } catch {
          // Keep the selected theme for this visit.
        }
      });
    });
    applyTheme();
  });
})();
