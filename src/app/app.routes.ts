import type { Routes } from '@angular/router';

export const APP_TITLE = 'WorkCap Sentinel · 现金哨兵';

/**
 * 顶层路由表。
 *
 * 约定：
 *  1. 所有业务页面均按 feature 懒加载（loadComponent），首屏只加载驾驶舱；
 *  2. 每个路由通过 data.title / data.subtitle 向顶栏输出「页面标题 + 一句话说明」，
 *     避免页面组件再去写标题逻辑；
 *  3. 详情类页面不单独建路由，统一由所在模块以 Drawer 承载（PRD 的交互口径）。
 */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  {
    path: 'dashboard',
    title: `${APP_TITLE} · 风险驾驶舱`,
    data: { title: '风险驾驶舱', subtitle: '现金安全度、缺口预测与全球 Top Risk 一屏总览' },
    loadComponent: () => import('./features/dashboard/dashboard.page').then((m) => m.DashboardPage),
  },
  {
    path: 'inventory',
    title: `${APP_TITLE} · 库存风险中心`,
    data: { title: '库存风险中心', subtitle: '库龄结构、海外仓分布与建议踩刹车清单' },
    loadComponent: () => import('./features/inventory/inventory.page').then((m) => m.InventoryPage),
  },
  {
    path: 'receivables',
    title: `${APP_TITLE} · 应收风险中心`,
    data: { title: '应收风险中心', subtitle: '应收账龄、客户信用与催收优先级' },
    loadComponent: () => import('./features/receivables/receivables.page').then((m) => m.ReceivablesPage),
  },
  {
    path: 'cash-fx',
    title: `${APP_TITLE} · 现金流与外汇`,
    data: { title: '现金流与外汇', subtitle: '30 / 60 / 90 天现金预测、短期债务与外币敞口' },
    loadComponent: () => import('./features/cash-fx/cash-fx.page').then((m) => m.CashFxPage),
  },
  {
    path: 'scenario',
    title: `${APP_TITLE} · 情景模拟`,
    data: { title: '情景模拟', subtitle: '调整外部冲击参数，推演现金缺口与风险等级迁移' },
    loadComponent: () => import('./features/scenario/scenario.page').then((m) => m.ScenarioPage),
  },
  {
    path: 'alerts',
    title: `${APP_TITLE} · 预警中心`,
    data: { title: '预警中心', subtitle: '全部预警的筛选、认领、状态流转与五段式详情' },
    loadComponent: () => import('./features/alerts/alerts.page').then((m) => m.AlertsPage),
  },
  {
    path: 'radar',
    title: `${APP_TITLE} · 外部风险雷达`,
    data: { title: '外部风险雷达', subtitle: '汇率、海运运价与贸易政策的公开信号追踪' },
    loadComponent: () => import('./features/radar/radar.page').then((m) => m.RadarPage),
  },
  {
    path: 'assistant',
    title: `${APP_TITLE} · Sentinel AI`,
    data: { title: 'Sentinel AI', subtitle: '面向 CFO 的经营问答与推理过程透明化' },
    loadComponent: () => import('./features/assistant/assistant.page').then((m) => m.AssistantPage),
  },
  {
    path: 'settings',
    title: `${APP_TITLE} · 基础配置`,
    data: { title: '基础配置', subtitle: '数据源接入状态、指标阈值与角色权限' },
    loadComponent: () => import('./features/settings/settings.page').then((m) => m.SettingsPage),
  },
  {
    path: '**',
    title: `${APP_TITLE} · 页面不存在`,
    data: { title: '页面不存在', subtitle: '请通过左侧导航进入业务模块' },
    loadComponent: () => import('./features/not-found/not-found.page').then((m) => m.NotFoundPage),
  },
];
