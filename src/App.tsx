import { useEffect, useMemo, useState } from "react";
import {
  fallbackSnapshot,
  loadMarketSnapshot,
  type MarketSnapshot,
  type SnapshotResult,
} from "./data";
import { fallbackNews, loadNewsItems, type NewsItem } from "./news";
import "./index.css";

type ContractSymbol = "NVDA" | "GOOGL" | "AVGO" | "MSFT" | "TSLA";

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

const contractNames: ContractSymbol[] = ["NVDA", "GOOGL", "AVGO", "MSFT", "TSLA"];

const stopLines: Record<ContractSymbol, string> = {
  NVDA: "跌破205减半，跌破198清3x",
  GOOGL: "跌破350减半，跌破340清3x",
  AVGO: "跌破390减半，跌破375清3x",
  MSFT: "观察仓，不作为3x主攻",
  TSLA: "事件仓，跌破400降仓，跌破385不碰",
};

function boolScore(passed: boolean, points: number) {
  return passed ? points : 0;
}

function buildClusters(s: MarketSnapshot): Cluster[] {
  const marketChecks: Check[] = [
    {
      label: "科技大盘",
      rule: "QQQ日涨跌幅 > 0",
      value: formatPct(s.qqqChange),
      passed: s.qqqChange > 0,
      detail: "QQQ代表大型科技股整体风险偏好。QQQ转弱时，3x科技仓位不宜扩张。",
    },
    {
      label: "半导体相对强度",
      rule: "SMH日涨跌幅 > QQQ日涨跌幅",
      value: `SMH ${formatPct(s.smhChange)} / QQQ ${formatPct(s.qqqChange)}`,
      passed: s.smhChange > s.qqqChange,
      detail: "AI行情的第一驱动力仍是半导体和数据中心。SMH强于QQQ，说明主线资金仍在硬件链。",
    },
    {
      label: "半导体绝对方向",
      rule: "SMH日涨跌幅 > 0",
      value: formatPct(s.smhChange),
      passed: s.smhChange > 0,
      detail: "相对强度不够，还要看板块本身是否上涨。绝对下跌时不适合激进加3x仓。",
    },
  ];

  const macroChecks: Check[] = [
    {
      label: "10年美债绝对水平",
      rule: "10年美债收益率 < 5.00%",
      value: `${s.tenYearYield.toFixed(2)}%`,
      passed: s.tenYearYield < 5,
      detail: "5%常被市场视为成长股估值压力区。接近或突破5%时，科技股估值容错率会明显下降。",
    },
    {
      label: "10年美债单日变化",
      rule: "10年美债单日上行 <= 8bp",
      value: `${s.tenYearYieldChangeBp > 0 ? "+" : ""}${s.tenYearYieldChangeBp.toFixed(0)}bp`,
      passed: s.tenYearYieldChangeBp <= 8,
      detail: "收益率单日快速上行代表折现率冲击。即使绝对水平没破5%，快速上行也会压制高估值科技股。",
    },
    {
      label: "波动率",
      rule: "VIX日涨跌幅 <= 10%",
      value: formatPct(s.vixChange),
      passed: s.vixChange <= 10,
      detail: "VIX快速上升时，3x合约更容易出现滑点、追保压力和情绪性止损。",
    },
    {
      label: "美元压力",
      rule: "DXY日涨跌幅 <= 0.50%",
      value: formatPct(s.dxyChange),
      passed: s.dxyChange <= 0.5,
      detail: "美元快速走强通常压制风险资产，也会影响大型科技公司的海外收入折算预期。",
    },
  ];

  const coreChecks: Check[] = [
    {
      label: "NVDA主线确认",
      rule: "NVDA日涨跌幅 > QQQ日涨跌幅",
      value: `NVDA ${formatPct(s.nvdaChange)} / QQQ ${formatPct(s.qqqChange)}`,
      passed: s.nvdaChange > s.qqqChange,
      detail: "NVDA是AI算力链核心开关。它强于QQQ，说明市场仍认可AI基础设施主线。",
    },
    {
      label: "GOOGL补涨确认",
      rule: "GOOGL日涨跌幅 > QQQ日涨跌幅",
      value: `GOOGL ${formatPct(s.googlChange)} / QQQ ${formatPct(s.qqqChange)}`,
      passed: s.googlChange > s.qqqChange,
      detail: "GOOGL强于QQQ，说明资金不只买芯片，也在买AI云、搜索和应用变现。",
    },
    {
      label: "AVGO修复确认",
      rule: "AVGO日涨跌幅 > QQQ日涨跌幅",
      value: `AVGO ${formatPct(s.avgoChange)} / QQQ ${formatPct(s.qqqChange)}`,
      passed: s.avgoChange > s.qqqChange,
      detail: "AVGO代表定制AI芯片和网络。它强于QQQ，说明财报后修复和ASIC主线被资金接受。",
    },
    {
      label: "核心三股广度",
      rule: "NVDA/GOOGL/AVGO至少2只强于QQQ",
      value: `${[s.nvdaChange, s.googlChange, s.avgoChange].filter((v) => v > s.qqqChange).length}/3只跑赢QQQ`,
      passed: [s.nvdaChange, s.googlChange, s.avgoChange].filter((v) => v > s.qqqChange).length >= 2,
      detail: "只靠一只股票拉升容易是假强。至少两只核心股跑赢QQQ，主线质量更高。",
    },
  ];

  const watchChecks: Check[] = [
    {
      label: "MSFT是否拖累企业AI",
      rule: "MSFT日涨跌幅 >= QQQ日涨跌幅 - 0.50%",
      value: `MSFT ${formatPct(s.msftChange)} / 阈值 ${formatPct(s.qqqChange - 0.5)}`,
      passed: s.msftChange >= s.qqqChange - 0.5,
      detail: "MSFT是企业AI和云的观察锚。它明显跑输时，说明资金可能不愿买AI应用端。",
    },
    {
      label: "TSLA事件风险",
      rule: "TSLA日跌幅 > -3.00%",
      value: formatPct(s.tslaChange),
      passed: s.tslaChange > -3,
      detail: "TSLA是事件驱动票。单日大跌往往来自监管、交付、Robotaxi或舆论风险，不宜拖累主组合。",
    },
  ];

  const okxChecks: Check[] = [
    {
      label: "合约偏离",
      rule: "|OKX合约价 - 美股现货参考价| <= 1.20%",
      value: `${Math.abs(s.okxDeviationPct).toFixed(2)}%`,
      passed: Math.abs(s.okxDeviationPct) <= 1.2,
      detail: "你真实交易的是OKX TradFi合约。偏离过大时，信号再好也应先暂停加仓，避免买在异常价格。",
    },
  ];

  return [
    {
      id: "market",
      name: "大盘与板块",
      score:
        boolScore(marketChecks[0].passed, 8) +
        boolScore(marketChecks[1].passed, 11) +
        boolScore(marketChecks[2].passed, 6),
      max: 25,
      summary: "判断科技股和半导体AI主线是否仍处在顺风状态。",
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
      summary: "衡量高估值科技股是否面对利率、美元和波动率冲击。",
      checks: macroChecks,
    },
    {
      id: "core",
      name: "核心个股",
      score:
        boolScore(coreChecks[0].passed, 9) +
        boolScore(coreChecks[1].passed, 7) +
        boolScore(coreChecks[2].passed, 7) +
        boolScore(coreChecks[3].passed, 7),
      max: 30,
      summary: "验证NVDA、GOOGL、AVGO三条投资逻辑是否同时得到资金确认。",
      checks: coreChecks,
    },
    {
      id: "watch",
      name: "观察票风险",
      score: boolScore(watchChecks[0].passed, 5) + boolScore(watchChecks[1].passed, 5),
      max: 10,
      summary: "MSFT和TSLA不决定主仓，但能提示AI应用端和事件风险的边际变化。",
      checks: watchChecks,
    },
    {
      id: "okx",
      name: "OKX合约",
      score: boolScore(okxChecks[0].passed, 10),
      max: 10,
      summary: "检查你实际交易的TradFi合约是否存在价格偏离风险。",
      checks: okxChecks,
    },
  ];
}

function buildResult(snapshot: MarketSnapshot) {
  const clusters = buildClusters(snapshot);
  const score = clusters.reduce((sum, cluster) => sum + cluster.score, 0);

  let action = "中性，持有不加仓";
  let totalExposure = 57;
  let target: Record<ContractSymbol | "CASH", number> = {
    NVDA: 22,
    GOOGL: 20,
    AVGO: 15,
    MSFT: 0,
    TSLA: 0,
    CASH: 43,
  };

  if (score >= 85) {
    action = "强势进攻，可加仓但仍保留现金";
    totalExposure = 75;
    target = { NVDA: 29, GOOGL: 25, AVGO: 19, MSFT: 2, TSLA: 0, CASH: 25 };
  } else if (score >= 70) {
    action = "偏强，小幅加仓或继续持有";
    totalExposure = 65;
    target = { NVDA: 25, GOOGL: 22, AVGO: 16, MSFT: 2, TSLA: 0, CASH: 35 };
  } else if (score >= 55) {
    action = "中性，持有不加仓";
    totalExposure = 57;
    target = { NVDA: 22, GOOGL: 20, AVGO: 15, MSFT: 0, TSLA: 0, CASH: 43 };
  } else if (score >= 40) {
    action = "偏弱，减仓20%-30%";
    totalExposure = 40;
    target = { NVDA: 15, GOOGL: 15, AVGO: 8, MSFT: 2, TSLA: 0, CASH: 60 };
  } else {
    action = "高风险，降至轻仓或空仓";
    totalExposure = 15;
    target = { NVDA: 8, GOOGL: 5, AVGO: 2, MSFT: 0, TSLA: 0, CASH: 85 };
  }

  const smhVsQqq = snapshot.smhChange - snapshot.qqqChange;
  const nvdaVsQqq = snapshot.nvdaChange - snapshot.qqqChange;
  const googlVsQqq = snapshot.googlChange - snapshot.qqqChange;
  const avgoVsQqq = snapshot.avgoChange - snapshot.qqqChange;
  const coreBeatCount = [snapshot.nvdaChange, snapshot.googlChange, snapshot.avgoChange].filter(
    (value) => value > snapshot.qqqChange,
  ).length;
  const briefing = [
    `盘面上QQQ ${formatPct(snapshot.qqqChange)}，SMH ${formatPct(snapshot.smhChange)}，半导体相对QQQ ${
      smhVsQqq >= 0 ? "跑赢" : "跑输"
    } ${Math.abs(smhVsQqq).toFixed(2)}个百分点，AI硬件主线目前${
      smhVsQqq > 0 && snapshot.smhChange > 0 ? "仍有资金承接" : "需要降温观察"
    }。`,
    `宏观上10年美债为 ${snapshot.tenYearYield.toFixed(2)}%，单日变化 ${
      snapshot.tenYearYieldChangeBp > 0 ? "+" : ""
    }${snapshot.tenYearYieldChangeBp.toFixed(0)}bp，VIX ${formatPct(snapshot.vixChange)}；${
      snapshot.tenYearYield < 5 && snapshot.tenYearYieldChangeBp <= 8
        ? "利率暂未触发5%压力线或快速上行警报"
        : "利率环境已经对高估值科技股构成压力"
    }。`,
    `核心股中NVDA相对QQQ ${nvdaVsQqq >= 0 ? "+" : ""}${nvdaVsQqq.toFixed(2)}个百分点，GOOGL ${
      googlVsQqq >= 0 ? "+" : ""
    }${googlVsQqq.toFixed(2)}个百分点，AVGO ${avgoVsQqq >= 0 ? "+" : ""}${avgoVsQqq.toFixed(
      2,
    )}个百分点；${coreBeatCount}/3只跑赢QQQ，因此当前建议为“${action}”。`,
  ];

  return { score, action, totalExposure, target, clusters, briefing };
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
  const [currentPositions, setCurrentPositions] = useState<Record<ContractSymbol, number>>({
    NVDA: 2200,
    GOOGL: 2000,
    AVGO: 1500,
    MSFT: 0,
    TSLA: 0,
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
  const visibleNews = useMemo(() => {
    if (newsItems.length <= 3) return newsItems;
    const start = (newsPage * 3) % newsItems.length;
    const chunk = newsItems.slice(start, start + 3);
    if (chunk.length === 3) return chunk;
    return [...chunk, ...newsItems.slice(0, 3 - chunk.length)];
  }, [newsItems, newsPage]);
  const currentInvested = contractNames.reduce((sum, symbol) => sum + currentPositions[symbol], 0);
  const currentCashValue = Math.max(0, accountValue - currentInvested);

  const rebalanceRows = useMemo(() => {
    const rows = [...contractNames, "CASH" as const].map((name) => {
      const currentValue = name === "CASH" ? currentCashValue : currentPositions[name];
      const current = accountValue > 0 ? (currentValue / accountValue) * 100 : 0;
      const target = result.target[name];
      const targetValue = (accountValue * target) / 100;
      const diffPct = target - current;
      const tradeValue = targetValue - currentValue;
      let suggestion = "不动";
      if (diffPct >= 3) suggestion = `买入 ${formatMoney(tradeValue)}`;
      if (diffPct <= -3) suggestion = `卖出 ${formatMoney(Math.abs(tradeValue))}`;
      return { name, current, currentValue, target, targetValue, diffPct, tradeValue, suggestion };
    });
    return rows;
  }, [accountValue, currentCashValue, currentPositions, result.target]);

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
          <div className="eyebrow">AI科技3x TradFi盯盘</div>
          <button
            className="refreshButton"
            disabled={isRefreshing}
            onClick={refreshMarketData}
          >
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
          <div>
            <span>NVDA</span>
            <strong>{result.target.NVDA}%</strong>
          </div>
          <div>
            <span>GOOGL</span>
            <strong>{result.target.GOOGL}%</strong>
          </div>
          <div>
            <span>AVGO</span>
            <strong>{result.target.AVGO}%</strong>
          </div>
          <div>
            <span>MSFT</span>
            <strong>{result.target.MSFT}%</strong>
          </div>
          <div>
            <span>TSLA</span>
            <strong>{result.target.TSLA}%</strong>
          </div>
          <div>
            <span>空仓/现金</span>
            <strong>{result.target.CASH}%</strong>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>调仓助手</h2>
        <p className="hint">
          输入账户总资产和当前每个合约的持仓金额。系统会自动计算当前占比，并换算每个TradFi合约应买入或卖出的金额；
          差值小于3%默认不动，避免频繁交易。
        </p>
        <label className="assetInput">
          <span>账户总资产规模（USDT）</span>
          <input
            min="0"
            type="number"
            value={accountValue}
            onChange={(event) => setAccountValue(Number(event.target.value || 0))}
          />
        </label>
        <div className="inputs five">
          {contractNames.map((symbol) => (
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
                当前 {formatMoney(row.currentValue)} ({row.current.toFixed(1)}%) / 目标{" "}
                {formatMoney(row.targetValue)} ({row.target}%)
                {row.name !== "CASH" ? ` / ${stopLines[row.name]}` : ""}
              </span>
            </div>
            <b className={row.diffPct > 0 ? "up" : row.diffPct < 0 ? "down" : ""}>
              {row.suggestion}
            </b>
          </div>
        ))}
      </section>

      <section className="panel">
        <div className="panelHeader">
          <h2>资讯与研报线索</h2>
          <button
            className="miniButton"
            disabled={newsItems.length <= 3}
            onClick={() => setNewsPage((page) => page + 1)}
          >
            换一批
          </button>
        </div>
        <p className={newsErrors.length > 0 ? "hint warnText" : "hint"}>
          数据源：{newsSource}
          {newsErrors.length > 0 ? `；部分资讯抓取异常：${newsErrors.join("；")}` : ""}
        </p>
        {visibleNews.length === 0 ? (
          <div className="emptyState">
            暂未抓取到可用资讯。请点击右上角刷新重试；若持续失败，后续可切换到 Finnhub、NewsAPI
            或付费财经数据源。
          </div>
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
