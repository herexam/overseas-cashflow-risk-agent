import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { EChartsOption } from 'echarts';

import type { CashFlowItem, ForecastHorizon, FxExposure, RiskLevel } from '../../core/models';
import { SentinelDataService } from '../../core/services/sentinel-data.service';
import { StateService } from '../../core/services/state.service';
import { round, shortDay } from '../../data/mock/_random';
import {
  CHART_COLORS,
  WsAmountPipe,
  WsBadge,
  WsCard,
  WsChart,
  WsDatePipe,
  WsDemoNote,
  WsDisclaimer,
  WsEmptyState,
  WsIcon,
  WsKeyValue,
  WsMetricTile,
  WsNumPipe,
  WsPercentPipe,
  WsProgressBar,
  WsRatePipe,
  WsRiskBadge,
  WsSegmented,
  WsSortHeader,
  WsSparkline,
  WsTooltipDirective,
  areaSeries,
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
import type { KeyValueItem, SegmentedOption, SortChange, WsTone } from '../../shared/ui';

/** 资金计划表可排序列 */
type FlowSortKey = 'id' | 'item' | 'amount' | 'date' | 'certainty';

/** 通用排序比较：数字按大小，文本按字典序 */
function compareFlowValue(a: number | string, b: number | string): number {
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }
  return String(a).localeCompare(String(b));
}

const PAGE_SIZE = 10;

/** 资金确定性：展示文案与语义色 */
const CERTAINTY_LABEL: Record<CashFlowItem['certainty'], string> = {
  committed: '已确认',
  probable: '较可能',
  tentative: '待观察',
};

const CERTAINTY_TONE: Record<CashFlowItem['certainty'], WsTone> = {
  committed: 'green',
  probable: 'blue',
  tentative: 'yellow',
};

const CERTAINTY_ORDER: Record<CashFlowItem['certainty'], number> = {
  committed: 0,
  probable: 1,
  tentative: 2,
};

/** 主要外币敞口币种（用于汇率指数走势，人民币不参与） */
const INDEX_CURRENCIES: readonly FxExposure['code'][] = ['USD', 'EUR', 'GBP'];

const FX_INDEX_COLORS: Record<string, string> = {
  USD: CHART_COLORS.blue,
  EUR: CHART_COLORS.teal,
  GBP: CHART_COLORS.violet,
};

/** 敞口规模对应的语义色 */
const EXPOSURE_TONE: Record<RiskLevel, string> = {
  L4: CHART_COLORS.red,
  L3: CHART_COLORS.amber,
  L2: CHART_COLORS.violet,
  L1: CHART_COLORS.teal,
};

@Component({
  selector: 'app-cash-fx-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    WsAmountPipe,
    WsBadge,
    WsCard,
    WsChart,
    WsDatePipe,
    WsDemoNote,
    WsDisclaimer,
    WsEmptyState,
    WsIcon,
    WsKeyValue,
    WsMetricTile,
    WsNumPipe,
    WsPercentPipe,
    WsProgressBar,
    WsRatePipe,
    WsRiskBadge,
    WsSegmented,
    WsSortHeader,
    WsSparkline,
    WsTooltipDirective,
  ],
  template: `
    <div class="page">
      <div class="meta">
        <ws-icon name="clock" [size]="14" />
        <span>数据截止 {{ pos.asOf }}</span>
        <span class="meta__sep">·</span>
        <span>本位币 CNY</span>
        <span class="meta__sep">·</span>
        <span>预测窗口 {{ state.horizon() }} 天</span>
        <span class="meta__sep">·</span>
        <span>外币敞口币种 {{ exposures.length }} 个</span>
        <span class="ws-spacer"></span>
        <button type="button" class="ws-btn ws-btn--ghost ws-btn--sm" [disabled]="refreshing()" (click)="refreshData()">
          <ws-icon name="refresh" [size]="14" />
          {{ refreshing() ? '刷新中…' : '刷新数据' }}
        </button>
        <ws-demo-note />
      </div>

      <div class="tiles">
        <ws-metric-tile
          label="期末现金余额"
          [value]="pos.cashOnHand"
          kind="amount"
          [change]="pos.change"
          [spark]="balanceTrend()"
          hint="基准日可用现金及等价物余额（万元），趋势为近 12 个月月末口径"
        />
        <ws-metric-tile
          label="现金安全线"
          [value]="pos.safeLine"
          kind="amount"
          hint="集团营运资金管理设定的最低现金保有量（万元），低于该线即触发预警"
        />
        <ws-metric-tile
          label="30 天现金缺口"
          [value]="gaps()[0].amount"
          kind="amount"
          [level]="gaps()[0].level"
          sparkUnit="万元"
          [spark]="gapTrend()"
          hint="未来 30 天最低余额低于安全线的金额；当前无缺口，但需在 10 月上旬备足到期债务"
        />
        <ws-metric-tile
          label="60 天现金缺口"
          [value]="gaps()[1].amount"
          kind="amount"
          [level]="gaps()[1].level"
          hint="未来 60 天最低余额低于安全线的金额，主因 11 月 5 日信用证到期付款"
        />
        <ws-metric-tile
          label="90 天现金缺口"
          [value]="gaps()[2].amount"
          kind="amount"
          [level]="gaps()[2].level"
          route="/scenario"
          hint="未来 90 天最低余额低于安全线的金额，点击进入情景模拟评估缓解路径"
        />
        <ws-metric-tile
          label="90 天内到期债务"
          [value]="pos.debt90"
          kind="amount"
          hint="未来 90 天内到期的银行流贷、票据、信用证与融资租赁合计（万元）"
        />
      </div>

      <ws-card
        title="现金余额预测"
        [subtitle]="
          '未来 ' + state.horizon() + ' 天逐日余额预测，阴影区间为随预测天数放宽的置信区间（±2% → ±9%）'
        "
      >
        <ng-template #cardActions>
          <ws-segmented
            ariaLabel="预测窗口"
            [value]="horizonValue()"
            [options]="horizonOptions"
            (changed)="onHorizon($event)"
          />
        </ng-template>
        <ws-chart
          [options]="forecastOption()"
          [height]="340"
          [loading]="refreshing()"
          [empty]="forecast().points.length === 0"
          emptyTitle="暂无现金预测数据"
        />
        <div class="note" [class.note--risk]="forecast().gap > 0">
          <ws-icon [name]="forecast().gap > 0 ? 'alert' : 'check'" [size]="14" />
          <div>
            <div class="note__title">
              未来 {{ forecast().horizon }} 天最低余额 {{ forecast().minBalance | wsAmount }}（{{
                forecast().minBalanceDate | wsDate: 'short'
              }}）
              @if (forecast().gap > 0) {
                <span class="text-red">· 低于安全线 {{ forecast().gap | wsAmount }}</span>
              } @else {
                <span class="text-green">· 未跌破安全线</span>
              }
            </div>
            <div class="note__text">{{ forecast().note }}</div>
          </div>
        </div>
      </ws-card>

      <div class="charts">
        <ws-card title="三窗口缺口与安全线" subtitle="30 / 60 / 90 天最低余额、缺口金额与 6,000 万元安全线的对比（万元）">
          <ws-chart [options]="gapOption()" [height]="304" [loading]="refreshing()" />
        </ws-card>
        <ws-card title="逐日流入流出" subtitle="未来 {{ state.horizon() }} 天资金流入（正向）与流出（负向）堆叠，净额即日终余额变动（万元）">
          <ws-chart
            [options]="flowOption()"
            [height]="304"
            [loading]="refreshing()"
            [empty]="forecast().points.length === 0"
            emptyTitle="暂无逐日流水数据"
          />
        </ws-card>
      </div>

      <div class="split">
        <ws-card title="现金头寸与债务到期" subtitle="基准日现金头寸与各窗口到期债务（万元）">
          <ws-key-value [items]="positionItems()" [columns]="2" />
          <div class="ratio">
            <div class="ratio__head">
              <span>自由现金比率</span>
              <span class="ratio__value">{{ pos.freeCashRatio | wsPercent: 1 }}</span>
            </div>
            <ws-progress
              [value]="pos.freeCashRatio"
              [tone]="pos.freeCashRatio < 0.4 ? 'orange' : 'blue'"
              label="自由现金 ÷ 期末现金"
            />
          </div>
        </ws-card>

        <ws-card title="短期债务台账" subtitle="未来 90 天内到期债务 6 笔，按到期日升序排列">
          <ng-template #cardActions>
            <span class="ws-caption">合计 {{ debtTotal() | wsAmount }}</span>
          </ng-template>
          <div class="ws-table-wrap">
            <div class="ws-table-scroll">
              <table class="ws-table table--debts">
                <thead>
                  <tr>
                    <th>债务名称</th>
                    <th>类型</th>
                    <th class="is-numeric">金额</th>
                    <th>到期日</th>
                    <th>币种</th>
                    <th class="is-numeric">利率</th>
                    <th>风险等级</th>
                  </tr>
                </thead>
                <tbody>
                  @for (debt of debts; track debt.id) {
                    <tr>
                      <td>{{ debt.name }}</td>
                      <td><span class="ws-tag">{{ debt.type }}</span></td>
                      <td class="is-numeric">{{ debt.amount | wsAmount }}</td>
                      <td class="cell-date">{{ debt.dueDate | wsDate: 'short' }}</td>
                      <td>{{ debt.currency }}</td>
                      <td class="is-numeric">{{ debt.ratePct | wsRate }}</td>
                      <td><ws-risk-badge [level]="debt.level" [compact]="true" /></td>
                    </tr>
                  }
                </tbody>
                <tfoot>
                  <tr class="ws-table__footer">
                    <td colspan="2">合计</td>
                    <td class="is-numeric">{{ debtTotal() | wsAmount }}</td>
                    <td colspan="4">按合同到期日统计，不含可循环使用的授信额度</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </ws-card>
      </div>

      <ws-card title="外币敞口（FX Exposure）" subtitle="按币种汇总的外币应收、应付与净敞口，均按基准日中间价折合人民币（万元）">
        <ng-template #cardActions>
          <span class="fx-note" [wsTooltip]="hedgeHint()" tooltipPlacement="top">
            <ws-icon name="info" [size]="13" />
            仅展示敞口，不输出套期保值建议
          </span>
        </ng-template>

        <div class="charts">
          <ws-card title="主要币种汇率指数走势" subtitle="近 90 天，基期（90 天前）= 100，仅反映波动方向与幅度">
            <ws-chart [options]="fxIndexOption()" [height]="280" [loading]="refreshing()" />
          </ws-card>
          <ws-card title="外币净敞口结构" subtitle="按净敞口金额（万元）占比，人民币敞口仅指海外主体本币轧差">
            <ws-chart [options]="fxShareOption()" [height]="280" [loading]="refreshing()" />
          </ws-card>
        </div>

        <div class="fx-grid">
          @for (item of exposures; track item.code) {
            <div class="fx" [class.fx--top]="item.level === 'L4'">
              <div class="fx__head">
                <span class="fx__code">{{ item.code }}</span>
                <span class="fx__label">{{ item.label }}</span>
                <span class="ws-spacer"></span>
                <ws-risk-badge [level]="item.level" [compact]="true" />
              </div>
              <div class="fx__rate">
                <span class="fx__rate-value">{{ item.rate | wsNum: 4 }}</span>
                <span
                  class="fx__rate-delta"
                  [class.text-red]="item.rateChangePct < 0"
                  [class.text-green]="item.rateChangePct > 0"
                >
                  {{ item.rateChangePct > 0 ? '+' : '' }}{{ item.rateChangePct | wsNum: 2 }}%
                </span>
              </div>
              <div class="fx__rows">
                <div class="fx__row">
                  <span>外币应收</span>
                  <span class="fx__num">{{ item.receivable | wsAmount }}</span>
                </div>
                <div class="fx__row">
                  <span>外币应付</span>
                  <span class="fx__num">{{ item.payable | wsAmount }}</span>
                </div>
                <div class="fx__row fx__row--strong">
                  <span>净敞口</span>
                  <span class="fx__num">{{ item.net | wsAmount }}</span>
                </div>
              </div>
              <div class="fx__bar">
                <ws-progress
                  [value]="item.netRatio"
                  [tone]="toneOf(item.level)"
                  label="净敞口 ÷ 年化营业收入"
                />
              </div>
              <div class="fx__spark">
                <ws-sparkline [data]="sparkOf(item)" [tone]="item.level === 'L4' ? 'red' : 'blue'" [height]="30" [width]="220" />
                <span class="ws-caption">近 90 天中间价走势</span>
              </div>
              <p class="fx__note">{{ item.note }}</p>
            </div>
          }
        </div>
      </ws-card>

      <ws-card title="资金流入流出计划" subtitle="未来 90 天资金事项明细，按确定性分级管理">
        <ng-template #cardActions>
          <span class="ws-caption">
            流入 {{ inflowTotal() | wsAmount }} · 流出 {{ outflowTotal() | wsAmount }} · 净额 {{ netTotal() | wsAmount }}
          </span>
        </ng-template>

        <div class="toolbar">
          <input
            class="ws-input ws-input--sm ws-search"
            type="search"
            placeholder="搜索资金事项 / 交易对手"
            [value]="flowQuery()"
            (input)="onFlowQuery($event)"
          />
          <ws-segmented
            ariaLabel="资金方向"
            [value]="flowCategory()"
            [options]="categoryOptions"
            (changed)="onFlowCategory($event)"
          />
          <span class="toolbar__field">
            <label class="toolbar__label" for="flow-certainty">确定性</label>
            <select id="flow-certainty" class="ws-select ws-select--sm" [value]="flowCertainty()" (change)="onFlowCertainty($event)">
              <option value="all">全部</option>
              <option value="committed">已确认</option>
              <option value="probable">较可能</option>
              <option value="tentative">待观察</option>
            </select>
          </span>
          <span class="toolbar__field">
            <label class="toolbar__label" for="flow-from">到期区间</label>
            <input id="flow-from" class="ws-input ws-input--sm" type="date" [value]="flowFrom()" (change)="onFlowFrom($event)" />
            <span class="toolbar__label">至</span>
            <input class="ws-input ws-input--sm" type="date" [value]="flowTo()" (change)="onFlowTo($event)" />
          </span>
          <span class="ws-spacer"></span>
          <button type="button" class="ws-btn ws-btn--ghost ws-btn--sm" (click)="resetFlowFilters()">
            <ws-icon name="close" [size]="13" />
            重置筛选
          </button>
        </div>

        <div class="ws-table-wrap">
          <div class="ws-table-scroll">
            <table class="ws-table table--flows">
              <thead>
                <tr>
                  <th wsSort="id" [activeKey]="flowSortKey()" [direction]="flowSortDir()" defaultDirection="asc" (sorted)="onFlowSort($event)">
                    编号
                  </th>
                  <th wsSort="item" [activeKey]="flowSortKey()" [direction]="flowSortDir()" defaultDirection="asc" (sorted)="onFlowSort($event)">
                    资金事项
                  </th>
                  <th>方向</th>
                  <th wsSort="amount" [activeKey]="flowSortKey()" [direction]="flowSortDir()" (sorted)="onFlowSort($event)">
                    金额
                  </th>
                  <th wsSort="date" [activeKey]="flowSortKey()" [direction]="flowSortDir()" defaultDirection="asc" (sorted)="onFlowSort($event)">
                    预计日期
                  </th>
                  <th>币种</th>
                  <th>交易对手</th>
                  <th wsSort="certainty" [activeKey]="flowSortKey()" [direction]="flowSortDir()" defaultDirection="asc" (sorted)="onFlowSort($event)">
                    确定性
                  </th>
                  <th>备注</th>
                </tr>
              </thead>
              <tbody>
                @for (row of pagedFlows(); track row.id) {
                  <tr>
                    <td class="cell-code">{{ row.id }}</td>
                    <td class="cell-name">{{ row.item }}</td>
                    <td>
                      <span [class]="'ws-badge ws-badge--' + (row.category === 'inflow' ? 'green' : 'orange')">
                        {{ row.category === 'inflow' ? '流入' : '流出' }}
                      </span>
                    </td>
                    <td class="is-numeric" [class.text-green]="row.category === 'inflow'">{{ row.amount | wsAmount }}</td>
                    <td class="cell-date">{{ row.date | wsDate: 'short' }}</td>
                    <td>{{ row.currency }}</td>
                    <td class="cell-party">{{ row.counterparty }}</td>
                    <td>
                      <ws-badge
                        [tone]="certaintyTone(row)"
                        [dot]="true"
                        [wsTooltip]="certaintyHint(row)"
                        tooltipPlacement="top"
                      >
                        {{ certaintyLabel(row) }}
                      </ws-badge>
                    </td>
                    <td class="cell-note">{{ row.note }}</td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="9">
                      <ws-empty-state
                        title="当前筛选条件下没有资金事项"
                        description="可放宽确定性、日期区间或清空搜索关键词后重试。"
                        icon="filter"
                      >
                        <button type="button" class="ws-btn ws-btn--ghost ws-btn--sm" (click)="resetFlowFilters()">重置筛选条件</button>
                      </ws-empty-state>
                    </td>
                  </tr>
                }
              </tbody>
              <tfoot>
                <tr class="ws-table__footer">
                  <td colspan="3">筛选结果合计（{{ filteredFlows().length }} 条）</td>
                  <td class="is-numeric">{{ filteredTotal() | wsAmount }}</td>
                  <td colspan="5">金额为 Demo 示例口径，含汇率折算误差</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div class="ws-pager">
          <span class="ws-caption">共 {{ filteredFlows().length }} 条 · 第 {{ flowPage() }} / {{ flowPageCount() }} 页</span>
          <span class="ws-spacer"></span>
          <button type="button" [disabled]="flowPage() <= 1" (click)="goFlowPage(flowPage() - 1)">上一页</button>
          @for (p of flowPageList(); track p) {
            <button type="button" [attr.aria-current]="p === flowPage() ? 'true' : null" (click)="goFlowPage(p)">{{ p }}</button>
          }
          <button type="button" [disabled]="flowPage() >= flowPageCount()" (click)="goFlowPage(flowPage() + 1)">下一页</button>
        </div>
      </ws-card>

      <ws-disclaimer />
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
      color: var(--border-strong);
    }
    .tiles {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: var(--sp-4);
    }
    .charts,
    .split {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--sp-5);
      align-items: start;
    }

    .note {
      display: flex;
      align-items: flex-start;
      gap: var(--sp-2);
      margin-top: var(--sp-4);
      padding: var(--sp-3);
      font-size: 12px;
      line-height: 1.6;
      color: var(--text-secondary);
      background: var(--brand-soft);
      border: 1px solid var(--brand-soft-strong);
      border-radius: var(--radius-md);
    }
    .note--risk {
      background: var(--status-red-soft);
      border-color: var(--status-red-border);
    }
    .note ws-icon {
      flex: none;
      margin-top: 2px;
      color: var(--brand-primary);
    }
    .note--risk ws-icon {
      color: var(--status-red);
    }
    .note__title {
      font-weight: 600;
      color: var(--text-primary);
    }
    .note__text {
      margin-top: 2px;
    }

    .ratio {
      margin-top: var(--sp-4);
      padding-top: var(--sp-4);
      border-top: 1px solid var(--border);
    }
    .ratio__head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      margin-bottom: var(--sp-2);
      font-size: 12px;
      color: var(--text-secondary);
    }
    .ratio__value {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary);
      font-variant-numeric: tabular-nums;
    }

    .table--debts {
      min-width: 720px;
    }
    .table--flows {
      min-width: 1360px;
    }
    .cell-code {
      font-family: var(--font-mono);
      font-size: 12px;
      color: var(--brand-ink);
      white-space: nowrap;
    }
    .cell-name {
      min-width: 180px;
      font-weight: 600;
      color: var(--text-primary);
    }
    .cell-date {
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }
    .cell-party {
      min-width: 200px;
      font-size: 12px;
      color: var(--text-secondary);
    }
    .cell-note {
      min-width: 300px;
      max-width: 420px;
      font-size: 12px;
      line-height: 1.6;
      color: var(--text-secondary);
      white-space: normal;
    }

    .toolbar {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--sp-3);
      margin-bottom: var(--sp-4);
    }
    .toolbar .ws-search {
      min-width: 240px;
    }
    .toolbar__field {
      display: inline-flex;
      align-items: center;
      gap: var(--sp-2);
    }
    .toolbar__label {
      font-size: 12px;
      color: var(--text-secondary);
      white-space: nowrap;
    }

    .fx-note {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      font-size: 12px;
      color: var(--status-orange);
      background: var(--status-orange-soft);
      border: 1px solid var(--status-orange-border);
      border-radius: var(--radius-sm);
    }

    .fx-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: var(--sp-3);
      margin-top: var(--sp-5);
    }
    .fx {
      display: flex;
      flex-direction: column;
      gap: var(--sp-3);
      padding: var(--sp-4);
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
    }
    .fx--top {
      border-color: var(--status-red-border);
      box-shadow: 0 0 0 1px var(--status-red-border);
    }
    .fx__head {
      display: flex;
      align-items: center;
      gap: var(--sp-2);
    }
    .fx__code {
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.04em;
      color: var(--brand-ink);
      font-family: var(--font-mono);
    }
    .fx__label {
      font-size: 12px;
      color: var(--text-secondary);
    }
    .fx__rate {
      display: flex;
      align-items: baseline;
      gap: var(--sp-2);
    }
    .fx__rate-value {
      font-size: 20px;
      font-weight: 600;
      color: var(--text-primary);
      font-variant-numeric: tabular-nums;
    }
    .fx__rate-delta {
      font-size: 12px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
    .fx__rows {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: var(--sp-3) 0;
      border-top: 1px solid var(--border);
      border-bottom: 1px solid var(--border);
    }
    .fx__row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--sp-2);
      font-size: 12px;
      color: var(--text-secondary);
    }
    .fx__row--strong {
      color: var(--text-primary);
      font-weight: 600;
    }
    .fx__num {
      font-variant-numeric: tabular-nums;
      color: var(--text-primary);
    }
    .fx__bar ws-progress {
      display: block;
    }
    .fx__spark {
      display: flex;
      align-items: center;
      gap: var(--sp-2);
    }
    .fx__note {
      margin: 0;
      font-size: 12px;
      line-height: 1.6;
      color: var(--text-secondary);
    }

    @media (max-width: 1680px) {
      .tiles {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      .fx-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
    @media (max-width: 1366px) {
      .charts,
      .split {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    @media (max-width: 1100px) {
      .tiles,
      .fx-grid {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
})
export class CashFxPage {
  protected readonly data = inject(SentinelDataService);
  protected readonly state = inject(StateService);

  protected readonly pos = this.data.cashFxPage.position;
  protected readonly debts = this.data.cashFxPage.debts;
  protected readonly exposures = this.data.cashFxPage.exposures;
  protected readonly gaps = this.data.gaps;
  protected readonly forecast = this.data.forecastForHorizon;

  protected readonly refreshing = signal(false);

  /* ---------------- 预测窗口 ---------------- */

  protected readonly horizonOptions: readonly SegmentedOption[] = [
    { value: '30', label: '未来 30 天', hint: '短期流动性窗口，观察到期债务与刚性支出' },
    { value: '60', label: '未来 60 天', hint: '含信用证到期付款，缺口开始出现' },
    { value: '90', label: '未来 90 天', hint: '含融资租赁租金，缺口最大的窗口' },
  ];

  protected readonly horizonValue = computed(() => String(this.state.horizon()));

  protected onHorizon(value: string): void {
    this.state.setHorizon(Number(value) as ForecastHorizon);
  }

  /* ---------------- 头部指标辅助序列 ---------------- */

  protected readonly balanceTrend = computed<readonly number[]>(() => {
    const path = this.data.cashFxPage.forecasts.reduce<readonly number[]>(
      (longest, item) => (item.points.length > longest.length ? item.points.map((point) => point.balance) : longest),
      [],
    );
    const monthly = path.filter((_, index) => index % 3 === 2);
    return monthly.length > 0 ? monthly : path;
  });

  protected readonly gapTrend = computed<readonly number[]>(() => this.gaps().map((gap) => gap.amount));

  /* ---------------- 图表 ---------------- */

  protected readonly forecastOption = computed<EChartsOption>(() => {
    const points = this.forecast().points;
    if (points.length === 0) {
      return emptyChartOption('暂无现金预测数据');
    }
    const labels = points.map((point) => shortDay(point.date));
    const step = Math.max(1, Math.round(points.length / 7));
    return {
      tooltip: tooltipConfig('axis'),
      grid: gridConfig({ left: 56, right: 20, top: 32, bottom: 32 }),
      xAxis: categoryAxis(labels, { boundaryGap: false, interval: step }),
      yAxis: valueAxis({ name: '万元', decimals: 0, unit: '万元', scale: true }),
      series: [
        lineSeries(
          '预测上界',
          points.map((point) => point.upper),
          { color: CHART_COLORS.slate, smooth: true, dashed: true },
        ),
        lineSeries(
          '预测下界',
          points.map((point) => point.lower),
          { color: CHART_COLORS.slate, smooth: true, dashed: true },
        ),
        areaSeries(
          '预测余额',
          points.map((point) => point.balance),
          { color: CHART_COLORS.blue },
        ),
        lineSeries(
          '现金安全线',
          points.map(() => this.pos.safeLine),
          { color: CHART_COLORS.red, smooth: false, dashed: true },
        ),
      ],
    };
  });

  protected readonly gapOption = computed<EChartsOption>(() => {
    const gaps = this.gaps();
    if (gaps.length === 0) {
      return emptyChartOption('暂无缺口数据');
    }
    const labels = gaps.map((gap) => `${gap.horizon} 天`);
    return {
      tooltip: tooltipConfig('axis'),
      grid: gridConfig({ left: 56, right: 20, top: 40, bottom: 32 }),
      legend: legendConfig({ top: 4, right: 0 }),
      xAxis: categoryAxis(labels),
      yAxis: valueAxis({ name: '万元', decimals: 0, unit: '万元' }),
      series: [
        barSeries(
          '缺口金额',
          gaps.map((gap) => gap.amount),
          { color: CHART_COLORS.red, showLabel: true, labelUnit: ' 万元' },
        ),
        lineSeries(
          '最低余额',
          gaps.map((gap) => gap.minBalance),
          { color: CHART_COLORS.blue, symbol: true },
        ),
        lineSeries(
          '现金安全线',
          gaps.map(() => this.pos.safeLine),
          { color: CHART_COLORS.slate, smooth: false, dashed: true },
        ),
      ],
    };
  });

  protected readonly flowOption = computed<EChartsOption>(() => {
    const points = this.forecast().points;
    if (points.length === 0) {
      return emptyChartOption('暂无逐日流水数据');
    }
    const labels = points.map((point) => shortDay(point.date));
    const step = Math.max(1, Math.round(points.length / 6));
    return {
      tooltip: tooltipConfig('axis'),
      grid: gridConfig({ left: 52, right: 20, top: 40, bottom: 32 }),
      legend: legendConfig({ top: 4, right: 0 }),
      xAxis: categoryAxis(labels, { boundaryGap: true, interval: step }),
      yAxis: valueAxis({ name: '万元', decimals: 0, unit: '万元', scale: true }),
      series: [
        barSeries(
          '流入',
          points.map((point) => point.inflow),
          { stack: 'flow', color: CHART_COLORS.teal, barWidth: '64%' },
        ),
        barSeries(
          '流出',
          points.map((point) => -point.outflow),
          { stack: 'flow', color: CHART_COLORS.amber, barWidth: '64%' },
        ),
      ],
    };
  });

  protected readonly fxIndexOption = computed<EChartsOption>(() => {
    const list = this.exposures.filter((item) => INDEX_CURRENCIES.includes(item.code));
    if (list.length === 0) {
      return emptyChartOption('暂无汇率走势数据');
    }
    const labels = list[0].trend.map((point) => shortDay(point.label));
    const step = Math.max(1, Math.round(labels.length / 6));
    return {
      tooltip: tooltipConfig('axis'),
      grid: gridConfig({ left: 52, right: 20, top: 40, bottom: 32 }),
      legend: legendConfig({ top: 4, right: 0 }),
      xAxis: categoryAxis(labels, { boundaryGap: false, interval: step }),
      yAxis: valueAxis({ name: '指数', decimals: 1, scale: true }),
      series: list.map((item) =>
        lineSeries(item.code, this.indexValues(item), {
          color: FX_INDEX_COLORS[item.code] ?? CHART_COLORS.blue,
        }),
      ),
    };
  });

  protected readonly fxShareOption = computed<EChartsOption>(() => {
    const list = this.exposures;
    if (list.length === 0) {
      return emptyChartOption('暂无敞口数据');
    }
    const total = list.reduce((sum, item) => sum + item.net, 0);
    return {
      tooltip: tooltipConfig('item'),
      legend: legendConfig({ bottom: 0, top: undefined }),
      graphic: donutCenterLabel(`${Math.round(total)}`, '净敞口合计（万元）'),
      series: [
        pieSeries(
          '净敞口',
          list.map((item) => ({
            name: `${item.code} · ${item.label}`,
            value: item.net,
            color: EXPOSURE_TONE[item.level],
          })),
        ),
      ],
    };
  });

  /* ---------------- 现金头寸键值 ---------------- */

  protected readonly positionItems = computed<readonly KeyValueItem[]>(() => [
    { label: '期末现金余额', value: `${this.pos.cashOnHand} 万元` },
    { label: '现金安全线', value: `${this.pos.safeLine} 万元` },
    { label: '30 天流入合计', value: `${this.pos.inflow30} 万元` },
    { label: '30 天流出合计', value: `${this.pos.outflow30} 万元` },
    { label: '30 天净流入', value: `${this.pos.net30} 万元`, tone: this.pos.net30 >= 0 ? 'green' : 'red' },
    { label: '30 天内到期债务', value: `${this.pos.debt30} 万元`, tone: 'orange' },
    { label: '60 天内到期债务', value: `${this.pos.debt60} 万元`, tone: 'orange' },
    { label: '90 天内到期债务', value: `${this.pos.debt90} 万元`, tone: 'red' },
  ]);

  protected readonly debtTotal = computed(() => this.debts.reduce((sum, debt) => sum + debt.amount, 0));

  /* ---------------- 外币敞口辅助 ---------------- */

  protected readonly hedgeHint = (): string =>
    '按产品边界，本页只呈现外币敞口规模与汇率波动，不给出套期保值或结汇建议；如需处置动作请由资金部人工决策。';

  protected indexValues(item: FxExposure): readonly number[] {
    const first = item.trend[0]?.value ?? item.rate;
    return item.trend.map((point) => round((point.value / first) * 100, 3));
  }

  protected sparkOf(item: FxExposure): readonly number[] {
    return item.trend.map((point) => point.value);
  }

  protected toneOf(level: RiskLevel): 'blue' | 'orange' | 'red' | 'green' {
    if (level === 'L4') {
      return 'red';
    }
    if (level === 'L3') {
      return 'orange';
    }
    return level === 'L2' ? 'blue' : 'green';
  }

  /* ---------------- 资金计划表：筛选 / 排序 / 分页 ---------------- */

  protected readonly flowQuery = signal('');
  protected readonly flowCategory = signal('all');
  protected readonly flowCertainty = signal('all');
  protected readonly flowFrom = signal('');
  protected readonly flowTo = signal('');
  protected readonly flowSortKey = signal<FlowSortKey>('date');
  protected readonly flowSortDir = signal<'asc' | 'desc'>('asc');
  protected readonly flowPage = signal(1);

  protected readonly categoryOptions: readonly SegmentedOption[] = [
    { value: 'all', label: '全部' },
    { value: 'inflow', label: '流入' },
    { value: 'outflow', label: '流出' },
  ];

  protected onFlowQuery(event: Event): void {
    this.flowQuery.set((event.target as HTMLInputElement).value);
    this.flowPage.set(1);
  }

  protected onFlowCategory(value: string): void {
    this.flowCategory.set(value);
    this.flowPage.set(1);
  }

  protected onFlowCertainty(event: Event): void {
    this.flowCertainty.set((event.target as HTMLSelectElement).value);
    this.flowPage.set(1);
  }

  protected onFlowFrom(event: Event): void {
    this.flowFrom.set((event.target as HTMLInputElement).value);
    this.flowPage.set(1);
  }

  protected onFlowTo(event: Event): void {
    this.flowTo.set((event.target as HTMLInputElement).value);
    this.flowPage.set(1);
  }

  protected resetFlowFilters(): void {
    this.flowQuery.set('');
    this.flowCategory.set('all');
    this.flowCertainty.set('all');
    this.flowFrom.set('');
    this.flowTo.set('');
    this.flowSortKey.set('date');
    this.flowSortDir.set('asc');
    this.flowPage.set(1);
  }

  protected onFlowSort(change: SortChange): void {
    this.flowSortKey.set(change.key as FlowSortKey);
    this.flowSortDir.set(change.direction);
    this.flowPage.set(1);
  }

  protected certaintyLabel(row: CashFlowItem): string {
    return CERTAINTY_LABEL[row.certainty];
  }

  protected certaintyTone(row: CashFlowItem): WsTone {
    return CERTAINTY_TONE[row.certainty];
  }

  protected certaintyHint(row: CashFlowItem): string {
    switch (row.certainty) {
      case 'committed':
        return '已锁定合同或已取得付款 / 付款指令，可作为确定性现金流使用。';
      case 'probable':
        return '历史履约率较高但尚未锁定，纳入基准情景，存在滑期风险。';
      default:
        return '首次交易或对方资金状况不确定，仅纳入压力情景参考。';
    }
  }

  protected readonly filteredFlows = computed<readonly CashFlowItem[]>(() => {
    const query = this.flowQuery().trim().toLowerCase();
    const category = this.flowCategory();
    const certainty = this.flowCertainty();
    const from = this.flowFrom();
    const to = this.flowTo();
    return this.data.cashFxPage.flows.filter((row) => {
      if (category !== 'all' && row.category !== category) {
        return false;
      }
      if (certainty !== 'all' && row.certainty !== certainty) {
        return false;
      }
      if (from !== '' && row.date < from) {
        return false;
      }
      if (to !== '' && row.date > to) {
        return false;
      }
      if (query !== '' && !`${row.item} ${row.counterparty} ${row.id}`.toLowerCase().includes(query)) {
        return false;
      }
      return true;
    });
  });

  private readonly sortedFlows = computed<readonly CashFlowItem[]>(() => {
    const key = this.flowSortKey();
    const dir = this.flowSortDir() === 'asc' ? 1 : -1;
    return [...this.filteredFlows()].sort(
      (a, b) => compareFlowValue(this.flowSortValue(a, key), this.flowSortValue(b, key)) * dir,
    );
  });

  protected readonly pagedFlows = computed<readonly CashFlowItem[]>(() => {
    const start = (this.flowPage() - 1) * PAGE_SIZE;
    return this.sortedFlows().slice(start, start + PAGE_SIZE);
  });

  protected readonly flowPageCount = computed(() => Math.max(1, Math.ceil(this.filteredFlows().length / PAGE_SIZE)));

  protected readonly flowPageList = computed<readonly number[]>(() => {
    const count = this.flowPageCount();
    const current = this.flowPage();
    const start = Math.max(1, Math.min(current - 1, count - 2));
    const end = Math.min(count, start + 2);
    const list: number[] = [];
    for (let page = start; page <= end; page += 1) {
      list.push(page);
    }
    return list;
  });

  protected readonly filteredTotal = computed(() => this.filteredFlows().reduce((sum, row) => sum + row.amount, 0));
  protected readonly inflowTotal = computed(() =>
    this.data.cashFxPage.flows.filter((row) => row.category === 'inflow').reduce((sum, row) => sum + row.amount, 0),
  );
  protected readonly outflowTotal = computed(() =>
    this.data.cashFxPage.flows.filter((row) => row.category === 'outflow').reduce((sum, row) => sum + row.amount, 0),
  );
  protected readonly netTotal = computed(() => this.inflowTotal() - this.outflowTotal());

  protected goFlowPage(page: number): void {
    this.flowPage.set(Math.min(Math.max(1, page), this.flowPageCount()));
  }

  /* ---------------- 刷新 ---------------- */

  protected refreshData(): void {
    if (this.refreshing()) {
      return;
    }
    this.refreshing.set(true);
    window.setTimeout(() => {
      this.refreshing.set(false);
      this.state.refresh();
    }, 520);
  }

  private flowSortValue(row: CashFlowItem, key: FlowSortKey): number | string {
    switch (key) {
      case 'id':
        return row.id;
      case 'item':
        return row.item;
      case 'amount':
        return row.amount;
      case 'date':
        return row.date;
      default:
        return CERTAINTY_ORDER[row.certainty];
    }
  }
}
