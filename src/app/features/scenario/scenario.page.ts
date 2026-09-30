import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import type { EChartsOption, YAXisComponentOption } from 'echarts';

import { BRAKE_ACTIONS, type BrakeAction } from '../../core/models';
import { ScenarioEngineService } from '../../core/services/scenario-engine.service';
import { StateService } from '../../core/services/state.service';
import {
  CHART_COLORS,
  WsAmountPipe,
  WsBadge,
  WsBrakeBadge,
  WsCard,
  WsChart,
  WsDemoNote,
  WsEmptyState,
  WsIcon,
  WsNumPipe,
  WsPriorityLabelPipe,
  WsRatePipe,
  WsRiskBadge,
  WsSignedPipe,
  WsSkeleton,
  WsTooltipDirective,
  barSeries,
  categoryAxis,
  emptyChartOption,
  gridConfig,
  legendConfig,
  lineSeries,
  tooltipConfig,
  valueAxis,
} from '../../shared/ui';

import { ScenarioParamsPanel } from './scenario-params.panel';

const SAMPLE_TEMPLATE = 'A';

/**
 * 情景模拟页面。
 *
 * 左侧参数面板（`app-scenario-params`）+ 右侧推演结果区；
 * 结果区按「运行中 / 已运行 / 未运行」三态渲染，全部数值来自
 * `ScenarioEngineService`，页面只做编排与可视化。
 */
@Component({
  selector: 'app-scenario-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ScenarioParamsPanel,
    WsAmountPipe,
    WsBadge,
    WsBrakeBadge,
    WsCard,
    WsChart,
    WsDemoNote,
    WsEmptyState,
    WsIcon,
    WsNumPipe,
    WsPriorityLabelPipe,
    WsRatePipe,
    WsRiskBadge,
    WsSignedPipe,
    WsSkeleton,
    WsTooltipDirective,
  ],
  template: `
    <div class="scenario">
      <app-scenario-params />

      <div class="scenario__main">
        @if (state.scenarioNote(); as note) {
          <div class="source">
            <ws-icon name="pin" [size]="14" />
            <span class="source__label">来源</span>
            <span class="source__text">{{ note }}</span>
          </div>
        }

        @if (engine.running()) {
          <ws-card title="推演中" subtitle="正在计算现金缺口、库存、CCC 与风险等级迁移">
            <div class="sk">
              <ws-skeleton [height]="30" />
              <ws-skeleton [height]="240" />
              <ws-skeleton [height]="180" />
            </div>
          </ws-card>
        } @else if (engine.result(); as r) {
          <div class="concl" [class.is-escalated]="r.riskEscalation.escalated">
            <div class="concl__main">
              <div class="concl__eyebrow">
                <ws-icon name="sparkle" [size]="14" />
                Sentinel AI 推演结论
              </div>
              <p class="concl__text">{{ r.aiSummary.conclusion }}</p>
              <div class="concl__meta">
                <span class="ws-tag">{{ engine.templateName(r.params.template) }}</span>
                <span class="ws-tag">计算时间 {{ r.computedAt }}</span>
                @if (r.riskEscalation.escalated) {
                  <span class="ws-tag concl__flag">风险等级升级</span>
                }
              </div>
            </div>
            <div class="concl__risk">
              <span class="concl__risk-label">风险等级迁移</span>
              <div class="concl__risk-flow">
                <ws-risk-badge [level]="r.riskEscalation.from" />
                <ws-icon name="arrow-right" [size]="18" />
                <ws-risk-badge [level]="r.riskEscalation.to" />
              </div>
            </div>
          </div>

          <ws-card title="指标对比" subtitle="基准快照与情景推演结果逐项对照，红线为触发风险升级的指标">
            <div class="ws-table-wrap">
              <div class="ws-table-scroll">
                <table class="ws-table">
                  <thead>
                    <tr>
                      <th>指标</th>
                      <th class="is-numeric">基准</th>
                      <th class="is-numeric">模拟</th>
                      <th class="is-numeric">变化</th>
                      <th class="is-numeric">变化幅度</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (d of r.deltas; track d.key) {
                      <tr [class.is-risk]="d.escalatesRisk">
                        <td>
                          <span class="cell-label">{{ d.label }}</span>
                          <span class="cell-unit">{{ d.unit }}</span>
                        </td>
                        <td class="is-numeric">{{ d.baseline | wsNum: d.precision }}</td>
                        <td class="is-numeric">{{ d.simulated | wsNum: d.precision }}</td>
                        <td
                          class="is-numeric"
                          [class.text-green]="d.favorable"
                          [class.text-red]="!d.favorable"
                        >
                          {{ d.delta | wsSigned: d.precision }}
                        </td>
                        <td
                          class="is-numeric"
                          [class.text-green]="d.favorable"
                          [class.text-red]="!d.favorable"
                        >
                          {{ d.deltaPct | wsRate: 1 }}
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          </ws-card>

          <div class="charts">
            <ws-card title="30 / 60 / 90 天现金缺口" subtitle="单位：万元，正数为缺口">
              <ws-chart [options]="gapOption()" [height]="280" />
            </ws-card>
            <ws-card title="库存货值与 CCC" subtitle="柱：库存货值（万元） · 线：CCC（天）">
              <ws-chart [options]="inventoryOption()" [height]="260" />
            </ws-card>
            <ws-card title="综合风险评分" subtitle="满分 100 分，越高越接近失控">
              <ws-chart [options]="riskOption()" [height]="260" />
            </ws-card>
          </div>

          <ws-card title="冲击传导路径" subtitle="从外部冲击到现金缺口与风险等级的传导链路">
            <ol class="tchain">
              @for (s of r.transmission; track s.step; let i = $index; let last = $last) {
                <li class="tnode" [class.is-last]="last">
                  <span class="tnode__idx">{{ i + 1 }}</span>
                  <div class="tnode__body">
                    <div class="tnode__head">
                      <span class="tnode__step">{{ s.step }}</span>
                      <ws-badge>{{ s.magnitude }}</ws-badge>
                    </div>
                    <p class="tnode__desc">{{ s.description }}</p>
                  </div>
                </li>
              }
            </ol>
          </ws-card>

          <ws-card
            title="受影响库存 SKU"
            subtitle="按聚焦 SKU 优先、增量货值次之排序，最多展示 8 条；点击行可跳转库存中心"
          >
            @if (skuRows().length) {
              <div class="ws-table-wrap">
                <div class="ws-table-scroll">
                  <table class="ws-table">
                    <thead>
                      <tr>
                        <th>SKU 编码</th>
                        <th>名称</th>
                        <th>仓库</th>
                        <th class="is-numeric">基准库存</th>
                        <th class="is-numeric">模拟库存</th>
                        <th class="is-numeric">增量货值</th>
                        <th class="is-numeric">库龄增加</th>
                        <th>风险等级</th>
                        <th>建议动作</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (s of skuRows(); track s.sku) {
                        <tr class="is-clickable" (click)="openSku(s.sku)">
                          <td class="cell-code">{{ s.sku }}</td>
                          <td>{{ s.name }}</td>
                          <td>
                            <div>{{ s.warehouseName }}</div>
                            <div class="cell-sub">{{ s.country }}</div>
                          </td>
                          <td class="is-numeric">{{ s.baselineQty | wsNum }}</td>
                          <td class="is-numeric">
                            <div>{{ s.simulatedQty | wsNum }}</div>
                            <div class="cell-sub" [class.text-orange]="s.qtyDelta > 0">
                              {{ s.qtyDelta | wsSigned }}
                            </div>
                          </td>
                          <td class="is-numeric text-orange">{{ s.extraValue | wsAmount }}</td>
                          <td class="is-numeric">{{ s.agingDeltaDays | wsSigned: 0 : ' 天' }}</td>
                          <td><ws-risk-badge [level]="s.level" /></td>
                          <td><ws-brake-badge [action]="s.brake" /></td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            } @else {
              <ws-empty-state
                title="本场景未识别到受影响的库存 SKU"
                description="当前参数未对海外仓库存形成净增量或库龄上升，可调整海运延迟、订单变化或回款延期后重新推演。"
              />
            }
          </ws-card>

          <ws-card
            title="受影响客户应收"
            subtitle="按延期金额排序，最多展示 8 条；点击行可跳转应收风险中心"
          >
            @if (r.affectedCustomers.length) {
              <div class="ws-table-wrap">
                <div class="ws-table-scroll">
                  <table class="ws-table">
                    <thead>
                      <tr>
                        <th>客户</th>
                        <th>国家</th>
                        <th class="is-numeric">基准应收</th>
                        <th class="is-numeric">延后回款金额</th>
                        <th class="is-numeric">新增逾期天数</th>
                        <th>风险等级</th>
                        <th>负责人</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (c of r.affectedCustomers; track c.name) {
                        <tr class="is-clickable" (click)="openReceivables()">
                          <td>{{ c.name }}</td>
                          <td>{{ c.country }}</td>
                          <td class="is-numeric">{{ c.baselineAmount | wsAmount }}</td>
                          <td class="is-numeric text-orange">{{ c.delayedAmount | wsAmount }}</td>
                          <td class="is-numeric">{{ c.newOverdueDays | wsSigned: 0 : ' 天' }}</td>
                          <td><ws-risk-badge [level]="c.level" /></td>
                          <td>{{ c.owner }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            } @else {
              <ws-empty-state
                title="本场景未识别到受影响的重点客户"
                description="回款延期与订单下降同时为 0 时不会产生应收冲击，调整参数后重新推演即可看到优先级排序。"
              />
            }
          </ws-card>

          <div #aiCard>
            <ws-card title="Sentinel AI 推演解读" subtitle="结论 / 原因 / 影响 / 建议动作 / 证据">
              <ng-template #cardActions>
                <button
                  type="button"
                  class="ws-btn ws-btn--ghost ws-btn--sm"
                  [disabled]="state.aiStatus() === 'thinking'"
                  (click)="summarize()"
                >
                  <ws-icon name="sparkle" [size]="14" />
                  {{
                    state.aiStatus() === 'thinking'
                      ? 'Sentinel AI 正在总结…'
                      : '让 Sentinel AI 总结结果'
                  }}
                </button>
              </ng-template>

              <div class="ai">
                <section class="ai__block">
                  <h3 class="ai__title">结论</h3>
                  <p class="ai__conclusion">{{ r.aiSummary.conclusion }}</p>
                </section>

                <section class="ai__block">
                  <h3 class="ai__title">原因</h3>
                  <ol class="ai__list">
                    @for (reason of r.aiSummary.reasons; track reason) {
                      <li>{{ reason }}</li>
                    }
                  </ol>
                </section>

                <section class="ai__block">
                  <h3 class="ai__title">影响</h3>
                  <ul class="ai__list ai__list--plain">
                    @for (item of r.aiSummary.impacts; track item.text) {
                      <li class="ai__impact">
                        <ws-icon name="alert" [size]="14" />
                        <span class="ai__impact-text">{{ item.text }}</span>
                        @if (item.metric) {
                          <span class="ws-tag">{{ item.metric }}</span>
                        }
                        @if (item.delta) {
                          <span class="ai__delta">{{ item.delta }}</span>
                        }
                      </li>
                    }
                  </ul>
                </section>

                <section class="ai__block">
                  <h3 class="ai__title">建议动作</h3>
                  <ol class="ai__list">
                    @for (a of r.aiSummary.actions; track a.id) {
                      <li class="ai__action">
                        <span class="ai__action-text">{{ a.text }}</span>
                        <div class="ai__action-meta">
                          <ws-brake-badge [action]="a.actionType" />
                          <ws-badge tone="orange">{{ a.priority | wsPriority }}</ws-badge>
                          <span class="ws-tag">负责人 {{ a.owner }}</span>
                          @if (a.releaseAmount) {
                            <span class="ws-tag">可释放 {{ a.releaseAmount | wsAmount }}</span>
                          }
                          <span class="ws-tag">截止 {{ a.dueDate }}</span>
                        </div>
                      </li>
                    }
                  </ol>
                </section>

                <section class="ai__block">
                  <h3 class="ai__title">证据</h3>
                  <div class="ai__evidence">
                    @for (e of r.aiSummary.evidence; track e.id) {
                      <span class="ws-tag" [wsTooltip]="e.definition">
                        {{ e.sourceSystem }} · {{ e.metric }}：{{ e.value }}
                      </span>
                    }
                  </div>
                </section>
              </div>
            </ws-card>
          </div>

          <ws-card title="风险提示" subtitle="按 Demo 口径的分级红线自动生成">
            <div class="warns">
              @for (w of r.warnings; track w) {
                <div class="ws-warn-banner">{{ w }}</div>
              }
            </div>
          </ws-card>
        } @else {
          <ws-card>
            <ws-empty-state
              title="尚未运行模拟"
              [description]="
                engine.hasRun()
                  ? '推演结果已被重置，请重新运行模拟。'
                  : '选择场景模板或调整参数后点击「运行模拟」，查看现金缺口、库存、CCC 与风险等级的变化。'
              "
            >
              <button type="button" class="ws-btn ws-btn--primary" (click)="runSample()">
                <ws-icon name="play" [size]="14" />
                运行示例场景（海运延迟 +30 天）
              </button>
            </ws-empty-state>
          </ws-card>
        }

        <ws-demo-note />
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .scenario {
      display: grid;
      grid-template-columns: 380px minmax(0, 1fr);
      gap: var(--sp-5);
      align-items: start;
    }

    .scenario__main {
      display: flex;
      flex-direction: column;
      gap: var(--sp-4);
      min-width: 0;
    }

    .source {
      display: flex;
      align-items: center;
      gap: var(--sp-2);
      padding: var(--sp-3) var(--sp-4);
      border: 1px solid var(--status-info-border);
      border-radius: var(--radius-md);
      background: var(--brand-soft);
      font-size: 12px;
      color: var(--brand-ink);
    }

    .source ws-icon {
      color: var(--brand-primary);
    }

    .source__label {
      font-weight: 600;
    }

    .source__text {
      color: var(--text-secondary);
    }

    .sk {
      display: flex;
      flex-direction: column;
      gap: var(--sp-4);
    }

    .concl {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--sp-5);
      padding: var(--sp-5);
      border: 1px solid var(--status-info-border);
      border-radius: var(--radius-lg);
      background: linear-gradient(135deg, var(--brand-soft) 0%, var(--bg-surface) 78%);
      box-shadow: var(--shadow-xs);
    }

    .concl.is-escalated {
      border-color: var(--status-orange-border);
      background: linear-gradient(135deg, var(--status-orange-soft) 0%, var(--bg-surface) 78%);
    }

    .concl__main {
      min-width: 0;
    }

    .concl__eyebrow {
      display: flex;
      align-items: center;
      gap: var(--sp-2);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--text-secondary);
    }

    .concl__text {
      margin: var(--sp-2) 0 var(--sp-3);
      font-size: 18px;
      font-weight: 600;
      line-height: 1.6;
      color: var(--brand-ink);
    }

    .concl__meta {
      display: flex;
      flex-wrap: wrap;
      gap: var(--sp-2);
    }

    .concl__flag {
      background: var(--status-orange-soft);
      color: var(--status-orange);
    }

    .concl__risk {
      display: flex;
      flex: 0 0 auto;
      flex-direction: column;
      align-items: flex-end;
      gap: var(--sp-2);
    }

    .concl__risk-label {
      font-size: 12px;
      color: var(--text-secondary);
    }

    .concl__risk-flow {
      display: flex;
      align-items: center;
      gap: var(--sp-2);
      color: var(--text-muted);
    }

    .charts {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--sp-4);
    }

    .charts > ws-card:first-child {
      grid-column: 1 / -1;
    }

    .cell-label {
      color: var(--text-primary);
    }

    .cell-unit {
      margin-left: var(--sp-2);
      font-size: 11px;
      color: var(--text-muted);
    }

    .cell-code {
      font-variant-numeric: tabular-nums;
      color: var(--text-secondary);
    }

    .cell-sub {
      font-size: 11px;
      color: var(--text-muted);
    }

    table.ws-table tbody tr.is-risk td {
      background: var(--status-red-soft);
    }

    table.ws-table tbody tr.is-risk:hover td {
      background: var(--status-red-soft);
    }

    .tchain {
      display: flex;
      flex-direction: column;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .tnode {
      position: relative;
      display: flex;
      gap: var(--sp-3);
      padding-bottom: var(--sp-4);
    }

    .tnode.is-last {
      padding-bottom: 0;
    }

    .tnode:not(.is-last)::before {
      content: '';
      position: absolute;
      left: 13.5px;
      top: 28px;
      bottom: 0;
      width: 1px;
      background: var(--border-strong);
    }

    .tnode__idx {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
      width: 28px;
      height: 28px;
      border-radius: var(--radius-sm);
      background: var(--brand-primary);
      color: var(--text-inverse);
      font-size: 13px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }

    .tnode__body {
      min-width: 0;
      padding-top: 3px;
    }

    .tnode__head {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--sp-2);
    }

    .tnode__step {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .tnode__desc {
      margin: var(--sp-1) 0 0;
      font-size: 12px;
      line-height: 1.6;
      color: var(--text-secondary);
    }

    .ai {
      display: flex;
      flex-direction: column;
      gap: var(--sp-5);
    }

    .ai__title {
      margin: 0 0 var(--sp-2);
      font-size: 13px;
      font-weight: 600;
      color: var(--brand-ink);
    }

    .ai__conclusion {
      margin: 0;
      padding: var(--sp-4);
      border: 1px solid var(--status-info-border);
      border-radius: var(--radius-md);
      background: var(--brand-soft);
      font-size: 13px;
      line-height: 1.7;
      color: var(--brand-ink);
    }

    .ai__list {
      margin: 0;
      padding-left: var(--sp-5);
      font-size: 13px;
      line-height: 1.7;
      color: var(--text-primary);
    }

    .ai__list--plain {
      padding-left: 0;
      list-style: none;
    }

    .ai__list li + li {
      margin-top: var(--sp-1);
    }

    .ai__impact {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--sp-2);
    }

    .ai__impact ws-icon {
      color: var(--status-orange);
    }

    .ai__impact-text {
      color: var(--text-primary);
    }

    .ai__delta {
      font-size: 12px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      color: var(--status-red);
    }

    .ai__action {
      display: flex;
      flex-direction: column;
      gap: var(--sp-2);
    }

    .ai__action-meta {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--sp-2);
    }

    .ai__evidence {
      display: flex;
      flex-wrap: wrap;
      gap: var(--sp-2);
    }

    .ai__evidence .ws-tag {
      height: auto;
      padding: 3px var(--sp-2);
      line-height: 1.5;
    }

    .warns {
      display: flex;
      flex-direction: column;
      gap: var(--sp-2);
    }

    @media (max-width: 1366px) {
      .scenario {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 1100px) {
      .charts {
        grid-template-columns: 1fr;
      }

      .charts > ws-card:first-child {
        grid-column: auto;
      }

      .concl {
        flex-direction: column;
      }

      .concl__risk {
        align-items: flex-start;
      }
    }
  `,
})
export class ScenarioPage {
  protected readonly engine = inject(ScenarioEngineService);
  protected readonly state = inject(StateService);
  private readonly router = inject(Router);

  private readonly aiCardRef = viewChild<ElementRef<HTMLElement>>('aiCard');

  /** 受影响 SKU 的视图模型：补上库存变化量与建议动作枚举。 */
  protected readonly skuRows = computed(() =>
    (this.engine.result()?.affectedSkus ?? []).map((row) => ({
      ...row,
      qtyDelta: row.simulatedQty - row.baselineQty,
      brake: this.brakeAction(row.action),
    })),
  );

  protected readonly gapOption = computed<EChartsOption>(() => {
    const r = this.engine.result();
    if (!r) {
      return emptyChartOption();
    }
    return {
      tooltip: tooltipConfig('axis'),
      legend: legendConfig(),
      grid: gridConfig(),
      xAxis: categoryAxis(['30 天', '60 天', '90 天']),
      yAxis: valueAxis({ unit: ' 万元' }),
      series: [
        barSeries(
          '基准',
          [r.baseline.gap30, r.baseline.gap60, r.baseline.gap90],
          { color: CHART_COLORS.slate },
        ),
        barSeries(
          '模拟',
          [r.simulated.gap30, r.simulated.gap60, r.simulated.gap90],
          { color: CHART_COLORS.red },
        ),
      ],
    };
  });

  protected readonly inventoryOption = computed<EChartsOption>(() => {
    const r = this.engine.result();
    if (!r) {
      return emptyChartOption();
    }
    return {
      tooltip: tooltipConfig('axis'),
      legend: legendConfig(),
      grid: gridConfig({ right: 28 }),
      xAxis: categoryAxis(['基准', '模拟']),
      yAxis: [
        valueAxis({ name: '库存货值', unit: ' 万元' }) as YAXisComponentOption,
        valueAxis({ name: 'CCC', unit: ' 天', splitLine: false }) as YAXisComponentOption,
      ],
      series: [
        barSeries('库存货值（万元）', [r.baseline.inventoryValue, r.simulated.inventoryValue], {
          color: CHART_COLORS.blue,
          showLabel: true,
          barWidth: '38%',
        }),
        lineSeries('CCC（天）', [r.baseline.ccc, r.simulated.ccc], {
          color: CHART_COLORS.amber,
          yAxisIndex: 1,
          showLabel: true,
          labelUnit: ' 天',
        }),
      ],
    };
  });

  protected readonly riskOption = computed<EChartsOption>(() => {
    const r = this.engine.result();
    if (!r) {
      return emptyChartOption();
    }
    return {
      tooltip: tooltipConfig('axis'),
      legend: legendConfig(),
      grid: gridConfig(),
      xAxis: categoryAxis(['综合风险评分']),
      yAxis: valueAxis({ name: '分', max: 100, unit: ' 分' }),
      series: [
        barSeries('基准', [r.baseline.riskScore], {
          color: CHART_COLORS.slate,
          showLabel: true,
          barWidth: '30%',
        }),
        barSeries('模拟', [r.simulated.riskScore], {
          color: CHART_COLORS.amber,
          showLabel: true,
          barWidth: '30%',
        }),
      ],
    };
  });

  constructor() {
    effect(() => {
      this.engine.focusSku(this.state.focusSkuIds());
    });
  }

  protected runSample(): void {
    this.engine.applyTemplate(SAMPLE_TEMPLATE);
    this.engine.run();
  }

  protected openSku(sku: string): void {
    this.state.setFocusSkus([sku]);
    void this.router.navigateByUrl('/inventory');
  }

  protected openReceivables(): void {
    void this.router.navigateByUrl('/receivables');
  }

  protected summarize(): void {
    this.state.setAiStatus('thinking');
    setTimeout(() => {
      this.state.setAiStatus('ready');
      this.aiCardRef()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 600);
  }

  /** `AffectedSku.action` 存的是中文标签，回查枚举后再交给 `ws-brake-badge`。 */
  private brakeAction(label: string): BrakeAction {
    const found = BRAKE_ACTIONS.find((item) => item.label === label);
    return found ? found.action : 'continue';
  }
}
