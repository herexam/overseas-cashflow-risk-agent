import type { RiskLevel, SeriesPoint } from './common.model';
import type { FivePartAnalysis } from './analysis.model';
import type { AgingBucket } from './inventory.model';

export type CreditRating = 'AAA' | 'AA' | 'A' | 'BBB' | 'BB' | 'B';

export interface CustomerRow {
  readonly id: string;
  readonly name: string;
  /** 渠道类型，如「欧洲经销商 / 安装商」 */
  readonly channelType: string;
  readonly country: string;
  readonly countryCode: string;
  /** 应收余额（万元） */
  readonly receivable: number;
  /** 加权平均账龄（天） */
  readonly agingDays: number;
  /** 最长逾期天数 */
  readonly overdueDays: number;
  readonly creditRating: CreditRating;
  /** 预计可回款金额（万元） */
  readonly expectedCollection: number;
  /** 预计回款日期 */
  readonly expectedDate: string;
  readonly level: RiskLevel;
  readonly score: number;
  /** 催收优先级，1 为最高 */
  readonly collectionPriority: number;
  readonly owner: string;
  readonly lastPaymentDate: string;
  /** 授信额度（万元） */
  readonly creditLimit: number;
  readonly agingBuckets: readonly AgingBucket[];
  /** 近 12 个月回款趋势（万元） */
  readonly collectionTrend: readonly number[];
  readonly overdueInvoices: readonly {
    invoiceNo: string;
    amount: number;
    dueDate: string;
    overdueDays: number;
  }[];
  readonly analysis: FivePartAnalysis;
}

export interface ReceivableOverview {
  /** 应收总余额（万元） */
  readonly totalReceivable: number;
  readonly dso: number;
  /** 逾期率 0–1 */
  readonly overdueRatio: number;
  readonly overdueAmount: number;
  readonly expectedCollection: number;
  readonly expectedCollectionRatio: number;
  /** 超期 90 天以上占比 0–1 */
  readonly severeOverdueRatio: number;
  readonly customerCount: number;
  readonly agingStructure: readonly AgingBucket[];
  readonly trend: readonly SeriesPoint[];
  /** 近 6 个月 DSO 趋势 */
  readonly dsoTrend: readonly number[];
  readonly ratingDistribution: readonly { rating: CreditRating; amount: number; count: number }[];
}

export interface CollectionQueueItem {
  readonly customerId: string;
  readonly customer: string;
  readonly country: string;
  readonly amount: number;
  readonly overdueDays: number;
  readonly priority: number;
  readonly owner: string;
  readonly level: RiskLevel;
  readonly nextStep: string;
  readonly dueDate: string;
}
