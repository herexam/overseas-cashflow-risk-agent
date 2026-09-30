import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import type { EChartsOption } from 'echarts';

import { riskLevelMeta } from '../../core/models';
import type { CustomerRow, SuggestedAction } from '../../core/models';
import { StateService } from '../../core/services/state.service';
import {
  areaSeries,
  barSeries,
  categoryAxis,
  CHART_COLORS,
  CHART_PALETTE,
  gridConfig,
  tooltipConfig,
  valueAxis,
  WsAmountPipe,
  WsChart,
  WsDatePipe,
  WsDrawer,
  WsEmptyState,
  WsFivePart,
  WsIcon,
  WsKeyValue,
  WsNumPipe,
  WsPercentPipe,
  WsProgressBar,
  WsRiskBadge,
  type KeyValueItem,
} from '../../shared/ui';

/** 账龄明细行：金额 + 桶内占比 + 相对最大值条宽。 */
interface AgingDetailRow {
  readonly bucket: string;
  readonly amount: number;
  readonly ratio: number;
  readonly barRatio: number;
  readonly level: 'high' | 'mid' | 'low';
}

/** 从基准时间回溯 N 个月的 `YYYY-MM` 标签。 */
function trailingMonthLabels(asOf: string, count: number): readonly string[] {
  const datePart = asOf.split(' ')[0];
  const segments = datePart.split('-');
  const year = Number(segments[0]);
  const month = Number(segments[1]);
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return [];
  }
  const labels: string[] = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const stamp = year * 12 + (month - 1) - offset;
    labels.push(`${String(Math.floor(stamp / 12))}-${String((stamp % 12) + 1).padStart(2, '0')}`);
  }
  return labels;
}

/**
 * 客户应收详情抽屉。
 *
 * 纯展示组件：只接收选中的 CustomerRow，写操作通过 output 交回页面统一处理。
 */
@Component({
  selector: 'ws-customer-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    WsDrawer,
    WsKeyValue,
    WsChart,
    WsFivePart,
    WsRiskBadge,
    WsProgressBar,
    WsEmptyState,
    WsIcon,
    WsAmountPipe,
    WsPercentPipe,
    WsDatePipe,
  ],
  template: `
    <ws-drawer
      [open]="open()"
      [title]="customer()?.name ?? '客户详情'"
      [eyebrow]="eyebrow()"
      [subtitle]="subtitle()"
      [width]="780"
      (closed)="closed.emit()"
    >
      @if (customer(); as c) {
        <div class="dw">
          <div class="dw__top">
            <span class="ws-tag">{{ c.id }}</span>
            <span class="ws-tag">{{ c.channelType }}</span>
            <span class="ws-tag">{{ c.country }}</span>
            <span class="ws-tag">信用等级 {{ c.creditRating }}</span>
            <span class="ws-spacer"></span>
            <ws-risk-badge [level]="c.level" />
          </div>

          @if (c.overdueDays > 0) {
            <p class="dw__alert">
              <ws-icon name="alert" [size]="14" />
              <span>
                该客户存在逾期款项，最长逾期 {{ c.overdueDays }} 天；风险等级 {{
                  levelLabel()
                }}，催收优先级 P{{ c.collectionPriority }}。
              </span>
            </p>
          } @else {
            <p class="dw__reason">
              <ws-icon name="check" [size]="14" />
              <span>该客户当前未出现逾期，账龄 {{ c.agingDays }} 天处于正常区间，按计划跟踪回款即可。</span>
            </p>
          }

          <section class="dw__sec">
            <h4 class="dw__sec-title">授信占用</h4>
            <ws-progress
              [value]="creditUsage()"
              [tone]="creditUsage() > 0.9 ? 'red' : creditUsage() > 0.75 ? 'orange' : 'blue'"
              [label]="'授信占用 ' + (creditUsage() * 100).toFixed(0) + '%（应收 ' + creditLimitText() + '）'"
            />
          </section>

          <section class="dw__sec">
            <h4 class="dw__sec-title">关键指标</h4>
            <ws-key-value [items]="keyValues()" [columns]="2" />
          </section>

          <section class="dw__sec">
            <h4 class="dw__sec-title">账龄结构</h4>
            <ul class="ag">
              @for (row of agingRows(); track row.bucket) {
                <li class="ag__row">
                  <span class="ag__label">{{ row.bucket }}</span>
                  <span class="ag__bar">
                    <span
                      class="ag__fill"
                      [class.ag__fill--high]="row.level === 'high'"
                      [class.ag__fill--mid]="row.level === 'mid'"
                      [style.width.%]="row.barRatio * 100"
                    ></span>
                  </span>
                  <span class="ag__amount">{{ row.amount | wsAmount }}</span>
                  <span class="ag__pct">{{ row.ratio | wsPercent }}</span>
                </li>
              }
            </ul>
          </section>

          <section class="dw__sec">
            <h4 class="dw__sec-title">回款趋势（近 12 个月）</h4>
            <ws-chart [options]="collectionOption()" [height]="220" />
          </section>

          <section class="dw__sec">
            <h4 class="dw__sec-title">应收 / 预计回款 / 逾期金额</h4>
            <ws-chart [options]="expectedOption()" [height]="200" />
          </section>

          <section class="dw__sec">
            <h4 class="dw__sec-title">逾期发票</h4>
            @if (c.overdueInvoices.length > 0) {
              <div class="ws-table-wrap">
                <div class="ws-table-scroll">
                  <table class="ws-table">
                    <thead>
                      <tr>
                        <th scope="col">发票号</th>
                        <th scope="col" class="is-numeric">金额</th>
                        <th scope="col">到期日</th>
                        <th scope="col" class="is-numeric">逾期天数</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (invoice of c.overdueInvoices; track invoice.invoiceNo) {
                        <tr>
                          <td class="dw__mono">{{ invoice.invoiceNo }}</td>
                          <td class="is-numeric">{{ invoice.amount | wsAmount }}</td>
                          <td>{{ invoice.dueDate | wsDate: 'short' }}</td>
                          <td class="is-numeric">
                            <span [class]="invoice.overdueDays > 90 ? 'text-red' : invoice.overdueDays > 30 ? 'text-orange' : 'text-yellow'">
                              {{ invoice.overdueDays }} 天
                            </span>
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            } @else {
              <ws-empty-state title="无逾期发票" description="该客户名下发票均在信用期内" />
            }
          </section>

          <section class="dw__sec">
            <ws-five-part
              [analysis]="c.analysis"
              [title]="'Sentinel AI 分析 · ' + c.name"
              (assignAction)="assignAction.emit($event)"
            />
          </section>
        </div>
      } @else {
        <ws-empty-state title="未选择客户" description="请在上方表格中点击任意一行查看详情" />
      }

      <ng-template #drawerFoot>
        <button type="button" class="ws-btn ws-btn--ghost" [disabled]="!customer()" (click)="onQueue()">
          <ws-icon name="target" [size]="14" />
          加入催收队列
        </button>
        <span class="ws-spacer"></span>
        <button type="button" class="ws-btn ws-btn--primary" [disabled]="!customer()" (click)="onAssign()">
          <ws-icon name="check" [size]="14" />
          指派催收动作
        </button>
      </ng-template>
    </ws-drawer>
  `,
  styles: `
    :host {
      display: contents;
    }

    .dw {
      display: flex;
      flex-direction: column;
      gap: var(--sp-5);
    }

    .dw__top {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--sp-2);
    }

    .dw__reason,
    .dw__alert {
      display: flex;
      align-items: flex-start;
      gap: var(--sp-2);
      margin: 0;
      padding: var(--sp-3);
      border-radius: var(--radius-md);
      font-size: 12px;
      line-height: 1.6;
      color: var(--text-secondary);
    }

    .dw__reason {
      border: 1px solid var(--status-info-border);
      background: var(--brand-soft);
    }

    .dw__alert {
      border: 1px solid var(--status-red-border);
      background: var(--status-red-soft);
    }

    .dw__reason ws-icon {
      flex: 0 0 auto;
      margin-top: 2px;
      color: var(--brand-primary);
    }

    .dw__alert ws-icon {
      flex: 0 0 auto;
      margin-top: 2px;
      color: var(--status-red);
    }

    .dw__sec {
      display: flex;
      flex-direction: column;
      gap: var(--sp-3);
    }

    .dw__sec-title {
      margin: 0;
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .dw__mono {
      font-family: var(--font-mono);
      font-size: 12px;
    }

    .ag {
      display: flex;
      flex-direction: column;
      gap: var(--sp-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .ag__row {
      display: grid;
      grid-template-columns: 92px minmax(60px, 1fr) 104px 56px;
      align-items: center;
      gap: var(--sp-3);
      font-size: 12px;
    }

    .ag__label {
      color: var(--text-secondary);
      white-space: nowrap;
    }

    .ag__bar {
      height: 6px;
      border-radius: var(--radius-pill);
      background: var(--bg-subtle);
      overflow: hidden;
    }

    .ag__fill {
      display: block;
      height: 100%;
      border-radius: var(--radius-pill);
      background: var(--chart-3);
    }

    .ag__fill--high {
      background: var(--status-red);
    }

    .ag__fill--mid {
      background: var(--status-orange);
    }

    .ag__amount,
    .ag__pct {
      text-align: right;
      font-variant-numeric: tabular-nums;
      color: var(--text-primary);
    }

    .ag__pct {
      color: var(--text-secondary);
    }

    @media (max-width: 720px) {
      .ag__row {
        grid-template-columns: 84px minmax(40px, 1fr) 84px;
      }

      .ag__pct {
        display: none;
      }
    }
  `,
})
export class CustomerDrawer {
  readonly customer = input<CustomerRow | null>(null);
  readonly open = input(false);

  readonly closed = output<void>();
  readonly assign = output<CustomerRow>();
  readonly assignAction = output<SuggestedAction>();
  readonly toQueue = output<CustomerRow>();

  private readonly state = inject(StateService);

  private readonly dateFmt = new WsDatePipe();
  private readonly amountFmt = new WsAmountPipe();
  private readonly numFmt = new WsNumPipe();

  protected readonly eyebrow = computed(() => {
    const c = this.customer();
    return c ? `${c.countryCode} · ${c.owner}` : '';
  });

  protected readonly subtitle = computed(() => {
    const c = this.customer();
    if (!c) {
      return '';
    }
    const expected = this.dateFmt.transform(c.expectedDate, 'short');
    const last = this.dateFmt.transform(c.lastPaymentDate, 'short');
    return `${c.channelType} · 最近回款 ${last} · 预计回款日 ${expected}`;
  });

  protected readonly levelLabel = computed(() => {
    const c = this.customer();
    return c ? riskLevelMeta(c.level).label : '—';
  });

  protected readonly creditUsage = computed(() => {
    const c = this.customer();
    if (!c || c.creditLimit <= 0) {
      return 0;
    }
    return Math.min(c.receivable / c.creditLimit, 1);
  });

  protected readonly creditLimitText = computed(() => {
    const c = this.customer();
    if (!c) {
      return '—';
    }
    return `${this.amountFmt.transform(c.receivable)} / ${this.amountFmt.transform(c.creditLimit)}`;
  });

  protected readonly keyValues = computed<readonly KeyValueItem[]>(() => {
    const c = this.customer();
    if (!c) {
      return [];
    }
    return [
      { label: '应收余额', value: this.amountFmt.transform(c.receivable) },
      { label: '加权平均账龄', value: `${c.agingDays} 天` },
      {
        label: '最长逾期天数',
        value: c.overdueDays > 0 ? `${c.overdueDays} 天` : '未逾期',
        tone: c.overdueDays > 90 ? 'red' : c.overdueDays > 30 ? 'orange' : c.overdueDays > 0 ? 'yellow' : 'green',
      },
      { label: '信用等级', value: c.creditRating },
      { label: '预计可回款', value: this.amountFmt.transform(c.expectedCollection), tone: 'blue' },
      {
        label: '预计回款率',
        value: this.numFmt.transform((c.expectedCollection / (c.receivable || 1)) * 100, 1) + '%',
      },
      {
        label: '催收优先级',
        value: `P${c.collectionPriority}`,
        hint: 'P1 为最高优先级，建议 7 日内完成首轮触达',
      },
      { label: '风险评分', value: `${c.score} / 100` },
      { label: '负责人', value: c.owner },
      { label: '预计回款日', value: this.dateFmt.transform(c.expectedDate, 'full') },
    ];
  });

  protected readonly agingRows = computed<readonly AgingDetailRow[]>(() => {
    const c = this.customer();
    if (!c) {
      return [];
    }
    const total = c.agingBuckets.reduce((sum, bucket) => sum + bucket.qty, 0);
    const max = c.agingBuckets.reduce((peak, bucket) => Math.max(peak, bucket.qty), 0);
    return c.agingBuckets.map((bucket, index) => ({
      bucket: bucket.bucket,
      amount: bucket.qty,
      ratio: total > 0 ? bucket.qty / total : 0,
      barRatio: max > 0 ? bucket.qty / max : 0,
      level: index >= 3 ? 'high' : index === 2 ? 'mid' : 'low',
    }));
  });

  protected readonly collectionOption = computed<EChartsOption>(() => {
    const c = this.customer();
    if (!c) {
      return {};
    }
    return {
      tooltip: tooltipConfig('axis'),
      grid: gridConfig({ bottom: 16 }),
      xAxis: categoryAxis(this.monthLabels(), { boundaryGap: false }),
      yAxis: valueAxis({ decimals: 0, unit: ' 万元' }),
      series: [areaSeries('月度回款', c.collectionTrend, { color: CHART_COLORS.blue })],
    };
  });

  protected readonly expectedOption = computed<EChartsOption>(() => {
    const c = this.customer();
    if (!c) {
      return {};
    }
    return {
      tooltip: tooltipConfig('axis'),
      grid: gridConfig({ bottom: 16 }),
      xAxis: categoryAxis(['应收余额', '预计回款', '逾期金额']),
      yAxis: valueAxis({ decimals: 0, unit: ' 万元' }),
      series: [
        barSeries(
          '金额',
          [c.receivable, c.expectedCollection, Math.max(c.receivable - c.expectedCollection, 0)],
          { color: CHART_PALETTE[0] },
        ),
      ],
    };
  });

  private readonly monthLabels = computed<readonly string[]>(() =>
    trailingMonthLabels(this.state.lastRefreshedAt(), 12),
  );

  protected onAssign(): void {
    const c = this.customer();
    if (c) {
      this.assign.emit(c);
    }
  }

  protected onQueue(): void {
    const c = this.customer();
    if (c) {
      this.toQueue.emit(c);
    }
  }
}
