export type CalendarEvent = {
  date: string;
  time: string;
  category: "宏观" | "美联储" | "公司";
  title: string;
  subject: string;
  detail: string;
  source: string;
  url: string;
};

export const majorEvents: CalendarEvent[] = [
  {
    date: "2026-06-16",
    time: "两日会议",
    category: "美联储",
    title: "FOMC议息会议开始",
    subject: "利率 / SEP",
    detail: "6月16-17日会议，带经济预测摘要；声明通常在第二天美东14:00发布，发布会约14:30。",
    source: "Federal Reserve",
    url: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm",
  },
  {
    date: "2026-06-17",
    time: "14:00 ET / 14:30 ET",
    category: "美联储",
    title: "FOMC声明与发布会",
    subject: "利率 / 科技估值",
    detail: "重点看点阵图、通胀措辞和降息路径，10年美债若上冲会压制VRT/MRVL/COHR估值。",
    source: "Federal Reserve",
    url: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm",
  },
  {
    date: "2026-07-02",
    time: "08:30 ET",
    category: "宏观",
    title: "美国6月非农就业报告",
    subject: "NFP / 失业率 / 薪资",
    detail: "强就业会推高利率压力，弱就业若触发衰退交易也会压制高beta科技股。",
    source: "BLS",
    url: "https://www.bls.gov/schedule/news_release/empsit.htm",
  },
  {
    date: "2026-07-28",
    time: "两日会议",
    category: "美联储",
    title: "FOMC议息会议",
    subject: "利率",
    detail: "7月28-29日会议，不带SEP；重点看声明是否延续高利率压力。",
    source: "Federal Reserve",
    url: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm",
  },
  {
    date: "2026-07-29",
    time: "估算窗口",
    category: "公司",
    title: "VRT下一季财报估算窗口",
    subject: "VRT / 电力散热",
    detail: "官方未在当前资料中公布下一季日期；按历史节奏估算，发布前应下调3x追涨动作。",
    source: "Company IR / estimated",
    url: "https://investors.vertiv.com/",
  },
  {
    date: "2026-08-05",
    time: "估算窗口",
    category: "公司",
    title: "COHR下一季财报估算窗口",
    subject: "COHR / 光通信",
    detail: "官方IR显示上季为5月6日，下一次按季度节奏估算在8月上旬；重点看800G/1.6T、CPO和数据中心订单。",
    source: "Coherent IR / estimated",
    url: "https://www.coherent.com/company/investor-relations",
  },
  {
    date: "2026-08-07",
    time: "08:30 ET",
    category: "宏观",
    title: "美国7月非农就业报告",
    subject: "NFP / 利率",
    detail: "对三个月交易窗口很关键，若就业过热且10年美债接近5%，需降低组合总杠杆。",
    source: "BLS",
    url: "https://www.bls.gov/schedule/news_release/empsit.htm",
  },
  {
    date: "2026-08-26",
    time: "估算窗口",
    category: "公司",
    title: "MRVL下一季财报估算窗口",
    subject: "MRVL / 定制芯片",
    detail: "Marvell上次财报电话会为5月27日；下一季按季度节奏估算在8月下旬，重点看定制AI芯片和互联收入。",
    source: "Marvell IR / estimated",
    url: "https://investor.marvell.com/news-events/ir-calendar",
  },
  {
    date: "2026-09-04",
    time: "08:30 ET",
    category: "宏观",
    title: "美国8月非农就业报告",
    subject: "NFP / 三个月窗口",
    detail: "会影响9月FOMC前的利率定价，是三个月持仓窗口内的重要宏观节点。",
    source: "BLS",
    url: "https://www.bls.gov/schedule/news_release/empsit.htm",
  },
  {
    date: "2026-09-15",
    time: "两日会议",
    category: "美联储",
    title: "FOMC议息会议开始",
    subject: "利率 / SEP",
    detail: "9月15-16日会议，带经济预测摘要；若市场押注降息失败，高beta科技仓位需降杠杆。",
    source: "Federal Reserve",
    url: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm",
  },
];
