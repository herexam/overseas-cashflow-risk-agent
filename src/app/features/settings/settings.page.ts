import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { EChartsOption } from 'echarts';

import type {
  DataSource,
  DataSourceCategory,
  QualityIssue,
  RoleDefinition,
  ThresholdConfig,
} from '../../core/models';
import { SentinelDataService } from '../../core/services/sentinel-data.service';
import { StateService } from '../../core/services/state.service';
import {
  CHART_COLORS,
  WsBadge,
  WsCard,
  WsChart,
  WsDemoNote,
  WsEmptyState,
  WsIcon,
  WsKeyValue,
  WsMetricTile,
  WsModal,
  WsNatureBadge,
  WsNumPipe,
  WsPercentPipe,
  WsProgressBar,
  WsRiskBadge,
  WsSegmented,
  WsSortHeader,
  WsTabs,
  WsTooltipDirective,
  barSeries,
  categoryAxis,
  gridConfig,
  tooltipConfig,
  valueAxis,
} from '../../shared/ui';
import type {
  KeyValueItem,
  MetricKind,
  SegmentedOption,
  SortChange,
  TabItem,
  WsIconName,
  WsTone,
} from '../../shared/ui';

/* ========================= 纯函数与视图模型 ========================= */

type SourceStatus = DataSource['status'];

/** 数据源类别文案 */
function categoryLabel(category: DataSourceCategory): string {
  return category === 'internal' ? '内部系统' : '外部数据';
}

/** 接入状态文案 */
function sourceStatusLabel(status: SourceStatus): string {
  return status === 'simulated' ? '已模拟接入' : '待接入';
}

/** 接入状态色 */
function sourceStatusTone(status: SourceStatus): WsTone {
  return status === 'simulated' ? 'green' : 'plain';
}

/** 质量分归档色（数据区间 73–96） */
function scoreTone(score: number): WsTone {
  if (score >= 90) return 'green';
  if (score >= 85) return 'blue';
  if (score >= 80) return 'yellow';
  if (score >= 75) return 'orange';
  return 'red';
}

/** 质量分归档文案 */
function scoreLabel(score: number): string {
  if (score >= 90) return '优秀';
  if (score >= 85) return '良好';
  if (score >= 80) return '可用';
  if (score >= 75) return '需改善';
  return '偏低';
}

type ZoneTier = 'green' | 'yellow' | 'red';

interface ZoneCell {
  readonly tier: ZoneTier;
  readonly label: string;
  readonly condition: string;
}

function fmtNum(value: number): string {
  return value.toLocaleString('en-US');
}

function withUnit(value: number, unit: string): string {
  if (unit === '%') return `${fmtNum(value)}%`;
  if (unit === '') return fmtNum(value);
  return `${fmtNum(value)} ${unit}`;
}

/** 阈值三档分档文案：lte = 越小越优，gte = 越大越优 */
function buildZones(
  comparator: 'lte' | 'gte',
  levels: { readonly green: number; readonly yellow: number; readonly red: number },
  unit: string,
): readonly ZoneCell[] {
  const green = withUnit(levels.green, unit);
  const yellow = withUnit(levels.yellow, unit);
  const red = withUnit(levels.red, unit);
  const yellowHasGap = levels.green !== levels.yellow;

  if (comparator === 'lte') {
    return [
      { tier: 'green', label: '正常区', condition: `≤ ${green}` },
      {
        tier: 'yellow',
        label: '关注区',
        condition: yellowHasGap ? `> ${green} 且 ≤ ${yellow}` : '无独立区间（与正常区边界重合）',
      },
      { tier: 'red', label: '升级区', condition: `> ${red}` },
    ];
  }

  return [
    { tier: 'green', label: '正常区', condition: `≥ ${green}` },
    {
      tier: 'yellow',
      label: '关注区',
      condition: yellowHasGap ? `< ${green} 且 ≥ ${yellow}` : '无独立区间（与正常区边界重合）',
    },
    { tier: 'red', label: '升级区', condition: `< ${red}` },
  ];
}

/** 色带顺序：越小越优为 绿→黄→红，越大越优为 红→黄→绿 */
function buildBand(comparator: 'lte' | 'gte'): readonly ZoneTier[] {
  return comparator === 'lte' ? ['green', 'yellow', 'red'] : ['red', 'yellow', 'green'];
}

type MvpTier = 'P0 必做' | 'P1 简化' | '暂不实现';

function mvpTierIcon(tier: MvpTier): WsIconName {
  if (tier === 'P0 必做') return 'check';
  if (tier === 'P1 简化') return 'clock';
  return 'close';
}

function mvpTierTone(tier: MvpTier): WsTone {
  if (tier === 'P0 必做') return 'green';
  if (tier === 'P1 简化') return 'blue';
  return 'plain';
}

function mvpTierCaption(tier: MvpTier): string {
  if (tier === 'P0 必做') return 'Demo 必须完整覆盖的主线能力';
  if (tier === 'P1 简化') return '保留主流程，交互与口径做简化';
  return '仅在方案中说明边界，Demo 不落地';
}

interface SourceRow {
  readonly source: DataSource;
  readonly categoryLabel: string;
  readonly statusLabel: string;
  readonly statusTone: WsTone;
  readonly scoreTone: WsTone;
  readonly scoreLabel: string;
  readonly fieldsText: string;
}

interface ThresholdRow {
  readonly config: ThresholdConfig;
  readonly title: string;
  readonly subtitle: string;
  readonly zones: readonly ZoneCell[];
  readonly band: readonly ZoneTier[];
}

interface MatrixCell {
  readonly route: string;
  readonly name: string;
  readonly allowed: boolean;
}

interface RoleRow {
  readonly role: RoleDefinition;
  readonly cells: readonly MatrixCell[];
  readonly allowedCount: number;
  readonly coverageText: string;
  readonly fullAccess: boolean;
}

interface DimensionRow {
  readonly key: string;
  readonly name: string;
  readonly score: number;
  readonly weight: number;
  readonly note: string;
  readonly tone: WsTone;
  readonly ratio: number;
}

interface IssueRow {
  readonly issue: QualityIssue;
  readonly resolved: boolean;
}

interface MvpTierRow {
  readonly tier: MvpTier;
  readonly caption: string;
  readonly icon: WsIconName;
  readonly tone: WsTone;
  readonly items: readonly string[];
}

interface TileSpec {
  readonly label: string;
  readonly value: number;
  readonly kind: MetricKind;
  readonly decimals: number;
  readonly unit: string;
  readonly note: string;
}

/** 页面可见性矩阵的列（仅使用系统真实存在的 9 个路由） */
const PAGE_COLUMNS: readonly { readonly route: string; readonly name: string }[] = [
  { route: '/dashboard', name: '风险驾驶舱' },
  { route: '/inventory', name: '库存风险中心' },
  { route: '/receivables', name: '应收风险中心' },
  { route: '/cash-fx', name: '现金流与外汇' },
  { route: '/scenario', name: '情景模拟' },
  { route: '/alerts', name: '预警中心' },
  { route: '/radar', name: '外部风险雷达' },
  { route: '/assistant', name: 'Sentinel AI' },
  { route: '/settings', name: '基础配置' },
];

const PAGE_SIZE = 10;

/* ========================= 页面 ========================= */

@Component({
  selector: 'app-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    WsBadge,
    WsCard,
    WsChart,
    WsDemoNote,
    WsEmptyState,
    WsIcon,
    WsKeyValue,
    WsMetricTile,
    WsModal,
    WsNatureBadge,
    WsNumPipe,
    WsPercentPipe,
    WsProgressBar,
    WsRiskBadge,
    WsSegmented,
    WsSortHeader,
    WsTabs,
    WsTooltipDirective,
  ],
  template: `
    <div class="page">
      <div class="meta">
        <ws-icon name="database" [size]="14" />
        <span>数据截止 {{ settingsPage.asOf }}</span>
        <span class="ws-muted">·</span>
        <span>
          {{ settingsPage.dataSources.length }} 个数据源 · {{ settingsPage.thresholds.length }} 条指标阈值 ·
          {{ settingsPage.roles.length }} 个角色 · 综合质量分 {{ settingsPage.qualityScore | wsNum: 1 }}
        </span>
        <span class="ws-spacer"></span>
        <ws-demo-note />
      </div>

      <ws-tabs [tabs]="tabs" [active]="activeTab()" (changed)="onTabChange($event)" />

      @switch (activeTab()) {
        @case ('sources') {
          <div class="tab-body">
            <div class="tiles">
              @for (tile of sourceTiles; track tile.label) {
                <ws-metric-tile
                  [label]="tile.label"
                  [value]="tile.value"
                  [kind]="tile.kind"
                  [decimals]="tile.decimals"
                  [unit]="tile.unit"
                  [note]="tile.note"
                />
              }
            </div>

            <ws-card title="数据源台账" [subtitle]="sourcesSubtitle">
              <div class="toolbar">
                <label class="ws-search">
                  <ws-icon class="ws-search__icon" name="search" [size]="14" />
                  <input
                    class="ws-input ws-input--sm"
                    type="search"
                    placeholder="搜索编号 / 名称 / 承载系统 / 责任人 / 字段"
                    [value]="query()"
                    (input)="onQueryChange($event)"
                  />
                </label>
                <ws-segmented
                  ariaLabel="按数据源类别筛选"
                  [value]="categoryFilter()"
                  [options]="categoryOptions"
                  (changed)="onCategoryChange($event)"
                />
                <ws-segmented
                  ariaLabel="按接入状态筛选"
                  [value]="statusFilter()"
                  [options]="statusOptions"
                  (changed)="onStatusChange($event)"
                />
                <span class="ws-spacer"></span>
                <span class="ws-caption">{{ rangeText() }}</span>
                <button
                  type="button"
                  class="ws-btn ws-btn--ghost ws-btn--sm"
                  [disabled]="!filtersActive()"
                  (click)="resetFilters()"
                >
                  重置筛选
                </button>
              </div>

              @if (filteredRows().length === 0) {
                <ws-empty-state
                  title="没有符合条件的数据源"
                  description="当前搜索词与类别 / 状态筛选组合后无匹配记录，可重置筛选查看全部 22 个数据源。"
                  icon="database"
                >
                  <button type="button" class="ws-btn ws-btn--sm" (click)="resetFilters()">重置筛选条件</button>
                </ws-empty-state>
              } @else {
                <div class="ws-table-wrap">
                  <div class="ws-table-scroll">
                    <table class="ws-table table--sources">
                      <thead>
                        <tr>
                          <th
                            wsSort="code"
                            [activeKey]="sortKey()"
                            [direction]="sortDir()"
                            (sorted)="onSort($event)"
                          >
                            编号
                          </th>
                          <th>数据源名称</th>
                          <th>类别</th>
                          <th>承载系统</th>
                          <th>更新频率</th>
                          <th>最近同步</th>
                          <th
                            class="is-numeric"
                            wsSort="qualityScore"
                            [activeKey]="sortKey()"
                            [direction]="sortDir()"
                            (sorted)="onSort($event)"
                          >
                            质量分
                          </th>
                          <th>接入状态</th>
                          <th>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (row of pageRows(); track row.source.id) {
                          <tr>
                            <td class="cell-code">{{ row.source.code }}</td>
                            <td>
                              <div class="src">
                                <span class="src__name">{{ row.source.name }}</span>
                                <ws-nature-badge [nature]="row.source.nature" />
                              </div>
                              <p class="src__note">{{ row.source.note }}</p>
                            </td>
                            <td class="cell-nowrap">{{ row.categoryLabel }}</td>
                            <td class="cell-wrap">{{ row.source.system }}</td>
                            <td class="cell-wrap">{{ row.source.frequency }}</td>
                            <td class="cell-nowrap ws-muted">{{ row.source.lastSync }}</td>
                            <td class="is-numeric">
                              <span [class]="'ws-tag text-' + row.scoreTone" [wsTooltip]="row.scoreLabel">
                                {{ row.source.qualityScore }}
                              </span>
                            </td>
                            <td>
                              <ws-badge [tone]="row.statusTone">{{ row.statusLabel }}</ws-badge>
                            </td>
                            <td>
                              <button
                                type="button"
                                class="ws-btn ws-btn--ghost ws-btn--sm"
                                (click)="openDetail(row.source)"
                              >
                                详情
                              </button>
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                  <div class="ws-table__footer">
                    <span class="ws-caption">{{ rangeText() }}</span>
                    <div class="ws-pager">
                      <button
                        type="button"
                        aria-label="上一页"
                        [disabled]="currentPage() <= 1"
                        (click)="goPage(currentPage() - 1)"
                      >
                        <ws-icon name="chevron-left" [size]="13" />
                      </button>
                      @for (n of pageNumbers(); track n) {
                        <button type="button" [attr.aria-current]="n === currentPage()" (click)="goPage(n)">
                          {{ n }}
                        </button>
                      }
                      <button
                        type="button"
                        aria-label="下一页"
                        [disabled]="currentPage() >= pageCount()"
                        (click)="goPage(currentPage() + 1)"
                      >
                        <ws-icon name="chevron-right" [size]="13" />
                      </button>
                    </div>
                  </div>
                </div>
              }
            </ws-card>

            <ws-card title="接入说明" subtitle="Demo 阶段的数据接入方式、口径对齐与权限边界">
              <div class="notes">
                @for (note of settingsPage.integrationNotes; track note.title) {
                  <div class="note">
                    <ws-icon name="info" [size]="14" />
                    <div>
                      <p class="note__title">{{ note.title }}</p>
                      <p class="note__text">{{ note.text }}</p>
                    </div>
                  </div>
                }
              </div>
            </ws-card>

            <div class="ws-section-title">
              <h2>MVP 范围</h2>
              <span class="ws-muted">Demo 交付边界：必做 {{ mvpMustCount }} 项 · 简化 {{ mvpSimpleCount }} 项 · 暂不实现 {{ mvpSkipCount }} 项</span>
            </div>
            <div class="mvp-grid">
              @for (group of mvpTiers; track group.tier) {
                <ws-card [title]="group.tier" [subtitle]="group.caption">
                  <div class="mvp-head">
                    <ws-icon [name]="group.icon" [size]="15" />
                    <span class="ws-caption">{{ group.items.length }} 项</span>
                  </div>
                  <ul class="mvp-list">
                    @for (item of group.items; track item) {
                      <li class="mvp-item">
                        <ws-icon [name]="group.icon" [size]="13" />
                        <span>{{ item }}</span>
                      </li>
                    }
                  </ul>
                </ws-card>
              }
            </div>
          </div>
        }

        @case ('thresholds') {
          <div class="tab-body">
            <div class="ws-warn-banner">
              <ws-icon name="alert" [size]="15" />
              <span>
                全部 {{ settingsPage.thresholds.length }} 条指标阈值来自 PRD 的【假设】口径，Demo 阶段尚未与企业校准；
                本页可临时调整分档取值，仅在本页会话内生效，刷新后恢复假设值。
              </span>
            </div>

            <div class="tiles">
              @for (tile of thresholdTiles(); track tile.label) {
                <ws-metric-tile
                  [label]="tile.label"
                  [value]="tile.value"
                  [kind]="tile.kind"
                  [decimals]="tile.decimals"
                  [unit]="tile.unit"
                  [note]="tile.note"
                />
              }
            </div>

            <div class="toolbar">
              <label class="ws-search">
                <ws-icon class="ws-search__icon" name="search" [size]="14" />
                <input
                  class="ws-input ws-input--sm"
                  type="search"
                  placeholder="搜索指标编号 / 口径代码 / 名称"
                  [value]="thresholdQuery()"
                  (input)="onThresholdQueryChange($event)"
                />
              </label>
              <ws-segmented
                ariaLabel="按优化方向筛选"
                [value]="directionFilter()"
                [options]="directionOptions()"
                (changed)="onDirectionChange($event)"
              />
              <span class="ws-spacer"></span>
              <span class="ws-caption">本次已调整 {{ dirtyCount() }} 条</span>
              <button
                type="button"
                class="ws-btn ws-btn--ghost ws-btn--sm"
                [disabled]="dirtyCount() === 0"
                (click)="resetThresholds()"
              >
                重置为默认
              </button>
            </div>

            @if (thresholdRows().length === 0) {
              <ws-empty-state
                title="没有符合条件的指标阈值"
                description="可清空搜索词或把优化方向切回「全部」，查看 M1–M12 全部阈值。"
                icon="scale"
              />
            } @else {
              <div class="threshold-grid">
                @for (row of thresholdRows(); track row.config.metricId) {
                  <ws-card [title]="row.title" [subtitle]="row.subtitle">
                    <div class="th">
                      <div class="th__head">
                        @if (row.config.assumed) {
                          <ws-badge tone="yellow">假设口径</ws-badge>
                        } @else {
                          <ws-badge tone="green">已校准</ws-badge>
                        }
                        <ws-badge tone="plain">{{ row.config.unit }}</ws-badge>
                        <span class="ws-spacer"></span>
                        <span class="ws-caption">{{ row.config.code }}</span>
                      </div>

                      <div class="th__band">
                        @for (tier of row.band; track tier) {
                          <div [class]="'th__band-cell tone-' + tier"></div>
                        }
                      </div>

                      <div class="th__zones">
                        @for (zone of row.zones; track zone.tier) {
                          <div [class]="'th__zone tone-' + zone.tier">
                            <span class="th__zone-label">{{ zone.label }}</span>
                            <span class="th__zone-cond">{{ zone.condition }}</span>
                          </div>
                        }
                      </div>

                      <p class="th__note">{{ row.config.note }}</p>

                      <div class="th__foot">
                        <span class="ws-caption">指标 {{ row.config.metricId }}</span>
                        <span class="ws-spacer"></span>
                        <button
                          type="button"
                          class="ws-btn ws-btn--ghost ws-btn--sm"
                          (click)="openCalibrate(row.config)"
                        >
                          校准阈值
                        </button>
                      </div>
                    </div>
                  </ws-card>
                }
              </div>
            }
          </div>
        }

        @case ('roles') {
          <div class="tab-body">
            <div class="tiles">
              @for (tile of roleTiles; track tile.label) {
                <ws-metric-tile
                  [label]="tile.label"
                  [value]="tile.value"
                  [kind]="tile.kind"
                  [decimals]="tile.decimals"
                  [unit]="tile.unit"
                  [note]="tile.note"
                />
              }
            </div>

            <ws-card title="页面可见性矩阵" [subtitle]="matrixSubtitle">
              <div class="toolbar">
                <ws-segmented
                  ariaLabel="按权限范围筛选角色"
                  [value]="roleFilter()"
                  [options]="roleFilterOptions"
                  (changed)="onRoleFilterChange($event)"
                />
                <span class="ws-spacer"></span>
                <span class="ws-caption">当前展示 {{ visibleRoleRows().length }} 个角色</span>
              </div>

              <div class="ws-table-wrap">
                <div class="ws-table-scroll">
                  <table class="ws-table table--matrix">
                    <thead>
                      <tr>
                        <th>角色</th>
                        @for (col of pageColumns; track col.route) {
                          <th class="is-center">{{ col.name }}</th>
                        }
                        <th class="is-numeric">可见页面</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (row of visibleRoleRows(); track row.role.code) {
                        <tr>
                          <th scope="row" class="matrix__role">
                            <span class="matrix__role-code">{{ row.role.code }}</span>
                            <span class="matrix__role-name">{{ row.role.name }}</span>
                            <span class="matrix__role-desc">{{ row.role.description }}</span>
                          </th>
                          @for (cell of row.cells; track cell.route) {
                            <td class="is-center">
                              @if (cell.allowed) {
                                <span class="cell-allow" [wsTooltip]="'可访问「' + cell.name + '」'">
                                  <ws-icon name="check" [size]="14" [strokeWidth]="2.2" />
                                </span>
                              } @else {
                                <span class="cell-deny" [wsTooltip]="'无权限访问「' + cell.name + '」'">–</span>
                              }
                            </td>
                          }
                          <td class="is-numeric">{{ row.coverageText }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>
              <p class="foot-note">
                权限按「页面可见性 + 行级数据范围」双重控制：区域角色只能看到本区客户与仓库，职能角色只能看到职责相关指标，
                系统管理员只可查看配置与质量信息，不可见业务金额明细。
              </p>
            </ws-card>

            <ws-card title="行级数据范围规则" [subtitle]="scopeSubtitle">
              <div class="ws-table-wrap">
                <div class="ws-table-scroll">
                  <table class="ws-table table--roles">
                    <thead>
                      <tr>
                        <th>角色</th>
                        <th>数据范围</th>
                        <th>行级可见规则</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (row of visibleRoleRows(); track row.role.code) {
                        <tr>
                          <td class="cell-nowrap">
                            <span class="matrix__role-code">{{ row.role.code }}</span>
                            {{ row.role.name }}
                          </td>
                          <td class="cell-wrap">{{ row.role.dataScope }}</td>
                          <td class="cell-wrap">{{ row.role.rowLevelRule }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            </ws-card>
          </div>
        }

        @case ('quality') {
          <div class="tab-body">
            <div class="tiles">
              @for (tile of qualityTiles(); track tile.label) {
                <ws-metric-tile
                  [label]="tile.label"
                  [value]="tile.value"
                  [kind]="tile.kind"
                  [decimals]="tile.decimals"
                  [unit]="tile.unit"
                  [note]="tile.note"
                />
              }
            </div>

            <ws-card title="数据质量六维评分" [subtitle]="qualitySubtitle()">
              <ng-template #cardActions>
                <ws-demo-note />
              </ng-template>
              <div class="quality">
                <ws-chart
                  [height]="240"
                  [options]="qualityChart()"
                  [empty]="settingsPage.qualityDimensions.length === 0"
                  emptyTitle="暂无维度数据"
                />
                <div class="dims">
                  @for (dim of dimensionRows(); track dim.key) {
                    <div class="dim">
                      <div class="dim__head">
                        <span class="dim__name">{{ dim.name }}</span>
                        <span class="ws-tag">权重 {{ dim.weight | wsPercent: 0 }}</span>
                        <span class="ws-spacer"></span>
                        <span [class]="'dim__score text-' + dim.tone">{{ dim.score | wsNum }} 分</span>
                      </div>
                      <ws-progress [value]="dim.ratio" [tone]="dim.tone" />
                      <p class="dim__note">{{ dim.note }}</p>
                    </div>
                  }
                </div>
              </div>
            </ws-card>

            <ws-card title="质量问题清单" [subtitle]="issuesSubtitle()">
              <div class="ws-table-wrap">
                <div class="ws-table-scroll">
                  <table class="ws-table table--issues">
                    <thead>
                      <tr>
                        <th>编号</th>
                        <th>数据源</th>
                        <th>问题描述</th>
                        <th>严重程度</th>
                        <th>影响字段</th>
                        <th>检测时间</th>
                        <th>建议动作</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (row of issueRows(); track row.issue.id) {
                        <tr [class.is-resolved]="row.resolved">
                          <td class="cell-nowrap">{{ row.issue.id }}</td>
                          <td class="cell-nowrap">
                            <span class="cell-code">{{ row.issue.sourceCode }}</span>
                            {{ row.issue.sourceName }}
                          </td>
                          <td class="cell-wrap">{{ row.issue.issue }}</td>
                          <td><ws-risk-badge [level]="row.issue.severity" /></td>
                          <td class="cell-wrap ws-muted">{{ row.issue.affectedFields }}</td>
                          <td class="cell-nowrap ws-muted">{{ row.issue.detectedAt }}</td>
                          <td class="cell-clip" [wsTooltip]="row.issue.suggestion">{{ row.issue.suggestion }}</td>
                          <td class="cell-nowrap">
                            @if (row.resolved) {
                              <span class="ws-badge ws-badge--green">已处理</span>
                            } @else {
                              <button
                                type="button"
                                class="ws-btn ws-btn--ghost ws-btn--sm"
                                (click)="markResolved(row.issue)"
                              >
                                标记处理
                              </button>
                            }
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            </ws-card>

            <ws-card title="评分口径" subtitle="综合质量分的计算方式与拆解依据">
              <ws-key-value [items]="qualitySummary()" [columns]="3" />
            </ws-card>
          </div>
        }
      }

      <ws-modal
        [open]="detailSource() !== null"
        [title]="detailTitle()"
        subtitle="Demo 示例数据，用于说明正式接入后的字段映射与责任归属"
        [width]="620"
        (closed)="closeDetail()"
      >
        @if (detailSource(); as ds) {
          <p class="dlg__lead">{{ ds.note }}</p>
          <ws-key-value [items]="detailItems()" [columns]="2" />
          <div class="dlg__fields">
            <p class="dlg__label">涉及字段（{{ ds.fields.length }} 个）</p>
            <div class="dlg__chips">
              @for (field of ds.fields; track field) {
                <span class="ws-tag">{{ field }}</span>
              }
            </div>
          </div>
        }
        <ng-template #modalFoot>
          <button type="button" class="ws-btn ws-btn--ghost" (click)="closeDetail()">关闭</button>
        </ng-template>
      </ws-modal>

      <ws-modal
        [open]="editing() !== null"
        [title]="calibrateTitle()"
        [subtitle]="calibrateSubtitle()"
        [width]="560"
        (closed)="closeCalibrate()"
      >
        @if (editing(); as config) {
          <div class="form">
            <ws-key-value [items]="currentConfigItems()" [columns]="3" />
            <label class="ws-field">
              <span class="ws-field__label">绿区基准值（{{ config.unit }}）</span>
              <input
                class="ws-input"
                type="number"
                [value]="draftGreen()"
                (input)="updateDraft('green', $event)"
              />
            </label>
            <label class="ws-field">
              <span class="ws-field__label">黄区基准值（{{ config.unit }}）</span>
              <input
                class="ws-input"
                type="number"
                [value]="draftYellow()"
                (input)="updateDraft('yellow', $event)"
              />
            </label>
            <label class="ws-field">
              <span class="ws-field__label">红区基准值（{{ config.unit }}）</span>
              <input class="ws-input" type="number" [value]="draftRed()" (input)="updateDraft('red', $event)" />
            </label>
            <label class="ws-field">
              <span class="ws-field__label">口径备注</span>
              <textarea class="ws-textarea" rows="3" [value]="draftNote()" (input)="updateDraftNote($event)"></textarea>
            </label>
            <ws-key-value [items]="draftPreview()" [columns]="3" />
            @if (draftValid()) {
              <p class="form__hint">{{ draftHint() }}</p>
            } @else {
              <p class="ws-error">{{ draftHint() }}</p>
            }
          </div>
        }
        <ng-template #modalFoot>
          <button type="button" class="ws-btn ws-btn--ghost" (click)="closeCalibrate()">取消</button>
          <button type="button" class="ws-btn ws-btn--primary" [disabled]="!draftValid()" (click)="saveThreshold()">
            保存阈值
          </button>
        </ng-template>
      </ws-modal>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .page {
      display: flex;
      flex-direction: column;
      gap: var(--sp-5);
    }

    .meta {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--sp-2);
      font-size: 12px;
      color: var(--text-secondary);
    }

    .meta ws-icon {
      color: var(--text-muted);
    }

    .tab-body {
      display: flex;
      flex-direction: column;
      gap: var(--sp-5);
    }

    .tiles {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: var(--sp-4);
    }

    .toolbar {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--sp-3);
      margin-bottom: var(--sp-4);
    }

    .toolbar .ws-search {
      min-width: 280px;
    }

    /* ---------- 数据源表 ---------- */

    .table--sources {
      min-width: 1240px;
    }

    .table--matrix {
      min-width: 1120px;
    }

    .table--roles {
      min-width: 880px;
    }

    .table--issues {
      min-width: 1180px;
    }

    .cell-code {
      display: inline-block;
      padding: 1px 6px;
      border-radius: var(--radius-sm);
      background: var(--bg-subtle);
      font-size: 12px;
      font-weight: 600;
      color: var(--text-secondary);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    .cell-nowrap {
      white-space: nowrap;
    }

    .cell-wrap {
      min-width: 200px;
      white-space: normal;
      line-height: 1.6;
    }

    .cell-clip {
      max-width: 300px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--text-secondary);
    }

    .src {
      display: flex;
      align-items: center;
      gap: var(--sp-2);
      flex-wrap: wrap;
    }

    .src__name {
      font-weight: 600;
    }

    .src__note {
      max-width: 420px;
      margin: 4px 0 0;
      font-size: 12px;
      line-height: 1.6;
      color: var(--text-muted);
    }

    /* ---------- 接入说明 / MVP ---------- */

    .notes {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--sp-4);
    }

    .note {
      display: flex;
      align-items: flex-start;
      gap: var(--sp-2);
    }

    .note ws-icon {
      margin-top: 2px;
      color: var(--brand-primary);
    }

    .note__title {
      margin: 0 0 2px;
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .note__text {
      margin: 0;
      font-size: 12px;
      line-height: 1.7;
      color: var(--text-secondary);
    }

    .mvp-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: var(--sp-4);
    }

    .mvp-head {
      display: flex;
      align-items: center;
      gap: var(--sp-2);
      margin-bottom: var(--sp-3);
      color: var(--text-muted);
    }

    .mvp-list {
      display: flex;
      flex-direction: column;
      gap: var(--sp-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .mvp-item {
      display: flex;
      align-items: flex-start;
      gap: var(--sp-2);
      font-size: 13px;
      line-height: 1.6;
      color: var(--text-secondary);
    }

    .mvp-item ws-icon {
      margin-top: 3px;
      flex: 0 0 auto;
      color: var(--text-muted);
    }

    /* ---------- 阈值卡片 ---------- */

    .threshold-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: var(--sp-4);
    }

    .th {
      display: flex;
      flex-direction: column;
      gap: var(--sp-3);
    }

    .th__head {
      display: flex;
      align-items: center;
      gap: var(--sp-2);
      flex-wrap: wrap;
    }

    .th__band {
      display: flex;
      height: 6px;
      border-radius: var(--radius-pill);
      overflow: hidden;
    }

    .th__band-cell {
      flex: 1 1 0;
      background: var(--tone, var(--status-neutral));
    }

    .th__zones {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: var(--sp-2);
    }

    .th__zone {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: var(--sp-2);
      border: 1px solid var(--tone-border, var(--border));
      border-radius: var(--radius-md);
      background: var(--tone-soft, var(--bg-subtle));
      min-width: 0;
    }

    .th__zone-label {
      font-size: 11px;
      color: var(--text-muted);
    }

    .th__zone-cond {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-primary);
      line-height: 1.5;
      word-break: break-word;
    }

    .th__note {
      margin: 0;
      font-size: 12px;
      line-height: 1.7;
      color: var(--text-secondary);
    }

    .th__foot {
      display: flex;
      align-items: center;
      gap: var(--sp-2);
      padding-top: var(--sp-2);
      border-top: 1px solid var(--border);
    }

    /* ---------- 权限矩阵 ---------- */

    .table--matrix .is-center {
      text-align: center;
    }

    .table--matrix tbody th.matrix__role {
      min-width: 220px;
      padding: var(--sp-3);
      border-bottom: 1px solid var(--border);
      text-align: left;
      vertical-align: top;
      font-size: 13px;
      font-weight: 500;
      color: var(--text-primary);
    }

    .matrix__role-code {
      display: inline-block;
      min-width: 30px;
      margin-right: var(--sp-2);
      padding: 0 6px;
      border-radius: var(--radius-sm);
      background: var(--brand-soft);
      color: var(--brand-primary);
      font-size: 11px;
      font-weight: 600;
      line-height: 18px;
      text-align: center;
    }

    .matrix__role-name {
      font-size: 13px;
      font-weight: 600;
    }

    .matrix__role-desc {
      display: block;
      margin-top: 3px;
      font-size: 11px;
      font-weight: 400;
      line-height: 1.6;
      color: var(--text-muted);
    }

    .cell-allow,
    .cell-deny {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      border-radius: var(--radius-sm);
    }

    .cell-allow {
      background: var(--status-green-soft);
      color: var(--status-green);
    }

    .cell-deny {
      background: var(--bg-subtle);
      color: var(--text-muted);
      font-size: 12px;
    }

    .foot-note {
      margin: var(--sp-4) 0 0;
      font-size: 12px;
      line-height: 1.7;
      color: var(--text-muted);
    }

    /* ---------- 数据质量 ---------- */

    .quality {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
      gap: var(--sp-5);
      align-items: start;
    }

    .dims {
      display: flex;
      flex-direction: column;
      gap: var(--sp-3);
    }

    .dim {
      display: flex;
      flex-direction: column;
      gap: var(--sp-2);
    }

    .dim__head {
      display: flex;
      align-items: center;
      gap: var(--sp-2);
    }

    .dim__name {
      font-size: 13px;
      font-weight: 600;
    }

    .dim__score {
      font-size: 13px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }

    .dim__note {
      margin: 0;
      font-size: 12px;
      line-height: 1.6;
      color: var(--text-muted);
    }

    .table--issues tr.is-resolved td {
      opacity: 0.6;
    }

    /* ---------- 弹窗 ---------- */

    .dlg__lead {
      margin: 0 0 var(--sp-4);
      font-size: 13px;
      line-height: 1.7;
      color: var(--text-secondary);
    }

    .dlg__fields {
      margin-top: var(--sp-5);
    }

    .dlg__label {
      margin: 0 0 var(--sp-2);
      font-size: 11px;
      color: var(--text-muted);
    }

    .dlg__chips {
      display: flex;
      flex-wrap: wrap;
      gap: var(--sp-2);
    }

    .form {
      display: flex;
      flex-direction: column;
      gap: var(--sp-4);
    }

    .form__hint {
      margin: 0;
      font-size: 12px;
      line-height: 1.6;
      color: var(--text-secondary);
    }

    /* ---------- 响应式 ---------- */

    @media (max-width: 1440px) {
      .tiles {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .threshold-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .mvp-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media (max-width: 1100px) {
      .tiles,
      .threshold-grid,
      .mvp-grid,
      .notes,
      .quality {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
})
export class SettingsPage {
  private readonly data = inject(SentinelDataService);
  private readonly state = inject(StateService);

  protected readonly settingsPage = this.data.settingsPage;

  protected readonly activeTab = signal<string>('sources');

  protected readonly pageColumns = PAGE_COLUMNS;

  protected readonly tabs: readonly TabItem[] = [
    {
      id: 'sources',
      label: '数据源接入',
      hint: '数据源台账、接入状态与质量评分',
      badge: this.settingsPage.dataSources.length,
    },
    { id: 'thresholds', label: '指标阈值', hint: 'M1–M12 阈值分档与校准', badge: this.settingsPage.thresholds.length },
    { id: 'roles', label: '角色权限', hint: '页面可见性与行级数据范围', badge: this.settingsPage.roles.length },
    { id: 'quality', label: '数据质量', hint: '六维评分与质量问题清单', badge: this.settingsPage.qualityScore },
  ];

  protected onTabChange(id: string): void {
    this.activeTab.set(id);
  }

  /* ---------------- Tab1：数据源接入 ---------------- */

  private readonly sourceScores = this.settingsPage.dataSources.map((source) => source.qualityScore);
  private readonly sourceTotal = this.settingsPage.dataSources.length;
  private readonly internalCount = this.settingsPage.dataSources.filter((s) => s.category === 'internal').length;
  private readonly externalCount = this.settingsPage.dataSources.filter((s) => s.category === 'external').length;
  private readonly simulatedCount = this.settingsPage.dataSources.filter((s) => s.status === 'simulated').length;
  private readonly pendingCount = this.settingsPage.dataSources.filter((s) => s.status === 'pending').length;
  private readonly avgQuality =
    this.sourceScores.reduce((sum, score) => sum + score, 0) / (this.sourceScores.length || 1);

  protected readonly sourceTiles: readonly TileSpec[] = [
    {
      label: '数据源总数',
      value: this.sourceTotal,
      kind: 'num',
      decimals: 0,
      unit: '个',
      note: `内部系统 ${this.internalCount} 个 · 外部数据 ${this.externalCount} 个`,
    },
    {
      label: '已模拟接入',
      value: this.simulatedCount,
      kind: 'num',
      decimals: 0,
      unit: '个',
      note: 'Demo 阶段由前端 Mock 按业务口径预置数据',
    },
    {
      label: '待接入',
      value: this.pendingCount,
      kind: 'num',
      decimals: 0,
      unit: '个',
      note: '正式实施后按优先级逐项打通系统对接',
    },
    {
      label: '平均质量分',
      value: this.avgQuality,
      kind: 'num',
      decimals: 1,
      unit: '分',
      note: `算术平均 · 最低 ${Math.min(...this.sourceScores)} 分 / 最高 ${Math.max(...this.sourceScores)} 分`,
    },
  ];

  protected readonly sourcesSubtitle =
    `${this.sourceTotal} 个数据源 · 内部 ${this.internalCount} 个 / 外部 ${this.externalCount} 个 · ` +
    `已模拟接入 ${this.simulatedCount} 个 / 待接入 ${this.pendingCount} 个`;

  protected readonly categoryOptions: readonly SegmentedOption[] = [
    { value: 'all', label: '全部类别', hint: `全部 ${this.sourceTotal} 个数据源` },
    { value: 'internal', label: `内部系统 ${this.internalCount}`, hint: 'ERP / WMS / CRM / 资金 / PLM / BI / 工单' },
    { value: 'external', label: `外部数据 ${this.externalCount}`, hint: '运价 / 汇率 / 政策 / 原材料 / 行业景气' },
  ];

  protected readonly statusOptions: readonly SegmentedOption[] = [
    { value: 'all', label: '全部状态', hint: '不限接入状态' },
    { value: 'simulated', label: `已模拟接入 ${this.simulatedCount}`, hint: 'Demo 阶段已具备示例数据' },
    { value: 'pending', label: `待接入 ${this.pendingCount}`, hint: '正式实施阶段打通' },
  ];

  protected readonly query = signal('');
  protected readonly categoryFilter = signal<'all' | DataSourceCategory>('all');
  protected readonly statusFilter = signal<'all' | SourceStatus>('all');
  protected readonly sortKey = signal('code');
  protected readonly sortDir = signal<'asc' | 'desc'>('asc');
  protected readonly page = signal(1);

  private readonly allRows: readonly SourceRow[] = this.settingsPage.dataSources.map((source) => ({
    source,
    categoryLabel: categoryLabel(source.category),
    statusLabel: sourceStatusLabel(source.status),
    statusTone: sourceStatusTone(source.status),
    scoreTone: scoreTone(source.qualityScore),
    scoreLabel: scoreLabel(source.qualityScore),
    fieldsText: source.fields.join('、'),
  }));

  protected readonly filtersActive = computed(
    () => this.query().trim() !== '' || this.categoryFilter() !== 'all' || this.statusFilter() !== 'all',
  );

  protected readonly filteredRows = computed<readonly SourceRow[]>(() => {
    const text = this.query().trim().toLowerCase();
    const category = this.categoryFilter();
    const status = this.statusFilter();
    const rows = this.allRows.filter((row) => {
      if (category !== 'all' && row.source.category !== category) {
        return false;
      }
      if (status !== 'all' && row.source.status !== status) {
        return false;
      }
      if (text === '') {
        return true;
      }
      return (
        row.source.code.toLowerCase().includes(text) ||
        row.source.name.toLowerCase().includes(text) ||
        row.source.system.toLowerCase().includes(text) ||
        row.source.owner.toLowerCase().includes(text) ||
        row.fieldsText.toLowerCase().includes(text)
      );
    });
    return [...rows].sort((a, b) => this.compareRows(a, b));
  });

  protected readonly pageCount = computed(() => Math.max(1, Math.ceil(this.filteredRows().length / PAGE_SIZE)));

  protected readonly currentPage = computed(() => Math.min(this.page(), this.pageCount()));

  protected readonly pageRows = computed<readonly SourceRow[]>(() => {
    const start = (this.currentPage() - 1) * PAGE_SIZE;
    return this.filteredRows().slice(start, start + PAGE_SIZE);
  });

  protected readonly pageNumbers = computed<readonly number[]>(() =>
    Array.from({ length: this.pageCount() }, (_, index) => index + 1),
  );

  protected readonly rangeText = computed(() => {
    const total = this.filteredRows().length;
    if (total === 0) {
      return '无匹配结果';
    }
    const start = (this.currentPage() - 1) * PAGE_SIZE + 1;
    const end = Math.min(start + PAGE_SIZE - 1, total);
    return `显示第 ${start}–${end} 条，共 ${total} 条`;
  });

  protected onQueryChange(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.page.set(1);
  }

  protected onCategoryChange(value: string): void {
    this.categoryFilter.set(value === 'internal' || value === 'external' ? value : 'all');
    this.page.set(1);
  }

  protected onStatusChange(value: string): void {
    this.statusFilter.set(value === 'simulated' || value === 'pending' ? value : 'all');
    this.page.set(1);
  }

  protected onSort(change: SortChange): void {
    this.sortKey.set(change.key);
    this.sortDir.set(change.direction);
    this.page.set(1);
  }

  protected goPage(target: number): void {
    this.page.set(Math.min(Math.max(1, target), this.pageCount()));
  }

  protected resetFilters(): void {
    this.query.set('');
    this.categoryFilter.set('all');
    this.statusFilter.set('all');
    this.page.set(1);
  }

  private compareRows(a: SourceRow, b: SourceRow): number {
    const factor = this.sortDir() === 'asc' ? 1 : -1;
    const key = this.sortKey();
    if (key === 'qualityScore') {
      return (a.source.qualityScore - b.source.qualityScore) * factor;
    }
    if (key === 'lastSync') {
      return a.source.lastSync.localeCompare(b.source.lastSync) * factor;
    }
    return a.source.code.localeCompare(b.source.code, 'en') * factor;
  }

  protected readonly detailSource = signal<DataSource | null>(null);

  protected readonly detailTitle = computed(() => {
    const ds = this.detailSource();
    return ds === null ? '数据源详情' : `${ds.code} ${ds.name}`;
  });

  protected readonly detailItems = computed<readonly KeyValueItem[]>(() => {
    const ds = this.detailSource();
    if (ds === null) {
      return [];
    }
    return [
      { label: '数据源编号', value: `${ds.id} / ${ds.code}` },
      { label: '数据源名称', value: ds.name },
      { label: '类别', value: categoryLabel(ds.category) },
      { label: '数据源类型', value: ds.kind },
      { label: '承载系统', value: ds.system },
      { label: '更新频率', value: ds.frequency },
      { label: '最近同步', value: ds.lastSync },
      { label: '接入状态', value: sourceStatusLabel(ds.status), tone: sourceStatusTone(ds.status) },
      {
        label: '质量评分',
        value: `${ds.qualityScore} 分 · ${scoreLabel(ds.qualityScore)}`,
        tone: scoreTone(ds.qualityScore),
      },
      { label: '责任人', value: ds.owner },
      { label: '字段数量', value: `${ds.fields.length} 个` },
      { label: '数据性质', value: ds.nature },
    ];
  });

  protected openDetail(source: DataSource): void {
    this.detailSource.set(source);
  }

  protected closeDetail(): void {
    this.detailSource.set(null);
  }

  protected readonly mvpTiers: readonly MvpTierRow[] = this.settingsPage.mvpScope.map((group) => ({
    tier: group.tier,
    caption: mvpTierCaption(group.tier),
    icon: mvpTierIcon(group.tier),
    tone: mvpTierTone(group.tier),
    items: group.items,
  }));

  private readonly mvpItemsOf = (tier: MvpTier): number =>
    this.settingsPage.mvpScope.find((group) => group.tier === tier)?.items.length ?? 0;

  protected readonly mvpMustCount = this.mvpItemsOf('P0 必做');
  protected readonly mvpSimpleCount = this.mvpItemsOf('P1 简化');
  protected readonly mvpSkipCount = this.mvpItemsOf('暂不实现');

  /* ---------------- Tab2：指标阈值 ---------------- */

  protected readonly thresholds = signal<readonly ThresholdConfig[]>([...this.settingsPage.thresholds]);
  protected readonly editing = signal<ThresholdConfig | null>(null);
  protected readonly draftGreen = signal(0);
  protected readonly draftYellow = signal(0);
  protected readonly draftRed = signal(0);
  protected readonly draftNote = signal('');
  protected readonly thresholdQuery = signal('');
  protected readonly directionFilter = signal<'all' | 'lte' | 'gte'>('all');

  private baseConfig(metricId: string): ThresholdConfig | undefined {
    return this.settingsPage.thresholds.find((item) => item.metricId === metricId);
  }

  private isDirty(config: ThresholdConfig): boolean {
    const base = this.baseConfig(config.metricId);
    if (base === undefined) {
      return true;
    }
    return (
      base.green !== config.green ||
      base.yellow !== config.yellow ||
      base.red !== config.red ||
      base.note !== config.note ||
      base.assumed !== config.assumed
    );
  }

  protected readonly dirtyCount = computed(() => this.thresholds().filter((item) => this.isDirty(item)).length);

  protected readonly thresholdTiles = computed<readonly TileSpec[]>(() => {
    const list = this.thresholds();
    const assumed = list.filter((item) => item.assumed).length;
    const lower = list.filter((item) => item.comparator === 'lte').length;
    return [
      {
        label: '阈值总数',
        value: list.length,
        kind: 'num',
        decimals: 0,
        unit: '条',
        note: '覆盖 M1–M12 全部核心指标',
      },
      {
        label: '待校准（假设口径）',
        value: assumed,
        kind: 'num',
        decimals: 0,
        unit: '条',
        note: 'PRD 假设参数，需企业按自身基准校准',
      },
      {
        label: '已校准',
        value: list.length - assumed,
        kind: 'num',
        decimals: 0,
        unit: '条',
        note: '本次演示会话中已保存的调整',
      },
      {
        label: '越小越优',
        value: lower,
        kind: 'num',
        decimals: 0,
        unit: '条',
        note: `越大越优 ${list.length - lower} 条（现金安全度 / DPO / 预警响应率）`,
      },
    ];
  });

  protected readonly directionOptions = computed<readonly SegmentedOption[]>(() => {
    const list = this.thresholds();
    const lower = list.filter((item) => item.comparator === 'lte').length;
    return [
      { value: 'all', label: '全部方向', hint: `全部 ${list.length} 条阈值` },
      { value: 'lte', label: `越小越优 ${lower}`, hint: '数值越低越安全（缺口 / 周转天数 / 占比）' },
      { value: 'gte', label: `越大越优 ${list.length - lower}`, hint: '数值越高越安全（安全度 / DPO / 响应率）' },
    ];
  });

  protected readonly thresholdRows = computed<readonly ThresholdRow[]>(() => {
    const text = this.thresholdQuery().trim().toLowerCase();
    const direction = this.directionFilter();
    return this.thresholds()
      .filter((config) => {
        if (direction !== 'all' && config.comparator !== direction) {
          return false;
        }
        if (text === '') {
          return true;
        }
        return (
          config.metricId.toLowerCase().includes(text) ||
          config.code.toLowerCase().includes(text) ||
          config.name.toLowerCase().includes(text)
        );
      })
      .map((config) => ({
        config,
        title: `${config.metricId} ${config.name}`,
        subtitle: `${config.comparator === 'lte' ? '越小越优' : '越大越优'} · 单位：${config.unit}`,
        zones: buildZones(config.comparator, { green: config.green, yellow: config.yellow, red: config.red }, config.unit),
        band: buildBand(config.comparator),
      }));
  });

  protected onThresholdQueryChange(event: Event): void {
    this.thresholdQuery.set((event.target as HTMLInputElement).value);
  }

  protected onDirectionChange(value: string): void {
    this.directionFilter.set(value === 'lte' || value === 'gte' ? value : 'all');
  }

  protected readonly calibrateTitle = computed(() => {
    const config = this.editing();
    return config === null ? '校准指标阈值' : `校准阈值 · ${config.metricId} ${config.name}`;
  });

  protected readonly calibrateSubtitle = computed(() => {
    const config = this.editing();
    if (config === null) {
      return '';
    }
    return config.comparator === 'lte' ? '越小越优 · 需满足 绿 ≤ 黄 ≤ 红' : '越大越优 · 需满足 绿 ≥ 黄 ≥ 红';
  });

  protected readonly currentConfigItems = computed<readonly KeyValueItem[]>(() => {
    const config = this.editing();
    if (config === null) {
      return [];
    }
    return [
      { label: '指标编号', value: `${config.metricId} / ${config.code}` },
      { label: '指标名称', value: config.name },
      { label: '优化方向', value: config.comparator === 'lte' ? '越小越优' : '越大越优' },
      { label: '当前绿区基准', value: withUnit(config.green, config.unit) },
      { label: '当前黄区基准', value: withUnit(config.yellow, config.unit) },
      { label: '当前红区基准', value: withUnit(config.red, config.unit) },
    ];
  });

  protected readonly draftValid = computed(() => {
    const config = this.editing();
    if (config === null) {
      return false;
    }
    const green = this.draftGreen();
    const yellow = this.draftYellow();
    const red = this.draftRed();
    return config.comparator === 'lte' ? green <= yellow && yellow <= red : green >= yellow && yellow >= red;
  });

  protected readonly draftHint = computed(() => {
    const config = this.editing();
    if (config === null) {
      return '';
    }
    if (this.draftValid()) {
      return `三档取值满足单调约束，保存后该条阈值将标记为「已校准」（Demo 演示，不写回后端、刷新即还原）。`;
    }
    return config.comparator === 'lte'
      ? '越小越优的指标需满足 绿 ≤ 黄 ≤ 红，请调整取值后再保存。'
      : '越大越优的指标需满足 绿 ≥ 黄 ≥ 红，请调整取值后再保存。';
  });

  protected readonly draftPreview = computed<readonly KeyValueItem[]>(() => {
    const config = this.editing();
    if (config === null) {
      return [];
    }
    return buildZones(
      config.comparator,
      { green: this.draftGreen(), yellow: this.draftYellow(), red: this.draftRed() },
      config.unit,
    ).map((zone) => ({ label: zone.label, value: zone.condition, tone: zone.tier }));
  });

  protected openCalibrate(config: ThresholdConfig): void {
    this.editing.set(config);
    this.draftGreen.set(config.green);
    this.draftYellow.set(config.yellow);
    this.draftRed.set(config.red);
    this.draftNote.set(config.note);
  }

  protected closeCalibrate(): void {
    this.editing.set(null);
  }

  protected updateDraft(zone: ZoneTier, event: Event): void {
    const raw = Number((event.target as HTMLInputElement).value);
    const value = Number.isFinite(raw) ? raw : 0;
    if (zone === 'green') {
      this.draftGreen.set(value);
    } else if (zone === 'yellow') {
      this.draftYellow.set(value);
    } else {
      this.draftRed.set(value);
    }
  }

  protected updateDraftNote(event: Event): void {
    this.draftNote.set((event.target as HTMLTextAreaElement).value);
  }

  protected saveThreshold(): void {
    const config = this.editing();
    if (config === null || !this.draftValid()) {
      return;
    }
    const green = this.draftGreen();
    const yellow = this.draftYellow();
    const red = this.draftRed();
    const note = this.draftNote().trim() === '' ? config.note : this.draftNote().trim();
    this.thresholds.update((list) =>
      list.map((item) =>
        item.metricId === config.metricId ? { ...item, green, yellow, red, note, assumed: false } : item,
      ),
    );
    this.state.pushToast(`阈值已保存：${config.metricId} ${config.name}（Demo 演示，不持久化）`, 'success');
    this.editing.set(null);
  }

  protected resetThresholds(): void {
    this.thresholds.set([...this.settingsPage.thresholds]);
    this.state.pushToast('指标阈值已重置为 PRD 假设口径（Demo 演示）', 'info');
  }

  /* ---------------- Tab3：角色权限 ---------------- */

  private readonly roleCount = this.settingsPage.roles.length;
  private readonly grantedPageTotal = this.settingsPage.roles.reduce((sum, role) => sum + role.pages.length, 0);
  private readonly fullAccessCount = this.settingsPage.roles.filter(
    (role) => role.pages.length === PAGE_COLUMNS.length,
  ).length;
  private readonly avgPagesPerRole = this.grantedPageTotal / (this.roleCount || 1);

  private readonly allRoleRows: readonly RoleRow[] = this.settingsPage.roles.map((role) => {
    const cells: readonly MatrixCell[] = PAGE_COLUMNS.map((col) => ({
      route: col.route,
      name: col.name,
      allowed: role.pages.includes(col.route),
    }));
    const allowedCount = cells.filter((cell) => cell.allowed).length;
    return {
      role,
      cells,
      allowedCount,
      coverageText: `${allowedCount} / ${PAGE_COLUMNS.length}`,
      fullAccess: allowedCount === PAGE_COLUMNS.length,
    };
  });

  protected readonly roleTiles: readonly TileSpec[] = [
    {
      label: '角色总数',
      value: this.roleCount,
      kind: 'num',
      decimals: 0,
      unit: '个',
      note: '覆盖财务、供应链、仓储、物流、应收与系统管理',
    },
    {
      label: '全量可见角色',
      value: this.fullAccessCount,
      kind: 'num',
      decimals: 0,
      unit: '个',
      note: '仅 CFO 可访问全部 9 个页面',
    },
    {
      label: '平均可见页面数',
      value: this.avgPagesPerRole,
      kind: 'num',
      decimals: 1,
      unit: '个',
      note: `页面授权合计 ${this.grantedPageTotal} 项 / ${this.roleCount} 个角色`,
    },
    {
      label: '页面总数',
      value: PAGE_COLUMNS.length,
      kind: 'num',
      decimals: 0,
      unit: '个',
      note: '与系统路由表一致，未交付页面不参与授权',
    },
  ];

  protected readonly matrixSubtitle =
    `${this.roleCount} 个角色 × ${PAGE_COLUMNS.length} 个页面，页面授权合计 ${this.grantedPageTotal} 项；` +
    '打勾表示角色可访问该页面';

  protected readonly scopeSubtitle = '同一份数据按角色做行级过滤，区域角色与职能角色的可见范围不同';

  protected readonly roleFilter = signal<'all' | 'full' | 'partial'>('all');

  protected readonly roleFilterOptions: readonly SegmentedOption[] = [
    { value: 'all', label: `全部 ${this.roleCount}`, hint: '全部角色' },
    { value: 'full', label: `全量可见 ${this.fullAccessCount}`, hint: `可访问全部 ${PAGE_COLUMNS.length} 个页面` },
    {
      value: 'partial',
      label: `部分可见 ${this.roleCount - this.fullAccessCount}`,
      hint: '仅可访问职责相关页面',
    },
  ];

  protected readonly visibleRoleRows = computed<readonly RoleRow[]>(() => {
    const filter = this.roleFilter();
    if (filter === 'full') {
      return this.allRoleRows.filter((row) => row.fullAccess);
    }
    if (filter === 'partial') {
      return this.allRoleRows.filter((row) => !row.fullAccess);
    }
    return this.allRoleRows;
  });

  protected onRoleFilterChange(value: string): void {
    this.roleFilter.set(value === 'full' || value === 'partial' ? value : 'all');
  }

  /* ---------------- Tab4：数据质量 ---------------- */

  protected readonly resolvedIssues = signal<ReadonlySet<string>>(new Set<string>());

  protected readonly dimensionRows = computed<readonly DimensionRow[]>(() =>
    this.settingsPage.qualityDimensions.map((dim) => ({
      key: dim.key,
      name: dim.name,
      score: dim.score,
      weight: dim.weight,
      note: dim.note,
      tone: scoreTone(dim.score),
      ratio: dim.score / 100,
    })),
  );

  protected readonly issueRows = computed<readonly IssueRow[]>(() =>
    this.settingsPage.qualityIssues.map((issue) => ({
      issue,
      resolved: this.resolvedIssues().has(issue.id),
    })),
  );

  protected readonly openIssueCount = computed(
    () => this.settingsPage.qualityIssues.length - this.resolvedIssues().size,
  );

  protected readonly qualityTiles = computed<readonly TileSpec[]>(() => [
    {
      label: '综合质量分',
      value: this.settingsPage.qualityScore,
      kind: 'num',
      decimals: 1,
      unit: '分',
      note: '六维得分按权重加权计算得出',
    },
    {
      label: '质量维度',
      value: this.settingsPage.qualityDimensions.length,
      kind: 'num',
      decimals: 0,
      unit: '个',
      note: '完整性 / 准确性 / 及时性 / 一致性 / 唯一性 / 可追溯性',
    },
    {
      label: '质量问题',
      value: this.settingsPage.qualityIssues.length,
      kind: 'num',
      decimals: 0,
      unit: '项',
      note: '来自数据源台账的待改进事项',
    },
    {
      label: '待处理问题',
      value: this.openIssueCount(),
      kind: 'num',
      decimals: 0,
      unit: '项',
      note: '点击清单中的「标记处理」可临时关闭（不持久化）',
    },
  ]);

  protected readonly qualitySubtitle = computed(
    () => `综合质量分 ${this.settingsPage.qualityScore} 分（按维度权重加权）· 各维度为 0–100 分制`,
  );

  protected readonly issuesSubtitle = computed(() => {
    const issues = this.settingsPage.qualityIssues;
    const high = issues.filter((issue) => issue.severity === 'L4').length;
    return `共 ${issues.length} 项 · 待处理 ${this.openIssueCount()} 项 · L4 ${high} 项`;
  });

  protected readonly qualityChart = computed<EChartsOption>(() => {
    const dims = this.dimensionRows();
    return {
      tooltip: tooltipConfig('axis'),
      grid: gridConfig({ top: 16, bottom: 4, left: 4, right: 12 }),
      xAxis: categoryAxis(dims.map((dim) => dim.name)),
      yAxis: valueAxis({ min: 0, max: 100, unit: '分' }),
      series: [
        barSeries(
          '质量分',
          dims.map((dim) => dim.score),
          { color: CHART_COLORS.blue, showLabel: true, labelUnit: ' 分' },
        ),
      ],
    };
  });

  protected readonly qualitySummary = computed<readonly KeyValueItem[]>(() => {
    const dims = this.settingsPage.qualityDimensions;
    if (dims.length === 0) {
      return [];
    }
    const sorted = [...dims].sort((a, b) => b.score - a.score);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    const weightSum = dims.reduce((sum, dim) => sum + dim.weight, 0);
    return [
      { label: '计算方式', value: 'Σ(维度得分 × 维度权重)', hint: '各维度得分均为 0–100 分制' },
      { label: '权重合计', value: `${Math.round(weightSum * 100)}%`, hint: '六维权重之和为 1，未做二次归一化' },
      { label: '最高维度', value: `${best.name} ${best.score} 分`, tone: scoreTone(best.score) },
      { label: '最低维度', value: `${worst.name} ${worst.score} 分`, tone: scoreTone(worst.score) },
      { label: '数据截止时间', value: this.settingsPage.asOf },
      {
        label: '使用建议',
        value: this.settingsPage.qualityScore >= 85 ? '结论可直接用于Demo演示' : '需补充数据源后再用',
      },
    ];
  });

  protected markResolved(issue: QualityIssue): void {
    this.resolvedIssues.update((set) => new Set(set).add(issue.id));
    this.state.pushToast(`已标记处理：${issue.id} ${issue.sourceName}（Demo 演示，不持久化）`, 'success');
  }
}
