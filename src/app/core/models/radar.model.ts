import type { DataNature, RiskLevel, SeriesPoint } from './common.model';

export interface FxRateSeries {
  /** 如 USD/CNY */
  readonly pair: string;
  readonly base: string;
  readonly quote: string;
  readonly current: number;
  readonly changePct: number;
  readonly changeAbs: number;
  readonly high30: number;
  readonly low30: number;
  readonly level: RiskLevel;
  /** 近 90 天走势 */
  readonly series: readonly SeriesPoint[];
  readonly note: string;
  readonly nature: DataNature;
}

export interface ShippingLane {
  /** 航线名，如「上海 → 鹿特丹」 */
  readonly lane: string;
  readonly origin: string;
  readonly destination: string;
  /** 运价（USD / 40ft） */
  readonly rate: number;
  readonly changePct: number;
  readonly changeAbs: number;
  /** 平均时效（天） */
  readonly transitDays: number;
  readonly transitChangeDays: number;
  /** 订舱难度指数 0–100 */
  readonly bookingDifficulty: number;
  readonly level: RiskLevel;
  readonly series: readonly SeriesPoint[];
  readonly note: string;
  readonly nature: DataNature;
}

export interface ShippingIndex {
  readonly code: string;
  readonly name: string;
  readonly value: number;
  readonly changePct: number;
  readonly changeAbs: number;
  readonly level: RiskLevel;
  readonly series: readonly SeriesPoint[];
  readonly nature: DataNature;
  readonly note: string;
}

export interface PortCongestion {
  readonly port: string;
  readonly country: string;
  /** 平均等待小时 */
  readonly waitHours: number;
  readonly changeHours: number;
  readonly level: RiskLevel;
}

export interface PolicyRisk {
  readonly id: string;
  readonly title: string;
  readonly region: string;
  readonly level: RiskLevel;
  /** 影响金额（万元） */
  readonly impactAmount: number;
  /** 生效概率估计 */
  readonly probability: string;
  /** 预计生效窗口 */
  readonly window: string;
  readonly nature: DataNature;
  readonly note: string;
  readonly affectedCountries: readonly string[];
}

export interface ExternalRiskItem {
  readonly id: string;
  readonly category: '汇率' | '海运' | '政策' | '原材料';
  readonly title: string;
  readonly level: RiskLevel;
  readonly metric: string;
  readonly change: string;
  readonly impactAmount: number;
  readonly note: string;
  readonly nature: DataNature;
}

export interface RadarPageData {
  readonly asOf: string;
  readonly fxRates: readonly FxRateSeries[];
  readonly shippingIndex: ShippingIndex;
  readonly shippingLanes: readonly ShippingLane[];
  readonly portCongestion: readonly PortCongestion[];
  readonly policyRisks: readonly PolicyRisk[];
  readonly externalRisks: readonly ExternalRiskItem[];
  readonly rawMaterials: readonly {
    readonly name: string;
    readonly unit: string;
    readonly price: number;
    readonly changePct: number;
    readonly level: RiskLevel;
    readonly series: readonly SeriesPoint[];
    readonly nature: DataNature;
  }[];
}
