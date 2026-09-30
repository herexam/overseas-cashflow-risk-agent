/**
 * SKU 库存风险明细（Demo 示例数据）。
 *
 * 本文件为 WorkCap Sentinel（现金哨兵）产品演示原型的 Mock 数据：SKU 编码、产品型号与仓网归属沿用
 * 沃太能源（AlphaESS）户用储能、工商业储能、便携储能、光伏逆变器、充电桩与电池模组的产品语境，
 * 但库存台数、单位成本、库龄结构、超期占比、风险评分与可释放现金均按业务逻辑构造。
 * 【Demo 示例数据】不代表沃太能源任何时点的真实经营数据，也不构成任何经营或投资建议。
 *
 * 口径说明：
 *  1. 金额单位统一为「万元」。value（库存货值）= round(qty × unitCost / 10000)，unitCost 单位为元/台。
 *  2. warehouseName / country / countryCode 不重复填写，由 warehouseId 反查 WAREHOUSES 主数据派生。
 *  3. level（L4 高风险 / L3 中风险 / L2 关注 / L1 正常）不单独录入，统一由 score 经
 *     riskLevelFromScore 派生，保证「评分」与「分级」永远自洽（>=80 L4 / >=60 L3 / >=40 L2 / 其余 L1）。
 *  4. agingBuckets 的五个桶（0–30 / 31–60 / 61–90 / 91–180 / 180 天以上）台数合计恒等于 qty，
 *     货值合计恒等于 value；桶位结构由 agingDays 经指数衰减模型推导，加权库龄与 agingDays 一致。
 *  5. 仓库主数据中的 overstockRatio 为「该仓全部 SKU 的库龄 90 天以上货值占比」口径；本表仅列示
 *     重点风险 SKU，因此单仓 SKU 子集的超期占比均值会略低于该仓的仓库级数值，两者不可直接比对。
 *  6. 长序列（近 12 个月库存量趋势、近 12 个月出货量）不硬编码数字，统一由固定种子的
 *     _random 工具生成后按末位校准：出货量末位 = qty ÷ orderCoverageMonths，即「订单覆盖月数 =
 *     在库台数 ÷ 近期月均出货台数」，与 orderCoverageMonths 字段同口径。
 *  7. 在途批次批号规则：PO-{countryCode}-{yy}{mm}-{A|B|C}，其中月份取首批 ETA 所在月前推 2 个月，
 *     同批内逐条递增 1 个月；预付金额按批次状态对应的预付比例（已发运 78% / 生产中 50% / 待排产 30%）测算。
 */

import type { AgingBucket, BrakeAction, RiskLevel, SeriesPoint, SkuRow, Warehouse } from '../../core/models';
import { riskLevelFromScore } from '../../core/models';
import {
  DEMO_AS_OF_DATE,
  addDays,
  clamp,
  createRandom,
  genIntSeries,
  genSeries,
  monthLabels,
  round,
  seedFrom,
} from './_random';
import { skuAnalysis } from './analyses.mock';
import { WAREHOUSES } from './warehouses.mock';

/** 库龄分桶标签（与 PRD 分桶口径一致） */
const AGING_BUCKET_LABELS: readonly string[] = ['0–30 天', '31–60 天', '61–90 天', '91–180 天', '180 天以上'];
/** 分桶上界（天），用于指数衰减模型 */
const AGING_BUCKET_BOUNDS: readonly number[] = [30, 60, 90, 180];

/** 各国季度仓储费率（仓储成本 ÷ 库存货值）；欧洲自有仓高于第三方仓，南非仓费率最高 */
const HOLDING_RATE_BY_COUNTRY: Record<string, number> = {
  DE: 0.0157,
  NL: 0.0142,
  GB: 0.015,
  IT: 0.013,
  US: 0.0125,
  AU: 0.011,
  ZA: 0.0195,
  JP: 0.0165,
};
const DEFAULT_HOLDING_RATE = 0.0142;

/** 跌价风险系数：风险等级越高，同样超期敞口下计提越充分 */
const IMPAIRMENT_COEFFICIENT_BY_LEVEL: Record<RiskLevel, number> = {
  L4: 0.73,
  L3: 0.68,
  L2: 0.62,
  L1: 0.58,
};

/** 近 12 个月库存量趋势的月度增长率基准；高风险 SKU 仍在累库，正常 SKU 已开始去库 */
const TREND_GROWTH_BY_LEVEL: Record<RiskLevel, number> = {
  L4: 0.035,
  L3: 0.018,
  L2: 0.004,
  L1: -0.008,
};

/** 在途批次拆分权重（按批次数） */
const BATCH_WEIGHT_BY_COUNT: Record<number, readonly number[]> = {
  1: [1],
  2: [0.62, 0.38],
  3: [0.45, 0.33, 0.22],
};
/** 在途批次状态按到达先后排列 */
const BATCH_STATUSES: readonly string[] = ['已发运', '生产中', '待排产'];
/** 各批次相对数据截止日的 ETA 偏移（天），叠加 0–6 天确定性抖动 */
const BATCH_ETA_OFFSETS: readonly number[] = [16, 40, 64];
/** 批次序号后缀 */
const BATCH_LETTERS: readonly string[] = ['A', 'B', 'C'];
/** 预付比例（按批次状态） */
const PREPAID_RATE_BY_STATUS: Record<string, number> = {
  已发运: 0.78,
  生产中: 0.5,
  待排产: 0.3,
};

const TREND_MONTHS = 12;
/** 趋势序列起点相对当前库存量的比例 */
const TREND_START_RATIO = 0.66;
const TREND_NOISE_RATIO = 0.025;
/** 出货序列起点与波动相对目标出货量的比例 */
const SHIPMENT_START_RATIO = 0.72;
const SHIPMENT_DRIFT_RATIO = 0.02;
const SHIPMENT_NOISE_RATIO = 0.12;

/** SKU 级派生金额（预计跌价风险 / 季度仓储成本 / 现金占用 / CCC 边际影响天数） */
interface SkuAmounts {
  readonly impairmentRisk: number;
  readonly holdingCostQuarter: number;
  readonly cashOccupied: number;
  readonly cccImpactDays: number;
}

/** 在途批次 */
interface InTransitBatchSpec {
  readonly batch: string;
  readonly qty: number;
  readonly eta: string;
  readonly status: string;
  readonly prepaidAmount: number;
}

/** 重点 SKU 录入项（金额与桶结构默认派生，主案例可由 fixed* 字段逐字覆盖） */
interface SkuSpec {
  readonly id: string;
  readonly sku: string;
  readonly name: string;
  readonly productLine: string;
  readonly warehouseId: string;
  readonly qty: number;
  readonly inTransitQty: number;
  readonly unitCost: number;
  readonly agingDays: number;
  readonly orderCoverageMonths: number;
  readonly overstockRatio: number;
  readonly score: number;
  readonly suggestedAction: BrakeAction;
  readonly releaseCash: number;
  readonly owner: string;
  readonly dueDate: string;
  readonly actionReason: string;
  readonly fixedAmounts?: SkuAmounts;
  readonly fixedAgingQty?: readonly number[];
  readonly fixedBatches?: readonly InTransitBatchSpec[];
}

/**
 * 按权重把整数总量分摊到若干份额，使份额合计严格等于总量（最大余数法）。
 * @param total 待分摊总量
 * @param weights 各份额权重（内部归一化，不要求合计为 1）
 * @param minPerItem 每份额保底值
 */
function allocateTotal(total: number, weights: readonly number[], minPerItem = 0): number[] {
  const count = weights.length;
  if (count === 0) {
    return [];
  }
  const sum = weights.reduce((acc, weight) => acc + weight, 0);
  const safeSum = sum === 0 ? 1 : sum;
  const budget = Math.max(0, total - minPerItem * count);
  const exact = weights.map((weight) => (budget * weight) / safeSum);
  const floors = exact.map((item) => Math.floor(item));
  let remainder = Math.round(budget - floors.reduce((acc, item) => acc + item, 0));
  const order = exact
    .map((item, index) => ({ index, frac: item - Math.floor(item) }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index);
  const out = floors.slice();
  let cursor = 0;
  while (remainder > 0 && order.length > 0) {
    const target = order[cursor % order.length];
    out[target.index] += 1;
    remainder -= 1;
    cursor += 1;
  }
  return out.map((item) => item + minPerItem);
}

/**
 * 由加权平均库龄推导分桶权重（指数衰减模型）。
 * 库存停留时间服从参数为 agingDays 的指数分布，落在各库龄区间的概率即为该桶权重，
 * 权重合计恒为 1，据此得到的桶位加权库龄与 agingDays 相互印证。
 */
function agingWeights(agingDays: number): number[] {
  const lambda = Math.max(agingDays, 1);
  const weights: number[] = [];
  let previous = 1;
  for (const bound of AGING_BUCKET_BOUNDS) {
    const current = Math.exp(-bound / lambda);
    weights.push(previous - current);
    previous = current;
  }
  weights.push(previous);
  return weights;
}

/** 按仓库 ID 反查仓库主数据 */
function warehouseById(id: string): Warehouse {
  const found = WAREHOUSES.find((warehouse) => warehouse.id === id);
  if (!found) {
    throw new Error('未找到仓库主数据：' + id);
  }
  return found;
}

/** 按国家代码取季度仓储费率 */
function holdingRateOf(countryCode: string): number {
  return HOLDING_RATE_BY_COUNTRY[countryCode] ?? DEFAULT_HOLDING_RATE;
}

/** 生成库龄分桶：台数按 agingDays 推导（或主案例固定值），货值按台数比例分摊至 value 合计 */
function buildAgingBuckets(spec: SkuSpec, value: number): readonly AgingBucket[] {
  const qtys = spec.fixedAgingQty
    ? spec.fixedAgingQty.slice()
    : allocateTotal(spec.qty, agingWeights(spec.agingDays));
  const values = allocateTotal(value, qtys);
  return AGING_BUCKET_LABELS.map((bucket, index) => ({
    bucket,
    qty: qtys[index],
    value: values[index],
  }));
}

/** 生成在途批次号：PO-{countryCode}-{yy}{mm}-{A|B|C}，月份自首批 ETA 所在月前推 2 个月起逐批递增 */
function buildBatchCodes(countryCode: string, firstEta: string, count: number): string[] {
  const base = new Date(`${firstEta.slice(0, 7)}-01T00:00:00Z`);
  const codes: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const cursor = new Date(base.getTime());
    cursor.setUTCMonth(cursor.getUTCMonth() - 2 + index);
    const year = String(cursor.getUTCFullYear()).slice(2);
    const month = String(cursor.getUTCMonth() + 1).padStart(2, '0');
    codes.push(`PO-${countryCode}-${year}${month}-${BATCH_LETTERS[index] ?? 'Z'}`);
  }
  return codes;
}

/** 生成在途批次：批次数按在途台数推导（1–3 批），ETA 相对数据截止日排布，预付金额按状态比例测算 */
function buildInTransitBatches(spec: SkuSpec, countryCode: string): readonly InTransitBatchSpec[] {
  if (spec.fixedBatches) {
    return spec.fixedBatches;
  }
  if (spec.inTransitQty <= 0) {
    return [];
  }
  const count = clamp(round(spec.inTransitQty / 150, 0), 1, 3);
  const weights = BATCH_WEIGHT_BY_COUNT[count] ?? [1];
  const qtys = allocateTotal(spec.inTransitQty, weights, 1);
  const rand = createRandom(seedFrom(spec.sku + '-BATCH'));
  const firstEta = addDays(DEMO_AS_OF_DATE, (BATCH_ETA_OFFSETS[0] ?? 16) + Math.round(rand() * 6));
  const codes = buildBatchCodes(countryCode, firstEta, count);
  const batches: InTransitBatchSpec[] = [];
  for (let index = 0; index < count; index += 1) {
    const status = BATCH_STATUSES[index] ?? '待排产';
    const offset = BATCH_ETA_OFFSETS[index] ?? BATCH_ETA_OFFSETS[BATCH_ETA_OFFSETS.length - 1];
    const eta = addDays(DEMO_AS_OF_DATE, offset + Math.round(rand() * 6));
    const prepaidRate = PREPAID_RATE_BY_STATUS[status] ?? 0.5;
    const qty = qtys[index];
    batches.push({
      batch: codes[index],
      qty,
      eta,
      status,
      prepaidAmount: Math.max(1, round((qty * spec.unitCost * prepaidRate) / 10000, 0)),
    });
  }
  return batches;
}

/** 生成近 12 个月库存量趋势，末位校准为当前库存台数 */
function buildTrend(spec: SkuSpec, level: RiskLevel): readonly number[] {
  const growth = TREND_GROWTH_BY_LEVEL[level];
  const raw = genIntSeries(
    seedFrom(spec.sku + '-TREND'),
    TREND_MONTHS,
    spec.qty * TREND_START_RATIO,
    spec.qty * growth,
    Math.max(1, spec.qty * TREND_NOISE_RATIO),
  );
  const last = raw[TREND_MONTHS - 1] || 1;
  const scale = spec.qty / last;
  const trend = raw.map((item) => Math.max(1, Math.round(item * scale)));
  trend[TREND_MONTHS - 1] = spec.qty;
  return trend;
}

/** 生成近 12 个月出货量序列，末位校准为 qty ÷ orderCoverageMonths */
function buildMonthlyShipment(spec: SkuSpec): readonly SeriesPoint[] {
  const labels = monthLabels(DEMO_AS_OF_DATE, TREND_MONTHS);
  const target = Math.max(1, round(spec.qty / spec.orderCoverageMonths, 0));
  const raw = genSeries(
    seedFrom(spec.sku + '-SHIP'),
    TREND_MONTHS,
    target * SHIPMENT_START_RATIO,
    target * SHIPMENT_DRIFT_RATIO,
    target * SHIPMENT_NOISE_RATIO,
    0,
  );
  const last = raw[TREND_MONTHS - 1] || 1;
  const scale = target / last;
  const shipment = raw.map((item) => Math.max(1, Math.round(item * scale)));
  shipment[TREND_MONTHS - 1] = target;
  return labels.map((label, index) => ({ label, value: shipment[index] }));
}

/** 派生预计跌价风险、季度仓储成本、现金占用与 CCC 边际影响天数 */
function deriveAmounts(
  value: number,
  level: RiskLevel,
  overstockRatio: number,
  countryCode: string,
): SkuAmounts {
  const coefficient = IMPAIRMENT_COEFFICIENT_BY_LEVEL[level];
  const impairmentRisk = round(value * overstockRatio * coefficient, 0);
  const cashOccupied = round(value * overstockRatio * 0.77, 0);
  const holdingCostQuarter = round(value * holdingRateOf(countryCode), 0);
  const cccImpactDays = Math.max(1, round(cashOccupied / 160, 0));
  return { impairmentRisk, holdingCostQuarter, cashOccupied, cccImpactDays };
}

/** 组装一条完整 SKU 明细（字段顺序与 SkuRow 接口一致） */
function buildSku(spec: SkuSpec): SkuRow {
  const warehouse = warehouseById(spec.warehouseId);
  const value = round((spec.qty * spec.unitCost) / 10000, 0);
  const level = riskLevelFromScore(spec.score);
  const amounts = spec.fixedAmounts ?? deriveAmounts(value, level, spec.overstockRatio, warehouse.countryCode);

  return {
    id: spec.id,
    sku: spec.sku,
    name: spec.name,
    productLine: spec.productLine,
    warehouseId: spec.warehouseId,
    warehouseName: warehouse.name,
    country: warehouse.country,
    countryCode: warehouse.countryCode,
    qty: spec.qty,
    inTransitQty: spec.inTransitQty,
    value,
    unitCost: spec.unitCost,
    agingDays: spec.agingDays,
    orderCoverageMonths: spec.orderCoverageMonths,
    overstockRatio: spec.overstockRatio,
    level,
    score: spec.score,
    suggestedAction: spec.suggestedAction,
    releaseCash: spec.releaseCash,
    owner: spec.owner,
    dueDate: spec.dueDate,
    actionReason: spec.actionReason,
    trend: buildTrend(spec, level),
    inTransitBatches: buildInTransitBatches(spec, warehouse.countryCode),
    agingBuckets: buildAgingBuckets(spec, value),
    impairmentRisk: amounts.impairmentRisk,
    holdingCostQuarter: amounts.holdingCostQuarter,
    cashOccupied: amounts.cashOccupied,
    cccImpactDays: amounts.cccImpactDays,
    monthlyShipment: buildMonthlyShipment(spec),
    analysis: skuAnalysis({
      sku: spec.sku,
      name: spec.name,
      warehouseName: warehouse.name,
      country: warehouse.country,
      qty: spec.qty,
      inTransitQty: spec.inTransitQty,
      value,
      agingDays: spec.agingDays,
      orderCoverageMonths: spec.orderCoverageMonths,
      overstockRatio: spec.overstockRatio,
      impairmentRisk: amounts.impairmentRisk,
      holdingCostQuarter: amounts.holdingCostQuarter,
      cashOccupied: amounts.cashOccupied,
      cccImpactDays: amounts.cccImpactDays,
      owner: spec.owner,
      dueDate: spec.dueDate,
    }),
  };
}

const SKU_SPECS: readonly SkuSpec[] = [
  {
    id: 'SKU-DE-001',
    sku: 'ESS-BAT-05K-DE',
    name: '5kWh 家用储能电池包',
    productLine: '家用储能 ESS',
    warehouseId: 'WH-DE-FRA',
    qty: 1240,
    inTransitQty: 380,
    unitCost: 23065,
    agingDays: 90,
    orderCoverageMonths: 1.2,
    overstockRatio: 0.41,
    score: 88,
    suggestedAction: 'pause',
    releaseCash: 1180,
    owner: '李崇（海外仓运营）',
    dueDate: '2026-09-25',
    actionReason:
      '库存 1240 台、加权库龄 90 天、订单覆盖仅 1.2 个月、超期占比 41%，10kWh 新品已替代 5kWh 主力位，且在途 380 台仍将于 10 月陆续到仓 → 立即暂停该 SKU 新采购，直至覆盖月数回到 2 个月以内',
    fixedAmounts: { impairmentRisk: 860, holdingCostQuarter: 45, cashOccupied: 900, cccImpactDays: 6 },
    fixedAgingQty: [186, 254, 372, 328, 100],
    fixedBatches: [
      { batch: 'PO-DE-2607-A', qty: 180, eta: '2026-09-28', status: '已发运', prepaidAmount: 320 },
      { batch: 'PO-DE-2608-B', qty: 140, eta: '2026-10-12', status: '生产中', prepaidAmount: 232 },
      { batch: 'PO-DE-2609-C', qty: 60, eta: '2026-10-30', status: '待排产', prepaidAmount: 96 },
    ],
  },
  {
    id: 'SKU-DE-002',
    sku: 'ESS-BAT-10K-DE',
    name: '10kWh 家用储能电池包',
    productLine: '家用储能 ESS',
    warehouseId: 'WH-DE-FRA',
    qty: 420,
    inTransitQty: 240,
    unitCost: 41800,
    agingDays: 96,
    orderCoverageMonths: 1.4,
    overstockRatio: 0.48,
    score: 85,
    suggestedAction: 'reduce',
    releaseCash: 960,
    owner: '孙悦（供应链计划）',
    dueDate: '2026-09-28',
    actionReason:
      '库龄 96 天、超期占比 48%，10kWh 同系列新品持续上量分流需求 → 10 月采购量下调 40%，按周滚动复核至覆盖回到 2.5 个月',
  },
  {
    id: 'SKU-DE-003',
    sku: 'ESS-CI-125K-DE',
    name: '125kW/261kWh 工商业储能柜',
    productLine: '工商业储能 C&I',
    warehouseId: 'WH-DE-FRA',
    qty: 12,
    inTransitQty: 18,
    unitCost: 352000,
    agingDays: 104,
    orderCoverageMonths: 1.1,
    overstockRatio: 0.52,
    score: 91,
    suggestedAction: 'pause',
    releaseCash: 1240,
    owner: '李崇（海外仓运营）',
    dueDate: '2026-09-22',
    actionReason:
      '单台货值 35.2 万元（352000 元）的工商业储能柜库龄 104 天，欧洲大储招标整体延后，在途 18 台 10 月到仓 → 冻结新订单，优先转售荷兰、意大利在谈项目',
  },
  {
    id: 'SKU-DE-004',
    sku: 'PCS-INV-10K-DE',
    name: '10kW 三相光伏逆变器',
    productLine: '光伏逆变器',
    warehouseId: 'WH-DE-FRA',
    qty: 620,
    inTransitQty: 320,
    unitCost: 7680,
    agingDays: 88,
    orderCoverageMonths: 1.6,
    overstockRatio: 0.44,
    score: 84,
    suggestedAction: 'reduce',
    releaseCash: 880,
    owner: '赵敏（国际物流）',
    dueDate: '2026-09-30',
    actionReason:
      '库龄 88 天、超期占比 44%，德国户用渠道提货明显放缓，在途 320 台集中 10 月到仓 → 10 月采购量下调 40% 并压降安全库存水位',
  },
  {
    id: 'SKU-DE-005',
    sku: 'PORT-PS-2K-DE',
    name: '2kWh 便携储能电源',
    productLine: '便携储能',
    warehouseId: 'WH-DE-FRA',
    qty: 480,
    inTransitQty: 180,
    unitCost: 6820,
    agingDays: 62,
    orderCoverageMonths: 2.2,
    overstockRatio: 0.3,
    score: 72,
    suggestedAction: 'delay',
    releaseCash: 430,
    owner: '赵敏（国际物流）',
    dueDate: '2026-10-15',
    actionReason:
      '库龄 62 天，促销季后动销环比下滑，在途 180 台 10 月到仓 → 与 3PL 协商把到货推后至 11 月上旬',
  },
  {
    id: 'SKU-DE-006',
    sku: 'BAT-MOD-3K2-DE',
    name: '3.2kWh 磷酸铁锂电池模组',
    productLine: '电池模组',
    warehouseId: 'WH-DE-FRA',
    qty: 560,
    inTransitQty: 240,
    unitCost: 3620,
    agingDays: 58,
    orderCoverageMonths: 2.5,
    overstockRatio: 0.26,
    score: 68,
    suggestedAction: 'delay',
    releaseCash: 320,
    owner: '孙悦（供应链计划）',
    dueDate: '2026-10-20',
    actionReason: '库龄 58 天，整机配套需求同步延后，在途 240 台到仓将与现有库存叠加 → 与供应商协商推后入库 3–4 周',
  },
  {
    id: 'SKU-DE-007',
    sku: 'EV-CHG-22K-DE',
    name: '22kW 交流充电桩',
    productLine: '充电桩',
    warehouseId: 'WH-DE-FRA',
    qty: 180,
    inTransitQty: 60,
    unitCost: 9480,
    agingDays: 46,
    orderCoverageMonths: 3.0,
    overstockRatio: 0.18,
    score: 52,
    suggestedAction: 'transfer',
    releaseCash: 150,
    owner: '周航（资金管理）',
    dueDate: '2026-10-28',
    actionReason: '库龄 46 天，法兰克福自有仓库容使用率 92%，在途 60 台将挤压库位 → 调拨至鹿特丹海外仓就近履约',
  },
  {
    id: 'SKU-DE-008',
    sku: 'ESS-BAT-05H-DE',
    name: '5kWh 家用储能电池包（高压版）',
    productLine: '家用储能 ESS',
    warehouseId: 'WH-DE-FRA',
    qty: 160,
    inTransitQty: 0,
    unitCost: 21800,
    agingDays: 32,
    orderCoverageMonths: 4.2,
    overstockRatio: 0.07,
    score: 31,
    suggestedAction: 'continue',
    releaseCash: 0,
    owner: '孙悦（供应链计划）',
    dueDate: '2026-10-10',
    actionReason: '库龄 32 天、订单覆盖 4.2 个月，动销与补货节奏匹配 → 维持现有采购节奏并按月复核',
  },
  {
    id: 'SKU-NL-101',
    sku: 'ESS-BAT-10K-NL',
    name: '10kWh 家用储能电池包',
    productLine: '家用储能 ESS',
    warehouseId: 'WH-NL-RTM',
    qty: 500,
    inTransitQty: 180,
    unitCost: 41800,
    agingDays: 66,
    orderCoverageMonths: 2.3,
    overstockRatio: 0.29,
    score: 71,
    suggestedAction: 'delay',
    releaseCash: 380,
    owner: '赵敏（国际物流）',
    dueDate: '2026-10-16',
    actionReason: '库龄 66 天，荷兰 Q4 提货计划尚未确认，在途 180 台已进入发运 → 商谈推后到货',
  },
  {
    id: 'SKU-NL-102',
    sku: 'PCS-INV-5K-NL',
    name: '5kW 单相光伏逆变器',
    productLine: '光伏逆变器',
    warehouseId: 'WH-NL-RTM',
    qty: 1200,
    inTransitQty: 400,
    unitCost: 4260,
    agingDays: 48,
    orderCoverageMonths: 3.1,
    overstockRatio: 0.18,
    score: 50,
    suggestedAction: 'reduce',
    releaseCash: 160,
    owner: '孙悦（供应链计划）',
    dueDate: '2026-10-22',
    actionReason: '库龄 48 天，安装商年度备货结束、需求转淡，在途 400 台（两批） → 11 月采购量下调 30%',
  },
  {
    id: 'SKU-NL-103',
    sku: 'EV-CHG-11K-NL',
    name: '11kW 交流充电桩',
    productLine: '充电桩',
    warehouseId: 'WH-NL-RTM',
    qty: 700,
    inTransitQty: 220,
    unitCost: 5920,
    agingDays: 44,
    orderCoverageMonths: 3.3,
    overstockRatio: 0.15,
    score: 47,
    suggestedAction: 'transfer',
    releaseCash: 120,
    owner: '周航（资金管理）',
    dueDate: '2026-10-26',
    actionReason: '库龄 44 天，荷兰渠道竞品降价、提货低于计划，在途 220 台 → 调拨至米兰海外仓',
  },
  {
    id: 'SKU-NL-104',
    sku: 'BAT-MOD-5K1-NL',
    name: '5.1kWh 高压电池模组',
    productLine: '电池模组',
    warehouseId: 'WH-NL-RTM',
    qty: 900,
    inTransitQty: 0,
    unitCost: 7350,
    agingDays: 30,
    orderCoverageMonths: 4.0,
    overstockRatio: 0.06,
    score: 33,
    suggestedAction: 'continue',
    releaseCash: 0,
    owner: '孙悦（供应链计划）',
    dueDate: '2026-10-18',
    actionReason: '库龄 30 天、订单覆盖 4.0 个月 → 维持现有节奏并纳入周度监控',
  },
  {
    id: 'SKU-UK-201',
    sku: 'ESS-BAT-15K-UK',
    name: '15kWh 三相家用储能电池包',
    productLine: '家用储能 ESS',
    warehouseId: 'WH-UK-BHM',
    qty: 220,
    inTransitQty: 120,
    unitCost: 61500,
    agingDays: 60,
    orderCoverageMonths: 2.4,
    overstockRatio: 0.26,
    score: 70,
    suggestedAction: 'delay',
    releaseCash: 340,
    owner: '李崇（海外仓运营）',
    dueDate: '2026-10-14',
    actionReason: '库龄 60 天，英国户用补贴退坡后提货放缓，在途 120 台 → 推后入库并压降 10 月采购量',
  },
  {
    id: 'SKU-UK-202',
    sku: 'PORT-PS-2K-UK',
    name: '2kWh 便携储能电源',
    productLine: '便携储能',
    warehouseId: 'WH-UK-BHM',
    qty: 900,
    inTransitQty: 260,
    unitCost: 6820,
    agingDays: 56,
    orderCoverageMonths: 2.6,
    overstockRatio: 0.23,
    score: 66,
    suggestedAction: 'transfer',
    releaseCash: 280,
    owner: '赵敏（国际物流）',
    dueDate: '2026-10-19',
    actionReason: '库龄 56 天，英国市场进入季节性淡季，在途 260 台 → 转调至法兰克福海外仓',
  },
  {
    id: 'SKU-UK-203',
    sku: 'EV-CHG-22K-UK',
    name: '22kW 交流充电桩',
    productLine: '充电桩',
    warehouseId: 'WH-UK-BHM',
    qty: 380,
    inTransitQty: 80,
    unitCost: 9480,
    agingDays: 40,
    orderCoverageMonths: 3.2,
    overstockRatio: 0.12,
    score: 49,
    suggestedAction: 'reduce',
    releaseCash: 170,
    owner: '周航（资金管理）',
    dueDate: '2026-10-24',
    actionReason: '库龄 40 天，英国提货进度低于计划，在途 80 台 → 10 月采购量下调 30% 并暂停第二批备货',
  },
  {
    id: 'SKU-IT-301',
    sku: 'ESS-CI-60K-IT',
    name: '60kW/123kWh 工商业储能柜',
    productLine: '工商业储能 C&I',
    warehouseId: 'WH-IT-MIL',
    qty: 60,
    inTransitQty: 24,
    unitCost: 168000,
    agingDays: 44,
    orderCoverageMonths: 3.0,
    overstockRatio: 0.15,
    score: 48,
    suggestedAction: 'delay',
    releaseCash: 140,
    owner: '孙悦（供应链计划）',
    dueDate: '2026-10-27',
    actionReason: '库龄 44 天、单台货值 16.8 万元，米兰两个工商业项目验收延后，在途 24 台 → 与供应商协商推后到货',
  },
  {
    id: 'SKU-IT-302',
    sku: 'EV-CHG-22K-IT',
    name: '22kW 交流充电桩',
    productLine: '充电桩',
    warehouseId: 'WH-IT-MIL',
    qty: 640,
    inTransitQty: 140,
    unitCost: 9480,
    agingDays: 30,
    orderCoverageMonths: 3.8,
    overstockRatio: 0.06,
    score: 35,
    suggestedAction: 'continue',
    releaseCash: 0,
    owner: '周航（资金管理）',
    dueDate: '2026-10-12',
    actionReason: '库龄 30 天、订单覆盖 3.8 个月，意大利渠道节奏与补货计划匹配 → 维持',
  },
  {
    id: 'SKU-US-401',
    sku: 'ESS-BAT-13K5-US',
    name: '13.5kWh 家用储能电池包',
    productLine: '家用储能 ESS',
    warehouseId: 'WH-US-LAX',
    qty: 520,
    inTransitQty: 160,
    unitCost: 49200,
    agingDays: 78,
    orderCoverageMonths: 2.4,
    overstockRatio: 0.41,
    score: 74,
    suggestedAction: 'delay',
    releaseCash: 420,
    owner: '赵敏（国际物流）',
    dueDate: '2026-10-17',
    actionReason: '库龄 78 天、超期占比 41%，美国 IRA 补贴口径调整致渠道观望，在途 160 台 → 推后到货并重排 10 月采购',
  },
  {
    id: 'SKU-US-402',
    sku: 'PORT-PS-2K-US',
    name: '2kWh 便携储能电源',
    productLine: '便携储能',
    warehouseId: 'WH-US-LAX',
    qty: 1400,
    inTransitQty: 320,
    unitCost: 6820,
    agingDays: 52,
    orderCoverageMonths: 3.1,
    overstockRatio: 0.25,
    score: 55,
    suggestedAction: 'reduce',
    releaseCash: 190,
    owner: '李崇（海外仓运营）',
    dueDate: '2026-10-23',
    actionReason: '库龄 52 天，黑五备货前置后动销未达预期，在途 320 台 → 11 月采购量下调 40%',
  },
  {
    id: 'SKU-US-403',
    sku: 'PCS-INV-8K-US',
    name: '8kW 单相光伏逆变器',
    productLine: '光伏逆变器',
    warehouseId: 'WH-US-LAX',
    qty: 520,
    inTransitQty: 120,
    unitCost: 6840,
    agingDays: 44,
    orderCoverageMonths: 3.2,
    overstockRatio: 0.19,
    score: 51,
    suggestedAction: 'transfer',
    releaseCash: 130,
    owner: '周航（资金管理）',
    dueDate: '2026-10-29',
    actionReason: '库龄 44 天、超期占比 19%，美国东部订单改由荷兰直发，在途 120 台 → 调拨至鹿特丹海外仓',
  },
  {
    id: 'SKU-US-404',
    sku: 'BAT-MOD-3K2-US',
    name: '3.2kWh 磷酸铁锂电池模组',
    productLine: '电池模组',
    warehouseId: 'WH-US-LAX',
    qty: 1100,
    inTransitQty: 0,
    unitCost: 3620,
    agingDays: 26,
    orderCoverageMonths: 3.6,
    overstockRatio: 0.05,
    score: 37,
    suggestedAction: 'continue',
    releaseCash: 0,
    owner: '孙悦（供应链计划）',
    dueDate: '2026-10-13',
    actionReason: '库龄 26 天、订单覆盖 3.6 个月 → 维持现有采购节奏',
  },
  {
    id: 'SKU-AU-501',
    sku: 'BAT-MOD-3K2-AU',
    name: '3.2kWh 磷酸铁锂电池模组',
    productLine: '电池模组',
    warehouseId: 'WH-AU-SYD',
    qty: 2600,
    inTransitQty: 600,
    unitCost: 3620,
    agingDays: 24,
    orderCoverageMonths: 4.2,
    overstockRatio: 0.04,
    score: 29,
    suggestedAction: 'continue',
    releaseCash: 0,
    owner: '孙悦（供应链计划）',
    dueDate: '2026-10-11',
    actionReason: '库龄 24 天、订单覆盖 4.2 个月，大洋洲提货稳定、在途 600 台分三批到仓 → 维持',
  },
  {
    id: 'SKU-JP-601',
    sku: 'PCS-INV-5K-JP',
    name: '5kW 单相光伏逆变器',
    productLine: '光伏逆变器',
    warehouseId: 'WH-JP-OSA',
    qty: 1900,
    inTransitQty: 420,
    unitCost: 4260,
    agingDays: 22,
    orderCoverageMonths: 4.6,
    overstockRatio: 0.03,
    score: 27,
    suggestedAction: 'continue',
    releaseCash: 0,
    owner: '周航（资金管理）',
    dueDate: '2026-10-09',
    actionReason: '库龄 22 天、订单覆盖 4.6 个月，日本市场小批量高频提货 → 维持',
  },
  {
    id: 'SKU-ZA-701',
    sku: 'ESS-CI-30K-ZA',
    name: '30kW/64kWh 工商业储能柜',
    productLine: '工商业储能 C&I',
    warehouseId: 'WH-ZA-JNB',
    qty: 30,
    inTransitQty: 6,
    unitCost: 128000,
    agingDays: 34,
    orderCoverageMonths: 3.0,
    overstockRatio: 0.11,
    score: 46,
    suggestedAction: 'delay',
    releaseCash: 100,
    owner: '李崇（海外仓运营）',
    dueDate: '2026-10-25',
    actionReason: '库龄 34 天，南非两个工商业项目付款周期延长致发货顺延，在途 6 台 → 推后入库，与回款节奏对齐',
  },
];

export const SKUS: readonly SkuRow[] = SKU_SPECS.map(buildSku);
