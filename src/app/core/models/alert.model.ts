import type { AlertStatus, RiskLevel, RiskType } from './common.model';
import type { FivePartAnalysis } from './analysis.model';

export type TriggerRule = 'threshold' | 'trend' | 'event';

export const TRIGGER_RULE_LABEL: Record<TriggerRule, string> = {
  threshold: '阈值触发',
  trend: '趋势触发',
  event: '事件触发',
};

export interface AlertHistoryEntry {
  readonly at: string;
  readonly actor: string;
  readonly action: string;
  readonly note?: string;
}

export interface AlertRecord {
  /** 预警编号，如 ALERT-DE-INV-20260915-001 */
  readonly id: string;
  readonly title: string;
  readonly type: RiskType;
  readonly level: RiskLevel;
  readonly score: number;
  readonly country: string;
  readonly countryCode: string;
  readonly subjectType: 'customer' | 'sku' | 'country' | 'currency';
  readonly subject: string;
  /** 影响金额（万元） */
  readonly impactAmount: number;
  readonly triggeredAt: string;
  readonly owner: string;
  readonly status: AlertStatus;
  readonly triggerRule: TriggerRule;
  /** 触发该预警的指标编号（M1–M12） */
  readonly triggeredBy: readonly string[];
  readonly dueDate: string;
  readonly analysis: FivePartAnalysis;
  readonly history: readonly AlertHistoryEntry[];
}

export interface AlertFilter {
  readonly keyword: string;
  readonly status: string;
  readonly level: string;
  readonly type: string;
  readonly country: string;
  readonly owner: string;
}

export type AlertSortKey = 'triggeredAt' | 'impactAmount' | 'level' | 'status';

export interface AlertStats {
  readonly total: number;
  readonly pending: number;
  readonly processing: number;
  readonly resolved: number;
  readonly closed: number;
  readonly l4: number;
  readonly totalImpact: number;
  readonly l4Impact: number;
  /** 48 小时响应率 0–1（Demo 中的展示值） */
  readonly responseRate48h: number;
}
