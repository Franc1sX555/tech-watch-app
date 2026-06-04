export type MarketSnapshot = {
  qqqChange: number;
  smhChange: number;
  nvdaChange: number;
  googlChange: number;
  avgoChange: number;
  msftChange: number;
  tslaChange: number;
  vixChange: number;
  tenYearYield: number;
  tenYearYieldChangeBp: number;
  dxyChange: number;
  okxDeviationPct: number;
};

export type OkxContractQuote = {
  symbol: string;
  instId: string;
  last: number;
  mark: number | null;
  stockReference: number;
  deviationPct: number;
};

export type SnapshotResult = {
  snapshot: MarketSnapshot;
  fetchedAt: Date;
  source: string;
  errors: string[];
  okxContracts: OkxContractQuote[];
};

export const fallbackSnapshot: MarketSnapshot = {
  qqqChange: 0.8,
  smhChange: 1.3,
  nvdaChange: 1.7,
  googlChange: 0.9,
  avgoChange: 0.4,
  msftChange: 0.2,
  tslaChange: -1.1,
  vixChange: -3.5,
  tenYearYield: 4.82,
  tenYearYieldChangeBp: 2,
  dxyChange: -0.1,
  okxDeviationPct: 0.3,
};

type YahooQuote = {
  price: number;
  previousClose: number;
};

const yahooSymbols = {
  QQQ: "QQQ",
  SMH: "SMH",
  NVDA: "NVDA",
  GOOGL: "GOOGL",
  AVGO: "AVGO",
  MSFT: "MSFT",
  TSLA: "TSLA",
  VIX: "^VIX",
  TNX: "^TNX",
  DXY: "DX-Y.NYB",
};

function pctChange(quote: YahooQuote) {
  if (!Number.isFinite(quote.previousClose) || quote.previousClose === 0) return 0;
  return ((quote.price - quote.previousClose) / quote.previousClose) * 100;
}

async function fetchYahooQuote(symbol: string): Promise<YahooQuote> {
  const url = `/yahoo/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${symbol} ${response.status}`);

  const data = await response.json();
  const result = data?.chart?.result?.[0];
  const meta = result?.meta;
  const closes = result?.indicators?.quote?.[0]?.close?.filter((value: number | null) => value != null);
  const price = Number(meta?.regularMarketPrice ?? closes?.at(-1));
  const previousClose = Number(meta?.chartPreviousClose ?? closes?.at(-2));

  if (!Number.isFinite(price) || !Number.isFinite(previousClose)) {
    throw new Error(`${symbol} quote missing`);
  }

  return { price, previousClose };
}

type OkxInstrument = {
  instId: string;
  uly?: string;
  instFamily?: string;
  baseCcy?: string;
  quoteCcy?: string;
  state?: string;
};

type OkxTicker = {
  instId: string;
  last: string;
};

type OkxMarkPrice = {
  instId: string;
  markPx: string;
};

async function fetchOkxJson<T>(path: string): Promise<T[]> {
  const response = await fetch(`/okx${path}`);
  if (!response.ok) throw new Error(`OKX ${path} ${response.status}`);
  const data = await response.json();
  if (data?.code !== "0") throw new Error(`OKX ${path} ${data?.msg ?? data?.code}`);
  return data?.data ?? [];
}

function findOkxInstrument(symbol: string, instruments: OkxInstrument[]) {
  const live = instruments.filter((instrument) => instrument.state === "live");
  const exact = live.find((instrument) => instrument.instId === `${symbol}-USDT-SWAP`);
  if (exact) return exact;

  return live.find((instrument) => {
    const searchable = [
      instrument.instId,
      instrument.uly,
      instrument.instFamily,
      instrument.baseCcy,
    ]
      .filter(Boolean)
      .join(" ")
      .toUpperCase();

    return searchable.includes(symbol);
  });
}

async function fetchOkxContracts(stockPrices: Record<string, number>) {
  const symbols = Object.keys(stockPrices);
  const [instruments, tickers, marks] = await Promise.all([
    fetchOkxJson<OkxInstrument>("/api/v5/public/instruments?instType=SWAP"),
    fetchOkxJson<OkxTicker>("/api/v5/market/tickers?instType=SWAP"),
    fetchOkxJson<OkxMarkPrice>("/api/v5/public/mark-price?instType=SWAP"),
  ]);

  const tickerMap = new Map(tickers.map((ticker) => [ticker.instId, ticker]));
  const markMap = new Map(marks.map((mark) => [mark.instId, mark]));

  return symbols.flatMap((symbol) => {
    const instrument = findOkxInstrument(symbol, instruments);
    if (!instrument) return [];

    const ticker = tickerMap.get(instrument.instId);
    const last = Number(ticker?.last);
    if (!Number.isFinite(last)) return [];

    const mark = Number(markMap.get(instrument.instId)?.markPx);
    const usablePrice = Number.isFinite(mark) && mark > 0 ? mark : last;
    const stockReference = stockPrices[symbol];
    const deviationPct = ((usablePrice - stockReference) / stockReference) * 100;

    return [
      {
        symbol,
        instId: instrument.instId,
        last,
        mark: Number.isFinite(mark) ? mark : null,
        stockReference,
        deviationPct,
      },
    ];
  });
}

export async function loadMarketSnapshot(): Promise<SnapshotResult> {
  const errors: string[] = [];

  try {
    const [
      qqq,
      smh,
      nvda,
      googl,
      avgo,
      msft,
      tsla,
      vix,
      tnx,
      dxy,
    ] = await Promise.all([
      fetchYahooQuote(yahooSymbols.QQQ),
      fetchYahooQuote(yahooSymbols.SMH),
      fetchYahooQuote(yahooSymbols.NVDA),
      fetchYahooQuote(yahooSymbols.GOOGL),
      fetchYahooQuote(yahooSymbols.AVGO),
      fetchYahooQuote(yahooSymbols.MSFT),
      fetchYahooQuote(yahooSymbols.TSLA),
      fetchYahooQuote(yahooSymbols.VIX),
      fetchYahooQuote(yahooSymbols.TNX),
      fetchYahooQuote(yahooSymbols.DXY),
    ]);

    const tenYearYield = tnx.price / 10;
    const previousTenYearYield = tnx.previousClose / 10;
    let okxContracts: OkxContractQuote[] = [];
    try {
      okxContracts = await fetchOkxContracts({
        NVDA: nvda.price,
        GOOGL: googl.price,
        AVGO: avgo.price,
        MSFT: msft.price,
        TSLA: tsla.price,
      });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "OKX contract scan failed");
    }

    const okxDeviationPct =
      okxContracts.length > 0
        ? Math.max(...okxContracts.map((contract) => Math.abs(contract.deviationPct)))
        : 0;

    return {
      fetchedAt: new Date(),
      source: okxContracts.length > 0 ? "Yahoo Finance + OKX public" : "Yahoo Finance；OKX未发现匹配股票合约",
      errors,
      okxContracts,
      snapshot: {
        qqqChange: pctChange(qqq),
        smhChange: pctChange(smh),
        nvdaChange: pctChange(nvda),
        googlChange: pctChange(googl),
        avgoChange: pctChange(avgo),
        msftChange: pctChange(msft),
        tslaChange: pctChange(tsla),
        vixChange: pctChange(vix),
        tenYearYield,
        tenYearYieldChangeBp: (tenYearYield - previousTenYearYield) * 100,
        dxyChange: pctChange(dxy),
        okxDeviationPct,
      },
    };
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "unknown market data error");
    return {
      snapshot: fallbackSnapshot,
      fetchedAt: new Date(),
      source: "备用演示快照",
      errors,
      okxContracts: [],
    };
  }
}
