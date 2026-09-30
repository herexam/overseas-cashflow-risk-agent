import type { BrakeAction, DataNature, Priority, RiskLevel, RiskType } from './common.model';

/**
 * 五段式分析 — 全系统 AI 输出统一结构（原 PRD 强制格式）
 * ① 发生了什么 ② 为什么发生 ③ 可能造成什么影响 ④ 现在应该做什么 ⑤ 证据与数据来源
 */
export interface FivePartAnalysis {
  readonly whatHappened: string;
  readonly why: readonly WhyItem[];
  readonly impact: readonly ImpactItem[];
  readonly actions: readonly SuggestedAction[];
  readonly evidence: readonly EvidenceCard[];
  /** 证据校验（原 PRD 红线：证据完整率必须 = 100%） */
  readonly integrity: EvidenceIntegrity;
  /** 无证据时的降级提示（Demo 正常路径不出现） */
  readonly degradedNote?: string;
}

export interface WhyItem {
  readonly text: string;
  readonly likelihood: 'high' | 'medium' | 'low';
}

export interface ImpactItem {
  readonly text: string;
  /** 量化指标名，如「现金占用」 */
  readonly metric?: string;
  /** 变化量，如「+860 万元」 */
  readonly delta?: string;
}

export interface SuggestedAction {
  readonly id: string;
  readonly text: string;
  readonly actionType: BrakeAction;
  readonly priority: Priority;
  readonly owner: string;
  readonly dueDate: string;
  /** 可释放现金（万元） */
  readonly releaseAmount?: number;
  /** 相关页面路由，用于「前往处理」 */
  readonly route?: string;
}

export interface EvidenceCard {
  readonly id: string;
  /** 来源系统，如「WMS · 库龄快照」 */
  readonly sourceSystem: string;
  /** 指标名 */
  readonly metric: string;
  /** 当前值（已格式化） */
  readonly value: string;
  /** 对比基准（已格式化） */
  readonly baseline: string;
  /** 数据截止时间 */
  readonly asOf: string;
  readonly nature: DataNature;
  /** 口径说明 */
  readonly definition: string;
}

export interface EvidenceIntegrity {
  readonly traceable: number;
  readonly total: number;
}

/** 风险主体（驾驶舱 Top Risk / 预警中心 / 风险雷达共用） */
export interface TopRisk {
  readonly id: string;
  readonly title: string;
  readonly type: RiskType;
  readonly level: RiskLevel;
  readonly score: number;
  readonly country: string;
  readonly countryCode: string;
  /** 影响金额（万元） */
  readonly impactAmount: number;
  /** 时间窗口（天） */
  readonly windowDays: number;
  readonly owner: string;
  readonly dueDate: string;
  readonly summary: string;
  readonly tags: readonly string[];
  /** 关联 SKU（库存类风险） */
  readonly relatedSku?: string;
  /** 关联客户（应收类风险） */
  readonly relatedCustomer?: string;
  readonly analysis: FivePartAnalysis;
}
