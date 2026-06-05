import { useEffect, useMemo, useState } from "react";
import {
  fallbackSnapshot,
  loadMarketSnapshot,
  type CoreSymbol,
  type MarketSnapshot,
  type SnapshotResult,
} from "./data";
import { majorEvents } from "./events";
import { fallbackNews, loadNewsItems, type NewsItem } from "./news";
import "./index.css";

type Check = {
  label: string;
  rule: string;
  value: string;
  passed: boolean;
  detail: string;
};

type Cluster = {
  id: string;
  name: string;
  score: number;
  max: number;
  summary: string;
  checks: Check[];
};

const coreSymbols: CoreSymbol[] = ["VRT", "MRVL", "COHR"];

const symbolNames: Record<CoreSymbol, string> = {
  VRT: "电力与液冷",
  MRVL: "定制芯片与互联",
  COHR: "光通信与光子器件",
};

const stopLines: Record<CoreSymbol, string> = {
  VRT: "跌破20日线减仓，财报前不满仓追涨",
  MRVL: "跌破相对SMH强势减仓，财报前控制杠杆",
  COHR: "波动最大，跌破短期支撑先减半",
};

function boolScore(passed: boolean, points: number) {
  return passed ? points : 0;
}

function formatPct(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function buildClusters(s: MarketSnapshot): Cluster[] {
  const marketChecks: Check[] = [
    {
      label: "科技风险偏好",
      rule: "QQQ日涨跌幅 > 0",
      value: formatPct(s.qqqChange),
      passed: s.qqqChange > 0,
      detail: "QQQ代表大型成长股风险偏好。若QQQ转弱，VRT/MRVL/COHR这类高beta科技链标的不宜主动扩仓。",
    },
    {
      label: "半导体链强度",
      rule: "SMH日涨跌幅 > QQQ日涨跌幅",
      value: `SMH ${formatPct(s.smhChange)} / QQQ ${formatPct(s.qqqChange)}`,
      passed: s.smhChange > s.qqqChange,
      detail: "MRVL和COHR都受AI半导体与网络链情绪影响。SMH跑赢QQQ，说明AI硬件主线仍有资金承接。",
    },
    {
      label: "AI核心锚",
      rule: "NVDA日涨跌幅 >= QQQ日涨跌幅 - 0.50%",
      value: `NVDA ${formatPct(s.nvdaChange)} / 阈值 ${formatPct(s.qqqChange - 0.5)}`,
      passed: s.nvdaChange >= s.qqqChange - 0.5,
      detail: "即使不持有NVDA，它仍是AI基础设施交易的情绪锚。NVDA明显走弱时，下游AI链条也容易降温。",
    },
  ];

  const macroChecks: Check[] = [
    {
      label: "10年美债绝对水平",
      rule: "10年美债收益率 < 5.00%",
      value: `${s.tenYearYield.toFixed(2)}%`,
      passed: s.tenYearYield < 5,
      detail: "5%常被视为成长股估值压力线。VRT/MRVL/COHR估值弹性较高，利率越接近5%，越不适合满仓3x。",
    },
    {
      label: "10年美债单日变化",
      rule: "10年美债单日上行 <= 8bp",
      value: `${s.tenYearYieldChangeBp > 0 ? "+" : ""}${s.tenYearYieldChangeBp.toFixed(0)}bp`,
      passed: s.tenYearYieldChangeBp <= 8,
      detail: "利率快速上行会直接压制成长股估值，并提高高杠杆仓位的回撤风险。",
    },
    {
      label: "波动率",
      rule: "VIX日涨跌幅 <= 10%",
      value: formatPct(s.vixChange),
      passed: s.vixChange <= 10,
      detail: "VIX快速上行意味着市场风险溢价抬升，3x合约滑点和情绪性止损都会更严重。",
    },
    {
      label: "美元压力",
      rule: "DXY日涨跌幅 <= 0.50%",
      value: formatPct(s.dxyChange),
      passed: s.dxyChange <= 0.5,
      detail: "美元快速走强通常压制风险资产，也会影响科技成长股的全球收入预期。",
    },
  ];

  const coreChanges = [s.vrtChange, s.mrvlChange, s.cohrChange];
  const coreBeatQqq = coreChanges.filter((value) => value > s.qqqChange).length;
  const coreBeatSmh = coreChanges.filter((value) => value > s.smhChange).length;
  const coreChecks: Check[] = [
    {
      label: "VRT电力散热确认",
      rule: "VRT日涨跌幅 > QQQ日涨跌幅",
      value: `VRT ${formatPct(s.vrtChange)} / QQQ ${formatPct(s.qqqChange)}`,
      passed: s.vrtChange > s.qqqChange,
      detail: "VRT代表AI数据中心电力、散热和基础设施需求。跑赢QQQ说明资金认可AI算力扩建的非芯片环节。",
    },
    {
      label: "MRVL定制芯片确认",
      rule: "MRVL日涨跌幅 > SMH日涨跌幅",
      value: `MRVL ${formatPct(s.mrvlChange)} / SMH ${formatPct(s.smhChange)}`,
      passed: s.mrvlChange > s.smhChange,
      detail: "MRVL需要跑赢半导体ETF，才说明资金在买定制AI芯片和高速互联的超额弹性。",
    },
    {
      label: "COHR光通信确认",
      rule: "COHR日涨跌幅 > SMH日涨跌幅",
      value: `COHR ${formatPct(s.cohrChange)} / SMH ${formatPct(s.smhChange)}`,
      passed: s.cohrChange > s.smhChange,
      detail: "COHR代表800G/1.6T、CPO、光模块与光子器件。它跑赢SMH时，光通信主线更有持续性。",
    },
    {
      label: "三股组合广度",
      rule: "VRT/MRVL/COHR至少2只跑赢QQQ",
      value: `${coreBeatQqq}/3只跑赢QQQ，${coreBeatSmh}/3只跑赢SMH`,
      passed: coreBeatQqq >= 2,
      detail: "三只里至少两只跑赢QQQ，说明不是单票异动，而是AI基础设施组合整体被资金确认。",
    },
  ];

  const okxChecks: Check[] = [
    {
      label: "合约偏离",
      rule: "|OKX合约价 - 美股现货参考价| <= 1.20%",
      value: `${Math.abs(s.okxDeviationPct).toFixed(2)}%`,
      passed: Math.abs(s.okxDeviationPct) <= 1.2,
      detail: "你真实交易的是OKX TradFi合约。偏离过大时，即使股票信号好，也应先暂停加仓。",
    },
  ];

  return [
    {
      id: "market",
      name: "大盘与AI硬件链",
      score:
        boolScore(marketChecks[0].passed, 8) +
        boolScore(marketChecks[1].passed, 10) +
        boolScore(marketChecks[2].passed, 7),
      max: 25,
      summary: "判断VRT/MRVL/COHR所在的AI基础设施交易是否仍处顺风。",
      checks: marketChecks,
    },
    {
      id: "macro",
      name: "宏观利率",
      score:
        boolScore(macroChecks[0].passed, 9) +
        boolScore(macroChecks[1].passed, 7) +
        boolScore(macroChecks[2].passed, 5) +
        boolScore(macroChecks[3].passed, 4),
      max: 25,
      summary: "衡量10年美债、美元和波动率是否压制高beta科技仓。",
      checks: macroChecks,
    },
    {
      id: "core",
      name: "核心三股",
      score:
        boolScore(coreChecks[0].passed, 8) +
        boolScore(coreChecks[1].passed, 8) +
        boolScore(coreChecks[2].passed, 8) +
        boolScore(coreChecks[3].passed, 6),
      max: 30,
      summary: "验证电力散热、定制芯片、光通信三条链是否同步得到资金确认。",
      checks: coreChecks,
    },
    {
      id: "okx",
      name: "OKX合约",
      score: boolScore(okxChecks[0].passed, 20),
      max: 20,
      summary: "检查实际交易合约是否存在价格偏离和执行风险。",
      checks: okxChecks,
    },
  ];
}

function buildResult(snapshot: MarketSnapshot) {
  const clusters = buildClusters(snapshot);
  const score = clusters.reduce((sum, cluster) => sum + cluster.score, 0);

  let action = "中性，持有不加仓";
  let totalExposure = 57;
  let target: Record<CoreSymbol | "CASH", number> = { VRT: 20, MRVL: 18, COHR: 19, CASH: 43 };

  if (score >= 85) {
    action = "强势进攻，可加仓但保留现金";
    totalExposure = 75;
    target = { VRT: 26, MRVL: 23, COHR: 26, CASH: 25 };
  } else if (score >= 70) {
    action = "偏强，小幅加仓或继续持有";
    totalExposure = 65;
    target = { VRT: 23, MRVL: 20, COHR: 22, CASH: 35 };
  } else if (score >= 55) {
    action = "中性，持有不加仓";
    totalExposure = 57;
    target = { VRT: 20, MRVL: 18, COHR: 19, CASH: 43 };
  } else if (score >= 40) {
    action = "偏弱，减仓20%-30%";
    totalExposure = 40;
    target = { VRT: 14, MRVL: 12, COHR: 14, CASH: 60 };
  } else {
    action = "高风险，降至轻仓或空仓";
    totalExposure = 15;
    target = { VRT: 6, MRVL: 4, COHR: 5, CASH: 85 };
  }

  const smhVsQqq = snapshot.smhChange - snapshot.qqqChange;
  const coreBeatCount = [snapshot.vrtChange, snapshot.mrvlChange, snapshot.cohrChange].filter(
    (value) => value > snapshot.qqqChange,
  ).length;

  const briefing = [
    `盘面上QQQ ${formatPct(snapshot.qqqChange)}，SMH ${formatPct(snapshot.smhChange)}，半导体相对QQQ ${
      smhVsQqq >= 0 ? "跑赢" : "跑输"
    } ${Math.abs(smhVsQqq).toFixed(2)}个百分点；这决定MRVL/COHR这类AI硬件链是否顺风。`,
    `组合内VRT ${formatPct(snapshot.vrtChange)}、MRVL ${formatPct(snapshot.mrvlChange)}、COHR ${formatPct(
      snapshot.cohrChange,
    )}，其中${coreBeatCount}/3只跑赢QQQ；若低于2只，调仓以守为主。`,
    `宏观上10年美债 ${snapshot.tenYearYield.toFixed(2)}%，单日${
      snapshot.tenYearYieldChangeBp > 0 ? "+" : ""
    }${snapshot.tenYearYieldChangeBp.toFixed(0)}bp，VIX ${formatPct(snapshot.vixChange)}；当前建议为“${action}”。`,
  ];

  return { score, action, totalExposure, target, clusters, briefing };
}

function App() {
  const [openCluster, setOpenCluster] = useState<string | null>(null);
  const [marketResult, setMarketResult] = useState<SnapshotResult>({
    snapshot: fallbackSnapshot,
    fetchedAt: new Date(),
    source: "初始备用快照",
    errors: [],
    okxContracts: [],
  });
  const [newsItems, setNewsItems] = useState<NewsItem[]>(fallbackNews);
  const [newsSource, setNewsSource] = useState("初始备用资讯");
  const [newsErrors, setNewsErrors] = useState<string[]>([]);
  const [newsPage, setNewsPage] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [accountValue, setAccountValue] = useState(10_000);
  const [currentPositions, setCurrentPositions] = useState<Record<CoreSymbol, number>>({
    VRT: 2000,
    MRVL: 1800,
    COHR: 1900,
  });

  async function refreshMarketData() {
    setIsRefreshing(true);
    try {
      const [next, news] = await Promise.all([loadMarketSnapshot(), loadNewsItems()]);
      setMarketResult(next);
      setNewsItems(news.items);
      setNewsSource(news.source);
      setNewsErrors(news.errors);
      setNewsPage(0);
    } finally {
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    void refreshMarketData();
  }, []);

  const snapshot = marketResult.snapshot;
  const result = buildResult(snapshot);
  const holdingsBoard = [
    {
      symbol: "VRT",
      role: symbolNames.VRT,
      price: snapshot.vrtPrice,
      change: snapshot.vrtChange,
    },
    {
      symbol: "MRVL",
      role: symbolNames.MRVL,
      price: snapshot.mrvlPrice,
      change: snapshot.mrvlChange,
    },
    {
      symbol: "COHR",
      role: symbolNames.COHR,
      price: snapshot.cohrPrice,
      change: snapshot.cohrChange,
    },
  ];
  const currentInvested = coreSymbols.reduce((sum, symbol) => sum + currentPositions[symbol], 0);
  const currentCashValue = Math.max(0, accountValue - currentInvested);

  const rebalanceRows = useMemo(() => {
    return [...coreSymbols, "CASH" as const].map((name) => {
      const currentValue = name === "CASH" ? currentCashValue : currentPositions[name];
      const current = accountValue > 0 ? (currentValue / accountValue) * 100 : 0;
      const target = result.target[name];
      const targetValue = (accountValue * target) / 100;
      const diffPct = target - current;
      const tradeValue = targetValue - currentValue;
      let suggestion = "不动";
      if (diffPct >= 3) suggestion = `买入 ${formatMoney(tradeValue)}`;
      if (diffPct <= -3) suggestion = `卖出 ${formatMoney(Math.abs(tradeValue))}`;
      return { name, current, currentValue, target, targetValue, diffPct, suggestion };
    });
  }, [accountValue, currentCashValue, currentPositions, result.target]);

  const visibleNews = useMemo(() => {
    if (newsItems.length <= 3) return newsItems;
    const start = (newsPage * 3) % newsItems.length;
    const chunk = newsItems.slice(start, start + 3);
    if (chunk.length === 3) return chunk;
    return [...chunk, ...newsItems.slice(0, 3 - chunk.length)];
  }, [newsItems, newsPage]);

  const updatedAtText = marketResult.fetchedAt.toLocaleTimeString("zh-CN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <main className="app">
      <section className="hero">
        <div className="heroMeta">
          <div className="eyebrow">AI基础设施3x TradFi盯盘</div>
          <button className="refreshButton" disabled={isRefreshing} onClick={refreshMarketData}>
            {isRefreshing ? "刷新中" : "刷新"} {updatedAtText}
          </button>
        </div>
        <div className="heroTop">
          <div>
            <div className="score">{result.score}</div>
            <div className="scoreLabel">今日总分 / 100</div>
          </div>
          <div className="actionBox">
            <div className="actionTitle">操作建议</div>
            <div className="actionText">{result.action}</div>
            <div className="exposure">建议总3x仓位：{result.totalExposure}%</div>
          </div>
        </div>
        <div className="briefing">
          {result.briefing.map((line) => (
            <p key={line}>{line}</p>
          ))}
          <p className={marketResult.errors.length > 0 ? "dataSource warn" : "dataSource"}>
            数据源：{marketResult.source}
            {marketResult.errors.length > 0 ? `；抓取异常：${marketResult.errors.join("；")}` : ""}
          </p>
        </div>
      </section>

      <section className="panel">
        <h2>持仓看板</h2>
        <div className="tickerGrid">
          {holdingsBoard.map((item) => (
            <div className="tickerCard" key={item.symbol}>
              <div>
                <strong>{item.symbol}</strong>
                <span>{item.role}</span>
              </div>
              <b>${item.price.toFixed(2)}</b>
              <em className={item.change >= 0 ? "up" : "down"}>{formatPct(item.change)}</em>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>市场风控仪表盘</h2>
        {result.clusters.map((cluster) => (
          <button
            className="cluster"
            key={cluster.id}
            onClick={() => setOpenCluster(openCluster === cluster.id ? null : cluster.id)}
          >
            <div className="clusterTop">
              <div>
                <strong>{cluster.name}</strong>
                <span>{cluster.summary}</span>
              </div>
              <b>
                {cluster.score}/{cluster.max}
              </b>
            </div>
            {openCluster === cluster.id && (
              <>
                <div className="checks">
                  {cluster.checks.map((check) => (
                    <div className="check" key={check.label}>
                      <div className={check.passed ? "signalIcon pass" : "signalIcon fail"}>
                        {check.passed ? "OK" : "!"}
                      </div>
                      <div>
                        <div className="checkHeader">
                          <strong>{check.label}</strong>
                          <span className={check.passed ? "metricValue good" : "metricValue bad"}>
                            {check.value}
                          </span>
                        </div>
                        <code>{check.rule}</code>
                        <p>{check.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
                {cluster.id === "okx" && (
                  <div className="okxInline">
                    {marketResult.okxContracts.length === 0 ? (
                      <div className="emptyState">
                        暂未发现匹配的OKX股票合约，OKX偏离评分暂按0%处理。
                      </div>
                    ) : (
                      marketResult.okxContracts.map((contract) => (
                        <div className="row" key={contract.instId}>
                          <div>
                            <strong>
                              {contract.symbol} · {contract.instId}
                            </strong>
                            <span>
                              最新 {contract.last.toFixed(2)}
                              {contract.mark ? ` / 标记 ${contract.mark.toFixed(2)}` : ""} / 现货参考{" "}
                              {contract.stockReference.toFixed(2)}
                            </span>
                          </div>
                          <b className={Math.abs(contract.deviationPct) <= 1.2 ? "up" : "down"}>
                            {contract.deviationPct > 0 ? "+" : ""}
                            {contract.deviationPct.toFixed(2)}%
                          </b>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </>
            )}
          </button>
        ))}
      </section>

      <section className="panel">
        <h2>目标配置</h2>
        <div className="allocations">
          {coreSymbols.map((symbol) => (
            <div key={symbol}>
              <span>
                {symbol} · {symbolNames[symbol]}
              </span>
              <strong>{result.target[symbol]}%</strong>
            </div>
          ))}
          <div>
            <span>空仓/现金</span>
            <strong>{result.target.CASH}%</strong>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>调仓助手</h2>
        <p className="hint">
          输入账户总资产和当前每个合约的持仓金额。系统会自动计算当前占比，并换算每个TradFi合约应买入或卖出的金额。
        </p>
        <label className="assetInput">
          <span>账户总资产规模（USDT）</span>
          <input min="0" type="number" value={accountValue} onChange={(event) => setAccountValue(Number(event.target.value || 0))} />
        </label>
        <div className="inputs">
          {coreSymbols.map((symbol) => (
            <label key={symbol}>
              <span>{symbol}持仓USDT</span>
              <input
                min="0"
                type="number"
                value={currentPositions[symbol]}
                onChange={(event) =>
                  setCurrentPositions((prev) => ({
                    ...prev,
                    [symbol]: Number(event.target.value || 0),
                  }))
                }
              />
            </label>
          ))}
        </div>
        {rebalanceRows.map((row) => (
          <div className="row" key={row.name}>
            <div>
              <strong>{row.name === "CASH" ? "空仓/现金" : row.name}</strong>
              <span>
                当前 {formatMoney(row.currentValue)} ({row.current.toFixed(1)}%) / 目标 {formatMoney(row.targetValue)} (
                {row.target}%)
                {row.name !== "CASH" ? ` / ${stopLines[row.name]}` : ""}
              </span>
            </div>
            <b className={row.diffPct > 0 ? "up" : row.diffPct < 0 ? "down" : ""}>{row.suggestion}</b>
          </div>
        ))}
      </section>

      <section className="panel">
        <h2>重大事件日历</h2>
        <div className="eventList">
          {majorEvents.map((event) => (
            <a href={event.url} target="_blank" rel="noreferrer" className="eventItem" key={`${event.date}-${event.title}`}>
              <div className="eventDate">
                <strong>{event.date.slice(5)}</strong>
                <span>{event.time}</span>
              </div>
              <div>
                <div className="eventMeta">
                  <span>{event.category}</span>
                  <span>{event.source}</span>
                </div>
                <strong>{event.title}</strong>
                <em>{event.subject}</em>
                <p>{event.detail}</p>
              </div>
            </a>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panelHeader">
          <h2>资讯与研报线索</h2>
          <button className="miniButton" disabled={newsItems.length <= 3} onClick={() => setNewsPage((page) => page + 1)}>
            换一批
          </button>
        </div>
        <p className={newsErrors.length > 0 ? "hint warnText" : "hint"}>
          数据源：{newsSource}
          {newsErrors.length > 0 ? `；部分资讯抓取异常：${newsErrors.join("；")}` : ""}
        </p>
        {visibleNews.length === 0 ? (
          <div className="emptyState">暂未抓取到可用资讯。请点击右上角刷新重试。</div>
        ) : (
          <div className="newsList">
            {visibleNews.map((item) => (
              <a href={item.url} target="_blank" rel="noreferrer" className="news" key={item.id}>
                <div className="newsMeta">
                  <span>{item.time}</span>
                  <span>{item.source}</span>
                </div>
                <em>{item.subject}</em>
                <strong>{item.title}</strong>
                <p>{item.summary}</p>
              </a>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

export default App;
