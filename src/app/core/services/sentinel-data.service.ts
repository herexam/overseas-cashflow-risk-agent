/**
 * 业务数据服务 —— 全站唯一数据源。
 *
 * 所有 Mock 数据在本服务内转成 Signal 并做跨模块派生聚合，
 * 页面只允许通过本服务取数，模板中不得硬编码业务数值。
 * 数据均为 Demo 示例数据，不代表沃太能源（AlphaESS）真实经营数据。
 */

import { Injectable, computed, inject, signal } from '@angular/core';

import type {
  AlertRecord,
  AlertStatus,
  BrakeAction,
  CashForecast,
  CashFxPageData,
  CashGap,
  CfoBrief,
  CollectionQueueItem,
  CountryRiskRow,
  CustomerRow,
  DashboardSnapshot,
  KpiDefinition,
  RadarPageData,
  RiskDistributionItem,
  SeriesPoint,
  SettingsPageData,
  SkuRow,
  TopRisk,
  Warehouse,
} from '../models';

import { DEMO_AS_OF_TIME, round } from '../../data/mock/_random';
import { ALERTS } from '../../data/mock/alerts.mock';
import { CFO_BRIEFS } from '../../data/mock/briefs.mock';
import { DEMO_DATA_NOTICE } from '../../data/mock/demo-notice';
import { CASH_FORECASTS, CASH_FX_PAGE, CASH_POSITION } from '../../data/mock/cash.mock';
import { COLLECTION_QUEUE, CUSTOMERS } from '../../data/mock/customers.mock';
import {
  KPIS,
  RISK_BY_COUNTRY,
  RISK_DISTRIBUTION,
  RISK_TREND,
  TOP_RISKS,
} from '../../data/mock/dashboard.mock';
import { RADAR_PAGE } from '../../data/mock/radar.mock';
import { SETTINGS_PAGE } from '../../data/mock/settings.mock';
import { SKUS } from '../../data/mock/skus.mock';
import { WAREHOUSES } from '../../data/mock/warehouses.mock';
import { StateService } from './state.service';

/** 动作指派记录（Demo 演示用，仅存在于内存） */
export interface AssignedAction {
  readonly skuId: string;
  readonly sku: string;
  readonly action: BrakeAction;
  readonly owner: string;
  readonly dueDate: string;
  readonly note: string;
  readonly createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class SentinelDataService {
  private readonly state = inject(StateService);

  /* ================================================================ */
  /* 原始数据集                                                        */
  /* ================================================================ */

  private readonly skuSignal = signal<readonly SkuRow[]>(SKUS);
  readonly skus = this.skuSignal.asReadonly();

  readonly warehouses: readonly Warehouse[] = WAREHOUSES;

  private readonly customerSignal = signal<readonly CustomerRow[]>(CUSTOMERS);
  readonly customers = this.customerSignal.asReadonly();

  readonly collectionQueue: readonly CollectionQueueItem[] = COLLECTION_QUEUE;

  private readonly alertSignal = signal<readonly AlertRecord[]>(ALERTS);
  readonly alerts = this.alertSignal.asReadonly();

  readonly kpis: readonly KpiDefinition[] = KPIS;
  readonly topRisks: readonly TopRisk[] = TOP_RISKS;
  readonly riskDistribution: readonly RiskDistributionItem[] = RISK_DISTRIBUTION;
  readonly riskByCountry: readonly CountryRiskRow[] = RISK_BY_COUNTRY;
  readonly riskTrend: readonly SeriesPoint[] = RISK_TREND;

  readonly cashFxPage: CashFxPageData = CASH_FX_PAGE;
  readonly radarPage: RadarPageData = RADAR_PAGE;
  readonly settingsPage: SettingsPageData = SETTINGS_PAGE;

  private readonly assignedActionsSignal = signal<readonly AssignedAction[]>([]);
  readonly assignedActions = this.assignedActionsSignal.asReadonly();

  /* ================================================================ */
  /* 索引与查找                                                        */
  /* ================================================================ */

  private readonly skuIndex = computed(() => {
    const map = new Map<string, SkuRow>();
    for (const sku of this.skuSignal()) {
      map.set(sku.id, sku);
      map.set(sku.sku, sku);
    }
    return map;
  });

  private readonly customerIndex = computed(() => {
    const map = new Map<string, CustomerRow>();
    for (const customer of this.customerSignal()) {
      map.set(customer.id, customer);
    }
    return map;
  });

  private readonly alertIndex = computed(() => {
    const map = new Map<string, AlertRecord>();
    for (const alert of this.alertSignal()) {
      map.set(alert.id, alert);
    }
    return map;
  });

  getSku(idOrCode: string): SkuRow | undefined {
    return this.skuIndex().get(idOrCode);
  }

  getCustomer(id: string): CustomerRow | undefined {
    return this.customerIndex().get(id);
  }

  getAlert(id: string): AlertRecord | undefined {
    return this.alertIndex().get(id);
  }

  getTopRisk(id: string): TopRisk | undefined {
    return this.topRisks.find((risk) => risk.id === id);
  }

  getWarehouse(id: string): Warehouse | undefined {
    return this.warehouses.find((warehouse) => warehouse.id === id);
  }

  /* ================================================================ */
  /* CFO 晨会摘要                                                      */
  /* ================================================================ */

  private readonly briefVersionSignal = signal(1);
  readonly briefVersion = this.briefVersionSignal.asReadonly();

  private readonly briefGeneratedAtSignal = signal<string>(CFO_BRIEFS[0]?.generatedAt ?? DEMO_AS_OF_TIME);
  readonly briefGeneratedAt = this.briefGeneratedAtSignal.asReadonly();

  private readonly briefingSignal = signal(false);
  readonly briefing = this.briefingSignal.asReadonly();

  readonly brief = computed<CfoBrief>(() => {
    const index = (this.briefVersionSignal() - 1) % CFO_BRIEFS.length;
    return CFO_BRIEFS[index] ?? CFO_BRIEFS[0];
  });

  readonly briefHint = DEMO_DATA_NOTICE;

  /** 「生成晨会摘要」：模拟 AI 重新汇总，短暂 loading 后整体替换内容 */
  generateBrief(): void {
    if (this.briefingSignal()) {
      return;
    }
    this.briefingSignal.set(true);
    this.state.setAiStatus('thinking');
    setTimeout(() => {
      this.briefVersionSignal.update((version) => version + 1);
      this.briefGeneratedAtSignal.set(this.clock());
      this.briefingSignal.set(false);
      this.state.setAiStatus('ready');
      this.state.pushToast('晨会摘要已更新（Demo 示例数据）', 'success');
    }, 900);
  }

  private clock(): string {
    const now = new Date();
    const pad = (value: number): string => String(value).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  }

  /* ================================================================ */
  /* 派生聚合                                                          */
  /* ================================================================ */

  readonly gaps = computed<readonly CashGap[]>(() =>
    CASH_FORECASTS.map((forecast) => ({
      horizon: forecast.horizon,
      amount: forecast.gap,
      ratio: round(forecast.gap / CASH_POSITION.cashOnHand, 4),
      safeLine: CASH_POSITION.safeLine,
      level: forecast.level,
      minBalance: forecast.minBalance,
      note: forecast.note,
    })),
  );

  readonly forecastForHorizon = computed<CashForecast>(() => {
    const horizon = this.state.horizon();
    return CASH_FORECASTS.find((item) => item.horizon === horizon) ?? CASH_FORECASTS[CASH_FORECASTS.length - 1];
  });

  readonly openAlertCount = computed(
    () => this.alertSignal().filter((alert) => alert.status === 'pending' || alert.status === 'processing').length,
  );

  readonly l4AlertCount = computed(
    () =>
      this.alertSignal().filter(
        (alert) => alert.level === 'L4' && (alert.status === 'pending' || alert.status === 'processing'),
      ).length,
  );

  /** 驾驶舱整体快照 */
  readonly dashboardSnapshot = computed<DashboardSnapshot>(() => {
    const safety = this.kpis.find((kpi) => kpi.id === 'M1');
    return {
      asOf: DEMO_AS_OF_TIME,
      cashSafetyScore: safety?.value ?? 68,
      cashSafetyLevel: safety?.level ?? 'L3',
      cashOnHand: CASH_POSITION.cashOnHand,
      gaps: this.gaps(),
      kpis: this.kpis,
      forecast: this.forecastForHorizon(),
      riskDistribution: this.riskDistribution,
      riskByCountry: this.riskByCountry,
      topRisks: this.topRisks,
      brief: this.brief(),
      riskTrend: this.riskTrend,
      openAlertCount: this.openAlertCount(),
      l4AlertCount: this.l4AlertCount(),
    };
  });

  /** 库存概览（库存页头部指标） */
  readonly inventoryOverview = computed(() => {
    const rows = this.skuSignal();
    const totalValue = rows.reduce((sum, row) => sum + row.value, 0);
    const totalQty = rows.reduce((sum, row) => sum + row.qty, 0);
    const inTransitQty = rows.reduce((sum, row) => sum + row.inTransitQty, 0);
    const overstockValue = rows
      .filter((row) => row.level === 'L4' || row.level === 'L3')
      .reduce((sum, row) => sum + row.value, 0);
    const avgAgingDays = Math.round(rows.reduce((sum, row) => sum + row.agingDays, 0) / (rows.length || 1));
    const releasableCash = rows.reduce((sum, row) => sum + row.releaseCash, 0);
    return {
      totalValue: round(totalValue, 0),
      totalQty,
      inTransitQty,
      overstockRatio: round(overstockValue / (totalValue || 1), 4),
      avgAgingDays,
      dio: 92,
      warehouseCount: this.warehouses.length,
      skuCount: rows.length,
      releasableCash: round(releasableCash, 0),
    };
  });

  /** 应收概览（应收页头部指标） */
  readonly receivableOverview = computed(() => {
    const rows = this.customerSignal();
    const totalReceivable = rows.reduce((sum, row) => sum + row.receivable, 0);
    const overdueAmount = rows
      .filter((row) => row.overdueDays > 0)
      .reduce((sum, row) => sum + row.receivable, 0);
    const expectedCollection = rows.reduce((sum, row) => sum + row.expectedCollection, 0);
    const severeOverdue = rows
      .filter((row) => row.overdueDays > 90)
      .reduce((sum, row) => sum + row.receivable, 0);
    return {
      totalReceivable: round(totalReceivable, 0),
      dso: 104,
      overdueRatio: round(overdueAmount / (totalReceivable || 1), 4),
      overdueAmount: round(overdueAmount, 0),
      expectedCollection: round(expectedCollection, 0),
      expectedCollectionRatio: round(expectedCollection / (totalReceivable || 1), 4),
      severeOverdueRatio: round(severeOverdue / (totalReceivable || 1), 4),
      customerCount: rows.length,
    };
  });

  /* ================================================================ */
  /* 变更操作                                                          */
  /* ================================================================ */

  updateAlertStatus(id: string, status: AlertStatus, note?: string): void {
    const target = this.getAlert(id);
    if (!target || target.status === status) {
      return;
    }
    this.alertSignal.update((list) =>
      list.map((alert) =>
        alert.id === id
          ? {
              ...alert,
              status,
              history: [
                ...alert.history,
                {
                  at: this.clock(),
                  actor: `${this.state.currentUser.name}（${this.state.currentUser.role}）`,
                  action: `状态更新为「${status === 'pending' ? '待处理' : status === 'processing' ? '处理中' : status === 'resolved' ? '已解决' : '已关闭'}」`,
                  note: note ?? '',
                },
              ],
            }
          : alert,
      ),
    );
    this.state.pushToast(`${id} 状态已更新`, 'success');
  }

  assignAction(payload: {
    skuId: string;
    action: BrakeAction;
    owner: string;
    dueDate: string;
    note: string;
  }): void {
    const target = this.getSku(payload.skuId);
    if (!target) {
      return;
    }
    this.skuSignal.update((list) =>
      list.map((row) =>
        row.id === payload.skuId
          ? { ...row, suggestedAction: payload.action, owner: payload.owner, dueDate: payload.dueDate }
          : row,
      ),
    );
    this.assignedActionsSignal.update((list) => [
      {
        ...payload,
        sku: target.sku,
        createdAt: this.clock(),
      },
      ...list,
    ]);
    this.state.pushToast(`已向 ${payload.owner} 指派动作：${target.sku}`, 'success');
  }

  resetAssignedActions(): void {
    this.assignedActionsSignal.set([]);
    this.state.pushToast('动作指派记录已清空（Demo 示例数据）', 'info');
  }
}
