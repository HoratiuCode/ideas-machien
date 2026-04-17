const WINDOW_KEY = "eyestar_window_id";
const WINDOW_SIZE = {
  width: 860,
  height: 780
};

async function focusExistingWindow() {
  const data = await chrome.storage.session.get([WINDOW_KEY]);
  const windowId = data[WINDOW_KEY];

  if (typeof windowId !== "number") {
    return false;
  }

  try {
    await chrome.windows.update(windowId, {
      focused: true,
      width: WINDOW_SIZE.width,
      height: WINDOW_SIZE.height
    });
    return true;
  } catch {
    await chrome.storage.session.remove([WINDOW_KEY]);
    return false;
  }
}

async function updateWindowForTab(windowId, sourceTabId) {
  const url = new URL(chrome.runtime.getURL("popup.html"));
  if (sourceTabId !== null) {
    url.searchParams.set("tabId", String(sourceTabId));
  }

  const tabs = await chrome.tabs.query({ windowId });
  if (tabs.length > 0) {
    await chrome.tabs.update(tabs[0].id, { url: url.toString() });
    return true;
  }

  await chrome.tabs.create({ windowId, url: url.toString() });
  return true;
}

chrome.action.onClicked.addListener(async (tab) => {
  const sourceTabId = typeof tab?.id === "number" ? tab.id : null;
  const data = await chrome.storage.session.get([WINDOW_KEY]);
  const windowId = data[WINDOW_KEY];

  if (typeof windowId === "number") {
    try {
      await updateWindowForTab(windowId, sourceTabId);
      await chrome.windows.update(windowId, {
        focused: true,
        width: WINDOW_SIZE.width,
        height: WINDOW_SIZE.height
      });
      return;
    } catch {
      await chrome.storage.session.remove([WINDOW_KEY]);
    }
  }

  if (await focusExistingWindow()) {
    return;
  }

  const url = new URL(chrome.runtime.getURL("popup.html"));
  if (sourceTabId !== null) {
    url.searchParams.set("tabId", String(sourceTabId));
  }

  const created = await chrome.windows.create({
    url: url.toString(),
    type: "popup",
    width: WINDOW_SIZE.width,
    height: WINDOW_SIZE.height,
    focused: true
  });

  if (typeof created?.id === "number") {
    await chrome.storage.session.set({ [WINDOW_KEY]: created.id });
  }
});

chrome.windows.onRemoved.addListener(async (windowId) => {
  const data = await chrome.storage.session.get([WINDOW_KEY]);
  if (data[WINDOW_KEY] === windowId) {
    await chrome.storage.session.remove([WINDOW_KEY]);
  }
});
