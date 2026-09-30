/**
 * 应收客户与催收队列（Demo 示例数据）。
 *
 * 【Demo 示例数据】本文件中的全部客户名称、国家、金额、账龄、评级与日期均为按业务逻辑
 * 构造的示例数据，仅用于演示「WorkCap Sentinel 现金哨兵」的应收看板、账龄结构与催收队列，
 * 不代表沃太能源（AlphaESS）任何时点的真实客户或真实经营数据。
 *
 * 约定：
 *  1. 金额单位统一为「万元」；
 *  2. 账龄分桶中的 qty 承载该账龄区间的应收金额（万元），与 value 同值，便于图表直接复用；
 *  3. 各桶 qty 合计恒等于 receivable；
 *  4. 长序列（12 个月回款趋势）由固定种子推导，不使用硬编码字面量；
 *  5. creditLimit 与 customerAnalysis 证据卡中的「授信额度」口径一致（应收余额的 1.2 倍，取整到百位）。
 */

import type {
  AgingBucket,
  CollectionQueueItem,
  CreditRating,
  CustomerRow,
  RiskLevel,
} from '../../core/models';
import { addDays, clamp, DEMO_AS_OF_DATE, genSeries, seedFrom } from './_random';
import { customerAnalysis } from './analyses.mock';

/** 账龄分桶标签（与全站账龄结构图保持一致） */
export const AGING_BUCKET_LABELS: readonly string[] = [
  '0–30 天',
  '31–60 天',
  '61–90 天',
  '91–180 天',
  '180 天以上',
];

/** 客户种子数据：不含由公式派生的 creditLimit / 分桶 / 趋势 / 发票 / 分析 */
interface CustomerSeed {
  readonly id: string;
  readonly name: string;
  readonly channelType: string;
  readonly country: string;
  readonly countryCode: string;
  readonly receivable: number;
  readonly agingDays: number;
  readonly overdueDays: number;
  readonly creditRating: CreditRating;
  readonly expectedCollection: number;
  readonly expectedDate: string;
  readonly level: RiskLevel;
  readonly score: number;
  readonly collectionPriority: number;
  readonly owner: string;
  readonly lastPaymentDate: string;
}

/**
 * 按逾期与账龄推导 5 个账龄区间的权重（已归一化，合计为 1）。
 * 逾期越久，资金越集中到 61 天以上的桶；账龄越长，31 天以上的桶越厚。
 */
function agingWeights(agingDays: number, overdueDays: number): readonly number[] {
  const risk = clamp(overdueDays / 90, 0, 1);
  const aged = clamp((agingDays - 30) / 90, 0, 1);
  const fresh = clamp(1 - risk * 0.85 - aged * 0.45, 0.05, 0.75);
  const w1 = 0.12 + aged * 0.16;
  const w2 = 0.1 + risk * 0.22;
  const w3 = 0.06 + risk * 0.3;
  const w4 = risk * 0.22;
  const total = fresh + w1 + w2 + w3 + w4;
  return [fresh / total, w1 / total, w2 / total, w3 / total, w4 / total];
}

/** 生成账龄分桶：前 4 桶向下取整，最后一桶吸收尾差，保证合计 = receivable */
function buildAgingBuckets(
  agingDays: number,
  overdueDays: number,
  receivable: number,
): readonly AgingBucket[] {
  const weights = agingWeights(agingDays, overdueDays);
  const buckets: AgingBucket[] = [];
  let allocated = 0;
  for (let i = 0; i < AGING_BUCKET_LABELS.length - 1; i += 1) {
    const value = Math.floor(receivable * weights[i]);
    allocated += value;
    buckets.push({ bucket: AGING_BUCKET_LABELS[i], qty: value, value });
  }
  const last = Math.max(0, receivable - allocated);
  buckets.push({
    bucket: AGING_BUCKET_LABELS[AGING_BUCKET_LABELS.length - 1],
    qty: last,
    value: last,
  });
  return buckets;
}

/** 近 12 个月回款趋势（万元）：由固定种子推导，并把末点校准到月均计划回款额 */
function buildCollectionTrend(id: string, expectedCollection: number): readonly number[] {
  const monthly = Math.max(4, Math.round(expectedCollection / 12));
  const raw = genSeries(
    seedFrom(id),
    12,
    Math.round(monthly * 1.18),
    Math.round(monthly * 0.02),
    Math.round(monthly * 0.16),
    0,
  );
  const last = raw[raw.length - 1];
  const scale = last > 0 ? monthly / last : 1;
  return raw.map((value) => Math.max(0, Math.round(value * scale)));
}

/** 逾期发票清单：金额合计与五段式分析中的逾期金额口径一致 */
function buildOverdueInvoices(
  id: string,
  receivable: number,
  overdueDays: number,
): readonly { invoiceNo: string; amount: number; dueDate: string; overdueDays: number }[] {
  if (overdueDays <= 0) {
    return [];
  }
  const count = clamp(Math.round(overdueDays / 20), 1, 4);
  const total = Math.round(receivable * clamp(overdueDays / 120, 0.05, 0.6));
  const seq = (seedFrom(`${id}:invoice`) % 700) + 120;
  const invoices: { invoiceNo: string; amount: number; dueDate: string; overdueDays: number }[] = [];
  let allocated = 0;
  for (let i = 0; i < count; i += 1) {
    const isLast = i === count - 1;
    const amount = isLast
      ? Math.max(1, total - allocated)
      : Math.max(1, Math.round((total * 0.5) / (i + 1)));
    allocated += amount;
    const days = Math.max(1, Math.round(overdueDays * (1 - i * 0.25)));
    invoices.push({
      invoiceNo: `INV-2026-0${String(seq + i * 37).padStart(3, '0')}`,
      amount,
      dueDate: addDays(DEMO_AS_OF_DATE, -days),
      overdueDays: days,
    });
  }
  return invoices;
}

/** 催收队列的「下一步动作」，按客户风险等级给出对应口径 */
function nextStepFor(row: CustomerRow): string {
  switch (row.level) {
    case 'L4':
      return `24 小时内发出正式催收函，由 ${row.owner} 牵头高层沟通，同步冻结新增发货`;
    case 'L3':
      return `3 个工作日内取得书面付款计划确认函，由 ${row.owner} 每周跟进回款进度`;
    case 'L2':
      return `本周内完成逾期发票核对与对账函发送，由 ${row.owner} 在周例会复盘`;
    case 'L1':
      return `维持常规账期管理，由 ${row.owner} 按月复核账龄结构`;
    default:
      return `由 ${row.owner} 持续跟踪回款进度`;
  }
}

/** 18 家客户种子（按催收优先级 1→18 排列） */
const CUSTOMER_SEEDS: readonly CustomerSeed[] = [
  {
    id: 'CUST-DE-001',
    name: 'OSW Energy GmbH',
    channelType: '欧洲经销商',
    country: '德国',
    countryCode: 'DE',
    receivable: 3480,
    agingDays: 96,
    overdueDays: 68,
    creditRating: 'BB',
    expectedCollection: 2260,
    expectedDate: '2026-10-08',
    level: 'L4',
    score: 86,
    collectionPriority: 1,
    owner: '王倩（欧洲应收）',
    lastPaymentDate: '2026-06-24',
  },
  {
    id: 'CUST-IT-001',
    name: 'SolarEdge Distribution S.p.A.',
    channelType: '欧洲安装商渠道',
    country: '意大利',
    countryCode: 'IT',
    receivable: 3120,
    agingDays: 92,
    overdueDays: 61,
    creditRating: 'B',
    expectedCollection: 1960,
    expectedDate: '2026-10-12',
    level: 'L4',
    score: 84,
    collectionPriority: 2,
    owner: '王倩（欧洲应收）',
    lastPaymentDate: '2026-06-30',
  },
  {
    id: 'CUST-US-001',
    name: 'Blue Peak Power Inc.',
    channelType: '北美经销商',
    country: '美国',
    countryCode: 'US',
    receivable: 2680,
    agingDays: 88,
    overdueDays: 54,
    creditRating: 'BB',
    expectedCollection: 1780,
    expectedDate: '2026-10-16',
    level: 'L4',
    score: 81,
    collectionPriority: 3,
    owner: '陈曦（北美应收）',
    lastPaymentDate: '2026-07-05',
  },
  {
    id: 'CUST-GB-001',
    name: 'Waxman Energy Ltd',
    channelType: '欧洲经销商',
    country: '英国',
    countryCode: 'GB',
    receivable: 2380,
    agingDays: 84,
    overdueDays: 47,
    creditRating: 'BBB',
    expectedCollection: 1640,
    expectedDate: '2026-10-20',
    level: 'L3',
    score: 78,
    collectionPriority: 4,
    owner: '王倩（欧洲应收）',
    lastPaymentDate: '2026-07-12',
  },
  {
    id: 'CUST-NL-001',
    name: 'Immersa B.V.',
    channelType: '欧洲经销商',
    country: '荷兰',
    countryCode: 'NL',
    receivable: 2160,
    agingDays: 79,
    overdueDays: 42,
    creditRating: 'BB',
    expectedCollection: 1460,
    expectedDate: '2026-10-24',
    level: 'L3',
    score: 74,
    collectionPriority: 5,
    owner: '王倩（欧洲应收）',
    lastPaymentDate: '2026-07-18',
  },
  {
    id: 'CUST-ES-001',
    name: 'Ibervolt Energía S.L.',
    channelType: '欧洲安装商渠道',
    country: '西班牙',
    countryCode: 'ES',
    receivable: 1780,
    agingDays: 76,
    overdueDays: 38,
    creditRating: 'BB',
    expectedCollection: 1220,
    expectedDate: '2026-10-28',
    level: 'L3',
    score: 71,
    collectionPriority: 6,
    owner: '王倩（欧洲应收）',
    lastPaymentDate: '2026-07-22',
  },
  {
    id: 'CUST-AU-001',
    name: 'AusGrid Storage Pty',
    channelType: '亚太经销商',
    country: '澳洲',
    countryCode: 'AU',
    receivable: 1620,
    agingDays: 72,
    overdueDays: 34,
    creditRating: 'BBB',
    expectedCollection: 1150,
    expectedDate: '2026-11-02',
    level: 'L3',
    score: 68,
    collectionPriority: 7,
    owner: '刘洋（亚太应收）',
    lastPaymentDate: '2026-07-28',
  },
  {
    id: 'CUST-US-002',
    name: 'GreatLakes Energy Systems LLC',
    channelType: '北美安装商渠道',
    country: '美国',
    countryCode: 'US',
    receivable: 1340,
    agingDays: 68,
    overdueDays: 29,
    creditRating: 'A',
    expectedCollection: 980,
    expectedDate: '2026-11-05',
    level: 'L3',
    score: 63,
    collectionPriority: 8,
    owner: '陈曦（北美应收）',
    lastPaymentDate: '2026-08-03',
  },
  {
    id: 'CUST-CA-001',
    name: 'Northwind Storage Corp.',
    channelType: '北美经销商',
    country: '加拿大',
    countryCode: 'CA',
    receivable: 1280,
    agingDays: 62,
    overdueDays: 24,
    creditRating: 'BBB',
    expectedCollection: 960,
    expectedDate: '2026-11-09',
    level: 'L2',
    score: 58,
    collectionPriority: 9,
    owner: '陈曦（北美应收）',
    lastPaymentDate: '2026-08-08',
  },
  {
    id: 'CUST-JP-001',
    name: 'Sakura Smart Energy 株式会社',
    channelType: '亚太经销商',
    country: '日本',
    countryCode: 'JP',
    receivable: 1080,
    agingDays: 58,
    overdueDays: 19,
    creditRating: 'A',
    expectedCollection: 850,
    expectedDate: '2026-11-12',
    level: 'L2',
    score: 54,
    collectionPriority: 10,
    owner: '刘洋（亚太应收）',
    lastPaymentDate: '2026-08-12',
  },
  {
    id: 'CUST-ZA-001',
    name: 'Cape Solar Trading (Pty) Ltd',
    channelType: '非洲经销商',
    country: '南非',
    countryCode: 'ZA',
    receivable: 940,
    agingDays: 55,
    overdueDays: 16,
    creditRating: 'BB',
    expectedCollection: 700,
    expectedDate: '2026-11-16',
    level: 'L2',
    score: 51,
    collectionPriority: 11,
    owner: '刘洋（亚太应收）',
    lastPaymentDate: '2026-08-15',
  },
  {
    id: 'CUST-DE-002',
    name: 'Nordkraft Speicher GmbH',
    channelType: '欧洲经销商',
    country: '德国',
    countryCode: 'DE',
    receivable: 820,
    agingDays: 51,
    overdueDays: 12,
    creditRating: 'A',
    expectedCollection: 660,
    expectedDate: '2026-11-20',
    level: 'L2',
    score: 48,
    collectionPriority: 12,
    owner: '何静（信用管理）',
    lastPaymentDate: '2026-08-18',
  },
  {
    id: 'CUST-NL-002',
    name: 'Delta Storage Systems B.V.',
    channelType: '欧洲安装商渠道',
    country: '荷兰',
    countryCode: 'NL',
    receivable: 660,
    agingDays: 47,
    overdueDays: 9,
    creditRating: 'BBB',
    expectedCollection: 540,
    expectedDate: '2026-11-24',
    level: 'L2',
    score: 45,
    collectionPriority: 13,
    owner: '何静（信用管理）',
    lastPaymentDate: '2026-08-20',
  },
  {
    id: 'CUST-GB-002',
    name: 'Chesterfield Renewables Ltd',
    channelType: '欧洲经销商',
    country: '英国',
    countryCode: 'GB',
    receivable: 520,
    agingDays: 43,
    overdueDays: 6,
    creditRating: 'A',
    expectedCollection: 440,
    expectedDate: '2026-11-27',
    level: 'L2',
    score: 42,
    collectionPriority: 14,
    owner: '王倩（欧洲应收）',
    lastPaymentDate: '2026-08-23',
  },
  {
    id: 'CUST-ES-002',
    name: 'SolAndalucía Instalaciones S.L.',
    channelType: '欧洲安装商渠道',
    country: '西班牙',
    countryCode: 'ES',
    receivable: 420,
    agingDays: 38,
    overdueDays: 4,
    creditRating: 'AA',
    expectedCollection: 360,
    expectedDate: '2026-12-01',
    level: 'L1',
    score: 36,
    collectionPriority: 15,
    owner: '王倩（欧洲应收）',
    lastPaymentDate: '2026-08-26',
  },
  {
    id: 'CUST-PL-001',
    name: 'Wisła Energy Solutions Sp. z o.o.',
    channelType: '欧洲经销商',
    country: '波兰',
    countryCode: 'PL',
    receivable: 310,
    agingDays: 33,
    overdueDays: 2,
    creditRating: 'AA',
    expectedCollection: 270,
    expectedDate: '2026-12-04',
    level: 'L1',
    score: 30,
    collectionPriority: 16,
    owner: '何静（信用管理）',
    lastPaymentDate: '2026-08-28',
  },
  {
    id: 'CUST-ME-001',
    name: 'Enerwhere Middle East FZE',
    channelType: '中东经销商',
    country: '阿联酋',
    countryCode: 'AE',
    receivable: 180,
    agingDays: 26,
    overdueDays: 0,
    creditRating: 'AAA',
    expectedCollection: 160,
    expectedDate: '2026-12-08',
    level: 'L1',
    score: 24,
    collectionPriority: 17,
    owner: '刘洋（亚太应收）',
    lastPaymentDate: '2026-08-30',
  },
  {
    id: 'CUST-DE-003',
    name: 'Rheintal Solarhandel GmbH',
    channelType: '欧洲经销商',
    country: '德国',
    countryCode: 'DE',
    receivable: 96,
    agingDays: 21,
    overdueDays: 0,
    creditRating: 'AAA',
    expectedCollection: 84,
    expectedDate: '2026-12-12',
    level: 'L1',
    score: 16,
    collectionPriority: 18,
    owner: '何静（信用管理）',
    lastPaymentDate: '2026-09-02',
  },
];

/** 全量客户清单（应收页、客户详情、预警中心共用） */
export const CUSTOMERS: readonly CustomerRow[] = CUSTOMER_SEEDS.map((seed) => ({
  ...seed,
  creditLimit: Math.round((seed.receivable * 1.2) / 100) * 100,
  agingBuckets: buildAgingBuckets(seed.agingDays, seed.overdueDays, seed.receivable),
  collectionTrend: buildCollectionTrend(seed.id, seed.expectedCollection),
  overdueInvoices: buildOverdueInvoices(seed.id, seed.receivable, seed.overdueDays),
  analysis: customerAnalysis({
    name: seed.name,
    country: seed.country,
    receivable: seed.receivable,
    overdueDays: seed.overdueDays,
    agingDays: seed.agingDays,
    creditRating: seed.creditRating,
    expectedCollection: seed.expectedCollection,
    owner: seed.owner,
    dueDate: seed.expectedDate,
  }),
}));

/** 催收队列：按优先级取前 10 家，队列顺序即处理顺序 */
export const COLLECTION_QUEUE: readonly CollectionQueueItem[] = [...CUSTOMERS]
  .sort((a, b) => a.collectionPriority - b.collectionPriority)
  .slice(0, 10)
  .map((row) => ({
    customerId: row.id,
    customer: row.name,
    country: row.country,
    amount: row.receivable,
    overdueDays: row.overdueDays,
    priority: row.collectionPriority,
    owner: row.owner,
    level: row.level,
    nextStep: nextStepFor(row),
    dueDate: row.expectedDate,
  }));
