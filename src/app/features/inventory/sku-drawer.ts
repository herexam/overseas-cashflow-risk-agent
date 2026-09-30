import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import type { EChartsOption } from 'echarts';

import type { SkuRow, SuggestedAction } from '../../core/models';
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
  WsBrakeBadge,
  WsChart,
  WsDatePipe,
  WsDrawer,
  WsEmptyState,
  WsFivePart,
  WsIcon,
  WsKeyValue,
  WsNumPipe,
  WsPercentPipe,
  WsRiskBadge,
  type KeyValueItem,
} from '../../shared/ui';

/** 库龄明细行：原始桶 + 两种比例（桶内占比 / 相对最大值）。 */
interface AgingDetailRow {
  readonly bucket: string;
  readonly qty: number;
  readonly value: number;
  readonly ratio: number;
  readonly barRatio: number;
}

/** 从基准时间回溯 12 个月的 `YYYY-MM` 标签，与趋势序列一一对应。 */
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
    const labelYear = Math.floor(stamp / 12);
    const labelMonth = (stamp % 12) + 1;
    labels.push(`${String(labelYear)}-${String(labelMonth).padStart(2, '0')}`);
  }
  return labels;
}

/**
 * SKU 详情抽屉。
 *
 * 纯展示组件：只接收选中的 SkuRow，所有写操作（指派动作、加入情景模拟）通过
 * output 交回页面，由页面统一调用数据服务并给出反馈。
 */
@Component({
  selector: 'ws-sku-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    WsDrawer,
    WsKeyValue,
    WsChart,
    WsFivePart,
    WsRiskBadge,
    WsBrakeBadge,
    WsEmptyState,
    WsIcon,
    WsAmountPipe,
    WsNumPipe,
    WsPercentPipe,
    WsDatePipe,
  ],
  template: `
    <ws-drawer
      [open]="open()"
      [title]="sku()?.name ?? 'SKU 详情'"
      [eyebrow]="eyebrow()"
      [subtitle]="subtitle()"
      [width]="760"
      (closed)="closed.emit()"
    >
      @if (sku(); as s) {
        <div class="dw">
          <div class="dw__top">
            <span class="ws-tag">{{ s.sku }}</span>
            <span class="ws-tag">{{ s.warehouseName }}</span>
            <span class="ws-tag">{{ s.productLine }}</span>
            <span class="ws-spacer"></span>
            <ws-brake-badge [action]="s.suggestedAction" />
            <ws-risk-badge [level]="s.level" />
          </div>

          <p class="dw__reason">
            <ws-icon name="sparkle" [size]="14" />
            <span>{{ s.actionReason }}</span>
          </p>

          <section class="dw__sec">
            <h4 class="dw__sec-title">关键指标</h4>
            <ws-key-value [items]="keyValues()" [columns]="2" />
          </section>

          <section class="dw__sec">
            <h4 class="dw__sec-title">库存趋势（近 12 个月）</h4>
            <ws-chart [options]="trendOption()" [height]="220" />
          </section>

          <section class="dw__sec">
            <h4 class="dw__sec-title">月度出库</h4>
            <ws-chart [options]="shipmentOption()" [height]="200" />
          </section>

          <section class="dw__sec">
            <h4 class="dw__sec-title">在途批次</h4>
            @if (s.inTransitBatches.length > 0) {
              <div class="ws-table-wrap">
                <div class="ws-table-scroll">
                  <table class="ws-table">
                    <thead>
                      <tr>
                        <th scope="col">批次</th>
                        <th scope="col" class="is-numeric">数量（台）</th>
                        <th scope="col">预计到货</th>
                        <th scope="col">状态</th>
                        <th scope="col" class="is-numeric">预付金额</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (batch of s.inTransitBatches; track batch.batch) {
                        <tr>
                          <td class="dw__mono">{{ batch.batch }}</td>
                          <td class="is-numeric">{{ batch.qty | wsNum }}</td>
                          <td>{{ batch.eta | wsDate: 'short' }}</td>
                          <td><span class="ws-badge ws-badge--plain">{{ batch.status }}</span></td>
                          <td class="is-numeric">{{ batch.prepaidAmount | wsAmount }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            } @else {
              <ws-empty-state title="暂无在途批次" description="该 SKU 当前没有已下单未到货的批次" />
            }
          </section>

          <section class="dw__sec">
            <h4 class="dw__sec-title">库龄明细</h4>
            <ul class="ag">
              @for (row of agingRows(); track row.bucket) {
                <li class="ag__row">
                  <span class="ag__label">{{ row.bucket }}</span>
                  <span class="ag__bar">
                    <span class="ag__fill" [style.width.%]="row.barRatio * 100"></span>
                  </span>
                  <span class="ag__qty">{{ row.qty | wsNum }} 台</span>
                  <span class="ag__value">{{ row.value | wsAmount }}</span>
                  <span class="ag__pct">{{ row.ratio | wsPercent }}</span>
                </li>
              }
            </ul>
          </section>

          <section class="dw__sec">
            <ws-five-part
              [analysis]="s.analysis"
              [title]="'Sentinel AI 分析 · ' + s.sku"
              (assignAction)="assignAction.emit($event)"
            />
          </section>
        </div>
      } @else {
        <ws-empty-state title="未选择 SKU" description="请在上方表格中点击任意一行查看详情" />
      }

      <ng-template #drawerFoot>
        <button type="button" class="ws-btn ws-btn--ghost" [disabled]="!sku()" (click)="onScenario()">
          <ws-icon name="target" [size]="14" />
          加入情景模拟
        </button>
        <span class="ws-spacer"></span>
        <button type="button" class="ws-btn ws-btn--primary" [disabled]="!sku()" (click)="onAssign()">
          <ws-icon name="check" [size]="14" />
          指派动作
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

    .dw__reason {
      display: flex;
      align-items: flex-start;
      gap: var(--sp-2);
      margin: 0;
      padding: var(--sp-3);
      border: 1px solid var(--status-info-border);
      border-radius: var(--radius-md);
      background: var(--brand-soft);
      font-size: 12px;
      line-height: 1.6;
      color: var(--text-secondary);
    }

    .dw__reason ws-icon {
      flex: 0 0 auto;
      margin-top: 2px;
      color: var(--brand-primary);
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
      grid-template-columns: 92px minmax(60px, 1fr) 88px 96px 56px;
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

    .ag__qty,
    .ag__value,
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
        grid-template-columns: 84px minmax(40px, 1fr) 72px;
      }

      .ag__value,
      .ag__pct {
        display: none;
      }
    }
  `,
})
export class SkuDrawer {
  readonly sku = input<SkuRow | null>(null);
  readonly open = input(false);

  readonly closed = output<void>();
  readonly assign = output<SkuRow>();
  readonly assignAction = output<SuggestedAction>();
  readonly toScenario = output<SkuRow>();

  private readonly state = inject(StateService);

  private readonly dateFmt = new WsDatePipe();
  private readonly amountFmt = new WsAmountPipe();
  private readonly numFmt = new WsNumPipe();

  protected readonly eyebrow = computed(() => {
    const s = this.sku();
    return s ? `${s.sku} · ${s.id}` : '';
  });

  protected readonly subtitle = computed(() => {
    const s = this.sku();
    if (!s) {
      return '';
    }
    const due = this.dateFmt.transform(s.dueDate, 'short');
    return `${s.productLine} · ${s.country} · 责任人 ${s.owner} · 截止 ${due}`;
  });

  protected readonly keyValues = computed<readonly KeyValueItem[]>(() => {
    const s = this.sku();
    if (!s) {
      return [];
    }
    return [
      { label: '库存数量', value: `${this.numFmt.transform(s.qty)} 台` },
      { label: '库存金额', value: this.amountFmt.transform(s.value) },
      { label: '加权平均库龄', value: `${s.agingDays} 天` },
      { label: '订单覆盖', value: `${this.numFmt.transform(s.orderCoverageMonths, 1)} 月` },
      { label: '在途数量', value: `${this.numFmt.transform(s.inTransitQty)} 台` },
      { label: '预计跌价风险', value: this.amountFmt.transform(s.impairmentRisk) },
      { label: '季度仓储成本', value: this.amountFmt.transform(s.holdingCostQuarter) },
      { label: '现金占用', value: this.amountFmt.transform(s.cashOccupied) },
      {
        label: '对 CCC 边际影响',
        value: `+${s.cccImpactDays} 天`,
        tone: 'orange',
        hint: '该 SKU 库存压占若全部释放，对现金转换周期的边际改善',
      },
      { label: '可释放现金', value: this.amountFmt.transform(s.releaseCash), tone: 'blue' },
    ];
  });

  protected readonly agingRows = computed<readonly AgingDetailRow[]>(() => {
    const s = this.sku();
    if (!s) {
      return [];
    }
    const totalQty = s.agingBuckets.reduce((sum, bucket) => sum + bucket.qty, 0);
    const maxQty = s.agingBuckets.reduce((max, bucket) => Math.max(max, bucket.qty), 0);
    return s.agingBuckets.map((bucket) => ({
      bucket: bucket.bucket,
      qty: bucket.qty,
      value: bucket.value,
      ratio: totalQty > 0 ? bucket.qty / totalQty : 0,
      barRatio: maxQty > 0 ? bucket.qty / maxQty : 0,
    }));
  });

  protected readonly trendOption = computed<EChartsOption>(() => {
    const s = this.sku();
    if (!s) {
      return {};
    }
    return {
      tooltip: tooltipConfig('axis'),
      grid: gridConfig({ bottom: 16 }),
      xAxis: categoryAxis(this.monthLabels(), { boundaryGap: false }),
      yAxis: valueAxis({ decimals: 0, unit: ' 台' }),
      series: [areaSeries('库存台数', s.trend, { color: CHART_COLORS.blue, smooth: true })],
    };
  });

  protected readonly shipmentOption = computed<EChartsOption>(() => {
    const s = this.sku();
    if (!s) {
      return {};
    }
    return {
      tooltip: tooltipConfig('axis'),
      grid: gridConfig({ bottom: 16 }),
      xAxis: categoryAxis(s.monthlyShipment.map((point) => point.label)),
      yAxis: valueAxis({ decimals: 0, unit: ' 台' }),
      series: [
        barSeries(
          '月度出库',
          s.monthlyShipment.map((point) => point.value),
          { color: CHART_PALETTE[1] },
        ),
      ],
    };
  });

  private readonly monthLabels = computed<readonly string[]>(() =>
    trailingMonthLabels(this.state.lastRefreshedAt(), 12),
  );

  protected onAssign(): void {
    const s = this.sku();
    if (s) {
      this.assign.emit(s);
    }
  }

  protected onScenario(): void {
    const s = this.sku();
    if (s) {
      this.toScenario.emit(s);
    }
  }
}
