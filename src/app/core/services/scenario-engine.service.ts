/**
 * 情景推演引擎（Demo 示例口径）。
 *
 * 本服务把「海运延迟 / 回款延期 / 订单变化 / 汇率与融资成本变动」四个可调参数
 * 映射为可解释的经营指标变化，并输出风险等级迁移、受影响 SKU / 客户、
 * 冲击传导链路与 AI 总结。
 *
 * 计算口径说明（Demo 假设参数，非企业实际模型）：
 *   1. 严格保持恒等式 CCC = DIO + DSO − DPO，避免推演后对不上账；
 *   2. 全部为线性近似，系数固定可复现，同一组参数必然得到同一结果；
 *   3. 基线取自 BASELINE_METRICS，与驾驶舱、现金流 / 外汇页一致。
 */

import { Injectable, computed, inject, signal } from '@angular/core';

import {
  brakeActionMeta,
  riskLevelFromScore,
  RISK_TYPE_LABEL,
  type BrakeAction,
  type RiskLevel,
} from '../models';
import type {
  AffectedCustomer,
  AffectedSku,
  ImpactItem,
  ScenarioAiSummary,
  ScenarioDelta,
  ScenarioMetrics,
  ScenarioParams,
  ScenarioResult,
  ScenarioTemplate,
  ScenarioTemplateId,
} from '../models';

import { DEMO_AS_OF_DATE } from '../../data/mock/_random';
import { BASELINE_METRICS, SCENARIO_TEMPLATES } from '../../data/mock/scenario.mock';
import { SentinelDataService } from './sentinel-data.service';
import { StateService } from './state.service';

const BASE: ScenarioMetrics = BASELINE_METRICS;
const SAFE_LINE = 6000;
const CASH_ON_HAND = 8420;

const DEFAULT_PARAMS: ScenarioParams = {
  template: 'A',
  shippingDelayDays: 30,
  collectionDelayDays: 0,
  orderChangePct: 0,
  fxChangePct: 0,
  rateChangePct: 0,
  focusSkuIds: [],
};

function round0(value: number): number {
  return Math.round(value);
}

function levelOf(score: number): RiskLevel {
  return riskLevelFromScore(Math.max(0, Math.min(100, score)));
}

function actionForLevel(level: RiskLevel): BrakeAction {
  switch (level) {
    case 'L4':
      return 'pause';
    case 'L3':
      return 'reduce';
    case 'L2':
      return 'delay';
    default:
      return 'continue';
  }
}

@Injectable({ providedIn: 'root' })
export class ScenarioEngineService {
  private readonly data = inject(SentinelDataService);
  private readonly state = inject(StateService);

  readonly templates: readonly ScenarioTemplate[] = SCENARIO_TEMPLATES;

  private readonly paramsSignal = signal<ScenarioParams>({ ...DEFAULT_PARAMS });
  readonly params = this.paramsSignal.asReadonly();

  private readonly resultSignal = signal<ScenarioResult | null>(null);
  readonly result = this.resultSignal.asReadonly();

  private readonly runningSignal = signal(false);
  readonly running = this.runningSignal.asReadonly();

  private readonly hasRunSignal = signal(false);
  readonly hasRun = this.hasRunSignal.asReadonly();

  readonly activeTemplate = computed<ScenarioTemplateId>(() => this.paramsSignal().template);

  /** 参数是否已偏离当前模板默认值 */
  readonly isDirty = computed(() => {
    const params = this.paramsSignal();
    const template = this.templates.find((item) => item.id === params.template);
    if (!template) {
      return params.shippingDelayDays !== DEFAULT_PARAMS.shippingDelayDays;
    }
    const d = template.defaults;
    return (
      params.shippingDelayDays !== d.shippingDelayDays ||
      params.collectionDelayDays !== d.collectionDelayDays ||
      params.orderChangePct !== d.orderChangePct ||
      params.fxChangePct !== d.fxChangePct ||
      params.rateChangePct !== d.rateChangePct
    );
  });

  applyTemplate(id: ScenarioTemplateId): void {
    const template = this.templates.find((item) => item.id === id);
    if (!template) {
      return;
    }
    this.paramsSignal.set({ ...template.defaults });
  }

  patchParams(patch: Partial<ScenarioParams>): void {
    this.paramsSignal.update((params) => ({
      ...params,
      ...patch,
      template: patch.template ?? 'custom',
    }));
  }

  focusSku(ids: readonly string[]): void {
    this.paramsSignal.update((params) => ({ ...params, focusSkuIds: [...ids] }));
  }

  reset(): void {
    this.paramsSignal.set({ ...DEFAULT_PARAMS });
    this.resultSignal.set(null);
    this.hasRunSignal.set(false);
    this.state.setScenarioNote('');
  }

  /** 同步计算（纯函数，便于验证与测试） */
  compute(params: ScenarioParams): ScenarioResult {
    const s = Math.max(0, params.shippingDelayDays);
    const c = Math.max(0, params.collectionDelayDays);
    const o = Math.min(0, params.orderChangePct); // 订单下降幅度（负数）
    const decline = Math.abs(o);
    const f = params.fxChangePct;
    const r = Math.max(0, params.rateChangePct);

    const dio = BASE.dio + s * 0.35 + decline * 0.55;
    const dso = BASE.dso + c * 0.9 + decline * 0.2;
    const dpo = BASE.dpo;
    const ccc = dio + dso - dpo;

    const inventoryFactor = 1 + s * 0.0012 + decline * 0.0055;
    const inventoryValue = BASE.inventoryValue * inventoryFactor;
    const inventoryQty = BASE.inventoryQty * inventoryFactor;
    const overstockRatio = Math.min(0.75, BASE.overstockRatio + s * 0.0015 + decline * 0.006);
    const cashOccupied = BASE.cashOccupied + (inventoryValue - BASE.inventoryValue);

    const gap30 = Math.max(0, BASE.gap30 + s * 8 + c * 12 + decline * 7 + f * 15 + r * 20);
    const gap60 = Math.max(0, BASE.gap60 + s * 20 + c * 26 + decline * 16 + f * 40 + r * 30);
    const gap90 = Math.max(0, BASE.gap90 + s * 28 + c * 34 + decline * 22 + f * 55 + r * 45);

    const riskScore = Math.max(
      0,
      Math.min(
        100,
        BASE.riskScore +
          ((gap90 - BASE.gap90) / BASE.gap90) * 22 +
          (ccc - BASE.ccc) * 0.32 +
          (overstockRatio - BASE.overstockRatio) * 40 +
          f * 1.2 +
          r * 2.5,
      ),
    );

    const simulated: ScenarioMetrics = {
      gap30: round0(gap30),
      gap60: round0(gap60),
      gap90: round0(gap90),
      inventoryValue: round0(inventoryValue),
      inventoryQty: round0(inventoryQty),
      overstockRatio: Math.round(overstockRatio * 1000) / 1000,
      ccc: round0(ccc),
      dso: round0(dso),
      dio: round0(dio),
      dpo,
      riskScore: Math.round(riskScore),
      riskLevel: levelOf(riskScore),
      cashOccupied: round0(cashOccupied),
    };

    const deltas = this.buildDeltas(BASE, simulated);
    const affectedSkus = this.buildAffectedSkus(params);
    const affectedCustomers = this.buildAffectedCustomers(params);
    const escalation = {
      from: BASE.riskLevel,
      to: simulated.riskLevel,
      escalated: simulated.riskLevel !== BASE.riskLevel,
    };

    return {
      params,
      computedAt: `${DEMO_AS_OF_DATE} ${new Date().toTimeString().slice(0, 5)}`,
      baseline: BASE,
      simulated,
      deltas,
      riskEscalation: escalation,
      affectedSkus,
      affectedCustomers,
      aiSummary: this.buildAiSummary(params, simulated, deltas, escalation, affectedSkus, affectedCustomers),
      warnings: this.buildWarnings(simulated, affectedSkus),
      transmission: this.buildTransmission(params, simulated),
    };
  }

  /** 运行模拟（带 loading 态，Zoneless 下用 signal 写入驱动渲染） */
  run(): void {
    if (this.runningSignal()) {
      return;
    }
    this.runningSignal.set(true);
    this.state.setAiStatus('thinking');
    setTimeout(() => {
      const result = this.compute(this.paramsSignal());
      this.resultSignal.set(result);
      this.runningSignal.set(false);
      this.hasRunSignal.set(true);
      this.state.setAiStatus('ready');
      this.state.setScenarioNote(
        `已按「${this.templateName(result.params.template)}」完成推演：90 天缺口 ${result.simulated.gap90.toLocaleString('zh-CN')} 万元，风险等级 ${result.baseline.riskLevel} → ${result.simulated.riskLevel}。`,
      );
      this.state.pushToast('情景推演完成（Demo 示例数据）', 'success');
    }, 600);
  }

  templateName(id: ScenarioTemplateId): string {
    const template = this.templates.find((item) => item.id === id);
    return template ? template.name : '自定义情景';
  }

  /* ================================================================ */
  /* 内部构造                                                          */
  /* ================================================================ */

  private buildDeltas(baseline: ScenarioMetrics, simulated: ScenarioMetrics): readonly ScenarioDelta[] {
    const spec: readonly {
      key: keyof ScenarioMetrics;
      label: string;
      unit: string;
      favorableWhenDown: boolean;
      escalatesRisk: boolean;
      precision: number;
    }[] = [
      { key: 'gap30', label: '30 天现金缺口', unit: '万元', favorableWhenDown: true, escalatesRisk: true, precision: 0 },
      { key: 'gap60', label: '60 天现金缺口', unit: '万元', favorableWhenDown: true, escalatesRisk: true, precision: 0 },
      { key: 'gap90', label: '90 天现金缺口', unit: '万元', favorableWhenDown: true, escalatesRisk: true, precision: 0 },
      { key: 'cashOccupied', label: '现金占用', unit: '万元', favorableWhenDown: true, escalatesRisk: true, precision: 0 },
      { key: 'inventoryValue', label: '库存货值', unit: '万元', favorableWhenDown: true, escalatesRisk: false, precision: 0 },
      { key: 'inventoryQty', label: '库存台数', unit: '台', favorableWhenDown: true, escalatesRisk: false, precision: 0 },
      { key: 'overstockRatio', label: '超期库存占比', unit: '%', favorableWhenDown: true, escalatesRisk: false, precision: 1 },
      { key: 'ccc', label: 'CCC 现金转换周期', unit: '天', favorableWhenDown: true, escalatesRisk: true, precision: 0 },
      { key: 'dio', label: 'DIO 库存周转天数', unit: '天', favorableWhenDown: true, escalatesRisk: false, precision: 0 },
      { key: 'dso', label: 'DSO 应收周转天数', unit: '天', favorableWhenDown: true, escalatesRisk: false, precision: 0 },
      { key: 'dpo', label: 'DPO 应付周转天数', unit: '天', favorableWhenDown: false, escalatesRisk: false, precision: 0 },
      { key: 'riskScore', label: '综合风险评分', unit: '分', favorableWhenDown: true, escalatesRisk: true, precision: 0 },
    ];

    return spec.map((item) => {
      const baseValue = baseline[item.key] as number;
      const simValue = simulated[item.key] as number;
      const scale = item.key === 'overstockRatio' ? 100 : 1;
      const baseScaled = baseValue * scale;
      const simScaled = simValue * scale;
      const delta = simScaled - baseScaled;
      return {
        key: item.key,
        label: item.label,
        unit: item.unit,
        baseline: Math.round(baseScaled * 10) / 10,
        simulated: Math.round(simScaled * 10) / 10,
        delta: Math.round(delta * 10) / 10,
        deltaPct: baseScaled === 0 ? null : Math.round((delta / baseScaled) * 1000) / 10,
        favorable: item.favorableWhenDown ? delta <= 0 : delta >= 0,
        escalatesRisk: item.escalatesRisk && delta > 0,
        precision: item.precision,
      };
    });
  }

  private buildAffectedSkus(params: ScenarioParams): readonly AffectedSku[] {
    const s = Math.max(0, params.shippingDelayDays);
    const c = Math.max(0, params.collectionDelayDays);
    const decline = Math.abs(Math.min(0, params.orderChangePct));
    const focus = new Set(params.focusSkuIds);

    if (s === 0 && c === 0 && decline === 0) {
      return [];
    }

    return this.data
      .skus()
      .map((sku) => {
        const arrivalLag = s === 0 ? 0 : Math.min(1, s / 60) * sku.inTransitQty;
        const backlog = (decline / 100) * sku.qty * 0.5;
        const collectionHold = (c / 60) * sku.qty * 0.08;
        const simulatedQty = round0(sku.qty + arrivalLag + backlog + collectionHold);
        const extraValue = round0(((simulatedQty - sku.qty) * sku.unitCost) / 10000);
        const agingDeltaDays = Math.round(s * 0.45 + decline * 0.3 + c * 0.25);
        const score = sku.score + agingDeltaDays * 1.2 + (extraValue / (sku.value || 1)) * 30;
        const level = levelOf(score);
        return {
          sku: sku.sku,
          name: sku.name,
          warehouseName: sku.warehouseName,
          country: sku.country,
          baselineQty: sku.qty,
          simulatedQty,
          extraValue,
          agingDeltaDays,
          level,
          action: brakeActionMeta(actionForLevel(level)).label,
          _focus: focus.has(sku.id) || focus.has(sku.sku),
          _weight: extraValue + agingDeltaDays * 40,
        };
      })
      .filter((row) => row.simulatedQty - row.baselineQty > 0 || row.agingDeltaDays > 0)
      .sort((a, b) => Number(b._focus) - Number(a._focus) || b._weight - a._weight)
      .slice(0, 8)
      .map(({ _focus, _weight, ...row }) => row);
  }

  private buildAffectedCustomers(params: ScenarioParams): readonly AffectedCustomer[] {
    const c = Math.max(0, params.collectionDelayDays);
    const decline = Math.abs(Math.min(0, params.orderChangePct));
    const factor = (c / 60) * 0.9 + (decline / 100) * 0.25;
    if (factor === 0) {
      return [];
    }
    return this.data
      .customers()
      .map((customer) => {
        const delayedAmount = round0(customer.receivable * factor);
        const newOverdueDays = Math.round(customer.overdueDays + c + decline * 0.2);
        return {
          name: customer.name,
          country: customer.country,
          baselineAmount: customer.receivable,
          delayedAmount,
          newOverdueDays,
          level: levelOf(customer.score + c * 0.6 + decline * 0.8),
          owner: customer.owner,
          _weight: delayedAmount,
        };
      })
      .filter((row) => row.delayedAmount > 0)
      .sort((a, b) => b._weight - a._weight)
      .slice(0, 8)
      .map(({ _weight, ...row }) => row);
  }

  private buildAiSummary(
    params: ScenarioParams,
    simulated: ScenarioMetrics,
    deltas: readonly ScenarioDelta[],
    escalation: { from: RiskLevel; to: RiskLevel; escalated: boolean },
    affectedSkus: readonly AffectedSku[],
    affectedCustomers: readonly AffectedCustomer[],
  ): ScenarioAiSummary {
    const find = (key: string): ScenarioDelta | undefined => deltas.find((item) => item.key === key);
    const gap90 = find('gap90');
    const gap60 = find('gap60');
    const ccc = find('ccc');
    const inventory = find('inventoryValue');
    const gap90Ratio = Math.round((simulated.gap90 / CASH_ON_HAND) * 1000) / 10;

    const conclusion = [
      `在海运延迟 ${params.shippingDelayDays} 天、回款延期 ${params.collectionDelayDays} 天、订单变化 ${params.orderChangePct}% 的组合下，`,
      `90 天现金缺口升至 ${simulated.gap90.toLocaleString('zh-CN')} 万元（占期末现金 ${gap90Ratio}%），`,
      `CCC 由 ${BASE.ccc} 天变为 ${simulated.ccc} 天，风险等级 ${BASE.riskLevel} → ${simulated.riskLevel}`,
      escalation.escalated ? '，已触发等级升级。' : '，等级未发生迁移但缓冲空间收窄。',
    ].join('');

    const reasons: string[] = [];
    if (params.shippingDelayDays > 0) {
      reasons.push(
        `在途库存到货推迟 ${params.shippingDelayDays} 天，目的仓补货节奏与销售确认同步后移，DIO 上升 ${(ccc ? simulated.dio - BASE.dio : 0)} 天。`,
      );
    }
    if (params.collectionDelayDays > 0) {
      reasons.push(
        `重点客户付款节奏后移 ${params.collectionDelayDays} 天，DSO 由 ${BASE.dso} 天升至 ${simulated.dso} 天，回款与刚性支出形成错配。`,
      );
    }
    if (params.orderChangePct < 0) {
      reasons.push(
        `订单量下调 ${Math.abs(params.orderChangePct)}%，海外仓备货基数未同步下调，超期库存占比升至 ${(simulated.overstockRatio * 100).toFixed(1)}%。`,
      );
    }
    if (params.fxChangePct !== 0) {
      reasons.push(`汇率假设变动 ${params.fxChangePct}%，外币应收与在途货值的折算结果同步波动。`);
    }
    if (params.rateChangePct !== 0) {
      reasons.push(`融资成本假设上升 ${params.rateChangePct} 个百分点，短期融资可得额度收紧。`);
    }
    if (reasons.length === 0) {
      reasons.push('当前参数未对基线造成实质冲击，各项指标与基线一致。');
    }

    const impacts: ImpactItem[] = [];
    if (gap90) {
      impacts.push({
        text: '现金缺口扩大，安全线缓冲被进一步消耗',
        metric: '90 天现金缺口',
        delta: `${gap90.delta >= 0 ? '+' : ''}${gap90.delta.toLocaleString('zh-CN')} 万元`,
      });
    }
    if (gap60) {
      impacts.push({
        text: '中期现金错配加深，需提前安排融资或压降支出',
        metric: '60 天现金缺口',
        delta: `${gap60.delta >= 0 ? '+' : ''}${gap60.delta.toLocaleString('zh-CN')} 万元`,
      });
    }
    if (ccc) {
      impacts.push({
        text: '营运资本占用周期拉长，现金转换效率下降',
        metric: 'CCC',
        delta: `${ccc.delta >= 0 ? '+' : ''}${ccc.delta} 天`,
      });
    }
    if (inventory) {
      impacts.push({
        text: '海外仓库存被动累积，跌价与仓储成本压力上升',
        metric: '库存货值',
        delta: `${inventory.delta >= 0 ? '+' : ''}${inventory.delta.toLocaleString('zh-CN')} 万元`,
      });
    }
    if (affectedSkus.length > 0) {
      impacts.push({
        text: `受影响 SKU ${affectedSkus.length} 个，其中高风险 ${affectedSkus.filter((row) => row.level === 'L4').length} 个`,
        metric: '库存风险面',
      });
    }
    if (affectedCustomers.length > 0) {
      impacts.push({
        text: '重点客户回款节奏后移，催收工作量集中上升',
        metric: '额外延后回款',
        delta: `${affectedCustomers.reduce((sum, row) => sum + row.delayedAmount, 0).toLocaleString('zh-CN')} 万元`,
      });
    }

    const actions = [
      {
        id: `${params.template}-ACT-1`,
        text: `对 ${RISK_TYPE_LABEL.inventory}中评分最高的 SKU 暂停新采购申请，直至订单覆盖月数回到 2.0 个月以上。`,
        actionType: 'pause' as BrakeAction,
        priority: simulated.riskLevel === 'L4' ? ('P0' as const) : ('P1' as const),
        owner: '李强（供应链计划）',
        dueDate: DEMO_AS_OF_DATE,
        releaseAmount: affectedSkus.reduce((sum, row) => sum + row.extraValue, 0),
        route: '/inventory',
      },
      {
        id: `${params.template}-ACT-2`,
        text: '对延后到货的在途批次与供应商重新协商到货窗口，优先保障订单覆盖紧张的仓库。',
        actionType: 'delay' as BrakeAction,
        priority: 'P1' as const,
        owner: '周敏（国际物流）',
        dueDate: DEMO_AS_OF_DATE,
      },
      {
        id: `${params.template}-ACT-3`,
        text: '对回款延后的重点客户启动分级催收，L4 客户由大区负责人直接对接。',
        actionType: 'reduce' as BrakeAction,
        priority: 'P0' as const,
        owner: '王倩（国际销售）',
        dueDate: DEMO_AS_OF_DATE,
        route: '/receivables',
      },
      {
        id: `${params.template}-ACT-4`,
        text: '按推演结果复核 60 / 90 天融资安排与安全线，必要时提前启用备用额度。',
        actionType: 'continue' as BrakeAction,
        priority: 'P1' as const,
        owner: '陈曦（资金管理）',
        dueDate: DEMO_AS_OF_DATE,
        route: '/cash-fx',
      },
    ];

    const evidence = [
      {
        id: 'EV-SCN-1',
        sourceSystem: 'APS · 备货计划（模拟）',
        metric: '在途批次与到货窗口',
        value: `延迟 ${params.shippingDelayDays} 天`,
        baseline: '按原计划到货',
        asOf: DEMO_AS_OF_DATE,
        nature: 'demo' as const,
        definition: '在途批次 ETA 与目的仓补货计划的匹配结果。',
      },
      {
        id: 'EV-SCN-2',
        sourceSystem: 'CRM · 回款计划（模拟）',
        metric: '重点客户付款节奏',
        value: `延期 ${params.collectionDelayDays} 天`,
        baseline: `基线 DSO ${BASE.dso} 天`,
        asOf: DEMO_AS_OF_DATE,
        nature: 'demo' as const,
        definition: '基于合同账期与历史回款分布的滚动预测。',
      },
      {
        id: 'EV-SCN-3',
        sourceSystem: 'BI · 现金滚动预测（模拟）',
        metric: '90 天最低现金余额',
        value: `${simulated.gap90 > 0 ? `${(CASH_ON_HAND - simulated.gap90).toLocaleString('zh-CN')} 万元（低于安全线）` : '高于安全线'}`,
        baseline: `安全线 ${SAFE_LINE.toLocaleString('zh-CN')} 万元`,
        asOf: DEMO_AS_OF_DATE,
        nature: 'demo' as const,
        definition: '现金流入流出按确定性分层后的最低余额。',
      },
    ];

    return { conclusion, reasons, impacts, actions, evidence };
  }

  private buildWarnings(
    simulated: ScenarioMetrics,
    affectedSkus: readonly AffectedSku[],
  ): readonly string[] {
    const warnings: string[] = [];
    const gap90Ratio = simulated.gap90 / CASH_ON_HAND;
    if (gap90Ratio > 0.25) {
      warnings.push(
        `90 天现金缺口占期末现金 ${(gap90Ratio * 100).toFixed(1)}%，超过 25% 分级红线，建议按 L4 升级汇报。`,
      );
    } else if (gap90Ratio > 0.1) {
      warnings.push(`90 天现金缺口占期末现金 ${(gap90Ratio * 100).toFixed(1)}%，已进入 L3 关注区间。`);
    }
    if (simulated.ccc > BASE.ccc + 15) {
      warnings.push(`CCC 上升 ${simulated.ccc - BASE.ccc} 天，超过 15 天容忍线，营运资本占用加速恶化。`);
    }
    const l4Count = affectedSkus.filter((row) => row.level === 'L4').length;
    if (l4Count > 0) {
      warnings.push(`推演后新增 ${l4Count} 个 L4 库存风险 SKU，需在 24 小时内完成动作指派。`);
    }
    if (warnings.length === 0) {
      warnings.push('推演结果仍在可承受区间内，建议保持现有节奏并按周复核。');
    }
    return warnings;
  }

  private buildTransmission(
    params: ScenarioParams,
    simulated: ScenarioMetrics,
  ): readonly { step: string; description: string; magnitude: string }[] {
    return [
      {
        step: '外部冲击',
        description: `海运延迟 ${params.shippingDelayDays} 天 / 回款延期 ${params.collectionDelayDays} 天 / 订单变化 ${params.orderChangePct}%`,
        magnitude: params.template === 'custom' ? '自定义参数' : `模板 ${params.template}`,
      },
      {
        step: '物流与订单',
        description: '在途批次到货窗口后移，目的仓补货与销售确认节奏同步推迟。',
        magnitude: `DIO ${BASE.dio} → ${simulated.dio} 天`,
      },
      {
        step: '库存与应收',
        description: '海外仓库存被动累积、超期占比上升；重点客户回款周期拉长。',
        magnitude: `超期占比 ${(BASE.overstockRatio * 100).toFixed(1)}% → ${(simulated.overstockRatio * 100).toFixed(1)}%`,
      },
      {
        step: '营运资本',
        description: '库存与应收共同占用现金，CCC 被拉长，营运资本缺口扩大。',
        magnitude: `CCC ${BASE.ccc} → ${simulated.ccc} 天`,
      },
      {
        step: '现金缺口与风险等级',
        description: '现金余额跌破安全线的程度加深，风险等级发生迁移。',
        magnitude: `90 天缺口 ${BASE.gap90} → ${simulated.gap90} 万元`,
      },
    ];
  }
}
