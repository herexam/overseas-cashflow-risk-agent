import type { DataNature, RiskLevel } from './common.model';

export type DataSourceCategory = 'internal' | 'external';

/** 内部数据源类别（对应原 PRD D1–D15 的分类） */
export type InternalSourceKind = 'ERP' | 'WMS' | 'CRM' | '资金系统' | 'PLM' | 'BI' | '工单系统';

export interface DataSource {
  readonly id: string;
  /** D1 / E1 */
  readonly code: string;
  readonly name: string;
  readonly category: DataSourceCategory;
  readonly kind: string;
  /** 承载系统 */
  readonly system: string;
  /** 更新频率描述 */
  readonly frequency: string;
  /** 接入状态：模拟接入 / 待接入 */
  readonly status: 'simulated' | 'pending';
  readonly lastSync: string;
  readonly qualityScore: number;
  readonly owner: string;
  readonly fields: readonly string[];
  readonly nature: DataNature;
  readonly note: string;
}

export interface QualityDimension {
  readonly key: string;
  readonly name: string;
  /** 0–100 */
  readonly score: number;
  readonly weight: number;
  readonly note: string;
}

export interface QualityIssue {
  readonly id: string;
  readonly sourceCode: string;
  readonly sourceName: string;
  readonly issue: string;
  readonly severity: RiskLevel;
  readonly affectedFields: string;
  readonly detectedAt: string;
  readonly suggestion: string;
}

export interface ThresholdConfig {
  readonly metricId: string;
  readonly code: string;
  readonly name: string;
  readonly unit: string;
  readonly comparator: 'lte' | 'gte';
  readonly green: number;
  readonly yellow: number;
  readonly red: number;
  /** 是否为原 PRD 中的【假设】参数 */
  readonly assumed: boolean;
  readonly note: string;
}

export interface RoleDefinition {
  readonly code: string;
  readonly name: string;
  readonly description: string;
  readonly pages: readonly string[];
  readonly dataScope: string;
  readonly rowLevelRule: string;
}

export interface SettingsPageData {
  readonly asOf: string;
  readonly dataSources: readonly DataSource[];
  readonly qualityScore: number;
  readonly qualityDimensions: readonly QualityDimension[];
  readonly qualityIssues: readonly QualityIssue[];
  readonly thresholds: readonly ThresholdConfig[];
  readonly roles: readonly RoleDefinition[];
  readonly integrationNotes: readonly { title: string; text: string }[];
  readonly mvpScope: readonly { tier: 'P0 必做' | 'P1 简化' | '暂不实现'; items: readonly string[] }[];
}
