/**
 * 海外仓主数据（Demo 示例数据）。
 *
 * 本文件为 WorkCap Sentinel（现金哨兵）产品演示原型的 Mock 数据：仓库名称沿用沃太能源
 * （AlphaESS）海外仓布局的业务语境，但库容使用率、库存货值、超期占比与风险等级均按业务逻辑
 * 构造，不代表沃太能源任何时点的真实经营数据，仅用于展示 Agent 的库存风险识别与推演能力。
 *
 * 口径说明：
 *  1. totalValue 单位统一为万元（库存货值口径）。
 *  2. capacityUsage 为库容使用率（0–1），overstockRatio 为超期库存占比（0–1，库龄 90 天以上货值口径）。
 *  3. skuCount 为该仓在库 SKU 全量数；SKU 明细表（skus.mock）仅列示重点风险 SKU，故两者不可直接相减。
 *  4. level 为仓库级现金风险分级（L4 高风险 / L3 中风险 / L2 关注 / L1 正常），由库容、库龄结构、
 *     货值与在途敞口综合评定，与 SKU 明细表的分级口径一致但统计范围不同。
 */

import type { Warehouse } from '../../core/models';

export const WAREHOUSES: readonly Warehouse[] = [
  {
    id: 'WH-DE-FRA',
    name: '法兰克福海外仓',
    operator: '自有仓',
    country: '德国',
    countryCode: 'DE',
    region: '欧洲',
    capacityUsage: 0.92,
    totalValue: 8640,
    skuCount: 42,
    overstockRatio: 0.34,
    level: 'L4',
  },
  {
    id: 'WH-NL-RTM',
    name: '鹿特丹海外仓',
    operator: '第三方仓（3PL）',
    country: '荷兰',
    countryCode: 'NL',
    region: '欧洲',
    capacityUsage: 0.78,
    totalValue: 6120,
    skuCount: 35,
    overstockRatio: 0.18,
    level: 'L3',
  },
  {
    id: 'WH-UK-BHM',
    name: '伯明翰海外仓',
    operator: '第三方仓（3PL）',
    country: '英国',
    countryCode: 'GB',
    region: '欧洲',
    capacityUsage: 0.71,
    totalValue: 3980,
    skuCount: 28,
    overstockRatio: 0.22,
    level: 'L3',
  },
  {
    id: 'WH-IT-MIL',
    name: '米兰海外仓',
    operator: '第三方仓（3PL）',
    country: '意大利',
    countryCode: 'IT',
    region: '欧洲',
    capacityUsage: 0.64,
    totalValue: 2740,
    skuCount: 22,
    overstockRatio: 0.12,
    level: 'L2',
  },
  {
    id: 'WH-US-LAX',
    name: '洛杉矶海外仓',
    operator: '自有仓',
    country: '美国',
    countryCode: 'US',
    region: '北美',
    capacityUsage: 0.83,
    totalValue: 7210,
    skuCount: 38,
    overstockRatio: 0.27,
    level: 'L4',
  },
  {
    id: 'WH-AU-SYD',
    name: '悉尼海外仓',
    operator: '第三方仓（3PL）',
    country: '澳大利亚',
    countryCode: 'AU',
    region: '大洋洲',
    capacityUsage: 0.58,
    totalValue: 1860,
    skuCount: 18,
    overstockRatio: 0.08,
    level: 'L1',
  },
  {
    id: 'WH-ZA-JNB',
    name: '约翰内斯堡海外仓',
    operator: '第三方仓（3PL）',
    country: '南非',
    countryCode: 'ZA',
    region: '非洲',
    capacityUsage: 0.49,
    totalValue: 940,
    skuCount: 12,
    overstockRatio: 0.15,
    level: 'L2',
  },
  {
    id: 'WH-JP-OSA',
    name: '大阪海外仓',
    operator: '第三方仓（3PL）',
    country: '日本',
    countryCode: 'JP',
    region: '亚太',
    capacityUsage: 0.52,
    totalValue: 1420,
    skuCount: 16,
    overstockRatio: 0.06,
    level: 'L1',
  },
];
