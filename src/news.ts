export type NewsItem = {
  id: string;
  time: string;
  source: string;
  subject: string;
  title: string;
  summary: string;
  url: string;
};

const trackedSymbols = ["VRT", "MRVL", "COHR"];

const companyNames: Record<string, string> = {
  VRT: "Vertiv",
  MRVL: "Marvell",
  COHR: "Coherent",
};

const relevanceKeywords: Record<string, string[]> = {
  VRT: ["vertiv", "vrt", "data center power", "liquid cooling", "thermal management", "cooling", "power systems"],
  MRVL: ["marvell", "mrvl", "custom silicon", "custom chip", "asic", "pam4", "interconnect", "electro-optics"],
  COHR: ["coherent", "cohr", "optical", "photonics", "transceiver", "800g", "1.6t", "cpo", "indium phosphide"],
};

export const fallbackNews: NewsItem[] = [];

function cleanText(value: string) {
  const doc = new DOMParser().parseFromString(value, "text/html");
  return (doc.body.textContent ?? value).replace(/\s+/g, " ").trim();
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

type YahooSearchNewsItem = {
  uuid?: string;
  title?: string;
  publisher?: string;
  link?: string;
  providerPublishTime?: number;
  relatedTickers?: string[];
};

function getTags(title: string) {
  const lower = title.toLowerCase();
  const tags: string[] = [];

  if (lower.includes("upgrade") || lower.includes("price target") || lower.includes("analyst")) tags.push("大行观点/目标价");
  if (lower.includes("earnings") || lower.includes("revenue") || lower.includes("margin") || lower.includes("guidance")) {
    tags.push("财报与指引");
  }
  if (lower.includes("ai") || lower.includes("data center")) tags.push("AI数据中心");
  if (lower.includes("cooling") || lower.includes("power")) tags.push("电力/散热");
  if (lower.includes("custom") || lower.includes("asic") || lower.includes("interconnect")) tags.push("定制芯片/互联");
  if (lower.includes("optical") || lower.includes("photonics") || lower.includes("transceiver") || lower.includes("cpo")) {
    tags.push("光通信");
  }

  return tags.length > 0 ? tags : ["公开新闻"];
}

function isRelevant(symbol: string, item: YahooSearchNewsItem) {
  const title = (item.title ?? "").toLowerCase();
  const related = item.relatedTickers ?? [];
  const keywords = relevanceKeywords[symbol] ?? [symbol.toLowerCase()];
  return related.includes(symbol) || keywords.some((keyword) => title.includes(keyword));
}

async function fetchYahooSearchNews(query: string): Promise<YahooSearchNewsItem[]> {
  const params = new URLSearchParams({
    q: query,
    quotesCount: "0",
    newsCount: "10",
    listsCount: "0",
    enableFuzzyQuery: "false",
    region: "US",
    lang: "en-US",
  });
  const response = await fetch(`/yahoo/v1/finance/search?${params.toString()}`);
  if (!response.ok) throw new Error(`news ${query} ${response.status}`);

  const data = await response.json();
  return (data?.news ?? []) as YahooSearchNewsItem[];
}

async function fetchSymbolNews(symbol: string): Promise<NewsItem[]> {
  const company = companyNames[symbol] ?? symbol;
  const searches = await Promise.allSettled([
    fetchYahooSearchNews(`${symbol} stock`),
    fetchYahooSearchNews(`${company} AI data center`),
    fetchYahooSearchNews(`${company} earnings analyst`),
  ]);

  const rawItems = searches.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
  const unique = new Map<string, YahooSearchNewsItem>();
  rawItems.forEach((item) => {
    const key = item.link || item.uuid || item.title;
    if (key && !unique.has(key)) unique.set(key, item);
  });

  const items = Array.from(unique.values());
  const relevantItems = items.filter((item) => isRelevant(symbol, item));
  const usableItems = relevantItems.length > 0 ? relevantItems : items.slice(0, 3);

  const mapped = await Promise.all(
    usableItems.slice(0, 8).map(async (item, index) => {
      const title = cleanText(item.title ?? `${symbol} news`);
      const link = item.link ?? "";
      if (!link || !title) return null;
      const translatedTitle = await translateToChinese(title);
      const tags = getTags(title);

      return {
        id: item.uuid ?? `${symbol}-${link}-${index}`,
        time: formatNewsTime(item.providerPublishTime ?? ""),
        source: cleanText(item.publisher ?? new URL(link).hostname.replace(/^www\./, "")),
        subject: `${symbol} / ${tags[0]}`,
        title: translatedTitle,
        summary: `【${tags.join("、")}】主旨：${translatedTitle}`,
        url: link,
      };
    }),
  );

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
