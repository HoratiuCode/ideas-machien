const MAX_TEXT = 18000;
const MAX_ITEMS = 30;
const MAX_BLOCKS = 50;

function clean(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function limit(list, max) {
  return list.filter(Boolean).slice(0, max);
}

function unique(list) {
  return Array.from(new Set(list.filter(Boolean)));
}

function isVisible(node) {
  if (!(node instanceof Element)) {
    return false;
  }

  const style = window.getComputedStyle(node);
  if (!style || style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
    return false;
  }

  return node.getClientRects().length > 0;
}

function textFrom(selector, max = MAX_ITEMS) {
  const nodes = Array.from(document.querySelectorAll(selector));
  return limit(
    nodes
      .filter(isVisible)
      .map((node) => clean(node.innerText || node.textContent)),
    max
  );
}

function textAttrFrom(selector, attr, max = MAX_ITEMS) {
  const nodes = Array.from(document.querySelectorAll(selector));
  return limit(
    nodes
      .filter(isVisible)
      .map((node) => clean(node.getAttribute(attr) || "")),
    max
  );
}

function getMeta(key, attr = "name") {
  const selector = attr === "property"
    ? `meta[property="${key}"]`
    : `meta[name="${key}"]`;
  return clean(document.querySelector(selector)?.content || "");
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

function collectVisibleTextBlocks(selectors, max = MAX_BLOCKS) {
  const blocks = [];

  for (const selector of selectors) {
    for (const node of Array.from(document.querySelectorAll(selector))) {
      if (!isVisible(node)) {
        continue;
      }

      const text = clean(node.innerText || node.textContent);
      if (text.length < 12) {
        continue;
      }

      blocks.push(text);
      if (blocks.length >= max) {
        return unique(blocks);
      }
    }
  }

  return unique(blocks);
}

function collectCommonSignals(siteKind) {
  const title = clean(document.title);
  const description = getMeta("description") || getMeta("og:description", "property") || getMeta("twitter:description", "name");
  const canonical = clean(document.querySelector('link[rel="canonical"]')?.href || "");
  const headings = textFrom("h1, h2, h3, h4", MAX_ITEMS);
  const paragraphs = textFrom("p", MAX_ITEMS);
  const listItems = textFrom("li", MAX_ITEMS);
  const buttons = textFrom("button, [role=\"button\"]", MAX_ITEMS);
  const labels = textFrom("label", MAX_ITEMS);
  const placeholders = textAttrFrom("input[placeholder], textarea[placeholder]", "placeholder", MAX_ITEMS);
  const ariaLabels = textAttrFrom("[aria-label]", "aria-label", MAX_ITEMS);
  const altTexts = textAttrFrom("img[alt]", "alt", MAX_ITEMS);
  const codeTexts = textFrom("pre code, code", MAX_ITEMS);
  const captionTexts = textFrom("figcaption, caption", MAX_ITEMS);
  const navTexts = collectVisibleTextBlocks(["nav a", "nav button"], MAX_ITEMS);
  const articleTexts = collectVisibleTextBlocks(
    siteKind === "x"
      ? ["article", "[data-testid=\"tweetText\"]", "main"]
      : siteKind === "github"
        ? ["article.markdown-body", "article", "main"]
        : ["main", "article", "[role=\"main\"]", "section"],
    MAX_BLOCKS
  );

  const bodyText = unique([
    title,
    description,
    ...headings,
    ...paragraphs,
    ...listItems,
    ...buttons,
    ...labels,
    ...placeholders,
    ...ariaLabels,
    ...altTexts,
    ...codeTexts,
    ...captionTexts,
    ...navTexts,
    ...articleTexts
  ]).join(" ").slice(0, MAX_TEXT);

  return {
    title,
    description,
    canonical,
    headings,
    paragraphs,
    listItems,
    buttons,
    labels,
    placeholders,
    ariaLabels,
    altTexts,
    codeTexts,
    captionTexts,
    navTexts,
    articleTexts,
    bodyText
  };
}

function extractGithub() {
  const repoMatch = location.pathname.match(/^\/([^/]+)\/([^/]+)(?:\/|$)/);
  const repo = repoMatch ? `${repoMatch[1]}/${repoMatch[2].replace(/\.git$/, "")}` : "";
  const topics = limit(
    Array.from(document.querySelectorAll('a.topic-tag, a[data-view-component="true"].TopicTag'))
      .filter(isVisible)
      .map((node) => clean(node.textContent)),
    MAX_ITEMS
  );
  const language = clean(document.querySelector('[itemprop="programmingLanguage"]')?.textContent || "");
  const stars = clean(document.querySelector('a[href$="/stargazers"]')?.textContent || "");
  const forks = clean(document.querySelector('a[href$="/forks"]')?.textContent || "");
  const repoDescription = getMeta("description") || getMeta("og:description", "property");
  const readmeText = collectVisibleTextBlocks(
    ["article.markdown-body", "[data-testid=\"markdown-body\"]", "main article", "article"],
    MAX_BLOCKS
  );
  const fileNames = limit(
    Array.from(document.querySelectorAll('a[title], [data-testid="tree-view-row"] a'))
      .filter(isVisible)
      .map((node) => clean(node.getAttribute("title") || node.textContent || "")),
    MAX_ITEMS
  );

  return {
    repo,
    topics,
    language,
    stars,
    forks,
    description: repoDescription,
    readmeText,
    fileNames
  };
}

function extractX(bodyText) {
  const hashtags = limit(
    unique((bodyText.match(/#[\p{L}\p{N}_]+/gu) || []).map((tag) => tag.toLowerCase())),
    MAX_ITEMS
  );
  const handles = limit(
    unique((bodyText.match(/@[\p{L}\p{N}_]+/gu) || []).map((tag) => tag.toLowerCase())),
    MAX_ITEMS
  );
  const tweetTexts = collectVisibleTextBlocks(
    ["article [data-testid=\"tweetText\"]", "[data-testid=\"tweetText\"]", "article"],
    MAX_BLOCKS
  );
  const quoteTexts = collectVisibleTextBlocks(
    ["article blockquote", "blockquote"],
    MAX_BLOCKS
  );
  const timeTexts = textFrom("time", MAX_ITEMS);
  const linkTexts = textFrom("a", MAX_ITEMS);

  return {
    hashtags,
    handles,
    tweetTexts,
    quoteTexts,
    timeTexts,
    linkTexts
  };
}

function snapshot() {
  const siteKind = detectSiteKindFromUrl(location.href);
  const common = collectCommonSignals(siteKind);
  const platform = siteKind === "github" ? extractGithub() : siteKind === "x" ? extractX(common.bodyText) : {};
  const pageTextParts = [
    common.title,
    common.description,
    common.canonical,
    ...common.headings,
    ...common.paragraphs,
    ...common.listItems,
    ...common.buttons,
    ...common.labels,
    ...common.placeholders,
    ...common.ariaLabels,
    ...common.altTexts,
    ...common.codeTexts,
    ...common.captionTexts,
    ...common.navTexts,
    ...common.articleTexts,
    ...(platform.topics || []),
    ...(platform.fileNames || []),
    ...(platform.readmeText || []),
    ...(platform.tweetTexts || []),
    ...(platform.quoteTexts || []),
    ...(platform.linkTexts || [])
  ];

  const bodyText = unique(pageTextParts).join(" ").slice(0, MAX_TEXT);

  return {
    url: location.href,
    hostname: location.hostname || "",
    title: common.title,
    description: common.description,
    canonical: common.canonical,
    bodyText,
    rawBodyText: clean(document.body?.innerText || "").slice(0, MAX_TEXT),
    headings: common.headings,
    paragraphs: common.paragraphs,
    listItems: common.listItems,
    buttons: common.buttons,
    labels: common.labels,
    placeholders: common.placeholders,
    ariaLabels: common.ariaLabels,
    altTexts: common.altTexts,
    codeTexts: common.codeTexts,
    captionTexts: common.captionTexts,
    navTexts: common.navTexts,
    articleTexts: common.articleTexts,
    siteKind,
    siteKindSource: "url",
    platform
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "EYESTAR_ANALYZE_PAGE") {
    return;
  }

  try {
    sendResponse({ ok: true, page: snapshot() });
  } catch (error) {
    sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to read page."
    });
  }
});
