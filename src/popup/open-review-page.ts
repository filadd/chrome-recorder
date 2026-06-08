export const openReviewPage = (key: string): Promise<chrome.tabs.Tab> =>
  chrome.tabs.create({
    url: `${chrome.runtime.getURL("src/review/review.html")}?key=${encodeURIComponent(key)}`,
  });
