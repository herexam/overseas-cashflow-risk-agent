import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { EChartsOption } from 'echarts';

import { BRAKE_ACTIONS, RISK_LEVELS, RISK_TYPE_LABEL, brakeActionMeta, riskLevelMeta } from '../../core/models';
import type {
  BrakeAction,
  ChangeIndicator,
  ForecastHorizon,
  RiskLevel,
  RiskType,
  SuggestedAction,
  TopRisk,
} from '../../core/models';
import { SentinelDataService } from '../../core/services/sentinel-data.service';
import { StateService } from '../../core/services/state.service';
import { shortDay, wan } from '../../data/mock/_random';
import { DEMO_DATA_NOTICE } from '../../data/mock/demo-notice';
import {
  CHART_COLORS,
  WsAmountPipe,
  WsCard,
  WsChart,
  WsDemoNote,
  WsDisclaimer,
  WsDrawer,
  WsEmptyState,
  WsFivePart,
  WsIcon,
  WsKeyValue,
  WsMetricTile,
  WsModal,
  WsNatureBadge,
  WsNumPipe,
  WsPercentPipe,
  WsRiskBadge,
  WsSegmented,
  WsSkeleton,
  WsTrendIndicator,
  areaSeries,
  barSeries,
  categoryAxis,
  donutCenterLabel,
  gridConfig,
  legendConfig,
  lineSeries,
  pieSeries,
  tooltipConfig,
  valueAxis,
} from '../../shared/ui';
import type { KeyValueItem, MetricKind, SegmentedOption } from '../../shared/ui';

type RiskTypeFilter = 'all' | RiskType;

interface KpiTile {
  readonly id: string;
  readonly name: string;
  readonly value: number;
  readonly kind: MetricKind;
  readonly decimals: number;
  readonly unit: string;
  readonly level: RiskLevel;
  readonly change: ChangeIndicator;
  readonly spark: readonly number[];
  readonly hint: string;
  readonly route: string;
}

interface BriefChangeRow {
  readonly label: string;
  readonly value: string;
  readonly indicator: ChangeIndicator;
}

const RISK_TYPE_FILTERS: readonly SegmentedOption[] = [
  { value: 'all', label: '全部' },
  ...(Object.keys(RISK_TYPE_LABEL) as RiskType[]).map((type) => ({
    value: type,
    label: RISK_TYPE_LABEL[type],
  })),
];

const HORIZON_OPTIONS: readonly SegmentedOption[] = [
  { value: '30', label: '30 天', hint: '未来 30 天滚动资金缺口' },
  { value: '60', label: '60 天', hint: '未来 60 天滚动资金缺口' },
  { value: '90', label: '90 天', hint: '未来 90 天滚动资金缺口' },
];

const BRAKE_OPTIONS: readonly SegmentedOption[] = BRAKE_ACTIONS.map((meta) => ({
  value: meta.action,
  label: meta.label,
  hint: meta.hint,
}));

/** 环形图配色：按风险类型固定，避免同类型在不同图表里换色。 */
const RISK_TYPE_COLOR: Record<RiskType, string> = {
  inventory: CHART_COLORS.red,
  receivable: CHART_COLORS.amber,
  cash: CHART_COLORS.blue,
  fx: CHART_COLORS.violet,
  logistics: CHART_COLORS.teal,
  policy: CHART_COLORS.slate,
};

@Component({
  selector: 'app-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    WsAmountPipe,
    WsCard,
    WsChart,
    WsDemoNote,
    WsDisclaimer,
    WsDrawer,
    WsEmptyState,
    WsFivePart,
    WsIcon,
    WsKeyValue,
    WsMetricTile,
    WsModal,
    WsNatureBadge,
    WsNumPipe,
    WsPercentPipe,
    WsRiskBadge,
    WsSegmented,
    WsSkeleton,
    WsTrendIndicator,
  ],
  template: `
    <div class="page">
      <div class="meta">
        <ws-icon name="clock" [size]="14" />
        <span>数据截止 {{ snapshot().asOf }}</span>
        <span class="meta__sep">·</span>
        <span>上次刷新 {{ state.lastRefreshedAt() }}</span>
        <span class="meta__sep">·</span>
        <span>未闭环预警 {{ snapshot().openAlertCount | wsNum }} 条</span>
        <span class="meta__sep">·</span>
        <span>高风险预警 {{ snapshot().l4AlertCount | wsNum }} 条</span>
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

      <ws-card
        title="今日 CFO 晨会摘要"
        [subtitle]="'由 Sentinel AI 于 ' + data.brief().generatedAt + ' 生成（第 ' + data.briefVersion() + ' 版）'"
      >
        <ng-template #cardActions>
          <button
            type="button"
            class="ws-btn ws-btn--primary ws-btn--sm"
            [disabled]="data.briefing()"
            (click)="data.generateBrief()"
          >
            <ws-icon name="sparkle" [size]="14" />
            {{ data.briefing() ? '生成中…' : '生成晨会摘要' }}
          </button>
        </ng-template>

        @if (data.briefing()) {
          <div class="brief__loading">
            <ws-skeleton [height]="18" />
            <ws-skeleton [height]="14" width="82%" />
            <ws-skeleton [height]="14" width="66%" />
            <ws-skeleton [height]="96" />
          </div>
        } @else {
          <div class="brief">
            <p class="brief__headline">{{ data.brief().headline }}</p>

            <ol class="brief__risks">
              @for (item of data.brief().topThree; track item.title) {
                <li class="brief__risk">
                  <ws-risk-badge [level]="item.level" />
                  <div class="brief__risk-body">
                    <div class="brief__risk-head">
                      <span class="brief__risk-title">{{ item.title }}</span>
                      <span class="brief__risk-amount">{{ item.amount | wsAmount }}</span>
                    </div>
                    <p class="brief__risk-note">{{ item.note }}</p>
                  </div>
                </li>
              }
            </ol>

            <div class="brief__grid">
              <div class="brief__block">
                <div class="brief__block-title">关键指标变动（较上一交易日）</div>
                <ul class="brief__list">
                  @for (change of briefChanges(); track change.label) {
                    <li class="brief__row">
                      <span class="brief__row-label">{{ change.label }}</span>
                      <span class="brief__row-value">{{ change.value }}</span>
                      <ws-trend [change]="change.indicator" />
                    </li>
                  }
                </ul>
              </div>

              <div class="brief__block">
                <div class="brief__block-title">外部风险信号</div>
                <ul class="brief__list">
                  @for (item of data.brief().external; track item.label) {
                    <li class="brief__row brief__row--stack">
                      <span class="brief__row-label">{{ item.label }}</span>
                      <span class="brief__row-value">{{ item.value }}</span>
                      <span class="brief__row-note">{{ item.note }}</span>
                    </li>
                  }
                </ul>
              </div>

              <div class="brief__block">
                <div class="brief__block-title">今日建议动作</div>
                <ol class="brief__actions">
                  @for (action of data.brief().todaysActions; track action) {
                    <li class="brief__action">{{ action }}</li>
                  }
                </ol>
              </div>
            </div>

            <div class="brief__foot">
              <ws-nature-badge nature="demo" />
              <span class="ws-caption">数据截止 {{ data.brief().dataAsOf }}，全部数值为 Demo 示例数据。</span>
            </div>
          </div>
        }
      </ws-card>

      <div class="tiles">
        @for (kpi of kpiTiles(); track kpi.id) {
          <ws-metric-tile
            [label]="kpi.name"
            [value]="kpi.value"
            [kind]="kpi.kind"
            [decimals]="kpi.decimals"
            [unit]="kpi.unit"
            [level]="kpi.level"
            [change]="kpi.change"
            [spark]="kpi.spark"
            [hint]="kpi.hint"
            [route]="kpi.route"
          />
        }
      </div>

      <div class="charts">
        <ws-card title="现金余额预测与安全线" subtitle="30 / 60 / 90 天滚动预测，含在途回款、采购付款与在途库存（万元）">
          <ng-template #cardActions>
            <ws-segmented
              [value]="state.horizon().toString()"
              [options]="horizonOptions"
              ariaLabel="预测窗口"
              (changed)="onHorizon($event)"
            />
          </ng-template>
          <ws-chart
            [options]="forecastChart()"
            [height]="288"
            [loading]="refreshing()"
            [empty]="data.forecastForHorizon().points.length === 0"
            emptyTitle="暂无预测数据"
          />
          <div class="gaps">
            @for (gap of data.gaps(); track gap.horizon) {
              <div class="gap">
                <div class="gap__head">
                  <span class="gap__horizon">{{ gap.horizon }} 天缺口</span>
                  <ws-risk-badge [level]="gap.level" compact />
                </div>
                <div class="gap__value">{{ gap.amount | wsAmount }}</div>
                <div class="gap__note">{{ gap.note }}</div>
              </div>
            }
          </div>
        </ws-card>

        <ws-card title="风险敞口分布" subtitle="按风险类型汇总的在险金额（万元），风险等级以文字与形状同时表达">
          <ng-template #cardActions>
            <span class="ws-caption">最大单一类型占比 {{ maxExposureShare() | wsPercent : 1 }}</span>
          </ng-template>
          <ws-chart
            [options]="distributionChart()"
            [height]="288"
            [loading]="refreshing()"
            [empty]="data.riskDistribution.length === 0"
            emptyTitle="暂无风险敞口数据"
          />
          <ul class="levels">
            @for (level of riskLevels; track level.level) {
              <li class="levels__row">
                <ws-risk-badge [level]="level.level" />
                <span class="levels__label">{{ level.label }}</span>
                <span class="ws-spacer"></span>
                <span class="ws-caption">{{ level.scoreText }} · {{ level.slaText }}</span>
              </li>
            }
          </ul>
        </ws-card>

        <ws-card title="风险条数 · 国家分布" subtitle="按海外主体所在国统计的风险条数，堆叠展示风险等级构成">
          <ws-chart
            [options]="countryChart()"
            [height]="288"
            [loading]="refreshing()"
            [empty]="data.riskByCountry.length === 0"
            emptyTitle="暂无国家维度数据"
          />
        </ws-card>

        <ws-card title="新增风险趋势" subtitle="近 14 天每日新增风险条数，用于判断风险是否在加速累积">
          <ws-chart
            [options]="trendChart()"
            [height]="288"
            [loading]="refreshing()"
            [empty]="data.riskTrend.length === 0"
            emptyTitle="暂无趋势数据"
          />
        </ws-card>
      </div>

      <ws-card title="Top Risk" subtitle="按影响金额与风险评分排序，点击任一风险卡查看 Sentinel AI 五段式分析">
        <ng-template #cardActions>
          <ws-segmented
            [value]="riskTypeFilter()"
            [options]="typeFilters"
            ariaLabel="风险类型筛选"
            (changed)="onRiskTypeFilter($event)"
          />
        </ng-template>

        @if (filteredRisks().length === 0) {
          <ws-empty-state title="当前筛选条件下暂无风险" description="请切换风险类型筛选，或刷新数据后重试" icon="shield" />
        } @else {
          <div class="risk-grid">
            @for (risk of filteredRisks(); track risk.id) {
              <button type="button" class="risk" (click)="openRisk(risk.id)">
                <div class="risk__head">
                  <ws-risk-badge [level]="risk.level" />
                  <span class="ws-badge ws-badge--plain">{{ riskTypeLabel[risk.type] }}</span>
                  <span class="ws-spacer"></span>
                  <span class="risk__score">{{ risk.score }}</span>
                </div>

                <div class="risk__title">{{ risk.title }}</div>
                <div class="risk__meta">{{ risk.country }} · {{ risk.windowDays }} 天窗口 · {{ risk.id }}</div>

                <div class="risk__amount">
                  <span class="risk__amount-label">影响金额</span>
                  <span class="risk__amount-value">{{ risk.impactAmount | wsAmount }}</span>
                </div>

                <div class="risk__tags">
                  @for (tag of risk.tags; track tag) {
                    <span class="ws-tag">{{ tag }}</span>
                  }
                </div>

                <div class="risk__owner">
                  <ws-icon name="user" [size]="13" />
                  <span>{{ risk.owner }}</span>
                  <span class="ws-spacer"></span>
                  <span>{{ risk.dueDate }} 前</span>
                </div>

                <div class="risk__cta">
                  <ws-icon name="sparkle" [size]="13" />
                  <span>查看 Sentinel AI 分析</span>
                  <ws-icon name="arrow-right" [size]="13" />
                </div>
              </button>
            }
          </div>
        }
      </ws-card>

      <ws-card title="下一步动作" subtitle="按 Demo 演示路径继续下钻到各风险中心">
        <div class="next">
          <button type="button" class="next__item" (click)="goto('/inventory')">
            <ws-icon name="warehouse" [size]="16" />
            <span class="next__title">建议踩刹车清单</span>
            <span class="next__note">暂停 / 减少 / 延后 / 转调拨，逐 SKU 指派责任人</span>
          </button>
          <button type="button" class="next__item" (click)="goto('/receivables')">
            <ws-icon name="users" [size]="16" />
            <span class="next__title">催收优先级</span>
            <span class="next__note">Top 10 高风险客户与预计回款窗口</span>
          </button>
          <button type="button" class="next__item" (click)="goto('/scenario')">
            <ws-icon name="play" [size]="16" />
            <span class="next__title">情景模拟</span>
            <span class="next__note">海运延迟、回款延期、订单下滑对现金缺口的传导</span>
          </button>
          <button type="button" class="next__item" (click)="goto('/assistant')">
            <ws-icon name="sparkle" [size]="16" />
            <span class="next__title">Sentinel AI</span>
            <span class="next__note">追问原因、影响与建议动作</span>
          </button>
        </div>
      </ws-card>

      <ws-disclaimer [text]="demoNotice" />
    </div>

    <ws-drawer
      [open]="detailOpen()"
      [title]="selectedRisk()?.title ?? '风险详情'"
      [subtitle]="selectedRisk()?.id ?? ''"
      [eyebrow]="riskEyebrow()"
      [width]="820"
      (closed)="closeRisk()"
    >
      @if (selectedRisk(); as risk) {
        <div class="detail">
          <div class="detail__head">
            <ws-risk-badge [level]="risk.level" />
            <span class="ws-badge ws-badge--plain">{{ riskTypeLabel[risk.type] }}</span>
            <span class="ws-caption">评分 {{ risk.score }} / 100</span>
          </div>

          <p class="detail__summary">{{ risk.summary }}</p>

          <ws-key-value [items]="riskFacts()" [columns]="2" />

          <ws-five-part [analysis]="risk.analysis" (assignAction)="onSuggest($event)" />

          <div class="detail__links">
            @if (risk.relatedSku) {
              <button type="button" class="ws-btn ws-btn--primary ws-btn--sm" (click)="gotoScenario()">
                <ws-icon name="play" [size]="14" />
                进入情景模拟
              </button>
            }
            <button type="button" class="ws-btn ws-btn--ghost ws-btn--sm" (click)="goto('/inventory')">
              查看库存风险中心
            </button>
            <button type="button" class="ws-btn ws-btn--ghost ws-btn--sm" (click)="goto('/receivables')">
              查看应收风险中心
            </button>
            <button type="button" class="ws-btn ws-btn--ghost ws-btn--sm" (click)="goto('/alerts')">
              查看预警中心
            </button>
          </div>

          <div class="detail__note">
            <ws-nature-badge nature="demo" />
            <span>本页全部数值、证据与建议均为 Demo 示例数据，不代表沃太能源真实经营情况。</span>
          </div>
        </div>
      }

      <ng-template #drawerFoot>
        <span class="ws-caption">处置动作会写入演示会话，可在「建议踩刹车清单」中查看</span>
        <span class="ws-spacer"></span>
        <button type="button" class="ws-btn ws-btn--primary ws-btn--sm" (click)="openAssign()">
          <ws-icon name="target" [size]="14" />
          指派处置动作
        </button>
      </ng-template>
    </ws-drawer>

    <ws-modal
      [open]="assignOpen()"
      title="指派处置动作"
      [subtitle]="selectedRisk()?.title ?? ''"
      [width]="560"
      (closed)="assignOpen.set(false)"
    >
      <div class="assign">
        <div class="assign__field">
          <label class="ws-field__label">处置动作</label>
          <ws-segmented
            [value]="assignAction()"
            [options]="brakeOptions"
            size="md"
            ariaLabel="处置动作"
            (changed)="onPickBrake($event)"
          />
          <span class="ws-caption">{{ selectedBrakeHint() }}</span>
        </div>

        <div class="assign__field">
          <label class="ws-field__label">责任人</label>
          <input
            class="ws-input"
            type="text"
            placeholder="例如：李崇（海外仓运营）"
            [value]="assignOwner()"
            (input)="onOwnerInput($event)"
          />
        </div>

        <div class="assign__field">
          <label class="ws-field__label">截止日期</label>
          <input class="ws-input" type="date" [value]="assignDue()" (input)="onDueInput($event)" />
        </div>

        <div class="assign__field">
          <label class="ws-field__label">处置说明</label>
          <textarea
            class="ws-textarea"
            rows="3"
            placeholder="说明本次处置的口径、范围与验收方式"
            [value]="assignNote()"
            (input)="onNoteInput($event)"
          ></textarea>
        </div>

        <div class="assign__target">
          @if (selectedRisk(); as risk) {
            @if (risk.relatedSku) {
              <span class="ws-caption">关联 SKU：{{ risk.relatedSku }}（确认后写回库存风险中心）</span>
            } @else {
              <span class="ws-caption">该风险未关联具体 SKU，确认后仅记录指派结果。</span>
            }
          }
        </div>
      </div>

      <ng-template #modalFoot>
        <span class="ws-caption">Demo 示例数据 · 此操作不会触发外部系统</span>
        <span class="ws-spacer"></span>
        <button type="button" class="ws-btn ws-btn--ghost ws-btn--sm" (click)="assignOpen.set(false)">
          取消
        </button>
        <button type="button" class="ws-btn ws-btn--primary ws-btn--sm" (click)="confirmAssign()">
          确认指派
        </button>
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

    /* ---------- 晨会摘要 ---------- */

    .brief__loading {
      display: flex;
      flex-direction: column;
      gap: var(--sp-3);
    }

    .brief {
      display: flex;
      flex-direction: column;
      gap: var(--sp-5);
    }

    .brief__headline {
      margin: 0;
      padding: var(--sp-4) var(--sp-5);
      border-left: 3px solid var(--brand-primary);
      border-radius: 0 var(--radius-md) var(--radius-md) 0;
      background: var(--brand-soft);
      font-size: 15px;
      font-weight: 600;
      line-height: 1.7;
      color: var(--brand-ink);
    }

    .brief__risks {
      display: flex;
      flex-direction: column;
      gap: var(--sp-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .brief__risk {
      display: flex;
      align-items: flex-start;
      gap: var(--sp-3);
      padding: var(--sp-3) 0;
      border-top: 1px solid var(--border);
    }

    .brief__risk:first-child {
      border-top: none;
    }

    .brief__risk-body {
      min-width: 0;
      flex: 1;
    }

    .brief__risk-head {
      display: flex;
      align-items: baseline;
      gap: var(--sp-3);
    }

    .brief__risk-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .brief__risk-amount {
      margin-left: auto;
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    .brief__risk-note {
      margin: 4px 0 0;
      font-size: 12px;
      line-height: 1.7;
      color: var(--text-secondary);
    }

    .brief__grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--sp-5);
      padding-top: var(--sp-4);
      border-top: 1px solid var(--border);
    }

    .brief__block:last-child {
      grid-column: 1 / -1;
    }

    .brief__block-title {
      margin-bottom: var(--sp-3);
      font-size: 12px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .brief__list {
      display: flex;
      flex-direction: column;
      gap: var(--sp-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .brief__row {
      display: flex;
      align-items: center;
      gap: var(--sp-3);
      font-size: 12px;
    }

    .brief__row--stack {
      flex-wrap: wrap;
      align-items: baseline;
    }

    .brief__row-label {
      min-width: 88px;
      color: var(--text-secondary);
    }

    .brief__row-value {
      font-weight: 600;
      color: var(--text-primary);
      font-variant-numeric: tabular-nums;
    }

    .brief__row-note {
      flex: 1 1 100%;
      color: var(--text-muted);
      line-height: 1.6;
    }

    .brief__actions {
      display: flex;
      flex-direction: column;
      gap: var(--sp-2);
      margin: 0;
      padding-left: var(--sp-5);
      font-size: 12px;
      line-height: 1.7;
      color: var(--text-secondary);
    }

    .brief__foot {
      display: flex;
      align-items: center;
      gap: var(--sp-3);
      padding-top: var(--sp-3);
      border-top: 1px solid var(--border);
    }

    /* ---------- 指标卡 ---------- */

    .tiles {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: var(--sp-4);
    }

    /* ---------- 图表 ---------- */

    .charts {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--sp-5);
    }

    .gaps {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: var(--sp-3);
      margin-top: var(--sp-4);
      padding-top: var(--sp-4);
      border-top: 1px solid var(--border);
    }

    .gap {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: var(--sp-3);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      background: var(--bg-subtle);
    }

    .gap__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--sp-2);
    }

    .gap__horizon {
      font-size: 11px;
      color: var(--text-secondary);
    }

    .gap__value {
      font-size: 17px;
      font-weight: 600;
      color: var(--brand-ink);
      font-variant-numeric: tabular-nums;
      letter-spacing: -0.01em;
    }

    .gap__note {
      font-size: 11px;
      line-height: 1.6;
      color: var(--text-muted);
    }

    .levels {
      display: flex;
      flex-direction: column;
      gap: var(--sp-2);
      margin: var(--sp-4) 0 0;
      padding: var(--sp-3) 0 0;
      border-top: 1px solid var(--border);
      list-style: none;
    }

    .levels__row {
      display: flex;
      align-items: center;
      gap: var(--sp-3);
    }

    .levels__label {
      font-size: 12px;
      color: var(--text-secondary);
    }

    /* ---------- Top Risk ---------- */

    .risk-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: var(--sp-4);
    }

    .risk {
      display: flex;
      flex-direction: column;
      gap: var(--sp-3);
      padding: var(--sp-4);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      background: var(--bg-surface);
      box-shadow: var(--shadow-xs);
      text-align: left;
      font: inherit;
      cursor: pointer;
      transition:
        border-color 0.16s ease,
        box-shadow 0.16s ease,
        transform 0.16s ease;
    }

    .risk:hover {
      border-color: var(--brand-soft-strong);
      box-shadow: var(--shadow-sm);
      transform: translateY(-1px);
    }

    .risk:focus-visible {
      outline: 2px solid var(--brand-primary);
      outline-offset: 2px;
    }

    .risk__head {
      display: flex;
      align-items: center;
      gap: var(--sp-2);
    }

    .risk__score {
      font-family: var(--font-mono);
      font-size: 16px;
      font-weight: 600;
      color: var(--brand-ink);
      font-variant-numeric: tabular-nums;
    }

    .risk__title {
      font-size: 14px;
      font-weight: 600;
      line-height: 1.5;
      color: var(--text-primary);
    }

    .risk__meta {
      font-size: 11px;
      color: var(--text-muted);
    }

    .risk__amount {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--sp-3);
      padding: var(--sp-3) 0;
      border-top: 1px solid var(--border);
      border-bottom: 1px solid var(--border);
    }

    .risk__amount-label {
      font-size: 11px;
      color: var(--text-secondary);
    }

    .risk__amount-value {
      font-size: 15px;
      font-weight: 600;
      color: var(--brand-ink);
      font-variant-numeric: tabular-nums;
    }

    .risk__tags {
      display: flex;
      flex-wrap: wrap;
      gap: var(--sp-2);
    }

    .risk__owner {
      display: flex;
      align-items: center;
      gap: var(--sp-2);
      font-size: 11px;
      color: var(--text-secondary);
    }

    .risk__owner ws-icon {
      color: var(--text-muted);
    }

    .risk__cta {
      display: flex;
      align-items: center;
      gap: var(--sp-2);
      margin-top: auto;
      padding-top: var(--sp-3);
      border-top: 1px solid var(--border);
      font-size: 12px;
      font-weight: 500;
      color: var(--brand-primary);
    }

    .risk__cta ws-icon:last-child {
      margin-left: auto;
    }

    /* ---------- 下一步 ---------- */

    .next {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: var(--sp-4);
    }

    .next__item {
      display: flex;
      flex-direction: column;
      gap: var(--sp-2);
      padding: var(--sp-4);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      background: var(--bg-surface);
      text-align: left;
      font: inherit;
      cursor: pointer;
      transition:
        border-color 0.16s ease,
        background 0.16s ease;
    }

    .next__item:hover {
      border-color: var(--brand-soft-strong);
      background: var(--brand-soft);
    }

    .next__item ws-icon {
      color: var(--brand-primary);
    }

    .next__title {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .next__note {
      font-size: 11px;
      line-height: 1.6;
      color: var(--text-secondary);
    }

    /* ---------- 抽屉 / 弹窗 ---------- */

    .detail {
      display: flex;
      flex-direction: column;
      gap: var(--sp-5);
    }

    .detail__head {
      display: flex;
      align-items: center;
      gap: var(--sp-3);
    }

    .detail__summary {
      margin: 0;
      font-size: 13px;
      line-height: 1.8;
      color: var(--text-secondary);
    }

    .detail__links {
      display: flex;
      flex-wrap: wrap;
      gap: var(--sp-2);
      padding-top: var(--sp-4);
      border-top: 1px solid var(--border);
    }

    .detail__note {
      display: flex;
      align-items: center;
      gap: var(--sp-3);
      padding: var(--sp-3) var(--sp-4);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      background: var(--bg-subtle);
      font-size: 11px;
      line-height: 1.7;
      color: var(--text-secondary);
    }

    .assign {
      display: flex;
      flex-direction: column;
      gap: var(--sp-4);
    }

    .assign__field {
      display: flex;
      flex-direction: column;
      gap: var(--sp-2);
    }

    .assign__target {
      padding-top: var(--sp-2);
      border-top: 1px solid var(--border);
    }

    /* ---------- 响应式 ---------- */

    @media (max-width: 1680px) {
      .tiles {
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }
    }

    @media (max-width: 1366px) {
      .tiles {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }

      .risk-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .next {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media (max-width: 1180px) {
      .charts {
        grid-template-columns: minmax(0, 1fr);
      }

      .brief__grid {
        grid-template-columns: minmax(0, 1fr);
      }
    }

    @media (max-width: 900px) {
      .tiles {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .risk-grid {
        grid-template-columns: minmax(0, 1fr);
      }

      .gaps {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
})
export class DashboardPage {
  protected readonly data = inject(SentinelDataService);
  protected readonly state = inject(StateService);
  private readonly router = inject(Router);

  protected readonly snapshot = this.data.dashboardSnapshot;
  protected readonly riskLevels = RISK_LEVELS;
  protected readonly riskTypeLabel = RISK_TYPE_LABEL;
  protected readonly demoNotice = DEMO_DATA_NOTICE;
  protected readonly typeFilters = RISK_TYPE_FILTERS;
  protected readonly horizonOptions = HORIZON_OPTIONS;
  protected readonly brakeOptions = BRAKE_OPTIONS;
  protected readonly refreshing = signal(false);

  protected readonly riskTypeFilter = signal<RiskTypeFilter>('all');
  protected readonly selectedRiskId = signal<string | null>(null);
  protected readonly detailOpen = signal(false);
  protected readonly assignOpen = signal(false);
  protected readonly assignAction = signal<BrakeAction>('pause');
  protected readonly assignOwner = signal('');
  protected readonly assignDue = signal('');
  protected readonly assignNote = signal('');

  protected readonly kpiTiles = computed<readonly KpiTile[]>(() =>
    this.data.kpis.map((kpi) => {
      const isPercent = kpi.unit === '%';
      const isAmount = kpi.unit === '万元';
      return {
        id: kpi.id,
        name: kpi.name,
        value: isPercent ? kpi.value / 100 : kpi.value,
        kind: isPercent ? 'percent' : isAmount ? 'amount' : 'num',
        decimals: isPercent && !Number.isInteger(kpi.value) ? 1 : 0,
        unit: isPercent || isAmount ? '' : kpi.unit,
        level: kpi.level,
        change: kpi.change,
        spark: kpi.trend,
        hint: `${kpi.definition} ｜ ${kpi.thresholdHint}`,
        route: kpi.route,
      };
    }),
  );

  protected readonly briefChanges = computed<readonly BriefChangeRow[]>(() =>
    this.data.brief().changes.map((change) => ({
      label: change.label,
      value: change.value,
      indicator: {
        direction: change.direction,
        text: change.delta,
        favorable: change.favorable,
      },
    })),
  );

  protected readonly filteredRisks = computed<readonly TopRisk[]>(() => {
    const filter = this.riskTypeFilter();
    const risks = this.data.topRisks;
    return filter === 'all' ? risks : risks.filter((risk) => risk.type === filter);
  });

  protected readonly selectedRisk = computed<TopRisk | null>(() => {
    const id = this.selectedRiskId();
    return id ? (this.data.getTopRisk(id) ?? null) : null;
  });

  protected readonly riskEyebrow = computed(() => {
    const risk = this.selectedRisk();
    return risk ? `${risk.country} · ${RISK_TYPE_LABEL[risk.type]} · ${risk.windowDays} 天窗口` : '';
  });

  protected readonly riskFacts = computed<readonly KeyValueItem[]>(() => {
    const risk = this.selectedRisk();
    if (!risk) {
      return [];
    }
    const meta = riskLevelMeta(risk.level);
    return [
      { label: '影响金额', value: `${wan(risk.impactAmount)} 万元`, tone: 'red' },
      { label: '时间窗口', value: `${risk.windowDays} 天` },
      { label: '风险评分', value: `${risk.score} 分（${meta.scoreText}）` },
      { label: '响应要求', value: meta.slaText },
      { label: '责任部门 / 责任人', value: risk.owner },
      { label: '处置截止', value: risk.dueDate },
      { label: '国家 / 地区', value: `${risk.country}（${risk.countryCode}）` },
      { label: '关联主体', value: risk.relatedSku ?? risk.relatedCustomer ?? '组合风险（多主体）' },
    ];
  });

  protected readonly selectedBrakeHint = computed(() => brakeActionMeta(this.assignAction()).hint);

  protected readonly maxExposureShare = computed(() => {
    const items = this.data.riskDistribution;
    const total = items.reduce((sum, item) => sum + item.amount, 0);
    if (total === 0) {
      return 0;
    }
    return Math.max(...items.map((item) => item.amount)) / total;
  });

  protected readonly forecastChart = computed<EChartsOption>(() => {
    const forecast = this.data.forecastForHorizon();
    return {
      tooltip: tooltipConfig('axis'),
      legend: legendConfig({ top: 0, right: 0 }),
      grid: gridConfig({ top: 40, bottom: 4 }),
      xAxis: categoryAxis(forecast.points.map((point) => shortDay(point.date))),
      yAxis: valueAxis({ name: '万元', decimals: 0 }),
      series: [
        areaSeries(
          '预计现金余额',
          forecast.points.map((point) => point.balance),
          { color: CHART_COLORS.blue },
        ),
        lineSeries(
          '现金安全线',
          forecast.points.map((point) => point.safeLine),
          { color: CHART_COLORS.slate, dashed: true },
        ),
      ],
    };
  });

  protected readonly distributionChart = computed<EChartsOption>(() => {
    const items = this.data.riskDistribution;
    const total = items.reduce((sum, item) => sum + item.amount, 0);
    return {
      tooltip: tooltipConfig('item'),
      graphic: donutCenterLabel(`${wan(total)}`, '风险敞口（万元）'),
      legend: legendConfig({ top: 0, right: 0 }),
      series: [
        pieSeries(
          '风险敞口',
          items.map((item) => ({
            name: RISK_TYPE_LABEL[item.type],
            value: item.amount,
            color: RISK_TYPE_COLOR[item.type],
          })),
        ),
      ],
    };
  });

  protected readonly countryChart = computed<EChartsOption>(() => {
    const rows = this.data.riskByCountry;
    return {
      tooltip: tooltipConfig('axis'),
      legend: legendConfig({ top: 0, right: 0 }),
      grid: gridConfig({ top: 40, bottom: 4 }),
      xAxis: categoryAxis(rows.map((row) => row.countryCode)),
      yAxis: valueAxis({ name: '风险条数', decimals: 0, interval: 1 }),
      series: [
        barSeries(
          '高风险',
          rows.map((row) => row.L4),
          { color: CHART_COLORS.red, stack: 'risk' },
        ),
        barSeries(
          '中风险',
          rows.map((row) => row.L3),
          { color: CHART_COLORS.amber, stack: 'risk' },
        ),
        barSeries(
          '关注',
          rows.map((row) => row.L2),
          { color: CHART_COLORS.violet, stack: 'risk' },
        ),
        barSeries(
          '正常',
          rows.map((row) => row.L1),
          { color: CHART_COLORS.teal, stack: 'risk' },
        ),
      ],
    };
  });

  protected readonly trendChart = computed<EChartsOption>(() => ({
    tooltip: tooltipConfig('axis'),
    grid: gridConfig({ top: 24, bottom: 4 }),
    xAxis: categoryAxis(
      this.data.riskTrend.map((point) => point.label),
      { boundaryGap: false },
    ),
    yAxis: valueAxis({ name: '条', decimals: 0 }),
    series: [
      areaSeries(
        '新增风险条数',
        this.data.riskTrend.map((point) => point.value),
        { color: CHART_COLORS.blue },
      ),
    ],
  }));

  protected refreshData(): void {
    if (this.refreshing()) {
      return;
    }
    this.refreshing.set(true);
    this.state.refresh();
    window.setTimeout(() => this.refreshing.set(false), 520);
  }

  protected onHorizon(value: string): void {
    this.state.setHorizon(Number(value) as ForecastHorizon);
  }

  protected onRiskTypeFilter(value: string): void {
    this.riskTypeFilter.set(value as RiskTypeFilter);
  }

  protected openRisk(id: string): void {
    this.selectedRiskId.set(id);
    this.detailOpen.set(true);
  }

  protected closeRisk(): void {
    this.detailOpen.set(false);
  }

  protected openAssign(): void {
    const risk = this.selectedRisk();
    if (!risk) {
      this.state.pushToast('请先选择一条风险再指派动作', 'warn');
      return;
    }
    this.assignOwner.set(risk.owner);
    this.assignDue.set(risk.dueDate);
    this.assignOpen.set(true);
  }

  protected onSuggest(action: SuggestedAction): void {
    this.assignAction.set(action.actionType);
    this.assignOwner.set(action.owner);
    this.assignDue.set(action.dueDate);
    this.assignNote.set(action.text);
    this.assignOpen.set(true);
  }

  protected onPickBrake(value: string): void {
    this.assignAction.set(value as BrakeAction);
  }

  protected onOwnerInput(event: Event): void {
    this.assignOwner.set((event.target as HTMLInputElement).value);
  }

  protected onDueInput(event: Event): void {
    this.assignDue.set((event.target as HTMLInputElement).value);
  }

  protected onNoteInput(event: Event): void {
    this.assignNote.set((event.target as HTMLTextAreaElement).value);
  }

  protected goto(route: string): void {
    this.detailOpen.set(false);
    void this.router.navigate([route]);
  }

  protected gotoScenario(): void {
    const code = this.selectedRisk()?.relatedSku;
    if (!code) {
      return;
    }
    const sku = this.data.getSku(code);
    if (!sku) {
      return;
    }
    this.state.setFocusSkus([sku.id]);
    this.detailOpen.set(false);
    void this.router.navigate(['/scenario']);
  }

  protected confirmAssign(): void {
    const owner = this.assignOwner().trim();
    const dueDate = this.assignDue();
    if (!owner || !dueDate) {
      this.state.pushToast('请填写责任人与截止日期', 'warn');
      return;
    }
    const code = this.selectedRisk()?.relatedSku;
    const sku = code ? this.data.getSku(code) : undefined;
    if (sku) {
      this.data.assignAction({
        skuId: sku.id,
        action: this.assignAction(),
        owner,
        dueDate,
        note: this.assignNote(),
      });
    } else {
      this.state.pushToast('已记录处置动作（该风险未关联具体 SKU，仅记录指派）', 'success');
    }
    this.assignOpen.set(false);
  }
}
