/**
 * 通用类型定义。
 * 所有数据性质标注沿用原 PRD 的【公开】/【示例】/【假设】/【待接入】/【需确认】体系。
 */

/** 数据性质标注 */
export type DataNature = 'public' | 'demo' | 'assumed' | 'pending' | 'confirm';

export const DATA_NATURE_LABEL: Record<DataNature, string> = {
  public: '公开数据',
  demo: 'Demo 示例数据',
  assumed: '假设参数',
  pending: '待接入',
  confirm: '需确认',
};

/** 四级风险分级 */
export type RiskLevel = 'L4' | 'L3' | 'L2' | 'L1';

export interface RiskLevelMeta {
  readonly level: RiskLevel;
  readonly label: string;
  readonly scoreText: string;
  readonly slaText: string;
  readonly tone: 'red' | 'orange' | 'yellow' | 'green';
  /** 形态差异：仅凭颜色不足以表达风险等级，必须同时使用形状/文字 */
  readonly shape: 'square' | 'diamond' | 'triangle' | 'circle';
}

export const RISK_LEVELS: readonly RiskLevelMeta[] = [
  {
    level: 'L4',
    label: '高风险',
    scoreText: '评分 80–100',
    slaText: '24 小时内响应',
    tone: 'red',
    shape: 'square',
  },
  {
    level: 'L3',
    label: '中风险',
    scoreText: '评分 60–79',
    slaText: '3 个工作日内响应',
    tone: 'orange',
    shape: 'diamond',
  },
  {
    level: 'L2',
    label: '关注',
    scoreText: '评分 40–59',
    slaText: '每周跟进',
    tone: 'yellow',
    shape: 'triangle',
  },
  {
    level: 'L1',
    label: '正常',
    scoreText: '评分 0–39',
    slaText: '常规监控',
    tone: 'green',
    shape: 'circle',
  },
];

export function riskLevelFromScore(score: number): RiskLevel {
  if (score >= 80) return 'L4';
  if (score >= 60) return 'L3';
  if (score >= 40) return 'L2';
  return 'L1';
}

export function riskLevelMeta(level: RiskLevel): RiskLevelMeta {
  const found = RISK_LEVELS.find((item) => item.level === level);
  return found ?? RISK_LEVELS[3];
}

/** 风险类型 */
export type RiskType = 'inventory' | 'receivable' | 'cash' | 'fx' | 'logistics' | 'policy';

export const RISK_TYPE_LABEL: Record<RiskType, string> = {
  inventory: '库存风险',
  receivable: '应收风险',
  cash: '现金流风险',
  fx: '外汇风险',
  logistics: '物流风险',
  policy: '政策风险',
};

/** 预警状态机 */
export type AlertStatus = 'pending' | 'processing' | 'resolved' | 'closed';

export const ALERT_STATUS_LABEL: Record<AlertStatus, string> = {
  pending: '待处理',
  processing: '处理中',
  resolved: '已解决',
  closed: '已关闭',
};

/** 库存建议动作 */
export type BrakeAction = 'pause' | 'reduce' | 'delay' | 'transfer' | 'continue';

export interface BrakeActionMeta {
  readonly action: BrakeAction;
  readonly label: string;
  readonly tone: 'red' | 'orange' | 'yellow' | 'blue' | 'green';
  readonly hint: string;
}

export const BRAKE_ACTIONS: readonly BrakeActionMeta[] = [
  {
    action: 'pause',
    label: '暂停采购',
    tone: 'red',
    hint: '立即冻结该 SKU 新采购申请，直至库存回到目标覆盖月数。',
  },
  {
    action: 'reduce',
    label: '减少采购',
    tone: 'orange',
    hint: '将采购量下调 30%–50%，按周滚动复核。',
  },
  {
    action: 'delay',
    label: '延后入库',
    tone: 'yellow',
    hint: '与供应商协商推后在途批次到货时间，降低仓储与资金占用。',
  },
  {
    action: 'transfer',
    label: '转调拨',
    tone: 'blue',
    hint: '将该仓库存调拨至订单覆盖更紧的区域仓。',
  },
  {
    action: 'continue',
    label: '继续采购',
    tone: 'green',
    hint: '库存与订单覆盖处于健康区间，维持现有采购节奏。',
  },
];

export function brakeActionMeta(action: BrakeAction): BrakeActionMeta {
  const found = BRAKE_ACTIONS.find((item) => item.action === action);
  return found ?? BRAKE_ACTIONS[4];
}

/** 优先级 */
export type Priority = 'P0' | 'P1' | 'P2';

export const PRIORITY_LABEL: Record<Priority, string> = {
  P0: '立即执行',
  P1: '本周内',
  P2: '本月内',
};

/** 趋势方向 */
export type TrendDirection = 'up' | 'down' | 'flat';

export interface ChangeIndicator {
  readonly direction: TrendDirection;
  readonly text: string;
  /** 该变化对经营是否有利 */
  readonly favorable: boolean;
}

/** 通用时间序列点 */
export interface SeriesPoint {
  readonly label: string;
  readonly value: number;
}

export interface MultiSeriesPoint {
  readonly label: string;
  readonly values: readonly number[];
}
