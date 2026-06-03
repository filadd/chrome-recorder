export const t = (key: string): string => chrome.i18n.getMessage(key) || key;

export const applyI18n = (root: ParentNode): void => {
  for (const el of root.querySelectorAll<HTMLElement>("[data-i18n]")) {
    el.textContent = t(el.dataset.i18n!);
  }

  for (const el of root.querySelectorAll<HTMLElement>("[data-i18n-placeholder]")) {
    el.setAttribute("placeholder", t(el.dataset.i18nPlaceholder!));
  }
};
