import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { EChartsOption } from 'echarts';

import {
  ALERT_STATUS_LABEL,
  BRAKE_ACTIONS,
  RISK_LEVELS,
  RISK_TYPE_LABEL,
  riskLevelMeta,
} from '../../core/models';
import type {
  AlertRecord,
  AlertStats,
  AlertStatus,
  BrakeAction,
  RiskLevel,
  RiskType,
  SuggestedAction,
} from '../../core/models';
import { SentinelDataService } from '../../core/services/sentinel-data.service';
import { StateService } from '../../core/services/state.service';
import {
  CHART_COLORS,
  WsAmountPipe,
  WsBadge,
  WsCard,
  WsChart,
  WsDemoNote,
  WsDrawer,
  WsEmptyState,
  WsFivePart,
  WsIcon,
  WsKeyValue,
  WsMetricTile,
  WsModal,
  WsNatureBadge,
  WsRiskBadge,
  WsRiskTypeLabelPipe,
  WsSegmented,
  WsSortHeader,
  WsStatusBadge,
  WsStatusLabelPipe,
  WsTabs,
  barSeries,
  categoryAxis,
  donutCenterLabel,
  emptyChartOption,
  gridConfig,
  legendConfig,
  pieSeries,
  tooltipConfig,
  valueAxis,
} from '../../shared/ui';
import type { KeyValueItem, SortChange, TabItem } from '../../shared/ui';

/** 列表可排序列 */
type SortKey = 'id' | 'level' | 'impactAmount' | 'triggeredAt' | 'status';

const PAGE_SIZE = 10;

const STATUS_ORDER: Record<AlertStatus, number> = {
  pending: 0,
  processing: 1,
  resolved: 2,
  closed: 3,
};

const STATUS_FILTERS: readonly AlertStatus[] = ['pending', 'processing', 'resolved', 'closed'];

const LEVEL_FILTERS: readonly { readonly value: string; readonly label: string }[] = [
  { value: 'all', label: '全部等级' },
  { value: 'L4', label: 'L4 高风险' },
  { value: 'L3', label: 'L3 中风险' },
  { value: 'L2', label: 'L2 关注' },
  { value: 'L1', label: 'L1 正常' },
];

const TYPE_FILTERS: readonly RiskType[] = [
  'inventory',
  'receivable',
  'cash',
  'fx',
  'logistics',
  'policy',
];

@Component({
  selector: 'app-alerts-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    WsAmountPipe,
    WsBadge,
    WsCard,
    WsChart,
    WsDemoNote,
    WsDrawer,
    WsEmptyState,
    WsFivePart,
    WsIcon,
    WsKeyValue,
    WsMetricTile,
    WsModal,
    WsNatureBadge,
    WsRiskBadge,
    WsRiskTypeLabelPipe,
    WsSegmented,
    WsSortHeader,
    WsStatusBadge,
    WsStatusLabelPipe,
    WsTabs,
  ],
  template: `
    <div class="page">
      <div class="meta">
        <ws-icon name="bell" [size]="14" />
        <span>数据截止 {{ state.lastRefreshedAt() }}</span>
        <span class="meta__sep">·</span>
        <span>生效预警 {{ stats().total }} 条</span>
        <span class="meta__sep">·</span>
        <span>未闭环 {{ openCount() }} 条</span>
        <span class="meta__sep">·</span>
        <span>高风险 {{ stats().l4 }} 条</span>
        <span class="ws-spacer"></span>
        <ws-demo-note />
      </div>

      <div class="tiles">
        <ws-metric-tile label="预警总数" [value]="stats().total" unit="条" hint="当前生效的全部预警" />
        <ws-metric-tile
          label="待处理"
          [value]="stats().pending"
          unit="条"
          level="L4"
          hint="需要在 24 小时内响应"
        />
        <ws-metric-tile label="处理中" [value]="stats().processing" unit="条" />
        <ws-metric-tile
          label="48 小时响应率"
          [value]="stats().responseRate48h"
          kind="percent"
          [decimals]="1"
          hint="Demo 示例口径：48 小时内发生首次处置的预警占比"
        />
        <ws-metric-tile
          label="高风险影响金额"
          [value]="stats().l4Impact"
          kind="amount"
          level="L4"
          hint="L4 预警涉及的影响金额合计"
        />
        <ws-metric-tile
          label="影响金额合计"
          [value]="stats().totalImpact"
          kind="amount"
          hint="全部预警的影响金额合计"
        />
      </div>

      <div class="charts">
        <ws-card title="预警类型分布" subtitle="Demo 示例数据 · 按风险类型统计">
          <ws-chart [options]="typeChart()" [height]="264" [empty]="stats().total === 0" />
        </ws-card>
        <ws-card title="等级 × 状态分布" subtitle="Demo 示例数据 · 堆叠柱状">
          <ws-chart [options]="levelChart()" [height]="264" [empty]="stats().total === 0" />
        </ws-card>
      </div>

      <ws-card flush>
        <div class="board">
          <ws-tabs [tabs]="tabs()" [active]="statusTab()" (changed)="onTab($event)" />

          <div class="toolbar">
            <ws-segmented
              [value]="levelFilter()"
              [options]="levelOptions"
              ariaLabel="风险等级筛选"
              (changed)="levelFilter.set($event)"
            />
            <label class="toolbar__field">
              <span class="toolbar__label">风险类型</span>
              <select class="ws-select ws-select--sm" [value]="typeFilter()" (change)="onType($event)">
                <option value="all">全部类型</option>
                @for (type of typeFilters; track type) {
                  <option [value]="type">{{ type | wsRiskType }}</option>
                }
              </select>
            </label>
            <label class="toolbar__field">
              <span class="toolbar__label">国家</span>
              <select class="ws-select ws-select--sm" [value]="countryFilter()" (change)="onCountry($event)">
                <option value="all">全部国家 / 地区</option>
                @for (country of countries(); track country) {
                  <option [value]="country">{{ country }}</option>
                }
              </select>
            </label>
            <input
              class="ws-search"
              type="search"
              placeholder="搜索预警编号 / 标题 / 主体 / 责任人"
              aria-label="搜索预警"
              [value]="keyword()"
              (input)="onKeyword($event)"
            />
            <span class="ws-spacer"></span>
            <span class="ws-caption">共 {{ filtered().length }} 条</span>
            @if (filtersActive()) {
              <button type="button" class="ws-btn ws-btn--ghost ws-btn--sm" (click)="resetFilters()">
                <ws-icon name="refresh" [size]="13" />
                <span>重置筛选</span>
              </button>
            }
          </div>

          @if (filtered().length === 0) {
            <div class="board__empty">
              <ws-empty-state
                title="没有符合条件的预警"
                description="当前筛选条件下没有匹配记录。可以放宽等级、类型或国家条件后重试。"
                icon="filter"
              >
                <button type="button" class="ws-btn ws-btn--sm" (click)="resetFilters()">重置筛选</button>
              </ws-empty-state>
            </div>
          } @else {
            <div class="ws-table-wrap">
              <div class="ws-table-scroll">
                <table class="ws-table table--alerts">
                  <thead>
                    <tr>
                      <th wsSort="id" [activeKey]="sortKey()" [direction]="sortDir()" (sorted)="onSort($event)">
                        预警编号
                      </th>
                      <th>风险类型</th>
                      <th wsSort="level" [activeKey]="sortKey()" [direction]="sortDir()" (sorted)="onSort($event)">
                        风险等级
                      </th>
                      <th>国家 / 地区</th>
                      <th>监控主体</th>
                      <th
                        class="is-numeric"
                        wsSort="impactAmount"
                        [activeKey]="sortKey()"
                        [direction]="sortDir()"
                        (sorted)="onSort($event)"
                      >
                        影响金额
                      </th>
                      <th
                        wsSort="triggeredAt"
                        [activeKey]="sortKey()"
                        [direction]="sortDir()"
                        (sorted)="onSort($event)"
                      >
                        触发时间
                      </th>
                      <th>负责人</th>
                      <th wsSort="status" [activeKey]="sortKey()" [direction]="sortDir()" (sorted)="onSort($event)">
                        状态
                      </th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of paged(); track row.id) {
                      <tr class="row--clickable" (click)="openDetail(row)">
                        <td class="cell-code">{{ row.id }}</td>
                        <td>{{ row.type | wsRiskType }}</td>
                        <td><ws-risk-badge [level]="row.level" /></td>
                        <td>
                          <span class="cell-country">{{ row.country }}</span>
                          <span class="cell-cc">{{ row.countryCode }}</span>
                        </td>
                        <td class="cell-subject">{{ row.subject }}</td>
                        <td class="is-numeric">{{ row.impactAmount | wsAmount }}</td>
                        <td class="cell-time">{{ row.triggeredAt }}</td>
                        <td class="cell-owner">{{ row.owner }}</td>
                        <td (click)="$event.stopPropagation()">
                          <select
                            class="ws-select ws-select--sm"
                            [attr.aria-label]="row.id + ' 状态'"
                            [value]="row.status"
                            (change)="onStatusChange(row, $event)"
                          >
                            @for (status of statusFilters; track status) {
                              <option [value]="status">{{ status | wsStatus }}</option>
                            }
                          </select>
                        </td>
                        <td (click)="$event.stopPropagation()">
                          <div class="cell-actions">
                            <button type="button" class="ws-btn ws-btn--ghost ws-btn--sm" (click)="openDetail(row)">
                              详情
                            </button>
                          </div>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>

            <div class="ws-table__footer">
              <span class="ws-caption">
                第 {{ page() }} / {{ pageCount() }} 页 · 每页 {{ pageSize }} 条
              </span>
              <span class="ws-spacer"></span>
              <div class="ws-pager">
                <button
                  type="button"
                  class="ws-btn ws-btn--sm"
                  [disabled]="page() === 1"
                  (click)="goPage(page() - 1)"
                >
                  上一页
                </button>
                @for (item of pages(); track item) {
                  <button
                    type="button"
                    class="ws-btn ws-btn--sm"
                    [class.is-active]="item === page()"
                    (click)="goPage(item)"
                  >
                    {{ item }}
                  </button>
                }
                <button
                  type="button"
                  class="ws-btn ws-btn--sm"
                  [disabled]="page() === pageCount()"
                  (click)="goPage(page() + 1)"
                >
                  下一页
                </button>
              </div>
            </div>
          }
        </div>
      </ws-card>
    </div>

    <ws-drawer
      [open]="drawerOpen()"
      [title]="selected()?.title ?? ''"
      [subtitle]="selected()?.id ?? ''"
      [eyebrow]="drawerEyebrow()"
      [width]="780"
      (closed)="closeDetail()"
    >
      @if (selected(); as alert) {
        <div class="detail">
          <div class="detail__head">
            <ws-risk-badge [level]="alert.level" />
            <ws-status-badge [status]="alert.status" />
            <ws-badge tone="plain">{{ alert.type | wsRiskType }}</ws-badge>
            <span class="ws-caption">{{ alert.triggeredAt }} 触发</span>
          </div>

          <div class="detail__banner">
            <ws-icon name="alert" [size]="14" />
            <span>{{ subjectTypeText(alert) }}：{{ alert.subject }}</span>
          </div>

          <div class="detail__links">
            <button
              type="button"
              class="ws-btn ws-btn--ghost ws-btn--sm"
              (click)="navigateTo(relatedRoute(alert))"
            >
              <ws-icon name="globe" [size]="13" />
              <span>{{ relatedLabel(alert) }}</span>
            </button>
          </div>

          <ws-key-value [items]="alertFacts(alert)" [columns]="2" />

          <div class="detail__block">
            <h3 class="detail__title">触发规则</h3>
            <div class="detail__rules">
              <span class="ws-tag">规则类型：{{ triggerRuleText(alert) }}</span>
              @for (metric of alert.triggeredBy; track metric) {
                <span class="ws-tag">指标 {{ metric }}</span>
              }
            </div>
            <p class="ws-caption">
              触发指标编号对应 PRD 的 M1–M12 指标体系（Demo 示例口径，阈值需按企业实际基准校准）。
            </p>
          </div>

          <div class="detail__block">
            <ws-five-part [analysis]="alert.analysis" (assignAction)="onAssign($event)" />
          </div>

          <div class="detail__block">
            <h3 class="detail__title">处理时间线</h3>
            <ol class="timeline">
              @for (entry of alert.history; track entry.at) {
                <li class="timeline__item">
                  <span class="timeline__dot" [class.timeline__dot--last]="$last"></span>
                  <div class="timeline__body">
                    <div class="timeline__line">
                      <span class="timeline__actor">{{ entry.actor }}</span>
                      <span class="timeline__at">{{ entry.at }}</span>
                    </div>
                    <p class="timeline__action">{{ entry.action }}</p>
                    @if (entry.note) {
                      <p class="timeline__note">{{ entry.note }}</p>
                    }
                  </div>
                </li>
              }
            </ol>
          </div>

          <div class="detail__note">
            <ws-nature-badge nature="demo" />
            <span>{{ detailNotice }}</span>
          </div>
        </div>
      }

      <ng-template #drawerFoot>
        @if (selected(); as alert) {
          <div class="foot">
            <span class="ws-caption">状态变更仅保存在浏览器内存（Demo）</span>
            <span class="ws-spacer"></span>
            <div class="foot__actions">
              @for (status of statusFilters; track status) {
                <button
                  type="button"
                  class="ws-btn ws-btn--sm"
                  [disabled]="alert.status === status"
                  (click)="changeStatus(alert, status)"
                >
                  {{ status | wsStatus }}
                </button>
              }
            </div>
            <button type="button" class="ws-btn ws-btn--primary ws-btn--sm" (click)="openAssign(alert)">
              <ws-icon name="target" [size]="13" />
              <span>指派动作</span>
            </button>
          </div>
        }
      </ng-template>
    </ws-drawer>

    <ws-modal
      [open]="assignOpen()"
      [title]="assignTitle()"
      subtitle="指派结果仅保存在浏览器内存，用于演示风险处置闭环（Demo 示例数据）"
      [width]="560"
      (closed)="assignOpen.set(false)"
    >
      <div class="form">
        <div class="form__row">
          <span class="form__label">建议动作</span>
          <ws-segmented
            [value]="assignAction()"
            [options]="brakeOptions"
            ariaLabel="建议动作"
            (changed)="onAssignAction($event)"
          />
        </div>
        <p class="form__hint">{{ actionHint() }}</p>

        <label class="form__row">
          <span class="form__label">责任人</span>
          <input
            class="ws-input"
            type="text"
            placeholder="如：李崇（海外仓运营）"
            [value]="assignOwner()"
            (input)="onAssignOwner($event)"
          />
        </label>

        <label class="form__row">
          <span class="form__label">截止时间</span>
          <input class="ws-input" type="date" [value]="assignDue()" (input)="onAssignDue($event)" />
        </label>

        <label class="form__row">
          <span class="form__label">处置说明</span>
          <textarea
            class="ws-textarea"
            rows="3"
            placeholder="记录本次处置的口径、范围与后续跟进安排"
            [value]="assignNote()"
            (input)="onAssignNote($event)"
          ></textarea>
        </label>

        @if (assignSkuCode(); as code) {
          <div class="form__target">
            <ws-icon name="pin" [size]="13" />
            <span>关联 SKU：{{ code }}</span>
          </div>
        } @else {
          <div class="form__target form__target--warn">
            <ws-icon name="alert" [size]="13" />
            <span>该预警主体未关联可指派的 SKU，将仅记录处置说明。</span>
          </div>
        }
      </div>

      <ng-template #modalFoot>
        <span class="ws-caption">Demo 演示：指派结果不会回写真实业务系统</span>
        <span class="ws-spacer"></span>
        <button type="button" class="ws-btn" (click)="assignOpen.set(false)">取消</button>
        <button type="button" class="ws-btn ws-btn--primary" (click)="confirmAssign()">确认指派</button>
      </ng-template>
    </ws-modal>
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
      flex-wrap: wrap;
      align-items: center;
      gap: var(--sp-3);
      font-size: 12px;
      color: var(--text-secondary);
    }

    .meta__sep {
      color: var(--border-strong);
    }

    .meta ws-icon {
      color: var(--text-muted);
    }

    .tiles {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: var(--sp-4);
    }

    .charts {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--sp-5);
    }

    .board {
      display: flex;
      flex-direction: column;
      gap: var(--sp-4);
      padding: var(--sp-5);
    }

    .board__empty {
      padding: var(--sp-6) 0;
    }

    .toolbar {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      gap: var(--sp-3);
    }

    .toolbar .ws-search {
      min-width: 260px;
    }

    .toolbar__field {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .toolbar__label {
      font-size: 11px;
      color: var(--text-muted);
    }

    .table--alerts {
      min-width: 1320px;
    }

    .row--clickable {
      cursor: pointer;
    }

    .cell-code {
      font-family: var(--font-mono);
      font-size: 12px;
      color: var(--brand-ink);
      white-space: nowrap;
    }

    .cell-country {
      white-space: nowrap;
    }

    .cell-cc {
      margin-left: var(--sp-2);
      font-size: 11px;
      color: var(--text-muted);
    }

    .cell-subject {
      font-family: var(--font-mono);
      font-size: 12px;
      color: var(--text-secondary);
      white-space: nowrap;
    }

    .cell-time {
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
      color: var(--text-secondary);
    }

    .cell-owner {
      white-space: nowrap;
      font-size: 12px;
      color: var(--text-secondary);
    }

    .cell-actions {
      display: flex;
      gap: var(--sp-2);
      white-space: nowrap;
    }

    .ws-pager .is-active {
      border-color: var(--brand-primary);
      color: var(--brand-primary);
      background: var(--brand-soft);
    }

    /* ---------- 抽屉 ---------- */

    .detail {
      display: flex;
      flex-direction: column;
      gap: var(--sp-5);
    }

    .detail__head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--sp-3);
    }

    .detail__banner {
      display: flex;
      align-items: center;
      gap: var(--sp-2);
      padding: var(--sp-3) var(--sp-4);
      border: 1px solid var(--border);
      border-left: 2px solid var(--brand-primary);
      border-radius: var(--radius-sm);
      background: var(--bg-subtle);
      font-size: 12px;
      color: var(--text-secondary);
    }

    .detail__banner ws-icon {
      color: var(--brand-primary);
    }

    .detail__block {
      display: flex;
      flex-direction: column;
      gap: var(--sp-3);
      padding-top: var(--sp-4);
      border-top: 1px solid var(--border);
    }

    .detail__links {
      display: flex;
      flex-wrap: wrap;
      gap: var(--sp-2);
    }

    .detail__title {
      margin: 0;
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .detail__rules {
      display: flex;
      flex-wrap: wrap;
      gap: var(--sp-2);
    }

    .detail__note {
      display: flex;
      align-items: flex-start;
      gap: var(--sp-2);
      padding: var(--sp-3) var(--sp-4);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--bg-subtle);
      font-size: 11px;
      line-height: 1.6;
      color: var(--text-muted);
    }

    /* ---------- 时间线 ---------- */

    .timeline {
      display: flex;
      flex-direction: column;
      gap: var(--sp-4);
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .timeline__item {
      display: grid;
      grid-template-columns: 14px minmax(0, 1fr);
      gap: var(--sp-3);
    }

    .timeline__dot {
      position: relative;
      width: 8px;
      height: 8px;
      margin-top: 5px;
      border: 1px solid var(--brand-primary);
      border-radius: 50%;
      background: var(--bg-surface);
    }

    .timeline__dot::after {
      content: '';
      position: absolute;
      left: 2px;
      top: 10px;
      width: 1px;
      height: calc(100% + 22px);
      background: var(--border);
    }

    .timeline__dot--last::after {
      display: none;
    }

    .timeline__body {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .timeline__line {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: var(--sp-3);
    }

    .timeline__actor {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .timeline__at {
      font-size: 11px;
      color: var(--text-muted);
      font-variant-numeric: tabular-nums;
    }

    .timeline__action {
      margin: 0;
      font-size: 12px;
      line-height: 1.6;
      color: var(--text-secondary);
    }

    .timeline__note {
      margin: 0;
      font-size: 11px;
      line-height: 1.6;
      color: var(--text-muted);
    }

    /* ---------- 抽屉底栏 ---------- */

    .foot {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--sp-2);
      width: 100%;
    }

    .foot__actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--sp-2);
    }

    /* ---------- 表单 ---------- */

    .form {
      display: flex;
      flex-direction: column;
      gap: var(--sp-4);
    }

    .form__row {
      display: flex;
      flex-direction: column;
      gap: var(--sp-2);
    }

    .form__label {
      font-size: 11px;
      color: var(--text-muted);
    }

    .form__hint {
      margin: 0;
      font-size: 11px;
      line-height: 1.6;
      color: var(--text-secondary);
    }

    .form__target {
      display: flex;
      align-items: center;
      gap: var(--sp-2);
      padding: var(--sp-3) var(--sp-4);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--bg-subtle);
      font-size: 12px;
      color: var(--text-secondary);
    }

    .form__target ws-icon {
      color: var(--brand-primary);
    }

    .form__target--warn ws-icon {
      color: var(--tone-orange-text);
    }

    @media (max-width: 1680px) {
      .tiles {
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }
    }

    @media (max-width: 1366px) {
      .tiles {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }

      .charts {
        grid-template-columns: minmax(0, 1fr);
      }
    }

    @media (max-width: 1100px) {
      .tiles {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
})
export class AlertsPage {
  protected readonly data = inject(SentinelDataService);
  protected readonly state = inject(StateService);
  private readonly router = inject(Router);

  protected readonly pageSize = PAGE_SIZE;
  protected readonly statusFilters = STATUS_FILTERS;
  protected readonly typeFilters = TYPE_FILTERS;
  protected readonly levelOptions: readonly { readonly value: string; readonly label: string }[] =
    LEVEL_FILTERS;
  protected readonly brakeOptions = BRAKE_ACTIONS.map((item) => ({
    value: item.action as string,
    label: item.label,
    hint: item.hint,
  }));
  protected readonly detailNotice =
    '本页全部预警编号、金额、责任人与处理时间线均为 Demo 示例数据，仅用于产品演示，不代表沃太能源（AlphaESS）任何时点的真实经营数据。';

  protected readonly statusTab = signal('all');
  protected readonly levelFilter = signal('all');
  protected readonly typeFilter = signal('all');
  protected readonly countryFilter = signal('all');
  protected readonly keyword = signal('');
  protected readonly sortKey = signal<SortKey>('impactAmount');
  protected readonly sortDir = signal<'asc' | 'desc'>('desc');
  protected readonly page = signal(1);

  protected readonly selected = signal<AlertRecord | null>(null);
  protected readonly drawerOpen = signal(false);
  protected readonly assignOpen = signal(false);
  protected readonly assignTargetId = signal<string | null>(null);
  protected readonly assignSkuId = signal<string | null>(null);
  protected readonly assignSkuCode = signal<string | null>(null);
  protected readonly assignAction = signal<BrakeAction>('pause');
  protected readonly assignOwner = signal('');
  protected readonly assignDue = signal('');
  protected readonly assignNote = signal('');

  protected readonly stats = computed<AlertStats>(() => {
    const list = this.data.alerts();
    const sum = (rows: readonly AlertRecord[]): number =>
      rows.reduce((acc, row) => acc + row.impactAmount, 0);
    const byStatus = (status: AlertStatus): readonly AlertRecord[] =>
      list.filter((row) => row.status === status);
    const l4 = list.filter((row) => row.level === 'L4');
    return {
      total: list.length,
      pending: byStatus('pending').length,
      processing: byStatus('processing').length,
      resolved: byStatus('resolved').length,
      closed: byStatus('closed').length,
      l4: l4.length,
      totalImpact: sum(list),
      l4Impact: sum(l4),
      responseRate48h: list.length === 0 ? 0 : (list.length - byStatus('pending').length) / list.length,
    };
  });

  protected readonly openCount = computed(() => this.stats().pending + this.stats().processing);

  protected readonly tabs = computed<readonly TabItem[]>(() => {
    const list = this.data.alerts();
    const countOf = (status: AlertStatus): number =>
      list.filter((row) => row.status === status).length;
    return [
      { id: 'all', label: '全部', badge: list.length },
      { id: 'pending', label: '待处理', badge: countOf('pending') },
      { id: 'processing', label: '处理中', badge: countOf('processing') },
      { id: 'resolved', label: '已解决', badge: countOf('resolved') },
      { id: 'closed', label: '已关闭', badge: countOf('closed') },
    ];
  });

  protected readonly countries = computed(() => {
    const set = new Set<string>();
    for (const row of this.data.alerts()) {
      set.add(row.country);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  });

  protected readonly filtered = computed<readonly AlertRecord[]>(() => {
    const tab = this.statusTab();
    const level = this.levelFilter();
    const type = this.typeFilter();
    const country = this.countryFilter();
    const keyword = this.keyword().trim().toLowerCase();
    return this.data.alerts().filter((row) => {
      if (tab !== 'all' && row.status !== tab) {
        return false;
      }
      if (level !== 'all' && row.level !== level) {
        return false;
      }
      if (type !== 'all' && row.type !== type) {
        return false;
      }
      if (country !== 'all' && row.country !== country) {
        return false;
      }
      if (keyword.length > 0) {
        const haystack = [row.id, row.title, row.subject, row.owner, row.country]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(keyword)) {
          return false;
        }
      }
      return true;
    });
  });

  protected readonly sorted = computed<readonly AlertRecord[]>(() => {
    const key = this.sortKey();
    const dir = this.sortDir() === 'asc' ? 1 : -1;
    const list = [...this.filtered()];
    list.sort((a, b) => this.compare(a, b, key) * dir);
    return list;
  });

  protected readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.sorted().length / PAGE_SIZE)),
  );

  protected readonly paged = computed<readonly AlertRecord[]>(() => {
    const start = (this.page() - 1) * PAGE_SIZE;
    return this.sorted().slice(start, start + PAGE_SIZE);
  });

  protected readonly pages = computed<readonly number[]>(() =>
    Array.from({ length: this.pageCount() }, (_, index) => index + 1),
  );

  protected readonly filtersActive = computed(
    () =>
      this.statusTab() !== 'all' ||
      this.levelFilter() !== 'all' ||
      this.typeFilter() !== 'all' ||
      this.countryFilter() !== 'all' ||
      this.keyword().trim().length > 0,
  );

  protected readonly drawerEyebrow = computed(() => {
    const alert = this.selected();
    if (!alert) {
      return '';
    }
    return `${riskLevelMeta(alert.level).label} · ${RISK_TYPE_LABEL[alert.type]} · 评分 ${alert.score}`;
  });

  protected readonly assignTitle = computed(() => {
    const alert = this.selected();
    return alert ? `指派动作 · ${alert.id}` : '指派动作';
  });

  protected readonly actionHint = computed(() => {
    const found = BRAKE_ACTIONS.find((item) => item.action === this.assignAction());
    return found?.hint ?? '';
  });

  protected readonly typeChart = computed<EChartsOption>(() => {
    const list = this.data.alerts();
    if (list.length === 0) {
      return emptyChartOption('暂无预警数据');
    }
    const counts = new Map<RiskType, number>();
    for (const row of list) {
      counts.set(row.type, (counts.get(row.type) ?? 0) + 1);
    }
    const slices = TYPE_FILTERS.filter((type) => counts.has(type)).map((type) => ({
      name: RISK_TYPE_LABEL[type],
      value: counts.get(type) ?? 0,
    }));
    return {
      tooltip: tooltipConfig('item'),
      legend: legendConfig({ bottom: 0, right: 0 }),
      series: [pieSeries('预警类型', slices, { showLabel: false })],
      graphic: donutCenterLabel(`${list.length}`, '预警总数'),
      color: [CHART_COLORS.blue, CHART_COLORS.amber, CHART_COLORS.teal, CHART_COLORS.violet, CHART_COLORS.red, CHART_COLORS.slate],
    };
  });

  protected readonly levelChart = computed<EChartsOption>(() => {
    const list = this.data.alerts();
    if (list.length === 0) {
      return emptyChartOption('暂无预警数据');
    }
    const levels: readonly RiskLevel[] = RISK_LEVELS.map((item) => item.level);
    const statuses = STATUS_FILTERS;
    const statusSeries = statuses.map((status) =>
      barSeries(
        ALERT_STATUS_LABEL[status],
        levels.map((level) => list.filter((row) => row.level === level && row.status === status).length),
        { stack: 'alerts' },
      ),
    );
    return {
      tooltip: tooltipConfig('axis'),
      legend: legendConfig({ top: 0, right: 0 }),
      grid: gridConfig({ top: 36, bottom: 4 }),
      xAxis: categoryAxis(levels.map((level) => `${level} ${riskLevelMeta(level).label}`), {
        boundaryGap: true,
      }),
      yAxis: valueAxis({ name: '预警条数', interval: 1 }),
      series: statusSeries,
      color: [CHART_COLORS.blue, CHART_COLORS.amber, CHART_COLORS.teal, CHART_COLORS.slate],
    };
  });

  protected readonly alertFacts = (alert: AlertRecord): readonly KeyValueItem[] => [
    { label: '预警编号', value: alert.id },
    { label: '风险等级', value: `${alert.level} ${riskLevelMeta(alert.level).label} · 评分 ${alert.score}` },
    { label: '风险类型', value: RISK_TYPE_LABEL[alert.type] },
    { label: '国家 / 地区', value: `${alert.country}（${alert.countryCode}）` },
    { label: '监控主体', value: alert.subject },
    { label: '影响金额', value: `${alert.impactAmount.toLocaleString('zh-CN')} 万元` },
    { label: '触发时间', value: alert.triggeredAt },
    { label: '责任人', value: alert.owner },
    { label: '截止时间', value: alert.dueDate },
    { label: 'SLA', value: riskLevelMeta(alert.level).slaText },
  ];

  protected readonly triggerRuleText = (alert: AlertRecord): string => {
    const map: Record<string, string> = {
      threshold: '阈值触发',
      trend: '趋势触发',
      event: '事件触发',
    };
    return map[alert.triggerRule] ?? alert.triggerRule;
  };

  protected readonly subjectTypeText = (alert: AlertRecord): string => {
    const map: Record<AlertRecord['subjectType'], string> = {
      customer: '关联客户',
      sku: '关联 SKU',
      country: '关联国家 / 地区',
      currency: '关联币种',
    };
    return map[alert.subjectType];
  };

  protected onTab(id: string): void {
    this.statusTab.set(id);
    this.page.set(1);
  }

  protected onType(event: Event): void {
    this.typeFilter.set((event.target as HTMLSelectElement).value);
    this.page.set(1);
  }

  protected onCountry(event: Event): void {
    this.countryFilter.set((event.target as HTMLSelectElement).value);
    this.page.set(1);
  }

  protected onKeyword(event: Event): void {
    this.keyword.set((event.target as HTMLInputElement).value);
    this.page.set(1);
  }

  protected onSort(change: SortChange): void {
    this.sortKey.set(change.key as SortKey);
    this.sortDir.set(change.direction);
    this.page.set(1);
  }

  protected goPage(next: number): void {
    const bounded = Math.min(Math.max(1, next), this.pageCount());
    this.page.set(bounded);
  }

  protected resetFilters(): void {
    this.statusTab.set('all');
    this.levelFilter.set('all');
    this.typeFilter.set('all');
    this.countryFilter.set('all');
    this.keyword.set('');
    this.page.set(1);
  }

  protected onStatusChange(row: AlertRecord, event: Event): void {
    const next = (event.target as HTMLSelectElement).value as AlertStatus;
    this.data.updateAlertStatus(row.id, next);
  }

  protected changeStatus(row: AlertRecord, status: AlertStatus): void {
    this.data.updateAlertStatus(row.id, status);
    this.selected.set(this.data.getAlert(row.id) ?? row);
  }

  protected openDetail(row: AlertRecord): void {
    this.selected.set(this.data.getAlert(row.id) ?? row);
    this.drawerOpen.set(true);
  }

  protected closeDetail(): void {
    this.drawerOpen.set(false);
    this.selected.set(null);
  }

  protected onAssign(action: SuggestedAction): void {
    const alert = this.selected();
    if (!alert) {
      return;
    }
    this.assignAction.set(action.actionType);
    this.assignOwner.set(action.owner);
    this.assignDue.set(action.dueDate);
    this.assignNote.set(action.text);
    this.openAssign(alert);
  }

  protected openAssign(alert: AlertRecord): void {
    const sku = this.data.skus().find((row) => row.sku === alert.subject);
    this.assignTargetId.set(alert.id);
    this.assignSkuId.set(sku ? sku.id : null);
    this.assignSkuCode.set(sku ? sku.sku : null);
    if (!this.assignOwner()) {
      this.assignOwner.set(alert.owner);
    }
    if (!this.assignDue()) {
      this.assignDue.set(alert.dueDate);
    }
    this.assignOpen.set(true);
  }

  protected onAssignAction(value: string): void {
    this.assignAction.set(value as BrakeAction);
  }

  protected onAssignOwner(event: Event): void {
    this.assignOwner.set((event.target as HTMLInputElement).value);
  }

  protected onAssignDue(event: Event): void {
    this.assignDue.set((event.target as HTMLInputElement).value);
  }

  protected onAssignNote(event: Event): void {
    this.assignNote.set((event.target as HTMLTextAreaElement).value);
  }

  protected confirmAssign(): void {
    const skuId = this.assignSkuId();
    const alertId = this.assignTargetId();
    const owner = this.assignOwner().trim() || '未指定责任人';
    const dueDate = this.assignDue() || '未指定截止时间';
    const note = this.assignNote().trim();
    if (skuId) {
      this.data.assignAction({
        skuId,
        action: this.assignAction(),
        owner,
        dueDate,
        note,
      });
    } else {
      this.state.pushToast('该预警主体未关联 SKU，仅记录处置说明（Demo 示例数据）', 'warn');
    }
    if (alertId) {
      this.data.updateAlertStatus(alertId, 'processing', note || '已指派动作');
      const refreshed = this.data.getAlert(alertId);
      if (refreshed && this.selected()?.id === alertId) {
        this.selected.set(refreshed);
      }
    }
    this.assignOpen.set(false);
    this.assignNote.set('');
  }

  protected readonly navigateTo = (route: string): void => {
    void this.router.navigate([route]);
  };

  protected readonly relatedRoute = (alert: AlertRecord): string => {
    const map: Record<RiskType, string> = {
      inventory: '/inventory',
      receivable: '/receivables',
      cash: '/cash-fx',
      fx: '/cash-fx',
      logistics: '/radar',
      policy: '/radar',
    };
    return map[alert.type];
  };

  protected readonly relatedLabel = (alert: AlertRecord): string => {
    const map: Record<RiskType, string> = {
      inventory: '前往库存风险中心',
      receivable: '前往应收风险中心',
      cash: '前往现金流与外汇',
      fx: '前往现金流与外汇',
      logistics: '前往外部风险雷达',
      policy: '前往外部风险雷达',
    };
    return map[alert.type];
  };

  private compare(a: AlertRecord, b: AlertRecord, key: SortKey): number {
    switch (key) {
      case 'id':
        return a.id.localeCompare(b.id);
      case 'level':
        return a.score - b.score;
      case 'impactAmount':
        return a.impactAmount - b.impactAmount;
      case 'triggeredAt':
        return a.triggeredAt.localeCompare(b.triggeredAt);
      case 'status':
        return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      default:
        return 0;
    }
  }
}
