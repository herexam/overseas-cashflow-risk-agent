/**
 * 情景推演模板与基线指标 Mock 数据（Demo 示例数据）。
 *
 * 本文件提供「情景推演」页所需的三个预设模板、基线指标快照与预测窗口选项，
 * 全部为产品演示所用的示例数据，不代表沃太能源（AlphaESS）真实经营数据，
 * 也不构成经营或投资建议。
 *
 * 口径对齐说明：
 *  1. 基线指标与驾驶舱、现金流 / 外汇页保持一致：30 天缺口 0、60 天缺口 1,180 万元、
 *     90 天缺口 2,360 万元，库存货值 32,910 万元，CCC 108 天，风险等级 L3；
 *  2. 恒等式 CCC = DIO + DSO − DPO = 92 + 104 − 88 = 108 天严格成立，
 *     情景推演的模拟值必须在同一恒等式下计算，避免「推演后 CCC 对不上」的演示事故；
 *  3. 三条模板的 defaults 只预设被推演的单一变量，其余参数保持 0 或空数组，
 *     便于演示「一次只动一个变量」的因果链路；
 *  4. 额度、评分与占比均为 Demo 假设口径，需企业按自身融资与备货政策校准。
 */

import type { ScenarioMetrics, ScenarioTemplate } from '../../core/models';

/* ------------------------------------------------------------------ */
/* 情景模板（A / B / C）                                                */
/* ------------------------------------------------------------------ */

export const SCENARIO_TEMPLATES: readonly ScenarioTemplate[] = [
  {
    id: 'A',
    code: 'SCN-A',
    name: '海运延迟 +30 天',
    description: '欧洲航线时效恶化，在途库存到货推迟，库存周转与现金回收同步延后。',
    defaults: {
      template: 'A',
      shippingDelayDays: 30,
      collectionDelayDays: 0,
      orderChangePct: 0,
      fxChangePct: 0,
      rateChangePct: 0,
      focusSkuIds: [],
    },
  },
  {
    id: 'B',
    code: 'SCN-B',
    name: '客户回款延期 +30 天',
    description: '欧洲经销商资金紧张，重点客户付款节奏整体后移 30 天。',
    defaults: {
      template: 'B',
      shippingDelayDays: 0,
      collectionDelayDays: 30,
      orderChangePct: 0,
      fxChangePct: 0,
      rateChangePct: 0,
      focusSkuIds: [],
    },
  },
  {
    id: 'C',
    code: 'SCN-C',
    name: '订单下降 20%',
    description: '欧洲市场需求走弱，订单量整体下调 20%，海外仓库存被动积压。',
    defaults: {
      template: 'C',
      shippingDelayDays: 0,
      collectionDelayDays: 0,
      orderChangePct: -20,
      fxChangePct: 0,
      rateChangePct: 0,
      focusSkuIds: [],
    },
  },
];

/* ------------------------------------------------------------------ */
/* 基线指标                                                            */
/* ------------------------------------------------------------------ */

export const BASELINE_METRICS: ScenarioMetrics = {
  gap30: 0,
  gap60: 1180,
  gap90: 2360,
  inventoryValue: 32910,
  inventoryQty: 18640,
  overstockRatio: 0.214,
  ccc: 108,
  dso: 104,
  dio: 92,
  dpo: 88,
  riskScore: 62,
  riskLevel: 'L3',
  cashOccupied: 28400,
};

/* ------------------------------------------------------------------ */
/* 预测窗口选项                                                        */
/* ------------------------------------------------------------------ */

export const SCENARIO_HORIZON_OPTIONS: readonly { value: 30 | 60 | 90; label: string }[] = [
  { value: 30, label: '未来 30 天（短期）' },
  { value: 60, label: '未来 60 天（中期）' },
  { value: 90, label: '未来 90 天（中长期）' },
];
