/**
 * 驾驶舱 Mock 数据（Demo 示例数据）。
 *
 * 本文件提供首页驾驶舱所需的五组数据：M1–M12 核心指标、Top 6 风险、
 * 风险类型分布、国别风险分布、近 14 天新增风险趋势。
 * 全部数值为按业务逻辑生成的示例数据，不代表沃太能源（AlphaESS）真实经营数据；
 * 其中的阈值、目标值均为【假设】参数，需企业按自身经营基准校准，不构成经营或投资建议。
 *
 * 数据一致性约定（演示口径）：
 *  - 每条指标的 trend 由固定种子生成，并做比例校准，保证最后一个点严格等于 value；
 *  - RISK_DISTRIBUTION 的 count 合计 = 24，与 alerts.mock.ts 的 24 条预警逐类型一致；
 *  - RISK_BY_COUNTRY 四个等级合计 = 24；欧元区（EU）与全球（GL）维度的风险
 *    按主要经营区域归入对应国家行。
 */

import type {
  CountryRiskRow,
  KpiDefinition,
  RiskDistributionItem,
  SeriesPoint,
  TopRisk,
} from '../../core/models';
import {
  FX_VOLATILITY_ANALYSIS,
  INVENTORY_AGING_ANALYSIS,
  INVENTORY_AGING_SUMMARY,
  LOGISTICS_TRANSIT_ANALYSIS,
  POLICY_TARIFF_ANALYSIS,
  POLICY_TARIFF_SUMMARY,
  RECEIVABLE_DELAY_ANALYSIS,
} from './analyses.mock';
import {
  DEMO_AS_OF_DATE,
  clamp,
  dayLabels,
  genIntSeries,
  genSeries,
  round,
  shortDay,
} from './_random';

/* ------------------------------------------------------------------ */
/* 指标趋势校准                                                        */
/* ------------------------------------------------------------------ */

/** 趋势窗口：近 6 个月 */
const TREND_MONTHS = 6;

/**
 * 生成 6 个月趋势并校准到目标值。
 * 比例校准保证 trend 最后一个点严格等于指标当前值；目标值为 0 时改用平移校准，
 * 避免整条曲线被压成同一数值。
 */
function trendTo(
  seed: number,
  base: number,
  drift: number,
  noise: number,
  target: number,
  digits: number,
): readonly number[] {
  const raw = genSeries(seed, TREND_MONTHS, base, drift, noise, digits);
  const last = raw[raw.length - 1];
  let scaled: number[];
  if (target === 0) {
    scaled = raw.map((n) => Math.max(0, round(n - last, digits)));
  } else if (last === 0) {
    scaled = raw.map(() => target);
  } else {
    scaled = raw.map((n) => round((n * target) / last, digits));
  }
  scaled[scaled.length - 1] = target;
  return scaled;
}

/* ------------------------------------------------------------------ */
/* M1–M12 核心指标                                                     */
/* ------------------------------------------------------------------ */

export const KPIS: readonly KpiDefinition[] = [
  {
    id: 'M1',
    code: 'CASH_SAFETY',
    name: '现金安全度',
    value: 68,
    unit: '分',
    target: 70,
    comparator: 'gte',
    level: 'L3',
    trend: trendTo(4148, 74, -1.1, 1.6, 68, 1),
    thresholdHint:
      '示例阈值：低于 70 分进入橙色关注区、低于 60 分进入红色升级区。为 Demo 假设参数，需企业按自身现金波动区间校准。',
    definition: '综合现金余额、滚动缺口、回款进度与可用融资额度加权得到的 0–100 分安全评分。',
    route: '/cash-fx',
    change: { direction: 'down', text: '较上月 -3 分', favorable: false },
  },
  {
    id: 'M2',
    code: 'GAP30',
    name: '30 天现金缺口',
    value: 0,
    unit: '万元',
    target: 0,
    comparator: 'lte',
    level: 'L1',
    trend: trendTo(4111, 560, -75, 45, 0, 0),
    thresholdHint:
      '示例阈值：30 天滚动口径出现任何正缺口即触发提示。为 Demo 假设参数，需企业按最短回款周期与刚性支出节奏校准。',
    definition: '未来 30 天滚动现金流入减去刚性流出后的最低净头寸，无缺口记为 0。',
    route: '/cash-fx',
    change: { direction: 'down', text: '较上月 -75 万元', favorable: true },
  },
  {
    id: 'M3',
    code: 'GAP60',
    name: '60 天现金缺口',
    value: 1180,
    unit: '万元',
    target: 0,
    comparator: 'lte',
    level: 'L3',
    trend: trendTo(4454, 640, 95, 85, 1180, 0),
    thresholdHint:
      '示例阈值：缺口占期末现金比例超过 10% 进入 L3、超过 25% 进入 L4。为 Demo 假设参数，需企业按融资可得性校准。',
    definition: '未来 60 天滚动现金流预测中，现金余额低于集团安全线的最深缺口金额。',
    route: '/cash-fx',
    change: { direction: 'up', text: '较上月 +146 万元', favorable: false },
  },
  {
    id: 'M4',
    code: 'DIO',
    name: '库存周转天数 DIO',
    value: 92,
    unit: '天',
    target: 75,
    comparator: 'lte',
    level: 'L3',
    trend: trendTo(4120, 79, 2.3, 2.4, 92, 0),
    thresholdHint:
      '示例阈值：超过目标 75 天进入 L2、超过 90 天进入 L3、超过 105 天进入 L4。为 Demo 假设参数，需企业按品类与备货周期校准。',
    definition: '期末存货余额 ÷ 当期营业成本 × 统计天数，衡量库存整体周转效率。',
    route: '/inventory',
    change: { direction: 'up', text: '较上月 +3 天', favorable: false },
  },
  {
    id: 'M5',
    code: 'OVERSTOCK',
    name: '超期库存占比',
    value: 21.4,
    unit: '%',
    target: 15,
    comparator: 'lte',
    level: 'L3',
    trend: trendTo(4454, 17.4, 0.72, 0.75, 21.4, 1),
    thresholdHint:
      '示例阈值：库龄 180 天以上库存占比超过 15% 进入关注、超过 20% 进入 L3。为 Demo 假设参数，需企业按机型生命周期校准。',
    definition: '库龄超过 180 天的库存金额占期末库存总金额的比重。',
    route: '/inventory',
    change: { direction: 'up', text: '较上月 +1.1 个百分点', favorable: false },
  },
  {
    id: 'M6',
    code: 'DSO',
    name: '应收周转天数 DSO',
    value: 104,
    unit: '天',
    target: 96,
    comparator: 'lte',
    level: 'L3',
    trend: trendTo(4182, 96, 1.5, 2, 104, 0),
    thresholdHint:
      '示例阈值：超过目标 96 天进入 L2、超过 100 天进入 L3、超过 115 天进入 L4。为 Demo 假设参数，需企业按区域信用政策校准。',
    definition: '期末应收账款余额 ÷ 当期营业收入 × 统计天数，衡量平均回款速度。',
    route: '/receivables',
    change: { direction: 'up', text: '较上月 +3 天', favorable: false },
  },
  {
    id: 'M7',
    code: 'OVERDUE',
    name: '应收逾期率',
    value: 11.2,
    unit: '%',
    target: 8,
    comparator: 'lte',
    level: 'L3',
    trend: trendTo(4179, 9.2, 0.4, 0.45, 11.2, 1),
    thresholdHint:
      '示例阈值：逾期率超过 8% 进入关注、超过 10% 进入 L3、超过 15% 进入 L4。为 Demo 假设参数，需企业按客户结构校准。',
    definition: '已过合同约定到期日的应收账款金额占应收账款总额的比重。',
    route: '/receivables',
    change: { direction: 'up', text: '较上月 +0.6 个百分点', favorable: false },
  },
  {
    id: 'M8',
    code: 'CCC',
    name: '现金转换周期 CCC',
    value: 108,
    unit: '天',
    target: 118,
    comparator: 'lte',
    level: 'L2',
    trend: trendTo(4101, 121, -2.4, 2.6, 108, 0),
    thresholdHint:
      '示例阈值：CCC 高于目标值即视为关注，持续两月高于 130 天升级为 L3。为 Demo 假设参数，需企业按行业基准校准。',
    definition: 'DIO + DSO − DPO，衡量资金从投入到收回的净占用天数。',
    route: '/dashboard',
    change: { direction: 'down', text: '较上月 -5 天', favorable: true },
  },
  {
    id: 'M9',
    code: 'DPO',
    name: '应付周转天数 DPO',
    value: 88,
    unit: '天',
    target: 88,
    comparator: 'gte',
    level: 'L2',
    trend: trendTo(4120, 82, 1.1, 1.4, 88, 0),
    thresholdHint:
      '示例阈值：低于目标 88 天即视为资金占用偏紧，低于 75 天升级为 L3。为 Demo 假设参数，需企业按供应商账期政策校准。',
    definition: '期末应付账款余额 ÷ 当期采购成本 × 统计天数，衡量平均付款周期。',
    route: '/cash-fx',
    change: { direction: 'up', text: '较上月 +2 天', favorable: true },
  },
  {
    id: 'M10',
    code: 'FX_NET',
    name: '净外币敞口占比',
    value: 31.6,
    unit: '%',
    target: 25,
    comparator: 'lte',
    level: 'L3',
    trend: trendTo(4299, 27.2, 0.78, 0.85, 31.6, 1),
    thresholdHint:
      '示例阈值：净敞口占比超过 25% 进入关注、超过 30% 进入 L3、超过 40% 进入 L4。为 Demo 假设参数，需企业按套保政策校准。',
    definition: '外币资产与外币负债轧差后的净敞口金额，占集团总现金及等价物的比重。',
    route: '/radar',
    change: { direction: 'up', text: '较上月 +1.2 个百分点', favorable: false },
  },
  {
    id: 'M11',
    code: 'CONCENTRATION',
    name: '前五大客户集中度',
    value: 48.2,
    unit: '%',
    target: 45,
    comparator: 'lte',
    level: 'L2',
    trend: trendTo(4202, 44.5, 0.68, 0.75, 48.2, 1),
    thresholdHint:
      '示例阈值：前五大客户占比超过 45% 进入关注、超过 55% 升级为 L3。为 Demo 假设参数，需企业按渠道结构校准。',
    definition: '前五大客户的应收账款与在手收入合计占集团应收账款及在手收入总量的比重。',
    route: '/receivables',
    change: { direction: 'up', text: '较上月 +1.0 个百分点', favorable: false },
  },
  {
    id: 'M12',
    code: 'RESPONSE',
    name: '48 小时预警响应率',
    value: 84,
    unit: '%',
    target: 90,
    comparator: 'gte',
    level: 'L3',
    trend: trendTo(4101, 91, -1.2, 1.5, 84, 0),
    thresholdHint:
      '示例阈值：低于目标 90% 进入关注、低于 85% 进入 L3。为 Demo 假设参数，需企业按预警 SLA 校准。',
    definition: '48 小时内流转至处理中或已解决的预警条数，占同期新增预警总数的比重。',
    route: '/alerts',
    change: { direction: 'down', text: '较上月 -3 个百分点', favorable: false },
  },
];

/* ------------------------------------------------------------------ */
/* 驾驶舱 Top 6 风险（顺序即展示顺序）                                 */
/* ------------------------------------------------------------------ */

export const TOP_RISKS: readonly TopRisk[] = [
  {
    id: 'RISK-DE-INV-001',
    title: '德国法兰克福仓库存积压',
    type: 'inventory',
    level: 'L4',
    score: 88,
    country: '德国',
    countryCode: 'DE',
    impactAmount: 2860,
    windowDays: 30,
    owner: '李崇（海外仓运营）',
    dueDate: '2026-09-25',
    summary: INVENTORY_AGING_SUMMARY,
    tags: ['海外仓', '库龄超标', '跌价风险'],
    relatedSku: 'ESS-BAT-05K-DE',
    analysis: INVENTORY_AGING_ANALYSIS,
  },
  {
    id: 'RISK-US-POL-002',
    title: '美国储能产品关税调整',
    type: 'policy',
    level: 'L4',
    score: 84,
    country: '美国',
    countryCode: 'US',
    impactAmount: 1980,
    windowDays: 45,
    owner: '陈锐（海外合规）',
    dueDate: '2026-10-15',
    summary: POLICY_TARIFF_SUMMARY,
    tags: ['关税', '贸易政策', '美国市场'],
    analysis: POLICY_TARIFF_ANALYSIS,
  },
  {
    id: 'RISK-EU-RCV-003',
    title: '重点客户回款延期',
    type: 'receivable',
    level: 'L4',
    score: 86,
    country: '德国',
    countryCode: 'DE',
    impactAmount: 3480,
    windowDays: 30,
    owner: '王倩（欧洲应收）',
    dueDate: '2026-09-30',
    summary: 'OSW Energy 逾期 68 天，回款进度决定 9 月末现金缺口能否补齐。',
    tags: ['应收逾期', '信用风险', '欧洲经销商'],
    relatedCustomer: 'OSW Energy GmbH',
    analysis: RECEIVABLE_DELAY_ANALYSIS,
  },
  {
    id: 'RISK-EU-LOG-004',
    title: '欧洲海运时效恶化',
    type: 'logistics',
    level: 'L3',
    score: 72,
    country: '荷兰',
    countryCode: 'NL',
    impactAmount: 1120,
    windowDays: 60,
    owner: '赵敏（国际物流）',
    dueDate: '2026-10-10',
    summary: '上海至鹿特丹在途延长 6 天，10 月到货批次存在跨月顺延风险。',
    tags: ['海运时效', '订舱紧张', '鹿特丹'],
    analysis: LOGISTICS_TRANSIT_ANALYSIS,
  },
  {
    id: 'RISK-FX-EUR-005',
    title: '欧元汇率波动扩大',
    type: 'fx',
    level: 'L3',
    score: 68,
    country: '欧元区',
    countryCode: 'EU',
    impactAmount: 1460,
    windowDays: 90,
    owner: '周航（资金管理）',
    dueDate: '2026-10-31',
    summary: '欧元敞口 1460 万元，波动放大将直接冲击四季度收入折算。',
    tags: ['外汇敞口', 'EUR', '收入折算'],
    analysis: FX_VOLATILITY_ANALYSIS,
  },
  {
    id: 'RISK-US-INV-006',
    title: '洛杉矶仓工商业储能备货前置',
    type: 'inventory',
    level: 'L3',
    score: 66,
    country: '美国',
    countryCode: 'US',
    impactAmount: 1680,
    windowDays: 45,
    owner: '李崇（海外仓运营）',
    dueDate: '2026-10-20',
    summary: '备货覆盖率超目标上限，按现订单节奏将新增约 1680 万元资金占用。',
    tags: ['海外仓', '备货前置'],
    analysis: INVENTORY_AGING_ANALYSIS,
  },
];

/* ------------------------------------------------------------------ */
/* 风险类型分布（count 合计 = 24，与 ALERTS 逐类型一致）                */
/* ------------------------------------------------------------------ */

export const RISK_DISTRIBUTION: readonly RiskDistributionItem[] = [
  { type: 'inventory', count: 5, amount: 6340, level: 'L4' },
  { type: 'receivable', count: 4, amount: 6220, level: 'L4' },
  { type: 'cash', count: 4, amount: 2940, level: 'L3' },
  { type: 'fx', count: 4, amount: 2910, level: 'L3' },
  { type: 'logistics', count: 4, amount: 2520, level: 'L3' },
  { type: 'policy', count: 3, amount: 3840, level: 'L4' },
];

/* ------------------------------------------------------------------ */
/* 国别风险分布（四个等级合计 = 24）                                   */
/* ------------------------------------------------------------------ */

export const RISK_BY_COUNTRY: readonly CountryRiskRow[] = [
  { country: '德国', countryCode: 'DE', L4: 4, L3: 2, L2: 0, L1: 0, exposure: 12400 },
  { country: '美国', countryCode: 'US', L4: 1, L3: 3, L2: 2, L1: 0, exposure: 9800 },
  { country: '荷兰', countryCode: 'NL', L4: 0, L3: 2, L2: 0, L1: 0, exposure: 3600 },
  { country: '英国', countryCode: 'GB', L4: 0, L3: 0, L2: 2, L1: 1, exposure: 2800 },
  { country: '意大利', countryCode: 'IT', L4: 0, L3: 1, L2: 0, L1: 1, exposure: 1500 },
  { country: '澳大利亚', countryCode: 'AU', L4: 0, L3: 0, L2: 1, L1: 1, exposure: 900 },
  { country: '南非', countryCode: 'ZA', L4: 0, L3: 0, L2: 2, L1: 1, exposure: 600 },
];

/* ------------------------------------------------------------------ */
/* 近 14 天新增风险趋势                                                */
/* ------------------------------------------------------------------ */

/** 每日新增风险条数序列（2–8 条） */
const RISK_TREND_VALUES: readonly number[] = genIntSeries(5014, 14, 4.6, 0.06, 1.5).map((n) =>
  clamp(n, 2, 8),
);

export const RISK_TREND: readonly SeriesPoint[] = dayLabels(DEMO_AS_OF_DATE, 14).map(
  (iso, index) => ({
    label: shortDay(iso),
    value: RISK_TREND_VALUES[index],
  }),
);
