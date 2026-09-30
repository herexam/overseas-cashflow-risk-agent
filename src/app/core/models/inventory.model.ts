import type { BrakeAction, RiskLevel, SeriesPoint } from './common.model';
import type { FivePartAnalysis } from './analysis.model';

export interface Warehouse {
  readonly id: string;
  /** 仓库中文名，如「法兰克福海外仓」 */
  readonly name: string;
  /** 运营方类型 */
  readonly operator: string;
  readonly country: string;
  readonly countryCode: string;
  readonly region: string;
  /** 库容使用率 0–1 */
  readonly capacityUsage: number;
  /** 库存货值（万元） */
  readonly totalValue: number;
  readonly skuCount: number;
  /** 超期库存占比 0–1 */
  readonly overstockRatio: number;
  readonly level: RiskLevel;
}

export interface AgingBucket {
  /** 如「0–30 天」 */
  readonly bucket: string;
  readonly qty: number;
  /** 万元 */
  readonly value: number;
}

export interface SkuRow {
  readonly id: string;
  readonly sku: string;
  readonly name: string;
  readonly productLine: string;
  readonly warehouseId: string;
  readonly warehouseName: string;
  readonly country: string;
  readonly countryCode: string;
  /** 库存台数 */
  readonly qty: number;
  /** 在途台数 */
  readonly inTransitQty: number;
  /** 库存货值（万元） */
  readonly value: number;
  /** 单位成本（元/台） */
  readonly unitCost: number;
  /** 加权平均库龄（天） */
  readonly agingDays: number;
  /** 订单覆盖月数 */
  readonly orderCoverageMonths: number;
  /** 超期库存占比 0–1 */
  readonly overstockRatio: number;
  readonly level: RiskLevel;
  readonly score: number;
  readonly suggestedAction: BrakeAction;
  /** 可释放现金（万元） */
  readonly releaseCash: number;
  readonly owner: string;
  readonly dueDate: string;
  /** 建议动作的业务理由 */
  readonly actionReason: string;
  /** 近 12 个月库存量趋势 */
  readonly trend: readonly number[];
  /** 在途批次 */
  readonly inTransitBatches: readonly {
    batch: string;
    qty: number;
    eta: string;
    status: string;
    prepaidAmount: number;
  }[];
  readonly agingBuckets: readonly AgingBucket[];
  /** 预计跌价风险（万元） */
  readonly impairmentRisk: number;
  /** 季度仓储成本（万元） */
  readonly holdingCostQuarter: number;
  /** 现金占用（万元） */
  readonly cashOccupied: number;
  /** 对 CCC 的边际影响（天） */
  readonly cccImpactDays: number;
  readonly monthlyShipment: readonly SeriesPoint[];
  readonly analysis: FivePartAnalysis;
}

export interface InventoryOverview {
  /** 库存总货值（万元） */
  readonly totalValue: number;
  readonly totalQty: number;
  readonly inTransitQty: number;
  /** 超期库存占比 0–1 */
  readonly overstockRatio: number;
  /** 平均库龄（天） */
  readonly avgAgingDays: number;
  readonly dio: number;
  readonly warehouseCount: number;
  readonly skuCount: number;
  /** 可释放现金合计（万元） */
  readonly releasableCash: number;
  readonly agingStructure: readonly AgingBucket[];
  readonly trend: readonly SeriesPoint[];
}

export interface InventoryFilterOption {
  readonly value: string;
  readonly label: string;
}

export interface InventoryFilters {
  readonly country: string;
  readonly warehouseId: string;
  readonly productLine: string;
  readonly level: string;
  readonly agingRange: string;
  readonly coverageRange: string;
  readonly keyword: string;
}
