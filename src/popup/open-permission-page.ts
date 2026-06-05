export const openPermissionPage = (): Promise<chrome.tabs.Tab> =>
  chrome.tabs.create({ url: chrome.runtime.getURL("src/permission/permission.html") });
