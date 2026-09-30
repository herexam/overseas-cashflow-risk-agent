import type { ChangeIndicator, RiskLevel, RiskType, SeriesPoint } from './common.model';
import type { TopRisk } from './analysis.model';

export type Comparator = 'lte' | 'gte';

/** 指标定义（对应原 PRD M1–M12） */
export interface KpiDefinition {
  /** 指标编号，如 M4 */
  readonly id: string;
  /** 指标代码，如 DIO */
  readonly code: string;
  readonly name: string;
  readonly value: number;
  readonly unit: string;
  readonly target: number;
  readonly comparator: Comparator;
  readonly level: RiskLevel;
  /** 近 6 个月趋势 */
  readonly trend: readonly number[];
  /** 建议阈值说明（示例参数，非企业实际校准值） */
  readonly thresholdHint: string;
  readonly definition: string;
  /** 归属路由，用于点击下钻 */
  readonly route: string;
  readonly change: ChangeIndicator;
}

export type ForecastHorizon = 30 | 60 | 90;

export interface CashGap {
  readonly horizon: ForecastHorizon;
  /** 万元，正数表示缺口 */
  readonly amount: number;
  /** 缺口 / 期末现金 */
  readonly ratio: number;
  readonly safeLine: number;
  readonly level: RiskLevel;
  readonly minBalance: number;
  readonly note: string;
}

export interface CashForecastPoint {
  readonly date: string;
  readonly dayOffset: number;
  readonly balance: number;
  readonly lower: number;
  readonly upper: number;
  readonly safeLine: number;
  readonly inflow: number;
  readonly outflow: number;
  /** 低于安全线的缺口金额（万元），无缺口为 0 */
  readonly gap: number;
}

export interface CashForecast {
  readonly horizon: ForecastHorizon;
  readonly points: readonly CashForecastPoint[];
  readonly minBalance: number;
  readonly minBalanceDate: string;
  readonly gap: number;
  readonly level: RiskLevel;
  readonly note: string;
}

export interface RiskDistributionItem {
  readonly type: RiskType;
  readonly count: number;
  /** 万元 */
  readonly amount: number;
  readonly level: RiskLevel;
}

export interface CountryRiskRow {
  readonly country: string;
  readonly countryCode: string;
  readonly L4: number;
  readonly L3: number;
  readonly L2: number;
  readonly L1: number;
  readonly exposure: number;
}

/** 今日 CFO 晨会摘要 */
export interface CfoBrief {
  readonly generatedAt: string;
  readonly version: number;
  readonly headline: string;
  readonly topThree: readonly { title: string; level: RiskLevel; amount: number; note: string }[];
  readonly changes: readonly {
    label: string;
    value: string;
    delta: string;
    direction: 'up' | 'down' | 'flat';
    favorable: boolean;
  }[];
  readonly external: readonly { label: string; value: string; note: string }[];
  readonly todaysActions: readonly string[];
  readonly dataAsOf: string;
}

/** 驾驶舱整体快照 */
export interface DashboardSnapshot {
  readonly asOf: string;
  readonly cashSafetyScore: number;
  readonly cashSafetyLevel: RiskLevel;
  readonly cashOnHand: number;
  readonly gaps: readonly CashGap[];
  readonly kpis: readonly KpiDefinition[];
  readonly forecast: CashForecast;
  readonly riskDistribution: readonly RiskDistributionItem[];
  readonly riskByCountry: readonly CountryRiskRow[];
  readonly topRisks: readonly TopRisk[];
  readonly brief: CfoBrief;
  readonly riskTrend: readonly SeriesPoint[];
  readonly openAlertCount: number;
  readonly l4AlertCount: number;
}
