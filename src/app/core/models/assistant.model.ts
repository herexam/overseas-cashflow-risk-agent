import type { EvidenceCard, ImpactItem, SuggestedAction } from './analysis.model';

/** AI 助手快捷问题分类 */
export type AssistantCategory = 'cash' | 'inventory' | 'receivable' | 'scenario' | 'brief';

export const ASSISTANT_CATEGORY_LABEL: Record<AssistantCategory, string> = {
  cash: '现金流',
  inventory: '库存',
  receivable: '应收',
  scenario: '情景',
  brief: '晨会摘要',
};

export interface AssistantQuestion {
  readonly id: string;
  readonly text: string;
  readonly category: AssistantCategory;
  /** 该问题命中的指标编号（M1–M12） */
  readonly metrics: readonly string[];
}

/** AI 推理步骤，用于展示 Agent 的「思考过程」（数据取自 Demo Mock） */
export interface AssistantThinkingStep {
  readonly step: string;
  readonly detail: string;
  /** 该步骤读取的数据源 */
  readonly source: string;
}

export interface AssistantAnswer {
  readonly questionId: string;
  /** 一句话结论 */
  readonly conclusion: string;
  readonly reasons: readonly string[];
  readonly evidence: readonly EvidenceCard[];
  readonly impacts: readonly ImpactItem[];
  readonly actions: readonly SuggestedAction[];
  readonly thinkingSteps: readonly AssistantThinkingStep[];
  /** 关联页面，用于「前往处理」 */
  readonly relatedLinks: readonly { label: string; route: string }[];
}

/** 会话消息（Demo 中为只读展示，用户只能通过快捷问题提问） */
export interface AssistantMessage {
  readonly id: string;
  readonly role: 'user' | 'agent';
  readonly createdAt: string;
  readonly text?: string;
  readonly answer?: AssistantAnswer;
}
