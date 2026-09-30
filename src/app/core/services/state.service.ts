/**
 * 全局 UI 状态服务。
 *
 * 只承载跨页面共享的「界面状态」（侧边栏折叠、预测窗口、AI 状态、当前用户、
 * 通知已读记录、轻提示），不承载业务数据 —— 业务数据统一由 SentinelDataService 提供。
 */

import { Injectable, computed, signal } from '@angular/core';
import type { ForecastHorizon, RiskLevel } from '../models';

export type AiStatus = 'idle' | 'thinking' | 'ready';

export interface CurrentUser {
  readonly name: string;
  readonly role: string;
  readonly scope: string;
  readonly initials: string;
}

export interface NoticeItem {
  readonly id: string;
  readonly title: string;
  readonly at: string;
  readonly level: RiskLevel;
  readonly route: string;
}

export interface ToastMessage {
  readonly id: number;
  readonly text: string;
  readonly tone: 'info' | 'success' | 'warn';
}

/** Demo 通知中心固定文案（示例数据） */
const NOTICE_SEED: readonly NoticeItem[] = [
  {
    id: 'NTC-001',
    title: '德国法兰克福仓 4 个 SKU 库龄超 90 天，建议暂停采购',
    at: '08:12',
    level: 'L4',
    route: '/inventory',
  },
  {
    id: 'NTC-002',
    title: 'OSW Energy GmbH 应收账款逾期 68 天，需升级催收',
    at: '07:58',
    level: 'L4',
    route: '/receivables',
  },
  {
    id: 'NTC-003',
    title: '美国储能产品关税调整，影响在途货值 1,980 万元',
    at: '07:40',
    level: 'L3',
    route: '/radar',
  },
  {
    id: 'NTC-004',
    title: 'WCI 运价指数周环比 +6.4%，欧线舱位紧张',
    at: '07:21',
    level: 'L3',
    route: '/radar',
  },
  {
    id: 'NTC-005',
    title: 'EUR/CNY 上破 8.30，欧元应收折算压力上升',
    at: '06:55',
    level: 'L2',
    route: '/cash-fx',
  },
];

@Injectable({ providedIn: 'root' })
export class StateService {
  /* ---------------- 当前用户 ---------------- */

  readonly currentUser: CurrentUser = {
    name: '张立',
    role: 'CFO',
    scope: '数据范围：全球',
    initials: '张',
  };

  /* ---------------- 侧边栏 ---------------- */

  private readonly sidebarCollapsedSignal = signal(false);
  readonly sidebarCollapsed = this.sidebarCollapsedSignal.asReadonly();

  toggleSidebar(): void {
    this.sidebarCollapsedSignal.update((value) => !value);
  }

  /* ---------------- 页面标题 ---------------- */

  private readonly pageTitleSignal = signal('风险驾驶舱');
  readonly pageTitle = this.pageTitleSignal.asReadonly();

  setPageTitle(title: string): void {
    this.pageTitleSignal.set(title);
  }

  /* ---------------- 预测窗口（30 / 60 / 90 天） ---------------- */

  private readonly horizonSignal = signal<ForecastHorizon>(90);
  readonly horizon = this.horizonSignal.asReadonly();

  setHorizon(horizon: ForecastHorizon): void {
    this.horizonSignal.set(horizon);
  }

  /* ---------------- 跨页定位：聚焦 SKU ---------------- */

  private readonly focusSkuIdsSignal = signal<readonly string[]>([]);
  readonly focusSkuIds = this.focusSkuIdsSignal.asReadonly();

  setFocusSkus(ids: readonly string[]): void {
    this.focusSkuIdsSignal.set([...ids]);
  }

  /** 情景推演结束后写入的说明文本，用于页面顶部提示条 */
  private readonly scenarioNoteSignal = signal('');
  readonly scenarioNote = this.scenarioNoteSignal.asReadonly();

  setScenarioNote(note: string): void {
    this.scenarioNoteSignal.set(note);
  }

  /* ---------------- AI 状态 ---------------- */

  private readonly aiStatusSignal = signal<AiStatus>('ready');
  readonly aiStatus = this.aiStatusSignal.asReadonly();

  setAiStatus(status: AiStatus): void {
    this.aiStatusSignal.set(status);
  }

  readonly aiStatusText = computed(() => {
    switch (this.aiStatusSignal()) {
      case 'thinking':
        return '推理中';
      case 'idle':
        return '待命';
      default:
        return '就绪';
    }
  });

  /* ---------------- 数据刷新 ---------------- */

  private readonly refreshTickSignal = signal(0);
  readonly refreshTick = this.refreshTickSignal.asReadonly();

  private readonly lastRefreshedAtSignal = signal('2026-09-15 08:30');
  readonly lastRefreshedAt = this.lastRefreshedAtSignal.asReadonly();

  private readonly refreshingSignal = signal(false);
  readonly refreshing = this.refreshingSignal.asReadonly();

  refresh(): void {
    this.refreshTickSignal.update((value) => value + 1);
    this.lastRefreshedAtSignal.set(this.currentClock());
    this.pushToast('数据已刷新（Demo 示例数据）', 'success');
  }

  private currentClock(): string {
    const now = new Date();
    const pad = (value: number): string => String(value).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  }

  /* ---------------- 通知中心 ---------------- */

  readonly notices: readonly NoticeItem[] = NOTICE_SEED;

  private readonly noticeReadIdsSignal = signal<readonly string[]>(['NTC-005']);
  readonly noticeReadIds = this.noticeReadIdsSignal.asReadonly();

  readonly unreadCount = computed(
    () => this.notices.filter((item) => !this.noticeReadIdsSignal().includes(item.id)).length,
  );

  markNoticeRead(id: string): void {
    this.noticeReadIdsSignal.update((ids) => (ids.includes(id) ? ids : [...ids, id]));
  }

  markAllNoticesRead(): void {
    this.noticeReadIdsSignal.set(this.notices.map((item) => item.id));
  }

  /* ---------------- 轻提示 ---------------- */

  private toastSeq = 0;
  private readonly toastsSignal = signal<readonly ToastMessage[]>([]);
  readonly toasts = this.toastsSignal.asReadonly();

  pushToast(text: string, tone: ToastMessage['tone'] = 'info'): void {
    this.toastSeq += 1;
    const id = this.toastSeq;
    this.toastsSignal.update((list) => [...list, { id, text, tone }]);
    setTimeout(() => this.dismissToast(id), 3600);
  }

  dismissToast(id: number): void {
    this.toastsSignal.update((list) => list.filter((item) => item.id !== id));
  }
}
