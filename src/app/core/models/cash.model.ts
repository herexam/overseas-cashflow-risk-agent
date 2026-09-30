import type { ChangeIndicator, RiskLevel, SeriesPoint } from './common.model';

export type CurrencyCode = 'CNY' | 'USD' | 'EUR' | 'GBP';

export interface CurrencyMeta {
  readonly code: CurrencyCode;
  readonly label: string;
  readonly symbol: string;
}

export const CURRENCIES: readonly CurrencyMeta[] = [
  { code: 'CNY', label: '人民币', symbol: '¥' },
  { code: 'USD', label: '美元', symbol: '$' },
  { code: 'EUR', label: '欧元', symbol: '€' },
  { code: 'GBP', label: '英镑', symbol: '£' },
];

/** 外币敞口（仅展示敞口，不输出套期保值建议） */
export interface FxExposure {
  readonly code: CurrencyCode;
  readonly label: string;
  /** 外币应收敞口（万元，折合人民币） */
  readonly receivable: number;
  /** 外币应付敞口（万元，折合人民币） */
  readonly payable: number;
  /** 净敞口（万元） */
  readonly net: number;
  /** 净敞口 / 总收入 0–1 */
  readonly netRatio: number;
  /** 当前中间价 */
  readonly rate: number;
  readonly rateChangePct: number;
  readonly level: RiskLevel;
  readonly note: string;
  /** 近 90 天汇率走势 */
  readonly trend: readonly SeriesPoint[];
}

export interface CashFlowItem {
  readonly id: string;
  /** 资金事项，如「欧洲经销商 T/T 回款」 */
  readonly item: string;
  readonly category: 'inflow' | 'outflow';
  /** 万元 */
  readonly amount: number;
  readonly date: string;
  readonly currency: CurrencyCode;
  readonly counterparty: string;
  readonly certainty: 'committed' | 'probable' | 'tentative';
  readonly note: string;
}

export interface DebtItem {
  readonly id: string;
  readonly name: string;
  /** 万元 */
  readonly amount: number;
  readonly dueDate: string;
  readonly currency: CurrencyCode;
  readonly type: '银行流贷' | '供应链票据' | '信用证' | '融资租赁';
  readonly ratePct: number;
  readonly level: RiskLevel;
}

export interface CashPosition {
  readonly asOf: string;
  /** 期末现金（万元） */
  readonly cashOnHand: number;
  /** 安全线（万元） */
  readonly safeLine: number;
  /** 30 天内确定性流入（万元） */
  readonly inflow30: number;
  readonly outflow30: number;
  readonly net30: number;
  readonly debt30: number;
  readonly debt60: number;
  readonly debt90: number;
  readonly freeCashRatio: number;
  readonly change: ChangeIndicator;
}

export interface CashFxPageData {
  readonly position: CashPosition;
  readonly forecasts: readonly import('./metrics.model').CashForecast[];
  readonly flows: readonly CashFlowItem[];
  readonly debts: readonly DebtItem[];
  readonly exposures: readonly FxExposure[];
}
