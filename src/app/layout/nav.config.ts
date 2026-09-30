/**
 * 侧边导航配置。
 *
 * 导航分组与 PRD 的信息架构一致：
 *   总览 → 风险监控 → 分析工具 → 系统配置
 */

export interface NavItem {
  readonly label: string;
  /** 一句话说明，用于侧边栏折叠态 tooltip 与全局搜索的副标题 */
  readonly hint: string;
  readonly route: string;
  readonly icon: NavIconName;
  /** 高亮时显示的数字角标来源，仅预警与库存使用 */
  readonly badge?: 'alerts' | 'l4';
}

export interface NavGroup {
  readonly group: string;
  readonly items: readonly NavItem[];
}

export type NavIconName =
  | 'dashboard'
  | 'inventory'
  | 'receivables'
  | 'cash'
  | 'scenario'
  | 'alerts'
  | 'radar'
  | 'assistant'
  | 'settings';

/** 24×24 线性图标路径（stroke，1.5px，无填充） */
export const NAV_ICONS: Record<NavIconName, string> = {
  dashboard: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  inventory: 'M21 8 12 3 3 8v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v8',
  receivables: 'M4 4h16v16H4zM4 10h16M8 15h4',
  cash: 'M3 17l5.5-5.5 4 4L21 7M15 7h6v6',
  scenario: 'M4 21v-6M4 11V3M12 21v-9M12 8V3M20 21v-4M20 13V3M1 15h6M9 8h6M17 17h6',
  alerts: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  radar: 'M12 12l7.5-7.5M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5',
  assistant: 'M9 3v2M15 3v2M9 19v2M15 19v2M3 9h2M3 15h2M19 9h2M19 15h2M6 6h12v12H6zM10 10h4v4h-4z',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.5 12c0-.5-.05-1-.15-1.45l1.75-1.2-2-3.46-2 1a7.4 7.4 0 0 0-2.5-1.45L14.2 3h-4.4l-.4 2.44A7.4 7.4 0 0 0 6.9 6.9l-2-1-2 3.46 1.75 1.2a7.6 7.6 0 0 0 0 2.9l-1.75 1.2 2 3.46 2-1a7.4 7.4 0 0 0 2.5 1.45l.4 2.43h4.4l.4-2.43a7.4 7.4 0 0 0 2.5-1.45l2 1 2-3.46-1.75-1.2c.1-.45.15-.95.15-1.45z',
};

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    group: '总览',
    items: [
      {
        label: '风险驾驶舱',
        hint: '现金安全度 / 缺口预测 / Top Risk 总览',
        route: '/dashboard',
        icon: 'dashboard',
      },
    ],
  },
  {
    group: '风险监控',
    items: [
      {
        label: '库存风险中心',
        hint: '库龄结构 / 海外仓 / 建议踩刹车清单',
        route: '/inventory',
        icon: 'inventory',
      },
      {
        label: '应收风险中心',
        hint: '账龄结构 / 客户信用 / 催收优先级',
        route: '/receivables',
        icon: 'receivables',
      },
      {
        label: '现金流与外汇',
        hint: '30 / 60 / 90 天预测与外币敞口',
        route: '/cash-fx',
        icon: 'cash',
      },
    ],
  },
  {
    group: '分析与工具',
    items: [
      {
        label: '情景模拟',
        hint: '海运延迟 / 回款延期 / 订单波动推演',
        route: '/scenario',
        icon: 'scenario',
      },
      {
        label: '预警中心',
        hint: '预警筛选、认领与状态流转',
        route: '/alerts',
        icon: 'alerts',
        badge: 'alerts',
      },
      {
        label: '外部风险雷达',
        hint: '汇率 / 海运运价 / 贸易政策信号',
        route: '/radar',
        icon: 'radar',
      },
      {
        label: 'Sentinel AI',
        hint: '经营问答与推理过程透明化',
        route: '/assistant',
        icon: 'assistant',
      },
    ],
  },
  {
    group: '系统',
    items: [
      {
        label: '基础配置',
        hint: '数据源状态 / 指标阈值 / 角色权限',
        route: '/settings',
        icon: 'settings',
      },
    ],
  },
];

/** 扁平导航项，供全局搜索使用 */
export const NAV_ITEMS: readonly NavItem[] = NAV_GROUPS.flatMap((group) => [...group.items]);
