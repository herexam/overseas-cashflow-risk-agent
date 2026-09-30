/**
 * 现金流与外汇 Mock 数据（Demo 示例数据）。
 *
 * 本文件全部内容为产品演示所用的示例数据：现金头寸、90 天滚动预测曲线、
 * 资金流入流出明细、债务台账与外币敞口均由固定种子的伪随机序列推导，
 * 不代表沃太能源（AlphaESS）任何时点的真实经营数据，也不构成经营或投资建议。
 * 全部金额单位为万元（外币敞口已折合人民币），汇率除外。
 *
 * 口径对齐说明：
 *  1. 现金头寸 8,420 万元、安全线 6,000 万元与 dashboard / 晨会摘要 / AI 助手保持一致；
 *  2. 30 / 60 / 90 天预测缺口依次为 0 / 1,180 / 2,360 万元，与情景模拟基线口径一致；
 *  3. 预测曲线在 30 / 60 / 90 天的锚点满足
 *     余额(30) = 8,420 + 净流入 940 - 30 天内到期债务 2,100 = 7,260 万元，
 *     余额(60) = 7,260 - 1,280 - 1,160（信用证）= 4,820 万元，
 *     余额(90) = 4,820 - 260 - 920（融资租赁）= 3,640 万元；
 *     debt30 / debt60 / debt90 与 DEBTS 的到期日严格对应。
 */

import type {
  CashFlowItem,
  CashForecast,
  CashForecastPoint,
  CashFxPageData,
  CashPosition,
  DebtItem,
  ForecastHorizon,
  FxExposure,
  RiskLevel,
  SeriesPoint,
} from '../../core/models';
import {
  DEMO_AS_OF_DATE,
  DEMO_AS_OF_TIME,
  addDays,
  clamp,
  dayLabels,
  genIntSeries,
  genSeries,
  round,
  seedFrom,
} from './_random';

/* ------------------------------------------------------------------ */
/* 基础参数                                                            */
/* ------------------------------------------------------------------ */

/** 现金安全线（万元） */
const SAFE_LINE = 6000;
/** 基准日现金余额（万元） */
const START_BALANCE = 8420;
/** 60 天缺口（万元） */
const GAP_60 = 1180;
/** 90 天缺口（万元） */
const GAP_90 = 2360;
/** 每 30 天为一个预测区间 */
const FLOW_WINDOW = 30;
/** 逐日流入 / 流出金额区间（万元） */
const DAILY_FLOW_MIN = 50;
const DAILY_FLOW_MAX = 600;
/** 置信区间随预测天数线性放宽（±2% → ±9%） */
const WIDEN_START = 0.02;
const WIDEN_END = 0.09;
/** 汇率走势点数与相对噪声 */
const FX_TREND_DAYS = 90;
const FX_NOISE_RATIO = 0.0009;
/** 净敞口占比分母：年化营业收入（万元，Demo 口径） */
const REVENUE_BASE = 15000;

/** 30 天内确定性流入 / 流出（万元） */
const INFLOW_30 = 6180;
const OUTFLOW_30 = 5240;
/** 31–60 天、61–90 天流入（万元）：欧洲回款放缓后小幅恢复 */
const INFLOW_31_60 = 4980;
const INFLOW_61_90 = 5240;
/** 31–60 天、61–90 天流出（万元）：信用证到期与年末采购集中支付 */
const OUTFLOW_31_60 = 6260;
const OUTFLOW_61_90 = 5500;
/** 30 / 60 / 90 天内到期债务（万元），与 DEBTS 到期日一一对应 */
const DEBT_30 = 2100;
const DEBT_60 = 3260;
const DEBT_90 = 4180;

const INFLOW_WINDOWS: readonly number[] = [INFLOW_30, INFLOW_31_60, INFLOW_61_90];
const OUTFLOW_WINDOWS: readonly number[] = [OUTFLOW_30, OUTFLOW_31_60, OUTFLOW_61_90];

/** 30 / 60 / 90 天预测的最低余额锚点（万元） */
const ANCHOR_30 = START_BALANCE + (INFLOW_30 - OUTFLOW_30) - DEBT_30;
const ANCHOR_60 = SAFE_LINE - GAP_60;
const ANCHOR_90 = SAFE_LINE - GAP_90;

/* ------------------------------------------------------------------ */
/* 逐日流入 / 流出：按 30 天窗口校准合计值                              */
/* ------------------------------------------------------------------ */

function sumRange(values: readonly number[], start: number, end: number): number {
  let sum = 0;
  for (let index = start; index < end; index += 1) {
    sum += values[index];
  }
  return sum;
}

/**
 * 生成逐日流水，并把每个 30 天窗口的合计精确校准到目标值。
 * 随机序列只负责日内节奏，窗口合计由比例变换 + 尾位补偿保证。
 */
function buildDailyFlows(
  seed: string,
  base: number,
  noise: number,
  windowTargets: readonly number[],
): number[] {
  const count = FLOW_WINDOW * windowTargets.length;
  const values = genIntSeries(seedFrom(seed), count, base, 0, noise).map((value) =>
    clamp(value, DAILY_FLOW_MIN, DAILY_FLOW_MAX),
  );

  windowTargets.forEach((target, window) => {
    const start = window * FLOW_WINDOW;
    const end = start + FLOW_WINDOW;
    const current = sumRange(values, start, end);
    const factor = current === 0 ? 1 : target / current;
    for (let index = start; index < end; index += 1) {
      values[index] = clamp(Math.round(values[index] * factor), DAILY_FLOW_MIN, DAILY_FLOW_MAX);
    }

    let diff = target - sumRange(values, start, end);
    let cursor = end - 1;
    while (diff !== 0 && cursor >= start) {
      const before = values[cursor];
      const after = clamp(before + diff, DAILY_FLOW_MIN, DAILY_FLOW_MAX);
      values[cursor] = after;
      diff -= after - before;
      cursor -= 1;
    }
  });

  return values;
}

const DAILY_INFLOW: readonly number[] = buildDailyFlows(
  'cash-daily-inflow',
  206,
  46,
  INFLOW_WINDOWS,
);
const DAILY_OUTFLOW: readonly number[] = buildDailyFlows(
  'cash-daily-outflow',
  176,
  40,
  OUTFLOW_WINDOWS,
);

/* ------------------------------------------------------------------ */
/* 90 天余额曲线：分段生成并校准到锚点                                  */
/* ------------------------------------------------------------------ */

/**
 * 生成一段单调不增的余额曲线：保证区间内最低点恰好落在区间的最后一天，
 * 从而让 30 / 60 / 90 天三条预测共用同一条曲线、缺口口径完全一致。
 */
function buildBalanceSegment(
  seed: string,
  start: number,
  end: number,
  days: number,
  noise: number,
): number[] {
  const raw = genSeries(seedFrom(seed), days, start, (end - start) / days, noise, 0);
  const monotone: number[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    const prev = index === 0 ? start : monotone[index - 1];
    monotone.push(Math.min(raw[index], prev));
  }

  const floor = monotone[monotone.length - 1];
  const span = start - floor;
  const factor = span === 0 ? 0 : (start - end) / span;
  return monotone.map((value) => Math.round(start + (value - start) * factor));
}

const BALANCE_PATH: readonly number[] = [
  ...buildBalanceSegment('cash-balance-s1', START_BALANCE, ANCHOR_30, FLOW_WINDOW, 24),
  ...buildBalanceSegment('cash-balance-s2', ANCHOR_30, ANCHOR_60, FLOW_WINDOW, 30),
  ...buildBalanceSegment('cash-balance-s3', ANCHOR_60, ANCHOR_90, FLOW_WINDOW, 26),
];

function buildForecastPoints(horizon: ForecastHorizon): CashForecastPoint[] {
  const points: CashForecastPoint[] = [];
  for (let index = 0; index < horizon; index += 1) {
    const balance = BALANCE_PATH[index];
    const widen = WIDEN_START + ((WIDEN_END - WIDEN_START) * index) / (BALANCE_PATH.length - 1);
    points.push({
      date: addDays(DEMO_AS_OF_DATE, index + 1),
      dayOffset: index + 1,
      balance,
      lower: Math.round(balance * (1 - widen)),
      upper: Math.round(balance * (1 + widen)),
      safeLine: SAFE_LINE,
      inflow: DAILY_INFLOW[index],
      outflow: DAILY_OUTFLOW[index],
      gap: Math.round(Math.max(0, SAFE_LINE - balance)),
    });
  }
  return points;
}

const FORECAST_SPECS: readonly { horizon: ForecastHorizon; level: RiskLevel; note: string }[] = [
  {
    horizon: 30,
    level: 'L1',
    note: '未来 30 天余额始终高于 6,000 万元安全线，无缺口；需在 10 月上旬备足 2,100 万元用于偿还流贷与票据。',
  },
  {
    horizon: 60,
    level: 'L3',
    note: '未来 60 天最低余额 4,820 万元，低于安全线 1,180 万元；缺口由 11 月 5 日信用证到期付款与欧洲回款放缓叠加形成。',
  },
  {
    horizon: 90,
    level: 'L4',
    note: '未来 90 天最低余额 3,640 万元，缺口扩大至 2,360 万元；需在 11 月底前落地融资额度或加速欧洲应收回收。',
  },
];

export const CASH_FORECASTS: readonly CashForecast[] = FORECAST_SPECS.map((spec) => {
  const points = buildForecastPoints(spec.horizon);
  let minBalance = points[0].balance;
  let minIndex = 0;
  points.forEach((point, index) => {
    if (point.balance < minBalance) {
      minBalance = point.balance;
      minIndex = index;
    }
  });
  return {
    horizon: spec.horizon,
    points,
    minBalance,
    minBalanceDate: points[minIndex].date,
    gap: Math.round(Math.max(0, SAFE_LINE - minBalance)),
    level: spec.level,
    note: spec.note,
  };
});

/* ------------------------------------------------------------------ */
/* 现金头寸                                                            */
/* ------------------------------------------------------------------ */

export const CASH_POSITION: CashPosition = {
  asOf: DEMO_AS_OF_TIME,
  cashOnHand: START_BALANCE,
  safeLine: SAFE_LINE,
  inflow30: INFLOW_30,
  outflow30: OUTFLOW_30,
  net30: INFLOW_30 - OUTFLOW_30,
  debt30: DEBT_30,
  debt60: DEBT_60,
  debt90: DEBT_90,
  freeCashRatio: 0.34,
  change: { direction: 'down', text: '较上周 -420 万元', favorable: false },
};

/* ------------------------------------------------------------------ */
/* 资金流入流出明细（16 条：流入 9 / 流出 7）                           */
/* ------------------------------------------------------------------ */

export const CASH_FLOWS: readonly CashFlowItem[] = [
  {
    id: 'CF-IN-01',
    item: '欧洲经销商 T/T 回款',
    category: 'inflow',
    amount: 1860,
    date: '2026-09-22',
    currency: 'EUR',
    counterparty: '德国 · SunPower Handel GmbH',
    certainty: 'committed',
    note: '已收到客户付款水单，预计 9 月 22 日入账，折合人民币 1,546 万元。',
  },
  {
    id: 'CF-IN-02',
    item: '荷兰安装商信用证回款',
    category: 'inflow',
    amount: 1420,
    date: '2026-10-08',
    currency: 'EUR',
    counterparty: '荷兰 · Dutch Solar Install BV',
    certainty: 'probable',
    note: '提单已交单，开证行审单通过概率较高，账期较合同约定晚 8 天。',
  },
  {
    id: 'CF-IN-03',
    item: '国内 EPC 客户回款',
    category: 'inflow',
    amount: 2400,
    date: '2026-09-28',
    currency: 'CNY',
    counterparty: '江苏 · 华能新能源工程有限公司',
    certainty: 'committed',
    note: '项目验收款按合同节点支付，已取得客户付款计划确认函。',
  },
  {
    id: 'CF-IN-04',
    item: '英国分销商回款',
    category: 'inflow',
    amount: 960,
    date: '2026-10-15',
    currency: 'GBP',
    counterparty: '英国 · GreenVolt Distribution Ltd',
    certainty: 'probable',
    note: '账期 60 天，客户历史回款信用良好，存在 5–10 天滑期风险。',
  },
  {
    id: 'CF-IN-05',
    item: '北美安装商回款',
    category: 'inflow',
    amount: 1580,
    date: '2026-10-22',
    currency: 'USD',
    counterparty: '美国 · Solaris Power Inc.',
    certainty: 'probable',
    note: '四季度安装旺季回款，受美国储能产品关税窗口影响存在议价拖延可能。',
  },
  {
    id: 'CF-IN-06',
    item: '澳洲经销商回款',
    category: 'inflow',
    amount: 1180,
    date: '2026-11-05',
    currency: 'USD',
    counterparty: '澳大利亚 · AusSolar Trading Pty',
    certainty: 'tentative',
    note: '新签经销商首笔大额订单，付款节奏尚未经过验证，按保守口径列入。',
  },
  {
    id: 'CF-IN-07',
    item: '出口退税到账',
    category: 'inflow',
    amount: 720,
    date: '2026-11-18',
    currency: 'CNY',
    counterparty: '国家税务总局（出口退税）',
    certainty: 'probable',
    note: '二季度出口退税申报已受理，按历史平均 45 个工作日到账推算。',
  },
  {
    id: 'CF-IN-08',
    item: '意大利经销商回款',
    category: 'inflow',
    amount: 1050,
    date: '2026-11-28',
    currency: 'EUR',
    counterparty: '意大利 · Enelio Energy S.r.l.',
    certainty: 'tentative',
    note: '客户所在区域银行授信收紧，回款时间存在较大不确定性。',
  },
  {
    id: 'CF-IN-09',
    item: '南非项目质保金释放',
    category: 'inflow',
    amount: 480,
    date: '2026-12-05',
    currency: 'USD',
    counterparty: '南非 · Cape Power Projects',
    certainty: 'tentative',
    note: '质保期满释放款项，需以业主验收签字为前提，暂按最晚时点预估。',
  },
  {
    id: 'CF-OUT-01',
    item: '电芯采购预付款',
    category: 'outflow',
    amount: 2100,
    date: '2026-09-25',
    currency: 'CNY',
    counterparty: '宁德 · 时代储能电芯供应商',
    certainty: 'committed',
    note: '四季度电芯锁价预付款，合同约定 30% 预付，逾期将影响排产次序。',
  },
  {
    id: 'CF-OUT-02',
    item: '银行流贷到期还本',
    category: 'outflow',
    amount: 1200,
    date: '2026-10-05',
    currency: 'CNY',
    counterparty: '中国工商银行南通分行',
    certainty: 'committed',
    note: '流动资金贷款到期还本，已启动续贷流程，最迟 10 月 5 日出账。',
  },
  {
    id: 'CF-OUT-03',
    item: '供应链票据兑付',
    category: 'outflow',
    amount: 900,
    date: '2026-10-12',
    currency: 'CNY',
    counterparty: '苏州 · 结构件供应商（银承）',
    certainty: 'committed',
    note: '银行承兑汇票到期兑付，不可展期。',
  },
  {
    id: 'CF-OUT-04',
    item: '海外仓储与尾程物流费',
    category: 'outflow',
    amount: 640,
    date: '2026-10-20',
    currency: 'EUR',
    counterparty: '德国 · 海外仓运营商',
    certainty: 'probable',
    note: '德国、荷兰两仓季度仓储与尾程派送结算，随库存量与运价同步上行。',
  },
  {
    id: 'CF-OUT-05',
    item: '信用证到期付款',
    category: 'outflow',
    amount: 1160,
    date: '2026-11-05',
    currency: 'USD',
    counterparty: '中国银行南通分行（进口信用证）',
    certainty: 'committed',
    note: '进口电芯信用证 90 天到期日，单笔金额最大，是 11 月现金压力主因。',
  },
  {
    id: 'CF-OUT-06',
    item: '员工薪酬与海外子公司费用',
    category: 'outflow',
    amount: 880,
    date: '2026-11-25',
    currency: 'CNY',
    counterparty: '集团人力资源与海外子公司',
    certainty: 'committed',
    note: '月度薪酬、社保及德国子公司运营费用合计，刚性支出不可压缩。',
  },
  {
    id: 'CF-OUT-07',
    item: '生产线设备融资租赁租金',
    category: 'outflow',
    amount: 920,
    date: '2026-12-08',
    currency: 'CNY',
    counterparty: '远东国际融资租赁有限公司',
    certainty: 'committed',
    note: '二期产线融资租赁季度租金，按合同固定支付。',
  },
];

/* ------------------------------------------------------------------ */
/* 债务台账（6 条，30 / 60 / 90 天到期金额与头寸一致）                   */
/* ------------------------------------------------------------------ */

export const DEBTS: readonly DebtItem[] = [
  {
    id: 'DB-01',
    name: '工商银行流动资金贷款',
    amount: 1200,
    dueDate: '2026-10-05',
    currency: 'CNY',
    type: '银行流贷',
    ratePct: 3.45,
    level: 'L3',
  },
  {
    id: 'DB-02',
    name: '银承票据（结构件供应商）',
    amount: 900,
    dueDate: '2026-10-12',
    currency: 'CNY',
    type: '供应链票据',
    ratePct: 2.8,
    level: 'L2',
  },
  {
    id: 'DB-03',
    name: '进口电芯信用证（90 天）',
    amount: 1160,
    dueDate: '2026-11-05',
    currency: 'USD',
    type: '信用证',
    ratePct: 4.15,
    level: 'L3',
  },
  {
    id: 'DB-04',
    name: '生产线设备融资租赁',
    amount: 920,
    dueDate: '2026-12-08',
    currency: 'CNY',
    type: '融资租赁',
    ratePct: 4.6,
    level: 'L3',
  },
  {
    id: 'DB-05',
    name: '招商银行流动资金贷款',
    amount: 2000,
    dueDate: '2026-12-20',
    currency: 'CNY',
    type: '银行流贷',
    ratePct: 3.35,
    level: 'L2',
  },
  {
    id: 'DB-06',
    name: '光伏产线融资租赁（二期）',
    amount: 780,
    dueDate: '2026-12-28',
    currency: 'CNY',
    type: '融资租赁',
    ratePct: 4.8,
    level: 'L2',
  },
];

/* ------------------------------------------------------------------ */
/* 外币敞口（4 条，仅展示敞口，不给套期保值建议）                        */
/* ------------------------------------------------------------------ */

/** 生成 90 天汇率走势，并把末两点校准到「当前中间价 / 上一日中间价」 */
function buildFxTrend(seed: string, rate: number, changePct: number): SeriesPoint[] {
  const labels = dayLabels(DEMO_AS_OF_DATE, FX_TREND_DAYS);
  const raw = genSeries(seedFrom(seed), FX_TREND_DAYS, rate, 0, rate * FX_NOISE_RATIO, 4);
  const factor = rate / raw[raw.length - 1];
  const values = raw.map((value) => round(value * factor, 4));
  values[FX_TREND_DAYS - 1] = round(rate, 4);
  values[FX_TREND_DAYS - 2] = round(rate / (1 + changePct / 100), 4);
  return labels.map((label, index) => ({ label, value: values[index] }));
}

/** 本位币敞口无汇率波动，走势为恒值 */
function buildFlatTrend(count: number, value: number): SeriesPoint[] {
  return dayLabels(DEMO_AS_OF_DATE, count).map((label) => ({ label, value }));
}

export const FX_EXPOSURES: readonly FxExposure[] = [
  {
    code: 'CNY',
    label: '人民币',
    receivable: 1200,
    payable: 800,
    net: 400,
    netRatio: round(400 / REVENUE_BASE, 4),
    rate: 1,
    rateChangePct: 0,
    level: 'L1',
    note: '人民币为本位币，此处敞口仅指海外主体人民币应收应付轧差，不含集团内部往来。',
    trend: buildFlatTrend(FX_TREND_DAYS, 1),
  },
  {
    code: 'USD',
    label: '美元',
    receivable: 8600,
    payable: 5200,
    net: 3400,
    netRatio: round(3400 / REVENUE_BASE, 4),
    rate: 7.0862,
    rateChangePct: -0.42,
    level: 'L3',
    note: '美元敞口按 2026-09-15 中间价 7.0862 折算；北美市场收入与电芯进口付款为主要来源，进口信用证到期形成集中付汇。',
    trend: buildFxTrend('fx-trend-usd', 7.0862, -0.42),
  },
  {
    code: 'EUR',
    label: '欧元',
    receivable: 12400,
    payable: 4100,
    net: 8300,
    netRatio: round(8300 / REVENUE_BASE, 4),
    rate: 8.3145,
    rateChangePct: 1.18,
    level: 'L4',
    note: '欧元敞口按 8.3145 折算；欧洲经销商应收占集团欧元应收的 82%，是规模最大、波动最敏感的单一币种敞口。',
    trend: buildFxTrend('fx-trend-eur', 8.3145, 1.18),
  },
  {
    code: 'GBP',
    label: '英镑',
    receivable: 3200,
    payable: 1100,
    net: 2100,
    netRatio: round(2100 / REVENUE_BASE, 4),
    rate: 9.5620,
    rateChangePct: 0.36,
    level: 'L2',
    note: '英镑敞口按 9.5620 折算；英国分销商账期 60 天、结算以 T/T 为主，敞口规模相对可控。',
    trend: buildFxTrend('fx-trend-gbp', 9.5620, 0.36),
  },
];

export const CASH_FX_PAGE: CashFxPageData = {
  position: CASH_POSITION,
  forecasts: CASH_FORECASTS,
  flows: CASH_FLOWS,
  debts: DEBTS,
  exposures: FX_EXPOSURES,
};
