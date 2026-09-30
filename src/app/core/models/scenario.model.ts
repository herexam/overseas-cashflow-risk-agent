import type { RiskLevel } from './common.model';
import type { EvidenceCard, ImpactItem, SuggestedAction } from './analysis.model';

export type ScenarioTemplateId = 'A' | 'B' | 'C' | 'custom';

export interface ScenarioTemplate {
  readonly id: ScenarioTemplateId;
  readonly code: string;
  readonly name: string;
  readonly description: string;
  readonly defaults: ScenarioParams;
}

export interface ScenarioParams {
  readonly template: ScenarioTemplateId;
  /** 海运延迟天数 0–90 */
  readonly shippingDelayDays: number;
  /** 客户回款延期天数 0–120 */
  readonly collectionDelayDays: number;
  /** 订单变化幅度 -50% – +20% */
  readonly orderChangePct: number;
  /** 汇率变动幅度 -10% – +10%（本币升值/贬值对收入端的影响） */
  readonly fxChangePct: number;
  /** 融资成本变动 0–5 个百分点 */
  readonly rateChangePct: number;
  /** 聚焦 SKU（由库存中心跳转带入） */
  readonly focusSkuIds: readonly string[];
}

export interface ScenarioMetrics {
  /** 万元，正数为缺口 */
  readonly gap30: number;
  readonly gap60: number;
  readonly gap90: number;
  /** 库存总货值（万元） */
  readonly inventoryValue: number;
  /** 库存台数 */
  readonly inventoryQty: number;
  /** 超期库存占比 0–1 */
  readonly overstockRatio: number;
  readonly ccc: number;
  readonly dso: number;
  readonly dio: number;
  readonly dpo: number;
  readonly riskScore: number;
  readonly riskLevel: RiskLevel;
  /** 万元 */
  readonly cashOccupied: number;
}

export interface ScenarioDelta {
  readonly key: string;
  readonly label: string;
  readonly unit: string;
  readonly baseline: number;
  readonly simulated: number;
  readonly delta: number;
  /** 基准为 0 时无法计算变化幅度，取 null 由管道渲染为占位符 */
  readonly deltaPct: number | null;
  /** 变化方向对经营是否有利 */
  readonly favorable: boolean;
  /** 是否触发风险升级 */
  readonly escalatesRisk: boolean;
  readonly precision: number;
}

export interface AffectedSku {
  readonly sku: string;
  readonly name: string;
  readonly warehouseName: string;
  readonly country: string;
  readonly baselineQty: number;
  readonly simulatedQty: number;
  readonly extraValue: number;
  readonly agingDeltaDays: number;
  readonly level: RiskLevel;
  readonly action: string;
}

export interface AffectedCustomer {
  readonly name: string;
  readonly country: string;
  readonly baselineAmount: number;
  readonly delayedAmount: number;
  readonly newOverdueDays: number;
  readonly level: RiskLevel;
  readonly owner: string;
}

export interface ScenarioAiSummary {
  readonly conclusion: string;
  readonly reasons: readonly string[];
  readonly impacts: readonly ImpactItem[];
  readonly actions: readonly SuggestedAction[];
  readonly evidence: readonly EvidenceCard[];
}

export interface ScenarioResult {
  readonly params: ScenarioParams;
  readonly computedAt: string;
  readonly baseline: ScenarioMetrics;
  readonly simulated: ScenarioMetrics;
  readonly deltas: readonly ScenarioDelta[];
  readonly riskEscalation: {
    readonly from: RiskLevel;
    readonly to: RiskLevel;
    readonly escalated: boolean;
  };
  readonly affectedSkus: readonly AffectedSku[];
  readonly affectedCustomers: readonly AffectedCustomer[];
  readonly aiSummary: ScenarioAiSummary;
  readonly warnings: readonly string[];
  /** 冲击传导链路，用于可视化 */
  readonly transmission: readonly { step: string; description: string; magnitude: string }[];
}
