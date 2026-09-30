/**
 * 外部风险雷达 Mock 数据（Demo 示例数据）。
 *
 * 本文件全部内容为产品演示所用的示例数据：汇率行情、全球集装箱运价指数、航线运价与时效、
 * 港口拥堵、贸易政策风险、外部风险清单与原材料价格，均由固定种子的伪随机序列推导而来，
 * 不代表沃太能源（AlphaESS）任何时点的真实行情，也不构成经营或投资建议。
 *
 * 口径对齐说明：
 *  1. 汇率末点与现金流 / 外汇页保持一致：USD/CNY 7.0862、EUR/CNY 8.3145、GBP/CNY 9.5620，
 *     且序列末两点之差与该条的 changeAbs 完全对应，图中环比与卡片数字不会打架；
 *  2. 长序列一律由 ./_random 生成后按比例校准到目标值，源文件中不出现硬编码数列；
 *  3. 美国储能产品关税影响金额 1,980 万元与预警中心、晨会摘要、AI 助手中的同一风险一致；
 *  4. 本页 riskLevel 仅表示「外部信号自身的剧烈程度」，与外币敞口风险的等级口径不同，
 *     因此同一币种在本页与现金流页可能落在不同等级。
 */

import type {
  ExternalRiskItem,
  FxRateSeries,
  PolicyRisk,
  PortCongestion,
  RadarPageData,
  RiskLevel,
  SeriesPoint,
  ShippingIndex,
  ShippingLane,
} from '../../core/models';
import { DEMO_AS_OF_DATE, DEMO_AS_OF_TIME, dayLabels, genSeries, round, seedFrom } from './_random';

/* ------------------------------------------------------------------ */
/* 基础参数                                                            */
/* ------------------------------------------------------------------ */

/** 汇率走势点数 */
const FX_DAYS = 90;
/** 运价指数走势点数 */
const INDEX_DAYS = 90;
/** 航线运价走势点数 */
const LANE_DAYS = 60;
/** 原材料价格走势点数 */
const MATERIAL_DAYS = 60;
/** high30 / low30 的统计窗口（天） */
const HIGH_LOW_WINDOW = 30;
/** 汇率保留小数位 */
const FX_DIGITS = 4;

/* ------------------------------------------------------------------ */
/* 序列生成：按比例校准末点，必要时同时校准倒数第二点                    */
/* ------------------------------------------------------------------ */

interface SeriesSpec {
  readonly seed: string;
  readonly labels: readonly string[];
  /** 序列起点 */
  readonly base: number;
  /** 每期趋势增量 */
  readonly drift: number;
  /** 噪声幅度（绝对值） */
  readonly noise: number;
  readonly digits: number;
  /** 末点目标值 */
  readonly target: number;
  /** 倒数第二点目标值（用于让「环比」与展示数字一致） */
  readonly prevTarget?: number;
}

/**
 * 生成序列并把末点校准到 target。
 * 随机序列只负责走势形态，关键数值由比例变换 + 末点赋值保证精确。
 */
function buildSeries(spec: SeriesSpec): SeriesPoint[] {
  const raw = genSeries(
    seedFrom(spec.seed),
    spec.labels.length,
    spec.base,
    spec.drift,
    spec.noise,
    spec.digits,
  );
  const last = raw[raw.length - 1];
  const factor = last === 0 ? 1 : spec.target / last;
  const values = raw.map((value) => round(value * factor, spec.digits));
  values[values.length - 1] = spec.target;
  if (spec.prevTarget !== undefined) {
    values[values.length - 2] = spec.prevTarget;
  }
  return spec.labels.map((label, index) => ({ label, value: values[index] }));
}

/** 取序列最后 count 个点的最高值 */
function highOf(points: readonly SeriesPoint[], count: number): number {
  return points.slice(-count).reduce((max, point) => Math.max(max, point.value), -Infinity);
}

/** 取序列最后 count 个点的最低值 */
function lowOf(points: readonly SeriesPoint[], count: number): number {
  return points.slice(-count).reduce((min, point) => Math.min(min, point.value), Infinity);
}

/** 港口拥堵等级：与平均等待时长挂钩，等待越久等级越高 */
function congestionLevel(waitHours: number): RiskLevel {
  if (waitHours >= 40) return 'L4';
  if (waitHours >= 25) return 'L3';
  if (waitHours >= 12) return 'L2';
  return 'L1';
}

/* ------------------------------------------------------------------ */
/* 汇率行情                                                            */
/* ------------------------------------------------------------------ */

interface FxSpec {
  readonly pair: string;
  readonly base: string;
  readonly quote: string;
  readonly current: number;
  readonly changePct: number;
  readonly changeAbs: number;
  readonly level: RiskLevel;
  readonly seed: string;
  /** 90 天前起点 */
  readonly startRate: number;
  readonly drift: number;
  readonly noise: number;
  readonly note: string;
}

const FX_SPECS: readonly FxSpec[] = [
  {
    pair: 'USD/CNY',
    base: 'USD',
    quote: 'CNY',
    current: 7.0862,
    changePct: -0.42,
    changeAbs: -0.0298,
    level: 'L2',
    seed: 'radar-fx-usd',
    startRate: 7.152,
    drift: -0.0008,
    noise: 0.0035,
    note: 'Demo 模拟汇率序列：以 2026-09-15 中间价 7.0862 为末点，日环比与上一交易日中间价对比；近 90 天美元整体震荡走弱，波动幅度为演示设定的示例值。',
  },
  {
    pair: 'EUR/CNY',
    base: 'EUR',
    quote: 'CNY',
    current: 8.3145,
    changePct: 1.18,
    changeAbs: 0.0969,
    level: 'L3',
    seed: 'radar-fx-eur',
    startRate: 8.08,
    drift: 0.0027,
    noise: 0.0042,
    note: 'Demo 模拟汇率序列：以 2026-09-15 中间价 8.3145 为末点；欧元是集团规模最大的外币敞口币种，近 90 天持续走强，序列仅用于演示走势形态。',
  },
  {
    pair: 'GBP/CNY',
    base: 'GBP',
    quote: 'CNY',
    current: 9.562,
    changePct: 0.36,
    changeAbs: 0.0343,
    level: 'L2',
    seed: 'radar-fx-gbp',
    startRate: 9.42,
    drift: 0.0018,
    noise: 0.005,
    note: 'Demo 模拟汇率序列：以 2026-09-15 中间价 9.5620 为末点；近 90 天温和上行，英镑敞口集中度低于欧元，汇率敏感度相对可控。',
  },
];

const FX_LABELS: readonly string[] = dayLabels(DEMO_AS_OF_DATE, FX_DAYS);

const FX_RATES: readonly FxRateSeries[] = FX_SPECS.map((spec) => {
  const series = buildSeries({
    seed: spec.seed,
    labels: FX_LABELS,
    base: spec.startRate,
    drift: spec.drift,
    noise: spec.noise,
    digits: FX_DIGITS,
    target: spec.current,
    prevTarget: round(spec.current - spec.changeAbs, FX_DIGITS),
  });
  return {
    pair: spec.pair,
    base: spec.base,
    quote: spec.quote,
    current: spec.current,
    changePct: spec.changePct,
    changeAbs: spec.changeAbs,
    high30: highOf(series, HIGH_LOW_WINDOW),
    low30: lowOf(series, HIGH_LOW_WINDOW),
    level: spec.level,
    series,
    note: spec.note,
    nature: 'demo',
  };
});

/* ------------------------------------------------------------------ */
/* 全球集装箱运价指数                                                   */
/* ------------------------------------------------------------------ */

const INDEX_LABELS: readonly string[] = dayLabels(DEMO_AS_OF_DATE, INDEX_DAYS);

const SHIPPING_INDEX: ShippingIndex = {
  code: 'WCI',
  name: '全球集装箱运价综合指数（Demo 口径）',
  value: 3128,
  changePct: 6.4,
  changeAbs: 188,
  level: 'L3',
  series: buildSeries({
    seed: 'radar-wci-index',
    labels: INDEX_LABELS,
    base: 2980,
    drift: 3,
    noise: 4,
    digits: 0,
    target: 3128,
  }),
  nature: 'demo',
  note: 'Demo 模拟运价指数：末点取 3,128 点，changePct 与 changeAbs 为周环比口径；序列由固定种子生成，仅用于演示运价上行趋势。',
};

/* ------------------------------------------------------------------ */
/* 航线运价与时效（4 条）                                               */
/* ------------------------------------------------------------------ */

interface LaneSpec {
  readonly lane: string;
  readonly origin: string;
  readonly destination: string;
  readonly rate: number;
  readonly changePct: number;
  readonly transitDays: number;
  readonly transitChangeDays: number;
  readonly bookingDifficulty: number;
  readonly level: RiskLevel;
  readonly seed: string;
  readonly base: number;
  readonly drift: number;
  readonly noise: number;
  readonly note: string;
}

const LANE_SPECS: readonly LaneSpec[] = [
  {
    lane: '上海 → 鹿特丹',
    origin: '上海',
    destination: '鹿特丹',
    rate: 4260,
    changePct: 9.2,
    transitDays: 38,
    transitChangeDays: 6,
    bookingDifficulty: 78,
    level: 'L3',
    seed: 'radar-lane-rotterdam',
    base: 3560,
    drift: 12,
    noise: 14,
    note: '欧线主力航线：周环比 +9.2%（约 +359 美元 / 40ft），平均时效 38 天、较上月延长 6 天，订舱难度指数 78；changePct 为周环比口径，序列为 60 天 Demo 模拟走势。',
  },
  {
    lane: '上海 → 汉堡',
    origin: '上海',
    destination: '汉堡',
    rate: 4180,
    changePct: 7.4,
    transitDays: 36,
    transitChangeDays: 5,
    bookingDifficulty: 72,
    level: 'L3',
    seed: 'radar-lane-hamburg',
    base: 3640,
    drift: 10,
    noise: 13,
    note: '德国仓主要补给航线：运价涨幅略低于鹿特丹，但时效延长 5 天，直接推高德国仓库存的资金占用周期；Demo 模拟数据。',
  },
  {
    lane: '上海 → 洛杉矶',
    origin: '上海',
    destination: '洛杉矶',
    rate: 3620,
    changePct: 2.1,
    transitDays: 21,
    transitChangeDays: 1,
    bookingDifficulty: 58,
    level: 'L2',
    seed: 'radar-lane-losangeles',
    base: 3460,
    drift: 4.2,
    noise: 9,
    note: '北美线运价小幅上行，时效仅延长 1 天、订舱难度中等；需关注美国关税窗口对四季度发运节奏的扰动。',
  },
  {
    lane: '宁波 → 悉尼',
    origin: '宁波',
    destination: '悉尼',
    rate: 2980,
    changePct: -1.8,
    transitDays: 24,
    transitChangeDays: 0,
    bookingDifficulty: 46,
    level: 'L1',
    seed: 'radar-lane-sydney',
    base: 3120,
    drift: -3.6,
    noise: 7,
    note: '澳新线运价与时效基本稳定，订舱难度为四条航线中最低；Demo 模拟数据。',
  },
];

const LANE_LABELS: readonly string[] = dayLabels(DEMO_AS_OF_DATE, LANE_DAYS);

const SHIPPING_LANES: readonly ShippingLane[] = LANE_SPECS.map((spec) => ({
  lane: spec.lane,
  origin: spec.origin,
  destination: spec.destination,
  rate: spec.rate,
  changePct: spec.changePct,
  changeAbs: Math.round(spec.rate - spec.rate / (1 + spec.changePct / 100)),
  transitDays: spec.transitDays,
  transitChangeDays: spec.transitChangeDays,
  bookingDifficulty: spec.bookingDifficulty,
  level: spec.level,
  series: buildSeries({
    seed: spec.seed,
    labels: LANE_LABELS,
    base: spec.base,
    drift: spec.drift,
    noise: spec.noise,
    digits: 0,
    target: spec.rate,
  }),
  note: spec.note,
  nature: 'demo',
}));

/* ------------------------------------------------------------------ */
/* 港口拥堵（5 条，等级与平均等待时长挂钩）                              */
/* ------------------------------------------------------------------ */

interface PortSpec {
  readonly port: string;
  readonly country: string;
  readonly waitHours: number;
  readonly changeHours: number;
}

const PORT_SPECS: readonly PortSpec[] = [
  { port: '鹿特丹', country: 'NL', waitHours: 44, changeHours: 11 },
  { port: '汉堡', country: 'DE', waitHours: 33, changeHours: 8 },
  { port: '洛杉矶', country: 'US', waitHours: 21, changeHours: 4 },
  { port: '长滩', country: 'US', waitHours: 17, changeHours: 2 },
  { port: '悉尼', country: 'AU', waitHours: 9, changeHours: -3 },
];

const PORT_CONGESTION: readonly PortCongestion[] = PORT_SPECS.map((spec) => ({
  port: spec.port,
  country: spec.country,
  waitHours: spec.waitHours,
  changeHours: spec.changeHours,
  level: congestionLevel(spec.waitHours),
}));

/* ------------------------------------------------------------------ */
/* 贸易政策风险（4 条）                                                 */
/* ------------------------------------------------------------------ */

const POLICY_RISKS: readonly PolicyRisk[] = [
  {
    id: 'PR-01',
    title: '美国储能产品关税调整',
    region: '北美',
    level: 'L4',
    impactAmount: 1980,
    probability: '中高（约 60%）',
    window: '2026Q4',
    nature: 'demo',
    note: 'Demo 情景：若美国对进口储能系统加征关税，按对美出口收入敞口测算影响金额约 1,980 万元；实际税率与生效范围以官方公告为准。',
    affectedCountries: ['美国'],
  },
  {
    id: 'PR-02',
    title: '欧盟碳边境调节机制（CBAM）',
    region: '欧盟',
    level: 'L3',
    impactAmount: 760,
    probability: '中等（约 45%）',
    window: '2027H1',
    nature: 'demo',
    note: 'Demo 情景：过渡期结束后需按出口欧盟产品申报隐含碳排放并承担碳成本，测算影响约 760 万元，同时增加单证与核算工作量。',
    affectedCountries: ['德国', '荷兰', '意大利', '西班牙'],
  },
  {
    id: 'PR-03',
    title: '欧盟新电池法规合规要求',
    region: '欧盟',
    level: 'L3',
    impactAmount: 540,
    probability: '高（约 80%）',
    window: '2027H2',
    nature: 'demo',
    note: 'Demo 情景：碳足迹声明、再生材料比例与数字电池护照等要求落地，合规改造与认证预计投入约 540 万元。',
    affectedCountries: ['德国', '荷兰', '意大利'],
  },
  {
    id: 'PR-04',
    title: '南非进口许可审批趋严',
    region: '非洲',
    level: 'L2',
    impactAmount: 180,
    probability: '中等（约 40%）',
    window: '2026Q4',
    nature: 'demo',
    note: 'Demo 情景：进口许可审批周期延长可能造成项目交付延后，按在手订单测算影响约 180 万元，规模有限但需跟踪排期。',
    affectedCountries: ['南非'],
  },
];

/* ------------------------------------------------------------------ */
/* 外部风险清单（8 条：汇率 2 / 海运 3 / 政策 1 / 原材料 2）            */
/* ------------------------------------------------------------------ */

const EXTERNAL_RISKS: readonly ExternalRiskItem[] = [
  {
    id: 'ER-01',
    category: '汇率',
    title: '欧元兑人民币持续走强',
    level: 'L3',
    metric: 'EUR/CNY',
    change: '+1.18%（近 90 天累计 +2.9%）',
    impactAmount: 620,
    note: '欧元升值抬升欧洲应收的折算收入，但同时削弱欧洲经销商的价格竞争力，两端口径需分开评估。',
    nature: 'demo',
  },
  {
    id: 'ER-02',
    category: '汇率',
    title: '美元兑人民币震荡走弱',
    level: 'L2',
    metric: 'USD/CNY',
    change: '-0.42%',
    impactAmount: 340,
    note: '美元走弱压缩北美收入的折算金额，与电芯进口付汇形成部分自然对冲，净影响相对有限。',
    nature: 'demo',
  },
  {
    id: 'ER-03',
    category: '海运',
    title: '欧线运价周环比大幅上行',
    level: 'L3',
    metric: '上海 → 鹿特丹现货运价',
    change: '+9.2%（约 +359 美元 / 40ft）',
    impactAmount: 780,
    note: '欧线运价连续三周上行，按四季度计划发运 68 个 40ft 柜测算，全年化影响约 780 万元。',
    nature: 'demo',
  },
  {
    id: 'ER-04',
    category: '海运',
    title: '欧线平均时效延长',
    level: 'L3',
    metric: '上海 → 鹿特丹平均时效',
    change: '38 天（较上月 +6 天）',
    impactAmount: 460,
    note: '到货推迟 6 天直接拉长德国仓补货周期，在途库存资金占用增加约 460 万元。',
    nature: 'demo',
  },
  {
    id: 'ER-05',
    category: '海运',
    title: '欧洲港口拥堵推高滞期费',
    level: 'L2',
    metric: '鹿特丹平均等待时长',
    change: '44 小时（前值 33 小时）',
    impactAmount: 210,
    note: '等泊时间延长导致滞期费与改配成本上升，按当前挂靠频次测算月均增加约 210 万元。',
    nature: 'demo',
  },
  {
    id: 'ER-06',
    category: '政策',
    title: '美国储能产品关税调整窗口临近',
    level: 'L4',
    metric: '对美出口收入敞口',
    change: '预计窗口 2026Q4，生效概率约 60%',
    impactAmount: 1980,
    note: '关税落地将直接压缩北美业务毛利，是本页影响金额最大的单一外部信号，需提前锁定发运与报价口径。',
    nature: 'demo',
  },
  {
    id: 'ER-07',
    category: '原材料',
    title: '碳酸锂价格触底回升',
    level: 'L3',
    metric: '碳酸锂（电池级）',
    change: '+3.2%（至 107,500 元 / 吨）',
    impactAmount: 520,
    note: '碳酸锂价格回升传导至电芯采购成本，按四季度锁价量测算影响约 520 万元。',
    nature: 'demo',
  },
  {
    id: 'ER-08',
    category: '原材料',
    title: '储能电芯采购价上行',
    level: 'L3',
    metric: '储能电芯（元 / Wh）',
    change: '+1.8%（至 0.412 元 / Wh）',
    impactAmount: 410,
    note: '电芯占整机物料成本约 45%，价格上涨进一步压缩海外仓低价清库的空间。',
    nature: 'demo',
  },
];

/* ------------------------------------------------------------------ */
/* 原材料价格（4 条）                                                   */
/* ------------------------------------------------------------------ */

const MATERIAL_LABELS: readonly string[] = dayLabels(DEMO_AS_OF_DATE, MATERIAL_DAYS);

const RAW_MATERIALS: RadarPageData['rawMaterials'] = [
  {
    name: '碳酸锂（电池级）',
    unit: '元/吨',
    price: 107500,
    changePct: 3.2,
    level: 'L3',
    series: buildSeries({
      seed: 'radar-material-lithium',
      labels: MATERIAL_LABELS,
      base: 102000,
      drift: 195,
      noise: 230,
      digits: 0,
      target: 107500,
    }),
    nature: 'demo',
  },
  {
    name: '磷酸铁锂正极材料',
    unit: '元/吨',
    price: 34200,
    changePct: 1.6,
    level: 'L3',
    series: buildSeries({
      seed: 'radar-material-lfp',
      labels: MATERIAL_LABELS,
      base: 33700,
      drift: 2.6,
      noise: 34,
      digits: 0,
      target: 34200,
    }),
    nature: 'demo',
  },
  {
    name: '储能电芯',
    unit: '元/Wh',
    price: 0.412,
    changePct: 1.8,
    level: 'L3',
    series: buildSeries({
      seed: 'radar-material-cell',
      labels: MATERIAL_LABELS,
      base: 0.4035,
      drift: 0.0001,
      noise: 0.00035,
      digits: 3,
      target: 0.412,
    }),
    nature: 'demo',
  },
  {
    name: '结构件（机柜与支架）',
    unit: '元/套',
    price: 168,
    changePct: -0.9,
    level: 'L2',
    series: buildSeries({
      seed: 'radar-material-frame',
      labels: MATERIAL_LABELS,
      base: 170,
      drift: -0.06,
      noise: 0.18,
      digits: 0,
      target: 168,
    }),
    nature: 'demo',
  },
];

/* ------------------------------------------------------------------ */
/* 页面组装                                                            */
/* ------------------------------------------------------------------ */

export const RADAR_PAGE: RadarPageData = {
  asOf: DEMO_AS_OF_TIME,
  fxRates: FX_RATES,
  shippingIndex: SHIPPING_INDEX,
  shippingLanes: SHIPPING_LANES,
  portCongestion: PORT_CONGESTION,
  policyRisks: POLICY_RISKS,
  externalRisks: EXTERNAL_RISKS,
  rawMaterials: RAW_MATERIALS,
};
