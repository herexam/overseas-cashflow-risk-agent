import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { EChartsOption } from 'echarts';

import { RISK_LEVELS } from '../../core/models';
import type {
  CollectionQueueItem,
  CreditRating,
  CustomerRow,
  RiskLevel,
  SuggestedAction,
} from '../../core/models';
import { SentinelDataService } from '../../core/services/sentinel-data.service';
import { StateService } from '../../core/services/state.service';
import { DEMO_AS_OF_DATE, genSeries, monthLabels, seedFrom } from '../../data/mock/_random';
import { AGING_BUCKET_LABELS } from '../../data/mock/customers.mock';
import {
  CHART_COLORS,
  WsAmountPipe,
  WsCard,
  WsChart,
  WsDatePipe,
  WsDemoNote,
  WsEmptyState,
  WsIcon,
  WsMetricTile,
  WsModal,
  WsPercentPipe,
  WsRiskBadge,
  WsSegmented,
  WsSortHeader,
  WsTooltipDirective,
  barSeries,
  categoryAxis,
  donutCenterLabel,
  emptyChartOption,
  gridConfig,
  legendConfig,
  lineSeries,
  pieSeries,
  tooltipConfig,
  valueAxis,
} from '../../shared/ui';
import type { SegmentedOption, SortChange } from '../../shared/ui';
import { CustomerDrawer } from './customer-drawer';

/** 客户表可排序列 */
type SortKey =
  | 'name'
  | 'country'
  | 'receivable'
  | 'agingDays'
  | 'overdueDays'
  | 'creditRating'
  | 'expectedCollection'
  | 'score'
  | 'collectionPriority';

const PAGE_SIZE = 10;

/** 账龄桶序号：第 4、5 桶为 91–180 天与 180 天以上 */
const SEVERE_BUCKET_INDEX = 3;

/** 信用评级由高到低，用于排序 */
const RATING_ORDER: readonly CreditRating[] = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B'];

/** 催收方式（Demo 示例口径） */
interface CollectionActionOption {
  readonly value: string;
  readonly label: string;
}

const COLLECTION_ACTIONS: readonly CollectionActionOption[] = [
  { value: 'letter', label: '正式催收函' },
  { value: 'exec', label: '高层沟通' },
  { value: 'plan', label: '付款计划确认函' },
  { value: 'recon', label: '对账函核对' },
  { value: 'routine', label: '常规跟踪' },
];

/**
 * 应收风险中心。
 *
 * 展示应收余额、DSO、账龄结构与高风险客户，并提供催收队列与动作指派。
 * 全部数值均为 Demo 示例数据，不代表沃太能源（AlphaESS）真实经营数据。
 */
@Component({
  selector: 'app-receivables-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    WsAmountPipe,
    WsCard,
    WsChart,
    WsDatePipe,
    WsDemoNote,
    WsEmptyState,
    WsIcon,
    WsMetricTile,
    WsModal,
    WsPercentPipe,
    WsRiskBadge,
    WsSegmented,
    WsSortHeader,
    WsTooltipDirective,
    CustomerDrawer,
  ],
  template: `
    <div class="page">
      <div class="meta">
        <ws-icon name="database" [size]="14" />
        <span>数据截止 {{ state.lastRefreshedAt() }}</span>
        <span class="meta__sep">·</span>
        <span>客户 {{ overview().customerCount }} 家</span>
        <span class="meta__sep">·</span>
        <span>逾期客户 {{ overdueCustomerCount() }} 家</span>
        <span class="meta__sep">·</span>
        <span>账龄 90 天以上占比 {{ severeRatio() | wsPercent }}</span>
        <span class="ws-spacer"></span>
        <button
          type="button"
          class="ws-btn ws-btn--ghost ws-btn--sm"
          [disabled]="refreshing()"
          (click)="refreshData()"
        >
          <ws-icon name="refresh" [size]="14" />
          {{ refreshing() ? '刷新中…' : '刷新数据' }}
        </button>
        <ws-demo-note />
      </div>

      <div class="tiles">
        <ws-metric-tile
          label="应收总余额"
          [value]="overview().totalReceivable"
          kind="amount"
          [spark]="receivableTrend()"
          hint="全部海外客户应收账款余额合计（Demo 示例口径）"
        />
        <ws-metric-tile
          label="DSO 应收周转天数"
          [value]="overview().dso"
          kind="num"
          unit="天"
          level="L3"
          [spark]="dsoTrend()"
          route="/cash-fx"
          hint="Demo 示例口径：应收余额 ÷ 日均销售。点击查看 DSO 对 CCC 的传导"
        />
        <ws-metric-tile
          label="应收逾期率"
          [value]="overview().overdueRatio"
          kind="percent"
          [decimals]="1"
          level="L3"
          hint="逾期客户的应收余额 ÷ 应收总余额"
        />
        <ws-metric-tile
          label="逾期金额"
          [value]="overview().overdueAmount"
          kind="amount"
          level="L4"
          hint="已过信用期仍未收回的应收余额合计"
        />
        <ws-metric-tile
          label="预计可回款"
          [value]="overview().expectedCollection"
          kind="amount"
          hint="按付款计划与历史履约推算的预计回款额（占应收 {{ overview().expectedCollectionRatio | wsPercent }}）"
        />
        <ws-metric-tile
          label="账龄 90 天以上占比"
          [value]="severeRatio()"
          kind="percent"
          [decimals]="1"
          level="L4"
          hint="账龄超过 90 天的应收余额 ÷ 应收总余额，是坏账准备的前置信号"
        />
      </div>

      <div class="charts">
        <ws-card title="应收账龄结构" subtitle="按账龄分桶的应收余额分布（万元），中心显示 90 天以上占比">
          <ws-chart
            [options]="agingOption()"
            [height]="304"
            [loading]="refreshing()"
            [empty]="data.customers().length === 0"
            emptyTitle="暂无可用的应收账龄数据"
          />
        </ws-card>
        <ws-card title="DSO 趋势" subtitle="近 6 个月应收周转天数，虚线为 90 天的内部管控目标">
          <ws-chart
            [options]="dsoOption()"
            [height]="304"
            [loading]="refreshing()"
            [empty]="dsoTrend().length === 0"
            emptyTitle="暂无 DSO 趋势数据"
          />
        </ws-card>
      </div>

      <div class="charts">
        <ws-card title="信用评级分布" subtitle="银行 / 信用机构评级口径的应收余额分布（万元）">
          <ws-chart
            [options]="ratingOption()"
            [height]="288"
            [loading]="refreshing()"
            [empty]="ratingRows().length === 0"
            emptyTitle="暂无信用评级数据"
          />
        </ws-card>
        <ws-card title="逾期金额 · 国家分布" subtitle="各国家 / 地区已逾期应收余额（万元），按金额降序排列">
          <ws-chart
            [options]="overdueCountryOption()"
            [height]="288"
            [loading]="refreshing()"
            [empty]="overdueCountryRows().length === 0"
            emptyTitle="当前没有逾期应收"
          />
        </ws-card>
      </div>

      <ws-card
        title="客户应收账龄明细"
        subtitle="按应收金额、账龄、逾期天数、信用评级与风险评分排序，点击行可打开客户风险详情"
      >
        <ng-template #cardActions>
          <span class="ws-badge ws-badge--red">高风险客户 {{ highRiskCount() }} 家</span>
          <span class="ws-caption">命中 {{ sorted().length }} / {{ overview().customerCount }} 家</span>
        </ng-template>

        <div class="toolbar">
          <label class="ws-search">
            <ws-icon class="ws-search__icon" name="search" [size]="14" />
            <input
              class="ws-input ws-input--sm"
              type="search"
              placeholder="搜索客户名称 / 渠道类型 / 负责人"
              [value]="keyword()"
              (input)="onKeyword($event)"
            />
          </label>

          <label class="toolbar__field">
            <span class="toolbar__label">国家</span>
            <select class="ws-select ws-select--sm" [value]="countryFilter()" (change)="onCountryChange($event)">
              <option value="all">全部国家</option>
              @for (option of countryOptions(); track option.value) {
                <option [value]="option.value">{{ option.label }}</option>
              }
            </select>
          </label>

          <label class="toolbar__field">
            <span class="toolbar__label">信用评级</span>
            <select class="ws-select ws-select--sm" [value]="ratingFilter()" (change)="onRatingChange($event)">
              <option value="all">全部评级</option>
              @for (rating of ratingOptions; track rating) {
                <option [value]="rating">{{ rating }}</option>
              }
            </select>
          </label>

          <ws-segmented
            ariaLabel="风险等级"
            [value]="levelFilter()"
            [options]="levelOptions"
            (changed)="onLevelChange($event)"
          />

          <span class="ws-spacer"></span>
          <button
            type="button"
            class="ws-btn ws-btn--ghost ws-btn--sm"
            [disabled]="!filtersActive()"
            (click)="resetFilters()"
          >
            重置筛选
          </button>
        </div>

        <div class="ws-table-wrap">
          <div class="ws-table-scroll">
            <table class="ws-table table--customers">
              <thead>
                <tr>
                  <th
                    wsSort="name"
                    [activeKey]="sortKey()"
                    [direction]="sortDir()"
                    defaultDirection="asc"
                    (sorted)="onSort($event)"
                  >
                    客户
                  </th>
                  <th
                    wsSort="country"
                    [activeKey]="sortKey()"
                    [direction]="sortDir()"
                    defaultDirection="asc"
                    (sorted)="onSort($event)"
                  >
                    国家
                  </th>
                  <th
                    class="is-numeric"
                    wsSort="receivable"
                    [activeKey]="sortKey()"
                    [direction]="sortDir()"
                    (sorted)="onSort($event)"
                  >
                    应收金额
                  </th>
                  <th
                    class="is-numeric"
                    wsSort="agingDays"
                    [activeKey]="sortKey()"
                    [direction]="sortDir()"
                    (sorted)="onSort($event)"
                  >
                    账龄(天)
                  </th>
                  <th
                    class="is-numeric"
                    wsSort="overdueDays"
                    [activeKey]="sortKey()"
                    [direction]="sortDir()"
                    (sorted)="onSort($event)"
                  >
                    逾期天数
                  </th>
                  <th
                    wsSort="creditRating"
                    [activeKey]="sortKey()"
                    [direction]="sortDir()"
                    (sorted)="onSort($event)"
                  >
                    信用等级
                  </th>
                  <th
                    class="is-numeric"
                    wsSort="expectedCollection"
                    [activeKey]="sortKey()"
                    [direction]="sortDir()"
                    (sorted)="onSort($event)"
                  >
                    预计回款
                  </th>
                  <th
                    wsSort="score"
                    [activeKey]="sortKey()"
                    [direction]="sortDir()"
                    (sorted)="onSort($event)"
                  >
                    风险
                  </th>
                  <th
                    class="is-numeric"
                    wsSort="collectionPriority"
                    [activeKey]="sortKey()"
                    [direction]="sortDir()"
                    defaultDirection="asc"
                    (sorted)="onSort($event)"
                  >
                    催收优先级
                  </th>
                  <th>负责人</th>
                </tr>
              </thead>
              <tbody>
                @for (row of paged(); track row.id) {
                  <tr
                    class="row--clickable"
                    tabindex="0"
                    (click)="openCustomer(row)"
                    (keydown.enter)="openCustomer(row)"
                  >
                    <td class="cell-name">
                      <div>{{ row.name }}</div>
                      <div class="cell-sub">{{ row.channelType }}</div>
                    </td>
                    <td>{{ row.country }}</td>
                    <td class="is-numeric">{{ row.receivable | wsAmount }}</td>
                    <td
                      class="is-numeric"
                      [class.text-orange]="row.agingDays >= 60 && row.agingDays < 90"
                      [class.text-red]="row.agingDays >= 90"
                    >
                      {{ row.agingDays }}
                    </td>
                    <td class="is-numeric">
                      @if (row.overdueDays > 0) {
                        <span
                          [class.text-red]="row.overdueDays > 60"
                          [class.text-orange]="row.overdueDays > 30 && row.overdueDays <= 60"
                          [class.text-yellow]="row.overdueDays > 0 && row.overdueDays <= 30"
                        >
                          {{ row.overdueDays }} 天
                        </span>
                      } @else {
                        <span class="text-green">未逾期</span>
                      }
                    </td>
                    <td>
                      <span
                        class="ws-tag"
                        [class.ws-tag--risk]="ratingRisk(row.creditRating)"
                        [wsTooltip]="ratingHint(row.creditRating)"
                        tooltipPlacement="top"
                      >
                        {{ row.creditRating }}
                      </span>
                    </td>
                    <td class="is-numeric">{{ row.expectedCollection | wsAmount }}</td>
                    <td><ws-risk-badge [level]="row.level" [compact]="true" /></td>
                    <td class="is-numeric">
                      <span class="prio" [class.prio--top]="row.collectionPriority <= 3">
                        P{{ row.collectionPriority }}
                      </span>
                    </td>
                    <td class="cell-owner">{{ row.owner }}</td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="10">
                      <ws-empty-state
                        title="没有符合条件的客户"
                        description="请放宽国家、信用评级或风险等级筛选条件。"
                        icon="filter"
                      >
                        <button type="button" class="ws-btn ws-btn--ghost ws-btn--sm" (click)="resetFilters()">
                          重置筛选
                        </button>
                      </ws-empty-state>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>

        <div class="ws-table__footer">
          <span class="ws-caption">
            共 {{ sorted().length }} 条 · 第 {{ page() }} / {{ pageCount() }} 页
          </span>
          <span class="ws-spacer"></span>
          <div class="ws-pager">
            <button type="button" [disabled]="page() <= 1" (click)="goPage(page() - 1)">上一页</button>
            @for (p of pages(); track p) {
              <button type="button" [attr.aria-current]="p === page() ? 'true' : null" (click)="goPage(p)">
                {{ p }}
              </button>
            }
            <button type="button" [disabled]="page() >= pageCount()" (click)="goPage(page() + 1)">下一页</button>
          </div>
        </div>
      </ws-card>

      <ws-card
        title="催收队列"
        subtitle="按催收优先级排序的处理队列，优先级 P1 表示最高，需在最短时限内完成首次触达"
      >
        <ng-template #cardActions>
          <span class="ws-badge ws-badge--orange">队列逾期金额 {{ queueAmount() | wsAmount }}</span>
          <span class="ws-caption">{{ queueRows().length }} 家客户</span>
        </ng-template>

        <div class="ws-table-wrap">
          <div class="ws-table-scroll">
            <table class="ws-table table--queue">
              <thead>
                <tr>
                  <th>客户</th>
                  <th>国家</th>
                  <th class="is-numeric">应收金额</th>
                  <th class="is-numeric">逾期天数</th>
                  <th class="is-numeric">优先级</th>
                  <th>负责人</th>
                  <th>下一步动作</th>
                  <th>截止时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                @for (row of queueRows(); track row.customerId) {
                  <tr>
                    <td class="cell-name">
                      <div>{{ row.customer }}</div>
                      <div class="cell-sub">{{ row.customerId }}</div>
                    </td>
                    <td>{{ row.country }}</td>
                    <td class="is-numeric">{{ row.amount | wsAmount }}</td>
                    <td class="is-numeric">
                      @if (row.overdueDays > 0) {
                        <span class="text-red">{{ row.overdueDays }} 天</span>
                      } @else {
                        <span class="text-green">未逾期</span>
                      }
                    </td>
                    <td class="is-numeric">
                      <span class="prio" [class.prio--top]="row.priority <= 3">P{{ row.priority }}</span>
                    </td>
                    <td class="cell-owner">{{ row.owner }}</td>
                    <td class="cell-step">{{ row.nextStep }}</td>
                    <td>{{ row.dueDate | wsDate }}</td>
                    <td class="cell-actions">
                      <button
                        type="button"
                        class="ws-btn ws-btn--ghost ws-btn--sm"
                        (click)="openCustomerById(row.customerId)"
                      >
                        详情
                      </button>
                      <button
                        type="button"
                        class="ws-btn ws-btn--ghost ws-btn--sm"
                        (click)="openAssignById(row.customerId)"
                      >
                        指派
                      </button>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="9">
                      <ws-empty-state
                        title="催收队列为空"
                        description="当前没有需要优先跟进的逾期客户。"
                        icon="check"
                      />
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>

        <div class="queue-note">
          <ws-icon name="info" [size]="14" />
          <span>
            队列口径：按风险评分与逾期天数推导的催收优先级排序，取优先级最高的前 10 家客户。
            队列顺序为 Demo 示例口径，用于演示 Agent 的催收排序能力，不代表真实催收指令。
          </span>
        </div>
      </ws-card>

      <ws-customer-drawer
        [customer]="selected()"
        [open]="drawerOpen()"
        (closed)="closeDrawer()"
        (assign)="openAssign($event)"
        (assignAction)="openAssignFromAction($event)"
        (toQueue)="onQueue($event)"
      />

      <ws-modal
        [open]="assignOpen()"
        [title]="assignTitle()"
        subtitle="催收动作指派会写入客户跟进记录（Demo 仅保存在浏览器内存）"
        [width]="580"
        (closed)="closeAssign()"
      >
        <div class="form">
          <div class="ws-field">
            <span class="ws-field__label">催收方式</span>
            <ws-segmented
              ariaLabel="催收方式"
              [value]="assignAction()"
              [options]="collectionOptions"
              (changed)="onAssignAction($event)"
            />
            <span class="ws-caption">{{ actionHint(assignAction()) }}</span>
          </div>

          <div class="form__row">
            <label class="ws-field">
              <span class="ws-field__label">责任人</span>
              <input
                class="ws-input"
                type="text"
                placeholder="如：王倩（欧洲应收）"
                [value]="assignOwner()"
                (input)="onAssignOwner($event)"
              />
            </label>
            <label class="ws-field">
              <span class="ws-field__label">截止日期</span>
              <input class="ws-input" type="date" [value]="assignDue()" (input)="onAssignDue($event)" />
            </label>
          </div>

          <label class="ws-field">
            <span class="ws-field__label">备注（可选）</span>
            <textarea
              class="ws-textarea"
              rows="3"
              placeholder="补充跟进说明，例如：要求客户 10 个工作日内提交书面付款计划"
              [value]="assignNote()"
              (input)="onAssignNote($event)"
            ></textarea>
          </label>
        </div>

        <ng-template #modalFoot>
          <span class="ws-caption">Demo 演示：指派结果不会回写真实系统</span>
          <span class="ws-spacer"></span>
          <button type="button" class="ws-btn ws-btn--ghost" (click)="closeAssign()">取消</button>
          <button
            type="button"
            class="ws-btn ws-btn--primary"
            [disabled]="!assignValid()"
            (click)="confirmAssign()"
          >
            确认指派
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

    .meta__sep {
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
      gap: var(--sp-4);
    }

    .toolbar {
      display: flex;
      align-items: flex-end;
      flex-wrap: wrap;
      gap: var(--sp-3);
      margin-bottom: var(--sp-4);
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

    .table--customers {
      min-width: 1320px;
    }

    .table--queue {
      min-width: 1240px;
    }

    .cell-name {
      font-weight: 500;
      color: var(--text-primary);
    }

    .cell-sub {
      margin-top: 2px;
      font-size: 11px;
      color: var(--text-muted);
    }

    .cell-owner {
      color: var(--text-secondary);
      white-space: nowrap;
    }

    .cell-step {
      max-width: 320px;
      font-size: 12px;
      line-height: 1.6;
      color: var(--text-secondary);
    }

    .cell-actions {
      display: flex;
      gap: var(--sp-2);
      white-space: nowrap;
    }

    .row--clickable {
      cursor: pointer;
    }

    .prio {
      display: inline-block;
      min-width: 30px;
      padding: 1px 6px;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      font-family: var(--font-mono);
      font-size: 11px;
      text-align: center;
      color: var(--text-secondary);
    }

    .prio--top {
      border-color: var(--status-red-border);
      background: var(--status-red-soft);
      color: var(--status-red);
    }

    .queue-note {
      display: flex;
      align-items: flex-start;
      gap: var(--sp-2);
      margin-top: var(--sp-4);
      font-size: 12px;
      line-height: 1.6;
      color: var(--text-secondary);
    }

    .queue-note ws-icon {
      flex: 0 0 auto;
      margin-top: 2px;
      color: var(--text-muted);
    }

    .form {
      display: flex;
      flex-direction: column;
      gap: var(--sp-4);
    }

    .form__row {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--sp-4);
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
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .form__row {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
})
export class ReceivablesPage {
  protected readonly data = inject(SentinelDataService);
  protected readonly state = inject(StateService);

  protected readonly overview = this.data.receivableOverview;

  /* ---------------- 筛选 / 排序 / 分页 ---------------- */
  protected readonly countryFilter = signal('all');
  protected readonly ratingFilter = signal('all');
  protected readonly levelFilter = signal('all');
  protected readonly keyword = signal('');
  protected readonly sortKey = signal<SortKey>('score');
  protected readonly sortDir = signal<'asc' | 'desc'>('desc');
  protected readonly page = signal(1);
  protected readonly refreshing = signal(false);

  /* ---------------- 抽屉 / 指派弹窗 ---------------- */
  protected readonly selected = signal<CustomerRow | null>(null);
  protected readonly drawerOpen = signal(false);
  protected readonly assignOpen = signal(false);
  protected readonly assignTarget = signal<CustomerRow | null>(null);
  protected readonly assignAction = signal('plan');
  protected readonly assignOwner = signal('');
  protected readonly assignDue = signal('');
  protected readonly assignNote = signal('');

  /** 页面内补充进催收队列的客户（Demo 仅存内存） */
  private readonly extraQueueIds = signal<readonly string[]>([]);

  protected readonly ratingOptions = RATING_ORDER;

  protected readonly collectionOptions: readonly SegmentedOption[] = COLLECTION_ACTIONS.map((item) => ({
    value: item.value,
    label: item.label,
  }));

  protected readonly levelOptions: readonly SegmentedOption[] = [
    { value: 'all', label: '全部等级' },
    ...RISK_LEVELS.map((item) => ({ value: item.level, label: `${item.level} ${item.label}` })),
  ];

  /* ---------------- 选项 ---------------- */
  protected readonly countryOptions = computed(() => {
    const seen = new Map<string, string>();
    for (const row of this.data.customers()) {
      if (!seen.has(row.countryCode)) {
        seen.set(row.countryCode, row.country);
      }
    }
    return [...seen.entries()].map(([value, label]) => ({ value, label }));
  });

  /* ---------------- 派生数据 ---------------- */
  protected readonly filtered = computed(() => {
    const country = this.countryFilter();
    const rating = this.ratingFilter();
    const level = this.levelFilter();
    const keyword = this.keyword().trim().toLowerCase();
    return this.data.customers().filter((row) => {
      if (country !== 'all' && row.countryCode !== country) return false;
      if (rating !== 'all' && row.creditRating !== rating) return false;
      if (level !== 'all' && row.level !== (level as RiskLevel)) return false;
      if (keyword) {
        const hay = `${row.name} ${row.channelType} ${row.owner} ${row.country}`.toLowerCase();
        if (!hay.includes(keyword)) return false;
      }
      return true;
    });
  });

  protected readonly sorted = computed(() => {
    const key = this.sortKey();
    const dir = this.sortDir() === 'asc' ? 1 : -1;
    const rows = [...this.filtered()];
    rows.sort((a, b) => this.compare(a, b, key) * dir);
    return rows;
  });

  protected readonly pageCount = computed(() => Math.max(1, Math.ceil(this.sorted().length / PAGE_SIZE)));

  protected readonly paged = computed(() => {
    const current = Math.min(this.page(), this.pageCount());
    const start = (current - 1) * PAGE_SIZE;
    return this.sorted().slice(start, start + PAGE_SIZE);
  });

  protected readonly pages = computed(() =>
    Array.from({ length: this.pageCount() }, (_, index) => index + 1),
  );

  protected readonly filtersActive = computed(
    () =>
      this.countryFilter() !== 'all' ||
      this.ratingFilter() !== 'all' ||
      this.levelFilter() !== 'all' ||
      this.keyword().trim().length > 0,
  );

  protected readonly overdueCustomerCount = computed(
    () => this.data.customers().filter((row) => row.overdueDays > 0).length,
  );

  protected readonly highRiskCount = computed(
    () => this.data.customers().filter((row) => row.level === 'L4' || row.level === 'L3').length,
  );

  /** 账龄结构：各客户分桶按索引累加（桶的 qty 即该账龄区间的应收金额） */
  protected readonly agingRows = computed(() => {
    const totals = AGING_BUCKET_LABELS.map((bucket, index) => {
      let amount = 0;
      for (const row of this.data.customers()) {
        amount += row.agingBuckets[index]?.qty ?? 0;
      }
      return { bucket, amount: Math.round(amount) };
    });
    return totals;
  });

  protected readonly severeRatio = computed(() => {
    const rows = this.agingRows();
    const total = rows.reduce((sum, row) => sum + row.amount, 0);
    const severe = rows
      .slice(SEVERE_BUCKET_INDEX)
      .reduce((sum, row) => sum + row.amount, 0);
    return total === 0 ? 0 : severe / total;
  });

  /** 近 12 个月应收余额趋势（万元） */
  protected readonly receivableTrend = computed(() => {
    const total = this.overview().totalReceivable;
    const series = genSeries(seedFrom('WS-AR-TREND'), 12, total * 0.86, total * 0.14, 120, 0);
    return series.map((value) => Math.round(Math.max(value, total * 0.5)));
  });

  /** 近 6 个月 DSO 趋势（天） */
  protected readonly dsoTrend = computed(() =>
    genSeries(seedFrom('WS-DSO-TREND'), 6, 96, 8, 2.5, 1).map((value) => Math.round(value)),
  );

  protected readonly dsoLabels = computed(() => monthLabels(DEMO_AS_OF_DATE, 6).map((label) => label.slice(5)));

  /** 信用评级分布 */
  protected readonly ratingRows = computed(() => {
    const map = new Map<CreditRating, { amount: number; count: number }>();
    for (const row of this.data.customers()) {
      const entry = map.get(row.creditRating) ?? { amount: 0, count: 0 };
      map.set(row.creditRating, {
        amount: entry.amount + row.receivable,
        count: entry.count + 1,
      });
    }
    return RATING_ORDER.filter((rating) => map.has(rating)).map((rating) => {
      const entry = map.get(rating) ?? { amount: 0, count: 0 };
      return { rating, amount: Math.round(entry.amount), count: entry.count };
    });
  });

  /** 逾期金额的国家分布 */
  protected readonly overdueCountryRows = computed(() => {
    const map = new Map<string, number>();
    for (const row of this.data.customers()) {
      if (row.overdueDays <= 0) continue;
      map.set(row.country, (map.get(row.country) ?? 0) + row.receivable);
    }
    return [...map.entries()]
      .map(([country, amount]) => ({ country, amount: Math.round(amount) }))
      .sort((a, b) => b.amount - a.amount);
  });

  /* ---------------- 催收队列 ---------------- */
  protected readonly queueRows = computed<readonly CollectionQueueItem[]>(() => {
    const base = this.data.collectionQueue;
    const extras = this.extraQueueIds()
      .filter((id) => !base.some((item) => item.customerId === id))
      .map((id) => this.data.getCustomer(id))
      .filter((row): row is CustomerRow => row !== undefined)
      .map<CollectionQueueItem>((row) => ({
        customerId: row.id,
        customer: row.name,
        country: row.country,
        amount: row.receivable,
        overdueDays: row.overdueDays,
        priority: row.collectionPriority,
        owner: row.owner,
        level: row.level,
        nextStep: `由 ${row.owner} 在 ${row.expectedDate} 前完成首次触达，并同步更新付款计划`,
        dueDate: row.expectedDate,
      }));
    return [...extras, ...base];
  });

  protected readonly queueAmount = computed(() =>
    Math.round(this.queueRows().reduce((sum, row) => sum + row.amount, 0)),
  );

  /* ---------------- 图表 ---------------- */
  protected readonly agingOption = computed<EChartsOption>(() => {
    const rows = this.agingRows();
    if (rows.every((row) => row.amount === 0)) {
      return emptyChartOption('暂无可用的应收账龄数据');
    }
    const slices = rows.map((row) => ({ name: row.bucket, value: row.amount }));
    const ratio = (this.severeRatio() * 100).toFixed(1);
    return {
      tooltip: tooltipConfig('item'),
      legend: legendConfig({ bottom: 0, top: undefined }),
      graphic: donutCenterLabel(`${ratio}%`, '账龄 90 天以上'),
      series: [
        pieSeries('应收账龄结构', slices, {
          radius: ['52%', '72%'],
          center: ['50%', '44%'],
        }),
      ],
    };
  });

  protected readonly dsoOption = computed<EChartsOption>(() => {
    const trend = this.dsoTrend();
    if (trend.length === 0) {
      return emptyChartOption('暂无 DSO 趋势数据');
    }
    return {
      tooltip: tooltipConfig('axis'),
      grid: gridConfig({ left: 52, right: 20, top: 28, bottom: 32 }),
      xAxis: categoryAxis(this.dsoLabels(), { boundaryGap: false }),
      yAxis: valueAxis({ name: '天', decimals: 0, scale: true }),
      series: [
        lineSeries('DSO', trend, { color: CHART_COLORS.blue, smooth: true, area: true }),
        lineSeries('管控目标', trend.map(() => 90), {
          color: CHART_COLORS.slate,
          smooth: false,
          dashed: true,
        }),
      ],
    };
  });

  protected readonly ratingOption = computed<EChartsOption>(() => {
    const rows = this.ratingRows();
    if (rows.length === 0) {
      return emptyChartOption('暂无信用评级数据');
    }
    return {
      tooltip: tooltipConfig('axis'),
      grid: gridConfig({ left: 56, right: 20, top: 28, bottom: 32 }),
      xAxis: categoryAxis(rows.map((row) => row.rating)),
      yAxis: valueAxis({ name: '万元', decimals: 0, unit: '万元' }),
      series: [
        barSeries(
          '应收余额',
          rows.map((row) => row.amount),
          { color: CHART_COLORS.blue },
        ),
      ],
    };
  });

  protected readonly overdueCountryOption = computed<EChartsOption>(() => {
    const rows = this.overdueCountryRows();
    if (rows.length === 0) {
      return emptyChartOption('当前没有逾期应收');
    }
    return {
      tooltip: tooltipConfig('axis'),
      grid: gridConfig({ left: 56, right: 20, top: 28, bottom: 32 }),
      xAxis: categoryAxis(rows.map((row) => row.country), { interval: 0 }),
      yAxis: valueAxis({ name: '万元', decimals: 0, unit: '万元' }),
      series: [
        barSeries(
          '逾期金额',
          rows.map((row) => row.amount),
          { color: CHART_COLORS.red },
        ),
      ],
    };
  });

  /* ---------------- 交互 ---------------- */
  protected onKeyword(event: Event): void {
    this.keyword.set((event.target as HTMLInputElement).value);
    this.page.set(1);
  }

  protected onCountryChange(event: Event): void {
    this.countryFilter.set((event.target as HTMLSelectElement).value);
    this.page.set(1);
  }

  protected onRatingChange(event: Event): void {
    this.ratingFilter.set((event.target as HTMLSelectElement).value);
    this.page.set(1);
  }

  protected onLevelChange(value: string): void {
    this.levelFilter.set(value);
    this.page.set(1);
  }

  protected onSort(change: SortChange): void {
    this.sortKey.set(change.key as SortKey);
    this.sortDir.set(change.direction);
    this.page.set(1);
  }

  protected resetFilters(): void {
    this.countryFilter.set('all');
    this.ratingFilter.set('all');
    this.levelFilter.set('all');
    this.keyword.set('');
    this.page.set(1);
  }

  protected goPage(page: number): void {
    this.page.set(Math.min(Math.max(page, 1), this.pageCount()));
  }

  protected refreshData(): void {
    this.refreshing.set(true);
    setTimeout(() => {
      this.refreshing.set(false);
      this.state.refresh();
    }, 520);
  }

  protected openCustomer(row: CustomerRow): void {
    this.selected.set(row);
    this.drawerOpen.set(true);
  }

  protected openCustomerById(customerId: string): void {
    const row = this.data.getCustomer(customerId);
    if (row) {
      this.openCustomer(row);
    }
  }

  protected closeDrawer(): void {
    this.drawerOpen.set(false);
  }

  protected onQueue(row: CustomerRow): void {
    if (!this.extraQueueIds().includes(row.id)) {
      this.extraQueueIds.update((ids) => [row.id, ...ids]);
    }
    this.state.pushToast(`${row.name} 已加入催收队列`, 'success');
  }

  protected openAssign(row: CustomerRow): void {
    this.assignTarget.set(row);
    this.assignAction.set(defaultActionFor(row));
    this.assignOwner.set(row.owner);
    this.assignDue.set(row.expectedDate);
    this.assignNote.set('');
    this.assignOpen.set(true);
  }

  protected openAssignById(customerId: string): void {
    const row = this.data.getCustomer(customerId);
    if (row) {
      this.openAssign(row);
    }
  }

  protected openAssignFromAction(action: SuggestedAction): void {
    const target = this.assignTarget();
    if (!target) {
      return;
    }
    this.assignOwner.set(action.owner);
    this.assignDue.set(action.dueDate);
    this.assignNote.set(action.text);
    this.assignOpen.set(true);
  }

  protected closeAssign(): void {
    this.assignOpen.set(false);
  }

  protected onAssignAction(value: string): void {
    this.assignAction.set(value);
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

  protected readonly assignTitle = computed(() => {
    const target = this.assignTarget();
    return target ? `指派催收动作 · ${target.name}` : '指派催收动作';
  });

  protected readonly assignValid = computed(
    () => this.assignOwner().trim().length > 0 && this.assignDue().trim().length > 0,
  );

  protected confirmAssign(): void {
    const target = this.assignTarget();
    if (!target || !this.assignValid()) {
      return;
    }
    const label = this.actionLabel(this.assignAction());
    this.onQueue(target);
    this.state.pushToast(
      `已指派「${label}」· ${target.name} · 责任人 ${this.assignOwner().trim()} · 截止 ${this.assignDue()}`,
      'success',
    );
    this.assignOpen.set(false);
  }

  protected actionHint(value: string): string {
    switch (value) {
      case 'letter':
        return '适用于逾期超过 60 天或评级 BBB 以下客户，需同步抄送法务。';
      case 'exec':
        return '适用于战略客户，由区域负责人直接对接客户高层。';
      case 'plan':
        return '要求客户提交书面付款计划，明确每期金额与日期。';
      case 'recon':
        return '先完成对账与发票签收确认，消除争议后再主张付款。';
      case 'routine':
        return '账期正常，维持既定跟踪节奏，按月复核账龄。';
      default:
        return '';
    }
  }

  protected actionLabel(value: string): string {
    return COLLECTION_ACTIONS.find((item) => item.value === value)?.label ?? '催收动作';
  }

  protected ratingRisk(rating: CreditRating): boolean {
    return rating === 'BB' || rating === 'B';
  }

  protected ratingHint(rating: CreditRating): string {
    switch (rating) {
      case 'AAA':
      case 'AA':
        return '评级优良，履约历史稳定，可按标准账期管理。';
      case 'A':
      case 'BBB':
        return '评级适中，需按月复核回款进度。';
      case 'BB':
      case 'B':
        return '评级偏低，建议缩短账期并提高预付款比例。';
      default:
        return '';
    }
  }

  /* ---------------- 工具 ---------------- */
  private sortValue(row: CustomerRow, key: SortKey): number | string {
    if (key === 'name') return row.name;
    if (key === 'country') return row.country;
    if (key === 'creditRating') return RATING_ORDER.indexOf(row.creditRating);
    const numeric: Record<
      Exclude<SortKey, 'name' | 'country' | 'creditRating'>,
      number
    > = {
      receivable: row.receivable,
      agingDays: row.agingDays,
      overdueDays: row.overdueDays,
      expectedCollection: row.expectedCollection,
      score: row.score,
      collectionPriority: row.collectionPriority,
    };
    return numeric[key];
  }

  private compare(a: CustomerRow, b: CustomerRow, key: SortKey): number {
    const va = this.sortValue(a, key);
    const vb = this.sortValue(b, key);
    if (typeof va === 'string' && typeof vb === 'string') {
      return va.localeCompare(vb, 'zh-Hans-CN');
    }
    return Number(va) - Number(vb);
  }
}

/** 按风险等级推导默认催收方式 */
function defaultActionFor(row: CustomerRow): string {
  switch (row.level) {
    case 'L4':
      return 'letter';
    case 'L3':
      return 'plan';
    case 'L2':
      return 'recon';
    default:
      return 'routine';
  }
}
