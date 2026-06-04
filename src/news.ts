export type NewsItem = {
  id: string;
  time: string;
  source: string;
  subject: string;
  title: string;
  summary: string;
  url: string;
};

const trackedSymbols = ["NVDA", "GOOGL", "AVGO", "MSFT", "TSLA"];

const relevanceKeywords: Record<string, string[]> = {
  NVDA: ["nvidia", "nvda", "tsmc", "gpu", "ai chip", "ai chips", "blackwell", "rubin"],
  GOOGL: ["google", "alphabet", "googl", "gemini", "waymo", "google cloud"],
  AVGO: ["broadcom", "avgo", "vmware", "custom chip", "asic", "tomahawk", "jericho"],
  MSFT: ["microsoft", "msft", "azure", "copilot", "openai"],
  TSLA: ["tesla", "tsla", "robotaxi", "fsd", "cybercab", "optimus"],
};

export const fallbackNews: NewsItem[] = [
  // Keep this empty on purpose. If live news fails, the UI should show a clear
  // failure state instead of filling the feed with low-value placeholder links.
];

function cleanText(value: string) {
  const doc = new DOMParser().parseFromString(value, "text/html");
  return (doc.body.textContent ?? value).replace(/\s+/g, " ").trim();
}

async function translateToChinese(text: string) {
  const cleaned = cleanText(text);
  if (!cleaned) return "";
  try {
    const params = new URLSearchParams({
      client: "gtx",
      sl: "en",
      tl: "zh-CN",
      dt: "t",
      q: cleaned,
    });
    const response = await fetch(`/translate/translate_a/single?${params.toString()}`);
    if (!response.ok) throw new Error(`translate ${response.status}`);
    const data = await response.json();
    const translated = data?.[0]?.map((part: unknown[]) => part?.[0]).join("");
    return cleanText(translated || cleaned);
  } catch {
    return cleaned;
  }
}

function getTags(title: string) {
  const lower = title.toLowerCase();
  const tags: string[] = [];

  if (lower.includes("upgrade") || lower.includes("price target") || lower.includes("analyst")) {
    tags.push("大行观点/目标价");
  }
  if (lower.includes("earnings") || lower.includes("revenue") || lower.includes("profit")) {
    tags.push("财报与业绩");
  }
  if (lower.includes("ai") || lower.includes("artificial intelligence")) {
    tags.push("AI主线");
  }
  if (lower.includes("chip") || lower.includes("semiconductor") || lower.includes("data center")) {
    tags.push("半导体/数据中心");
  }
  if (lower.includes("robotaxi") || lower.includes("self-driving") || lower.includes("autonomous")) {
    tags.push("自动驾驶事件");
  }

  return tags.length > 0 ? tags : ["公开新闻"];
}

function isRelevant(symbol: string, item: YahooSearchNewsItem) {
  const title = (item.title ?? "").toLowerCase();
  const related = item.relatedTickers ?? [];
  const keywords = relevanceKeywords[symbol] ?? [symbol.toLowerCase()];
  const hasKeyword = keywords.some((keyword) => title.includes(keyword));
  const hasTicker = related.includes(symbol);

  if (hasKeyword) return true;
  if (!hasTicker) return false;

  const isGenericCryptoOrOther =
    /\b(hype|hyperliquid|ionq|upstart|berkshire|loan|loans|quantum)\b/i.test(title) &&
    !keywords.some((keyword) => title.includes(keyword));

  return !isGenericCryptoOrOther;
}

function formatNewsTime(value: string | number) {
  const date = typeof value === "number" ? new Date(value * 1000) : new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

type YahooSearchNewsItem = {
  uuid?: string;
  title?: string;
  publisher?: string;
  link?: string;
  providerPublishTime?: number;
  relatedTickers?: string[];
};

async function fetchSymbolNews(symbol: string): Promise<NewsItem[]> {
  const params = new URLSearchParams({
    q: symbol,
    quotesCount: "0",
    newsCount: "8",
    listsCount: "0",
    enableFuzzyQuery: "false",
    region: "US",
    lang: "en-US",
  });
  const url = `/yahoo/v1/finance/search?${params.toString()}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`news ${symbol} ${response.status}`);

  const data = await response.json();
  const items = (data?.news ?? []) as YahooSearchNewsItem[];

  const relevantItems = items.filter((item) => isRelevant(symbol, item));
  const mapped = await Promise.all(
    relevantItems.slice(0, 6).map(async (item, index) => {
    const title = cleanText(item.title ?? `${symbol} news`);
    const link = item.link ?? "";
    if (!link || !title) return null;
    const related = item.relatedTickers?.includes(symbol) ? symbol : symbol;
    const translatedTitle = await translateToChinese(title);
    const tags = getTags(title);

    return {
      id: item.uuid ?? `${symbol}-${link}-${index}`,
      time: formatNewsTime(item.providerPublishTime ?? ""),
      source: cleanText(item.publisher ?? new URL(link).hostname.replace(/^www\./, "")),
      subject: `${related} / 公开新闻`,
      title: translatedTitle,
      summary: `【${tags.join("、")}】${symbol}相关资讯：${translatedTitle}`,
      url: link,
    };
  }));

  return mapped.filter((item): item is NewsItem => item != null);
}

export async function loadNewsItems() {
  const settled = await Promise.allSettled(trackedSymbols.map(fetchSymbolNews));
  const errors = settled
    .filter((result): result is PromiseRejectedResult => result.status === "rejected")
    .map((result) => (result.reason instanceof Error ? result.reason.message : "news error"));

  const byUrl = new Map<string, NewsItem>();
  settled.forEach((result) => {
    if (result.status !== "fulfilled") return;
    result.value.forEach((item) => {
      if (!item.url) return;
      const existing = byUrl.get(item.url);
      if (!existing) byUrl.set(item.url, item);
      else byUrl.set(item.url, { ...existing, subject: `${existing.subject} / ${item.subject.split(" / ")[0]}` });
    });
  });

  const items = Array.from(byUrl.values()).slice(0, 12);
  return {
    items,
    errors,
    source: items.length > 0 ? "Yahoo Finance Search" : "资讯抓取失败",
  };
}
