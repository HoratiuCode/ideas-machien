const STORAGE_KEYS = {
  history: "eyestar_history",
  settings: "eyestar_settings"
};

const DEFAULT_SETTINGS = {
  autoRefresh: false,
  intervalSeconds: 10,
  popupSize: "large"
};

const SOURCE_TAB_ID = (() => {
  const value = new URLSearchParams(location.search).get("tabId");
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) ? parsed : null;
})();

const state = {
  page: null,
  history: [],
  settings: { ...DEFAULT_SETTINGS },
  refreshTimer: null
};

const ui = {
  sizeButton: document.getElementById("sizeButton"),
  refreshButton: document.getElementById("refreshButton"),
  validateButton: document.getElementById("validateButton"),
  sparkButton: document.getElementById("sparkButton"),
  clearHistoryButton: document.getElementById("clearHistoryButton"),
  ideaInput: document.getElementById("ideaInput"),
  autoRefreshToggle: document.getElementById("autoRefreshToggle"),
  refreshInterval: document.getElementById("refreshInterval"),
  statusText: document.getElementById("statusText"),
  statusCopy: document.getElementById("statusCopy"),
  siteKind: document.getElementById("siteKind"),
  signalScore: document.getElementById("signalScore"),
  scorePill: document.getElementById("scorePill"),
  signalChips: document.getElementById("signalChips"),
  historyList: document.getElementById("historyList")
};

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "into",
  "your",
  "about",
  "idea",
  "ideas",
  "current",
  "page",
  "what",
  "when",
  "where",
  "which",
  "have",
  "will",
  "should",
  "could",
  "would",
  "using",
  "used",
  "use",
  "you",
  "are",
  "not",
  "can",
  "via",
  "our",
  "their",
  "they",
  "been",
  "but",
  "more",
  "than",
  "just",
  "new",
  "site",
  "trend",
  "trends"
]);

const GENERIC_TERMS = new Set([
  "github",
  "twitter",
  "x",
  "com",
  "app",
  "blog",
  "post",
  "readme",
  "repo",
  "repository",
  "project",
  "issue",
  "issues",
  "pull",
  "request",
  "open",
  "source"
]);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clean(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function tokenize(text) {
  return clean(text)
    .toLowerCase()
    .match(/[\p{L}\p{N}_-]+/gu)
    ?.filter((word) => word.length > 2 && !STOPWORDS.has(word) && !GENERIC_TERMS.has(word)) || [];
}

function unique(list) {
  return Array.from(new Set(list));
}

function countWords(list) {
  const map = new Map();
  for (const word of list) {
    map.set(word, (map.get(word) || 0) + 1);
  }
  return map;
}

function collectPageText(page) {
  const parts = [
    page.title,
    page.description,
    page.canonical,
    ...(page.headings || []),
    ...(page.paragraphs || []),
    ...(page.listItems || []),
    ...(page.buttons || []),
    ...(page.labels || []),
    ...(page.placeholders || []),
    ...(page.ariaLabels || []),
    ...(page.altTexts || []),
    ...(page.codeTexts || []),
    ...(page.captionTexts || []),
    ...(page.navTexts || []),
    ...(page.articleTexts || []),
    ...(page.platform?.topics || []),
    ...(page.platform?.fileNames || []),
    ...(page.platform?.readmeText || []),
    ...(page.platform?.tweetTexts || []),
    ...(page.platform?.quoteTexts || []),
    ...(page.platform?.linkTexts || []),
    page.bodyText,
    page.rawBodyText,
    page.platform?.repo,
    page.platform?.language,
    page.platform?.stars,
    page.platform?.forks
  ];

  return parts.filter(Boolean).join(" ");
}

function formatDate(isoString) {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(isoString));
  } catch {
    return isoString;
  }
}

function siteLabel(siteKind) {
  if (siteKind === "github") return "GitHub";
  if (siteKind === "x") return "X / Twitter";
  return "General site";
}

function pageLabel(page) {
  if (page?.siteKind === "github") {
    return page.platform?.repo || page.title || page.hostname || "GitHub";
  }
  if (page?.siteKind === "x") {
    return page.title || page.hostname || "X / Twitter";
  }
  return page?.title || page?.hostname || "Page";
}

function detectSiteKindFromUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    if (host === "github.com" || host.endsWith(".github.com")) {
      return "github";
    }

    if (
      host === "x.com" ||
      host.endsWith(".x.com") ||
      host === "twitter.com" ||
      host.endsWith(".twitter.com")
    ) {
      return "x";
    }
  } catch {
    return "general";
  }

  return "general";
}

function applyPopupSize() {
  document.body.dataset.popupSize = state.settings.popupSize === "large" ? "large" : "compact";

  if (ui.sizeButton) {
    const expanded = state.settings.popupSize === "large";
    ui.sizeButton.title = expanded ? "Make popup smaller" : "Make popup bigger";
    ui.sizeButton.setAttribute("aria-label", ui.sizeButton.title);
    ui.sizeButton.querySelector("span").textContent = expanded ? "⤡" : "⤢";
  }
}

function syncValidationButtonState() {
  const hasIdea = Boolean(clean(ui.ideaInput.value));
  ui.validateButton.disabled = !hasIdea;
  ui.validateButton.title = hasIdea
    ? "Validate the idea in the textbox"
    : "Add an idea first to validate it";
}

function normalizePageSiteKind(page) {
  const urlKind = detectSiteKindFromUrl(page?.url || "");
  if (urlKind !== "general") {
    return urlKind;
  }

  if (page?.siteKind === "github" || page?.siteKind === "x") {
    return page.siteKind;
  }

  return "general";
}

function textFrom(selector) {
  const nodes = Array.from(document.querySelectorAll(selector));
  return nodes.map((node) => clean(node.innerText || node.textContent)).filter(Boolean);
}

function getMeta(key, attr = "name") {
  const selector = attr === "property"
    ? `meta[property="${key}"]`
    : `meta[name="${key}"]`;
  return clean(document.querySelector(selector)?.content || "");
}

function extractGithub() {
  const repoMatch = location.pathname.match(/^\/([^/]+)\/([^/]+)(?:\/|$)/);
  const repo = repoMatch ? `${repoMatch[1]}/${repoMatch[2].replace(/\.git$/, "")}` : "";
  const topics = unique(
    textFrom('a.topic-tag, a[data-view-component="true"].TopicTag').slice(0, 20)
  );
  const language = clean(document.querySelector('[itemprop="programmingLanguage"]')?.textContent || "");
  const description = getMeta("description") || getMeta("og:description", "property");
  return {
    repo,
    topics,
    language,
    description
  };
}

function extractX(bodyText) {
  const hashtags = unique((bodyText.match(/#[\p{L}\p{N}_]+/gu) || []).map((tag) => tag.toLowerCase())).slice(0, 20);
  const handles = unique((bodyText.match(/@[\p{L}\p{N}_]+/gu) || []).map((tag) => tag.toLowerCase())).slice(0, 20);
  return {
    hashtags,
    handles
  };
}

function rankTerms(page) {
  const source = collectPageText(page).slice(0, 7000);
  const words = tokenize(source);
  const counts = countWords(words);
  return [...counts.entries()]
    .sort((a, b) => {
      const scoreA = a[1] + Math.min(3, a[0].length / 6);
      const scoreB = b[1] + Math.min(3, b[0].length / 6);
      return scoreB - scoreA;
    })
    .map(([term]) => term)
    .slice(0, 12);
}

function estimateSignalScore(page, terms) {
  let score = 40;
  if (page.siteKind === "github") score += 20;
  if (page.siteKind === "x") score += 18;
  score += Math.min(20, terms.length * 2);
  if ((page.platform?.topics || []).length) score += 8;
  if ((page.platform?.hashtags || []).length) score += 8;
  if (page.description) score += 4;
  return clamp(score, 0, 100);
}

function estimateClarity(ideaTokens) {
  if (!ideaTokens.length) return -20;
  let score = 0;
  if (ideaTokens.length >= 6 && ideaTokens.length <= 18) score += 10;
  if (ideaTokens.length > 18) score -= 4;
  if (ideaTokens.some((token) => /build|ship|launch|track|monitor|summar|analyz|generator|assistant|tool|extension|dashboard|cli/.test(token))) {
    score += 10;
  }
  if (ideaTokens.some((token) => /for|to|with/.test(token))) score += 4;
  return score;
}

function sharedTerms(ideaTokens, terms) {
  const termSet = new Set(terms);
  return ideaTokens.filter((token) => termSet.has(token));
}

function estimateFit(page, ideaTokens, terms) {
  const overlap = sharedTerms(ideaTokens, terms);
  let score = overlap.length * 10;
  const ideaText = ideaTokens.join(" ");

  if (page.siteKind === "github" && /(open-source|repo|action|extension|cli|sdk|tool|workflow|automation)/.test(ideaText)) {
    score += 12;
  }
  if (page.siteKind === "x" && /(creator|thread|post|feed|audience|newsletter|brief|share|social)/.test(ideaText)) {
    score += 12;
  }
  if (page.description && ideaTokens.some((token) => page.description.toLowerCase().includes(token))) {
    score += 8;
  }
  if (page.platform?.topics?.length && overlap.length) {
    score += 8;
  }
  return score;
}

function verdictForScore(score) {
  if (score >= 80) return "Strong idea";
  if (score >= 62) return "Promising";
  if (score >= 44) return "Needs a sharper edge";
  return "Weak on this page";
}

function adviceForScore(score, page, overlapCount) {
  const notes = [];

  if (score >= 80) {
    notes.push("The idea matches the current page signal cleanly.");
    notes.push("You can ship a narrow version without a big reposition.");
  } else if (score >= 62) {
    notes.push("The idea is close, but it needs a tighter hook.");
    notes.push("Reduce scope until the value is obvious in one sentence.");
  } else if (score >= 44) {
    notes.push("There is some fit, but the page signal and the idea do not line up tightly.");
    notes.push("Add a more specific audience, format, or workflow.");
  } else {
    notes.push("This does not match the current page signal well.");
    notes.push("Reframe the idea around the strongest page term instead.");
  }

  if (page.siteKind === "github") {
    notes.push("On GitHub, a practical tool, workflow, or automation angle usually lands better.");
  } else if (page.siteKind === "x") {
    notes.push("On X, speed, clarity, and shareability matter more than depth.");
  }

  if (overlapCount === 0) {
    notes.push("There is zero keyword overlap, so the idea is currently floating away from the trend.");
  }

  return notes.slice(0, 4);
}

function generateIdea(page, terms) {
  const cleanTerms = terms.filter((term) => term && term.length > 2);
  const primaryTerm = cleanTerms[0] || (page.siteKind === "github" ? "open-source" : page.siteKind === "x" ? "trend" : "signal");
  const secondaryTerm = cleanTerms[1] || (page.platform?.language || page.siteKind || "workflow");

  if (page.siteKind === "github") {
    return {
      title: `Build a tiny ${primaryTerm} tool for ${secondaryTerm}`,
      summary: `Package it as a CLI, browser helper, or GitHub Action so it feels native to the ecosystem.`,
      bullets: [
        `Start with ${primaryTerm} as the core hook.`,
        `Keep the scope focused on ${secondaryTerm}.`,
        "Ship it as a public repo people can fork."
      ]
    };
  }

  if (page.siteKind === "x") {
    return {
      title: `Turn ${primaryTerm} into a fast daily brief`,
      summary: `Make it post-aware, lightweight, and easy to share inside a feed-first workflow.`,
      bullets: [
        `Start with ${primaryTerm} as the core hook.`,
        `Keep the scope focused on ${secondaryTerm}.`,
        "Design it for fast sharing and short-form proof."
      ]
    };
  }

  return {
    title: `Wrap ${primaryTerm} into a small useful tool`,
    summary: "Keep the first version narrow and obvious so people get value in under a minute.",
    bullets: [
      `Start with ${primaryTerm} as the core hook.`,
      `Keep the scope focused on ${secondaryTerm}.`,
      "Make the first result visible immediately."
    ]
  };
}

function analyzeIdea(page, ideaText) {
  const terms = rankTerms(page);
  const idea = clean(ideaText);

  if (!idea) {
    const generated = generateIdea(page, terms);
    return {
      type: "spark",
      scoreLabel: "SPARK",
      score: estimateSignalScore(page, terms),
      verdict: "Idea spark",
      summary: generated.summary,
      idea: `${generated.title}. ${generated.summary}`,
      bullets: generated.bullets,
      page,
      terms
    };
  }

  const ideaTokens = tokenize(idea);
  const overlap = sharedTerms(ideaTokens, terms);
  let score = 42;
  score += estimateClarity(ideaTokens);
  score += estimateFit(page, ideaTokens, terms);
  score += Math.min(10, overlap.length * 3);
  score = clamp(score, 0, 100);

  const verdict = verdictForScore(score);
  const advice = adviceForScore(score, page, overlap.length);
  const wins = [];
  const risks = [];

  if (overlap.length) {
    wins.push(`Shares ${overlap.length} keyword${overlap.length === 1 ? "" : "s"} with the current page: ${overlap.slice(0, 4).join(", ")}.`);
  } else {
    risks.push("No direct overlap with the active page signal.");
  }

  if (page.siteKind === "github") {
    wins.push("GitHub fit is strongest when the idea can become a repo, tool, or automation.");
    risks.push("If it needs a lot of explanation, it will feel heavy on GitHub.");
  } else if (page.siteKind === "x") {
    wins.push("X fit is strongest when the idea can be summarized fast and shared in one line.");
    risks.push("If the pitch is too long, it will get lost in the feed.");
  }

  if (ideaTokens.length < 6) {
    risks.push("The idea is probably too short to prove the value.");
  }

  return {
    type: "validate",
    scoreLabel: `${score}/100`,
    score,
    verdict,
    summary: advice[0],
    idea,
    bullets: [...wins, advice[1] || "", ...risks, ...advice.slice(2)].filter(Boolean),
    page,
    terms
  };
}

function renderChips(values) {
  ui.signalChips.innerHTML = "";
  const items = unique(values).slice(0, 6);
  if (!items.length) {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = "No strong signals yet";
    ui.signalChips.appendChild(chip);
    return;
  }

  for (const value of items) {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = value;
    ui.signalChips.appendChild(chip);
  }
}

function renderCurrentPage(page) {
  const normalizedSiteKind = normalizePageSiteKind(page);
  const terms = rankTerms(page);
  const signalScore = estimateSignalScore(page, terms);
  const topChips = [];

  if (normalizedSiteKind === "github") {
    if (page.platform?.repo) topChips.push(page.platform.repo);
    topChips.push(...(page.platform?.topics || []).slice(0, 4));
    if (page.platform?.language) topChips.push(page.platform.language);
  } else if (normalizedSiteKind === "x") {
    topChips.push(...(page.platform?.hashtags || []).slice(0, 4));
    topChips.push(...(page.platform?.handles || []).slice(0, 4));
  }

  topChips.push(...terms.slice(0, 4));

  state.page = {
    ...page,
    siteKind: normalizedSiteKind
  };
  ui.siteKind.textContent = siteLabel(normalizedSiteKind);
  ui.signalScore.textContent = String(signalScore);
  renderChips(topChips);
}

function renderHistory() {
  ui.historyList.innerHTML = "";

  if (!state.history.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No scans yet. Validate an idea or spark one from the current page, then it will show up here.";
    ui.historyList.appendChild(empty);
    return;
  }

  for (const item of state.history) {
    const card = document.createElement("article");
    card.className = "history-item";

    const top = document.createElement("div");
    top.className = "history-top";

    const left = document.createElement("div");
    const source = document.createElement("p");
    source.className = "history-source";
    source.textContent = `${siteLabel(normalizePageSiteKind(item))} · ${item.sourceLabel}`;
    const title = document.createElement("h3");
    title.className = "history-title";
    title.textContent = item.verdict;
    left.append(source, title);

    const meta = document.createElement("div");
    meta.className = "history-meta";
    const score = document.createElement("span");
    score.className = "history-score";
    score.textContent = item.scoreLabel;
    const timestamp = document.createElement("span");
    timestamp.textContent = formatDate(item.timestamp);
    meta.append(score, timestamp);

    top.append(left, meta);

    const summary = document.createElement("p");
    summary.className = "history-summary";
    summary.textContent = item.summary;

    const actions = document.createElement("div");
    actions.className = "history-actions";

    const reuse = document.createElement("button");
    reuse.type = "button";
    reuse.className = "history-link";
    reuse.textContent = "Reuse idea";
    reuse.dataset.action = "reuse";
    reuse.dataset.id = item.id;

    const openPage = document.createElement("button");
    openPage.type = "button";
    openPage.className = "history-link";
    openPage.textContent = "Open page";
    openPage.dataset.action = "open";
    openPage.dataset.url = item.url;

    actions.append(reuse, openPage);
    card.append(top, summary, actions);
    ui.historyList.appendChild(card);
  }
}

async function loadStorage() {
  const data = await chrome.storage.local.get([STORAGE_KEYS.history, STORAGE_KEYS.settings]);
  state.history = Array.isArray(data[STORAGE_KEYS.history]) ? data[STORAGE_KEYS.history] : [];
  state.settings = {
    ...DEFAULT_SETTINGS,
    ...(data[STORAGE_KEYS.settings] || {})
  };

  if (state.settings.popupSize !== "large") {
    state.settings.popupSize = "large";
    await saveSettings();
  }

  applyPopupSize();
  ui.autoRefreshToggle.checked = Boolean(state.settings.autoRefresh);
  ui.refreshInterval.value = String(state.settings.intervalSeconds || DEFAULT_SETTINGS.intervalSeconds);
  renderHistory();
  syncAutoRefresh();
}

async function saveHistory() {
  await chrome.storage.local.set({ [STORAGE_KEYS.history]: state.history });
}

async function saveSettings() {
  await chrome.storage.local.set({ [STORAGE_KEYS.settings]: state.settings });
}

function syncAutoRefresh() {
  if (state.refreshTimer) {
    clearInterval(state.refreshTimer);
    state.refreshTimer = null;
  }

  if (!state.settings.autoRefresh) {
    return;
  }

  const intervalMs = clamp(Number(state.settings.intervalSeconds) || 10, 10, 60) * 1000;
  state.refreshTimer = setInterval(() => {
    refreshPage({ quiet: true });
  }, intervalMs);
}

async function getActivePage() {
  let tab = null;

  if (SOURCE_TAB_ID !== null) {
    try {
      tab = await chrome.tabs.get(SOURCE_TAB_ID);
    } catch {
      tab = null;
    }
  }

  if (!tab?.id) {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = activeTab || null;
  }

  if (!tab?.id) {
    return null;
  }

  let page = null;
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: "EYESTAR_ANALYZE_PAGE" });
    if (response?.ok) {
      page = response.page;
    }
  } catch {
    page = null;
  }

  if (!page) {
    let hostname = "";
    try {
      hostname = tab.url ? new URL(tab.url).hostname : "";
    } catch {
      hostname = "";
    }

    page = {
      url: tab.url || "",
      hostname,
      title: tab.title || "",
      description: "",
      bodyText: "",
      headings: [],
      linkTexts: [],
      siteKind: detectSiteKindFromUrl(tab.url || ""),
      platform: {}
    };
  }

  page.siteKind = normalizePageSiteKind(page);
  return page;
}

function recordHistory(result) {
  const item = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    timestamp: new Date().toISOString(),
    siteKind: result.page.siteKind,
    sourceLabel: pageLabel(result.page),
    verdict: result.verdict,
    scoreLabel: result.scoreLabel,
    summary: result.summary,
    idea: result.idea,
    url: result.page.url
  };

  state.history = [item, ...state.history].slice(0, 6);
}

async function refreshPage(options = {}) {
  const page = await getActivePage();
  if (!page) {
    ui.statusText.textContent = "Open X or GitHub";
    ui.statusCopy.textContent = "EyeStar needs an active page tab to read signals.";
    ui.siteKind.textContent = "Unavailable";
    ui.signalScore.textContent = "--";
    ui.scorePill.textContent = "--";
    ui.signalChips.innerHTML = "";
    renderChips([]);
    return;
  }

  renderCurrentPage(page);
  ui.statusText.textContent = "Ready.";
  ui.statusCopy.textContent = options.quiet
    ? "Validate an idea or generate one from the page."
    : "Validate an idea or generate one from the page.";
  ui.scorePill.textContent = "--";
}

async function runAnalysis(mode) {
  if (!state.page) {
    await refreshPage();
  }

  const input = clean(ui.ideaInput.value);
  if (mode === "validate" && !input) {
    ui.statusText.textContent = "Add an idea first.";
    ui.statusCopy.textContent = "Use Spark from page if you want a generated idea, or type your own idea before validating.";
    ui.scorePill.textContent = "--";
    return;
  }

  const result = analyzeIdea(state.page, mode === "spark" ? "" : input);

  if (result.type === "spark") {
    ui.ideaInput.value = result.idea;
    syncValidationButtonState();
  }

  ui.statusText.textContent = result.verdict;
  ui.statusCopy.textContent = result.summary;
  ui.scorePill.textContent = result.scoreLabel;
  renderChips(result.terms);

  recordHistory(result);
  await saveHistory();
  renderHistory();
}

function wireEvents() {
  ui.ideaInput.addEventListener("input", syncValidationButtonState);

  ui.refreshButton.addEventListener("click", async () => {
    ui.refreshButton.disabled = true;
    try {
      await refreshPage();
    } finally {
      ui.refreshButton.disabled = false;
    }
  });

  ui.validateButton.addEventListener("click", async () => {
    if (ui.validateButton.disabled) {
      return;
    }

    ui.validateButton.disabled = true;
    ui.validateButton.textContent = "Checking...";
    try {
      await runAnalysis("validate");
    } finally {
      ui.validateButton.disabled = false;
      ui.validateButton.textContent = "Validate idea";
    }
  });

  ui.sparkButton.addEventListener("click", async () => {
    ui.sparkButton.disabled = true;
    ui.sparkButton.textContent = "Sparking...";
    try {
      await runAnalysis("spark");
    } finally {
      ui.sparkButton.disabled = false;
      ui.sparkButton.textContent = "Spark from page";
    }
  });

  ui.clearHistoryButton.addEventListener("click", async () => {
    state.history = [];
    await saveHistory();
    renderHistory();
  });

  ui.autoRefreshToggle.addEventListener("change", async () => {
    state.settings.autoRefresh = ui.autoRefreshToggle.checked;
    await saveSettings();
    syncAutoRefresh();
  });

  ui.refreshInterval.addEventListener("change", async () => {
    state.settings.intervalSeconds = Number(ui.refreshInterval.value) || DEFAULT_SETTINGS.intervalSeconds;
    await saveSettings();
    syncAutoRefresh();
  });

  ui.sizeButton.addEventListener("click", async () => {
    state.settings.popupSize = state.settings.popupSize === "large" ? "compact" : "large";
    applyPopupSize();
    await saveSettings();
  });

  ui.historyList.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const action = target.dataset.action;
    const id = target.dataset.id;
    const url = target.dataset.url;

    if (action === "reuse" && id) {
      const item = state.history.find((entry) => entry.id === id);
      if (item) {
        ui.ideaInput.value = item.idea;
        syncValidationButtonState();
        await runAnalysis("validate");
      }
    }

    if (action === "open" && url) {
      await chrome.tabs.create({ url });
    }
  });
}

async function init() {
  wireEvents();
  await loadStorage();
  applyPopupSize();
  syncValidationButtonState();
  await refreshPage({ quiet: true });
}

document.addEventListener("DOMContentLoaded", () => {
  init().catch((error) => {
    ui.statusText.textContent = "EyeStar failed to load";
    ui.statusCopy.textContent = error instanceof Error ? error.message : "Unknown error";
  });
});
