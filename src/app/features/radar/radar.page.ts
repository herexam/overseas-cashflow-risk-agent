import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { EChartsOption } from 'echarts';

import { riskLevelMeta } from '../../core/models';
import type {
  ExternalRiskItem,
  FxRateSeries,
  RiskLevel,
  ShippingLane,
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
  WsRiskBadge,
  WsSegmented,
  WsSignedPipe,
  WsSortHeader,
  WsSparkline,
  WsTabs,
  WsTrendIndicator,
  areaSeries,
  barSeries,
  categoryAxis,
  emptyChartOption,
  gridConfig,
  horizontalValueAxis,
  legendConfig,
  lineSeries,
  tooltipConfig,
  valueAxis,
} from '../../shared/ui';
import type { KeyValueItem, SegmentedOption, SortChange, TabItem } from '../../shared/ui';

type RadarTab = 'fx' | 'shipping' | 'policy' | 'material' | 'summary';

type LaneSortKey = 'lane' | 'rate' | 'changePct' | 'transitDays' | 'bookingDifficulty' | 'level';

type MaterialSortKey = 'title' | 'level' | 'impactAmount';

const LANE_PAGE_SIZE = 10;

const LEVEL_OPTIONS: readonly SegmentedOption[] = [
  { value: 'all', label: '全部等级' },
  { value: 'L4', label: 'L4' },
  { value: 'L3', label: 'L3' },
  { value: 'L2', label: 'L2' },
  { value: 'L1', label: 'L1' },
];

const LEVEL_WEIGHT: Record<RiskLevel, number> = { L4: 4, L3: 3, L2: 2, L1: 1 };

const POLICY_ANALYSIS_NOTE =
  '政策风险的五段式分析引用预警中心「美国储能产品关税调整预期」案例口径（Demo 示例数据），用于演示外部政策信号如何转化为内部处置动作。';

@Component({
  selector: 'app-radar-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    WsAmountPipe,
    WsBadge,
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
    WsRiskBadge,
    WsSegmented,
    WsSignedPipe,
    WsSortHeader,
    WsSparkline,
    WsTabs,
    WsTrendIndicator,
  ],
  template: `
    <div class="page">
      <div class="meta">
        <ws-icon name="globe" [size]="14" />
        <span>数据截止 {{ page().asOf }}</span>
        <span class="meta__sep">·</span>
        <span>币种信号 {{ page().fxRates.length }} 项</span>
        <span class="meta__sep">·</span>
        <span>航线 {{ page().shippingLanes.length }} 条</span>
        <span class="meta__sep">·</span>
        <span>政策风险 {{ page().policyRisks.length }} 项</span>
        <span class="ws-spacer"></span>
        <ws-demo-note />
      </div>

      <ws-disclaimer [text]="caveat" />

      <div class="tiles">
        <ws-metric-tile
          label="汇率信号"
          [value]="fxSignalCount()"
          unit="项"
          level="L3"
          hint="近 90 天波动触及 L3 及以上的币种数"
        />
        <ws-metric-tile
          label="WCI 运价指数"
          [value]="page().shippingIndex.value"
          [decimals]="0"
          level="L3"
          hint="全球集装箱运价综合指数（Demo 口径）"
        />
        <ws-metric-tile
          label="最长航线时效"
          [value]="maxTransit()"
          unit="天"
          level="L3"
          hint="当前主要航线平均时效最大值"
        />
        <ws-metric-tile
          label="政策风险影响金额"
          [value]="policyImpact()"
          kind="amount"
          level="L4"
          hint="贸易政策类风险涉及影响金额合计"
        />
        <ws-metric-tile
          label="原材料价格信号"
          [value]="page().rawMaterials.length"
          unit="项"
          level="L3"
          hint="电池级碳酸锂、正极材料、电芯、结构件"
        />
        <ws-metric-tile
          label="外部风险影响合计"
          [value]="externalImpact()"
          kind="amount"
          level="L4"
          hint="外部风险清单影响金额合计"
        />
      </div>

      <ws-tabs [tabs]="tabs()" [active]="tab()" (changed)="onTab($event)" />

      @switch (tab()) {
        @case ('fx') {
          <section class="stack">
            <ws-card title="汇率走势与外币敞口信号" subtitle="Demo 模拟数据 · 近 90 天 CNY 报价">
              <ng-template #cardActions>
                <ws-segmented
                  [value]="fxWindow()"
                  [options]="windowOptions"
                  ariaLabel="汇率窗口"
                  (changed)="fxWindow.set($event)"
                />
              </ng-template>
              <ws-chart [options]="fxChart()" [height]="300" [empty]="page().fxRates.length === 0" />
            </ws-card>

            <div class="cards">
              @for (rate of page().fxRates; track rate.pair) {
                <article
                  class="fx"
                  [class.fx--active]="rate.pair === activePair()"
                  (click)="activePair.set(rate.pair)"
                >
                  <header class="fx__head">
                    <div class="fx__pair">
                      <span class="fx__pair-name">{{ rate.pair }}</span>
                      <ws-risk-badge [level]="rate.level" [compact]="true" />
                    </div>
                    <ws-nature-badge [nature]="rate.nature" />
                  </header>
                  <div class="fx__value">{{ rate.current | wsNum: 4 }}</div>
                  <div class="fx__change">
                    <ws-trend [change]="fxChange(rate)" />
                    <span class="ws-caption">较上一交易日</span>
                  </div>
                  <ws-sparkline [data]="sparkOf(rate)" [height]="34" [width]="190" />
                  <ws-key-value [items]="fxFacts(rate)" [columns]="2" />
                  <p class="fx__note">{{ rate.note }}</p>
                </article>
              }
            </div>

            <ws-card title="外币敞口提示" subtitle="Demo 示例数据 · 与现金流与外汇页口径一致">
              <div class="notice">
                <ws-icon name="info" [size]="14" />
                <span>
                  本页汇率信号仅表示<strong>外部行情自身的剧烈程度</strong>，与「现金流与外汇」页的外币敞口风险等级口径不同：
                  同一币种在本页与现金流页可能落在不同等级，因为敞口等级还取决于未到期合同金额、收付款币种结构与自然对冲比例。
                </span>
              </div>
            </ws-card>
          </section>
        }

        @case ('shipping') {
          <section class="stack">
            <div class="charts">
              <ws-card
                [title]="page().shippingIndex.code + ' 运价指数'"
                [subtitle]="page().shippingIndex.name"
              >
                <div class="big">
                  <span class="big__value">{{ page().shippingIndex.value | wsNum }}</span>
                  <ws-trend [change]="indexChange()" />
                </div>
                <ws-chart [options]="wciChart()" [height]="240" />
                <p class="ws-caption">{{ page().shippingIndex.note }}</p>
              </ws-card>

              <ws-card title="港口拥堵" subtitle="Demo 模拟数据 · 平均等待小时">
                <ws-chart [options]="portChart()" [height]="240" [empty]="page().portCongestion.length === 0" />
              </ws-card>
            </div>

            <ws-card flush title="主要航线运价与时效" subtitle="Demo 模拟数据 · 点击行查看运价走势">
              <div class="board">
                <div class="toolbar">
                  <ws-segmented
                    [value]="laneLevel()"
                    [options]="levelOptions"
                    ariaLabel="航线等级筛选"
                    (changed)="laneLevel.set($event)"
                  />
                  <span class="ws-spacer"></span>
                  <span class="ws-caption">共 {{ filteredLanes().length }} 条</span>
                </div>

                @if (filteredLanes().length === 0) {
                  <div class="board__empty">
                    <ws-empty-state
                      title="没有符合条件的航线"
                      description="放宽等级条件后可查看全部航线运价与时效数据。"
                      icon="ship"
                    >
                      <button type="button" class="ws-btn ws-btn--sm" (click)="laneLevel.set('all')">
                        重置筛选
                      </button>
                    </ws-empty-state>
                  </div>
                } @else {
                  <div class="ws-table-wrap">
                    <div class="ws-table-scroll">
                      <table class="ws-table table--lanes">
                        <thead>
                          <tr>
                            <th wsSort="lane" [activeKey]="laneSort()" [direction]="laneDir()" (sorted)="onLaneSort($event)">
                              航线
                            </th>
                            <th
                              class="is-numeric"
                              wsSort="rate"
                              [activeKey]="laneSort()"
                              [direction]="laneDir()"
                              (sorted)="onLaneSort($event)"
                            >
                              运价（USD / 40ft）
                            </th>
                            <th
                              class="is-numeric"
                              wsSort="changePct"
                              [activeKey]="laneSort()"
                              [direction]="laneDir()"
                              (sorted)="onLaneSort($event)"
                            >
                              环比
                            </th>
                            <th
                              class="is-numeric"
                              wsSort="transitDays"
                              [activeKey]="laneSort()"
                              [direction]="laneDir()"
                              (sorted)="onLaneSort($event)"
                            >
                              平均时效
                            </th>
                            <th class="is-numeric">时效变化</th>
                            <th
                              class="is-numeric"
                              wsSort="bookingDifficulty"
                              [activeKey]="laneSort()"
                              [direction]="laneDir()"
                              (sorted)="onLaneSort($event)"
                            >
                              订舱难度
                            </th>
                            <th wsSort="level" [activeKey]="laneSort()" [direction]="laneDir()" (sorted)="onLaneSort($event)">
                              等级
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          @for (lane of pagedLanes(); track lane.lane) {
                            <tr class="row--clickable" (click)="openLane(lane)">
                              <td class="cell-lane">{{ lane.lane }}</td>
                              <td class="is-numeric">{{ lane.rate | wsNum }}</td>
                              <td class="is-numeric" [class]="changeClass(lane.changePct)">
                                {{ lane.changePct | wsSigned }}%
                              </td>
                              <td class="is-numeric">{{ lane.transitDays }} 天</td>
                              <td class="is-numeric" [class]="changeClass(lane.transitChangeDays)">
                                {{ lane.transitChangeDays | wsSigned }} 天
                              </td>
                              <td class="is-numeric">{{ lane.bookingDifficulty }} / 100</td>
                              <td><ws-risk-badge [level]="lane.level" [compact]="true" /></td>
                            </tr>
                          }
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div class="ws-table__footer">
                    <span class="ws-caption">第 {{ lanePage() }} / {{ lanePageCount() }} 页</span>
                    <span class="ws-spacer"></span>
                    <div class="ws-pager">
                      <button
                        type="button"
                        class="ws-btn ws-btn--sm"
                        [disabled]="lanePage() === 1"
                        (click)="goLanePage(lanePage() - 1)"
                      >
                        上一页
                      </button>
                      <button
                        type="button"
                        class="ws-btn ws-btn--sm"
                        [disabled]="lanePage() === lanePageCount()"
                        (click)="goLanePage(lanePage() + 1)"
                      >
                        下一页
                      </button>
                    </div>
                  </div>
                }
              </div>
            </ws-card>
          </section>
        }

        @case ('policy') {
          <section class="stack">
            <ws-card title="贸易政策风险" subtitle="Demo 模拟数据 · 概率与影响金额为假设参数">
              <div class="policy">
                @for (risk of page().policyRisks; track risk.id) {
                  <article class="policy__item">
                    <header class="policy__head">
                      <div class="policy__title">
                        <ws-risk-badge [level]="risk.level" [compact]="true" />
                        <span>{{ risk.title }}</span>
                      </div>
                      <ws-nature-badge [nature]="risk.nature" />
                    </header>
                    <ws-key-value [items]="policyFacts(risk)" [columns]="4" />
                    <p class="policy__note">{{ risk.note }}</p>
                    <div class="policy__tags">
                      @for (country of risk.affectedCountries; track country) {
                        <span class="ws-tag">{{ country }}</span>
                      }
                    </div>
                  </article>
                }
              </div>
            </ws-card>

            <ws-card title="政策风险对外的影响路径" subtitle="Demo 示例数据">
              <p class="ws-caption">{{ policyAnalysisNote }}</p>
              <ws-five-part [analysis]="policyAnalysis()" (assignAction)="onAssign($event)" />
            </ws-card>
          </section>
        }

        @case ('material') {
          <section class="stack">
            <ws-card title="原材料价格信号" subtitle="Demo 模拟数据 · 归一化走势（首日 = 100）">
              <ws-chart [options]="materialChart()" [height]="300" [empty]="page().rawMaterials.length === 0" />
            </ws-card>

            <div class="cards cards--four">
              @for (item of page().rawMaterials; track item.name) {
                <article class="mat">
                  <header class="mat__head">
                    <span class="mat__name">{{ item.name }}</span>
                    <ws-risk-badge [level]="item.level" [compact]="true" />
                  </header>
                  <div class="mat__value">{{ item.price | wsNum: 3 }}<span class="mat__unit">{{ item.unit }}</span></div>
                  <ws-trend [change]="materialChange(item.changePct)" />
                  <ws-sparkline [data]="sparkOfSeries(item.series)" [height]="30" [width]="180" />
                  <ws-nature-badge [nature]="item.nature" />
                </article>
              }
            </div>
          </section>
        }

        @case ('summary') {
          <section class="stack">
            <ws-card flush title="外部风险清单" subtitle="Demo 模拟数据 · 支持筛选、搜索与排序">
              <div class="board">
                <div class="toolbar">
                  <ws-segmented
                    [value]="riskCategory()"
                    [options]="categoryOptions"
                    ariaLabel="风险类别筛选"
                    (changed)="riskCategory.set($event)"
                  />
                  <ws-segmented
                    [value]="riskLevel()"
                    [options]="levelOptions"
                    ariaLabel="风险等级筛选"
                    (changed)="riskLevel.set($event)"
                  />
                  <input
                    class="ws-search"
                    type="search"
                    placeholder="搜索风险标题 / 指标"
                    [value]="riskKeyword()"
                    (input)="onRiskKeyword($event)"
                  />
                  <span class="ws-spacer"></span>
                  <span class="ws-caption">共 {{ filteredRisks().length }} 条</span>
                  @if (riskFiltersActive()) {
                    <button type="button" class="ws-btn ws-btn--ghost ws-btn--sm" (click)="resetRiskFilters()">
                      <ws-icon name="refresh" [size]="13" />
                      <span>重置筛选</span>
                    </button>
                  }
                </div>

                @if (filteredRisks().length === 0) {
                  <div class="board__empty">
                    <ws-empty-state
                      title="没有符合条件的外部风险"
                      description="当前筛选条件下没有匹配记录，可放宽类别、等级或关键词条件。"
                      icon="filter"
                    >
                      <button type="button" class="ws-btn ws-btn--sm" (click)="resetRiskFilters()">重置筛选</button>
                    </ws-empty-state>
                  </div>
                } @else {
                  <div class="ws-table-wrap">
                    <div class="ws-table-scroll">
                      <table class="ws-table table--risks">
                        <thead>
                          <tr>
                            <th wsSort="title" [activeKey]="riskSort()" [direction]="riskDir()" (sorted)="onRiskSort($event)">
                              风险标题
                            </th>
                            <th>类别</th>
                            <th wsSort="level" [activeKey]="riskSort()" [direction]="riskDir()" (sorted)="onRiskSort($event)">
                              等级
                            </th>
                            <th>关键指标</th>
                            <th>变化</th>
                            <th
                              class="is-numeric"
                              wsSort="impactAmount"
                              [activeKey]="riskSort()"
                              [direction]="riskDir()"
                              (sorted)="onRiskSort($event)"
                            >
                              影响金额
                            </th>
                            <th>说明</th>
                          </tr>
                        </thead>
                        <tbody>
                          @for (risk of filteredRisks(); track risk.id) {
                            <tr>
                              <td class="cell-title">{{ risk.title }}</td>
                              <td><ws-badge tone="plain">{{ risk.category }}</ws-badge></td>
                              <td><ws-risk-badge [level]="risk.level" [compact]="true" /></td>
                              <td class="cell-metric">{{ risk.metric }}</td>
                              <td class="cell-change">{{ risk.change }}</td>
                              <td class="is-numeric">{{ risk.impactAmount | wsAmount }}</td>
                              <td class="cell-note">{{ risk.note }}</td>
                            </tr>
                          }
                        </tbody>
                      </table>
                    </div>
                  </div>
                }
              </div>
            </ws-card>
          </section>
        }
      }
    </div>

    <ws-drawer
      [open]="drawerOpen()"
      [title]="selectedLane()?.lane ?? ''"
      [subtitle]="laneSubtitle()"
      eyebrow="航线运价与时效"
      [width]="640"
      (closed)="closeLane()"
    >
      @if (selectedLane(); as lane) {
        <div class="detail">
          <ws-key-value [items]="laneFacts(lane)" [columns]="2" />
          <ws-chart [options]="laneChart()" [height]="260" />
          <p class="ws-caption">{{ lane.note }}</p>
          <div class="detail__note">
            <ws-nature-badge [nature]="lane.nature" />
            <span>
              航线运价、时效与订舱难度均为 Demo 示例数据，采用固定种子的模拟序列，不代表任何真实承运人报价。
            </span>
          </div>
        </div>
      }
      <ng-template #drawerFoot>
        <span class="ws-caption">外部信号用于解释内部指标变化，不作为独立决策依据（Demo 演示）</span>
        <span class="ws-spacer"></span>
        <button type="button" class="ws-btn" (click)="closeLane()">关闭</button>
      </ng-template>
    </ws-drawer>

    <ws-modal
      [open]="assignOpen()"
      [title]="'外部风险处置 · ' + (assignSourceTitle() || '政策风险')"
      subtitle="外部信号触发的动作建议（Demo 仅保存在浏览器内存）"
      [width]="540"
      (closed)="assignOpen.set(false)"
    >
      <div class="form">
        <ws-key-value [items]="assignFacts()" [columns]="1" />
        <p class="ws-caption">
          外部风险无法由企业直接消除，此处记录的是企业侧的应对动作（如提前锁定运价、调整交付节奏、评估区域调拨），
          并同步到库存与应收处置流程。
        </p>
      </div>
      <ng-template #modalFoot>
        <span class="ws-caption">Demo 演示：指派结果不会回写真实业务系统</span>
        <span class="ws-spacer"></span>
        <button type="button" class="ws-btn" (click)="assignOpen.set(false)">关闭</button>
        <button type="button" class="ws-btn ws-btn--primary" (click)="confirmAssign()">确认记录</button>
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

    .stack {
      display: flex;
      flex-direction: column;
      gap: var(--sp-5);
    }

    .charts {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--sp-5);
    }

    .cards {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: var(--sp-4);
    }

    .cards--four {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    .notice {
      display: flex;
      align-items: flex-start;
      gap: var(--sp-3);
      font-size: 12px;
      line-height: 1.7;
      color: var(--text-secondary);
    }

    .notice ws-icon {
      margin-top: 2px;
      color: var(--brand-primary);
    }

    /* ---------- 汇率卡 ---------- */

    .fx {
      display: flex;
      flex-direction: column;
      gap: var(--sp-3);
      padding: var(--sp-5);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      background: var(--bg-surface);
      box-shadow: var(--shadow-xs);
      cursor: pointer;
      transition: border-color 0.16s ease-out, box-shadow 0.16s ease-out;
    }

    .fx:hover {
      border-color: var(--border-strong);
    }

    .fx--active {
      border-color: var(--brand-primary);
      box-shadow: 0 0 0 1px var(--brand-soft);
    }

    .fx__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--sp-3);
    }

    .fx__pair {
      display: flex;
      align-items: center;
      gap: var(--sp-2);
    }

    .fx__pair-name {
      font-family: var(--font-mono);
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .fx__value {
      font-size: 26px;
      font-weight: 600;
      color: var(--text-primary);
      font-variant-numeric: tabular-nums;
      letter-spacing: -0.01em;
    }

    .fx__change {
      display: flex;
      align-items: center;
      gap: var(--sp-2);
    }

    .fx__note {
      margin: 0;
      font-size: 11px;
      line-height: 1.6;
      color: var(--text-muted);
    }

    /* ---------- 大数字 ---------- */

    .big {
      display: flex;
      align-items: baseline;
      gap: var(--sp-3);
      margin-bottom: var(--sp-2);
    }

    .big__value {
      font-size: 30px;
      font-weight: 600;
      color: var(--text-primary);
      font-variant-numeric: tabular-nums;
      letter-spacing: -0.01em;
    }

    /* ---------- 表格板 ---------- */

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
      align-items: center;
      gap: var(--sp-3);
    }

    .toolbar .ws-search {
      min-width: 240px;
    }

    .table--lanes {
      min-width: 1040px;
    }

    .table--risks {
      min-width: 1180px;
    }

    .row--clickable {
      cursor: pointer;
    }

    .cell-lane {
      white-space: nowrap;
      font-weight: 500;
      color: var(--text-primary);
    }

    .cell-title {
      min-width: 240px;
      color: var(--text-primary);
    }

    .cell-metric {
      font-family: var(--font-mono);
      font-size: 12px;
      color: var(--text-secondary);
      white-space: nowrap;
    }

    .cell-change {
      white-space: nowrap;
      font-size: 12px;
      color: var(--text-secondary);
    }

    .cell-note {
      min-width: 260px;
      font-size: 12px;
      color: var(--text-muted);
    }

    /* ---------- 政策 ---------- */

    .policy {
      display: flex;
      flex-direction: column;
      gap: var(--sp-4);
    }

    .policy__item {
      display: flex;
      flex-direction: column;
      gap: var(--sp-3);
      padding: var(--sp-4) var(--sp-5);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      background: var(--bg-subtle);
    }

    .policy__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--sp-3);
    }

    .policy__title {
      display: flex;
      align-items: center;
      gap: var(--sp-3);
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .policy__note {
      margin: 0;
      font-size: 12px;
      line-height: 1.7;
      color: var(--text-secondary);
    }

    .policy__tags {
      display: flex;
      flex-wrap: wrap;
      gap: var(--sp-2);
    }

    /* ---------- 原材料 ---------- */

    .mat {
      display: flex;
      flex-direction: column;
      gap: var(--sp-3);
      padding: var(--sp-5);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      background: var(--bg-surface);
      box-shadow: var(--shadow-xs);
    }

    .mat__head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--sp-3);
    }

    .mat__name {
      font-size: 13px;
      font-weight: 600;
      line-height: 1.5;
      color: var(--text-primary);
    }

    .mat__value {
      font-size: 22px;
      font-weight: 600;
      color: var(--text-primary);
      font-variant-numeric: tabular-nums;
    }

    .mat__unit {
      margin-left: 4px;
      font-size: 12px;
      font-weight: 500;
      color: var(--text-muted);
    }

    /* ---------- 抽屉 / 弹窗 ---------- */

    .detail {
      display: flex;
      flex-direction: column;
      gap: var(--sp-5);
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

    .form {
      display: flex;
      flex-direction: column;
      gap: var(--sp-4);
    }

    @media (max-width: 1680px) {
      .tiles {
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }

      .cards--four {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media (max-width: 1366px) {
      .tiles {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }

      .charts,
      .cards {
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
export class RadarPage {
  protected readonly data = inject(SentinelDataService);
  protected readonly state = inject(StateService);
  private readonly router = inject(Router);

  protected readonly page = computed(() => this.data.radarPage);
  protected readonly levelOptions = LEVEL_OPTIONS;
  protected readonly windowOptions: readonly SegmentedOption[] = [
    { value: '30', label: '近 30 天' },
    { value: '60', label: '近 60 天' },
    { value: '90', label: '近 90 天' },
  ];
  protected readonly categoryOptions: readonly SegmentedOption[] = [
    { value: 'all', label: '全部类别' },
    { value: '汇率', label: '汇率' },
    { value: '海运', label: '海运' },
    { value: '政策', label: '政策' },
    { value: '原材料', label: '原材料' },
  ];
  protected readonly caveat =
    '本页汇率、运价、港口拥堵、贸易政策与原材料价格全部为 Demo 模拟数据，由固定种子的伪随机序列推导，仅用于产品演示，不代表真实行情，也不构成任何经营或投资建议。';
  protected readonly policyAnalysisNote = POLICY_ANALYSIS_NOTE;

  protected readonly tab = signal<RadarTab>('fx');
  protected readonly activePair = signal('EUR/CNY');
  protected readonly fxWindow = signal('90');

  protected readonly laneLevel = signal('all');
  protected readonly laneSort = signal<LaneSortKey>('changePct');
  protected readonly laneDir = signal<'asc' | 'desc'>('desc');
  protected readonly lanePage = signal(1);

  protected readonly riskCategory = signal('all');
  protected readonly riskLevel = signal('all');
  protected readonly riskKeyword = signal('');
  protected readonly riskSort = signal<MaterialSortKey>('impactAmount');
  protected readonly riskDir = signal<'asc' | 'desc'>('desc');

  protected readonly selectedLane = signal<ShippingLane | null>(null);
  protected readonly drawerOpen = signal(false);
  protected readonly assignOpen = signal(false);
  protected readonly assignFacts = signal<readonly KeyValueItem[]>([]);
  protected readonly assignSourceTitle = signal('');

  protected readonly tabs = computed<readonly TabItem[]>(() => [
    { id: 'fx', label: '汇率信号', hint: '主要币种汇率与波动', badge: this.page().fxRates.length },
    { id: 'shipping', label: '海运与运价', hint: '运价指数、航线时效与港口拥堵', badge: this.page().shippingLanes.length },
    { id: 'policy', label: '贸易政策', hint: '关税与合规政策风险', badge: this.page().policyRisks.length },
    { id: 'material', label: '原材料', hint: '电池与结构件价格信号', badge: this.page().rawMaterials.length },
    { id: 'summary', label: '风险汇总', hint: '外部风险清单', badge: this.page().externalRisks.length },
  ]);

  protected readonly fxSignalCount = computed(
    () => this.page().fxRates.filter((rate) => LEVEL_WEIGHT[rate.level] >= 3).length,
  );

  protected readonly maxTransit = computed(() =>
    this.page().shippingLanes.reduce((max, lane) => Math.max(max, lane.transitDays), 0),
  );

  protected readonly policyImpact = computed(() =>
    this.page().policyRisks.reduce((sum, risk) => sum + risk.impactAmount, 0),
  );

  protected readonly externalImpact = computed(() =>
    this.page().externalRisks.reduce((sum, risk) => sum + risk.impactAmount, 0),
  );

  protected readonly policyAnalysis = computed(() => {
    const alert = this.data.alerts().find((row) => row.type === 'policy');
    return alert?.analysis ?? this.data.alerts()[0].analysis;
  });

  protected readonly fxChart = computed<EChartsOption>(() => {
    const rates = this.page().fxRates;
    if (rates.length === 0) {
      return emptyChartOption('暂无汇率数据');
    }
    const windowSize = Number(this.fxWindow());
    const trimmed = rates.map((rate) => {
      const series = rate.series.slice(-windowSize);
      return { pair: rate.pair, series };
    });
    const labels = trimmed[0].series.map((point) => point.label);
    const colors = [CHART_COLORS.blue, CHART_COLORS.amber, CHART_COLORS.teal];
    return {
      tooltip: tooltipConfig('axis'),
      legend: legendConfig({ top: 0, right: 0 }),
      grid: gridConfig({ top: 36, bottom: 4 }),
      xAxis: categoryAxis(labels, { boundaryGap: false, interval: 14 }),
      yAxis: valueAxis({ name: 'CNY', scale: true, decimals: 2 }),
      series: trimmed.map((item, index) =>
        lineSeries(item.pair, item.series.map((point) => point.value), {
          color: colors[index % colors.length],
          smooth: true,
          symbol: false,
        }),
      ),
    };
  });

  protected readonly wciChart = computed<EChartsOption>(() => {
    const index = this.page().shippingIndex;
    if (index.series.length === 0) {
      return emptyChartOption('暂无运价数据');
    }
    return {
      tooltip: tooltipConfig('axis'),
      grid: gridConfig({ top: 24, bottom: 4 }),
      xAxis: categoryAxis(
        index.series.map((point) => point.label),
        { boundaryGap: false, interval: 14 },
      ),
      yAxis: valueAxis({ name: index.code, scale: true }),
      series: [
        areaSeries(index.code, index.series.map((point) => point.value), {
          color: CHART_COLORS.blue,
          smooth: true,
          symbol: false,
        }),
      ],
    };
  });

  protected readonly portChart = computed<EChartsOption>(() => {
    const ports = this.page().portCongestion;
    if (ports.length === 0) {
      return emptyChartOption('暂无港口数据');
    }
    return {
      tooltip: tooltipConfig('axis'),
      grid: gridConfig({ top: 24, bottom: 4, left: 60 }),
      xAxis: horizontalValueAxis({ name: '小时' }),
      yAxis: { type: 'category', data: ports.map((port) => port.port) },
      series: [
        barSeries(
          '平均等待小时',
          ports.map((port) => port.waitHours),
          { color: CHART_COLORS.amber, showLabel: true, labelUnit: 'h' },
        ),
      ],
    };
  });

  protected readonly laneChart = computed<EChartsOption>(() => {
    const lane = this.selectedLane();
    if (!lane) {
      return emptyChartOption('请选择航线');
    }
    return {
      tooltip: tooltipConfig('axis'),
      grid: gridConfig({ top: 24, bottom: 4 },
      ),
      xAxis: categoryAxis(
        lane.series.map((point) => point.label),
        { boundaryGap: false, interval: 10 },
      ),
      yAxis: valueAxis({ name: 'USD / 40ft', scale: true }),
      series: [
        areaSeries(lane.lane, lane.series.map((point) => point.value), {
          color: CHART_COLORS.blue,
          smooth: true,
          symbol: false,
        }),
      ],
    };
  });

  protected readonly materialChart = computed<EChartsOption>(() => {
    const materials = this.page().rawMaterials;
    if (materials.length === 0) {
      return emptyChartOption('暂无原材料数据');
    }
    const colors = [CHART_COLORS.blue, CHART_COLORS.amber, CHART_COLORS.teal, CHART_COLORS.violet];
    const labels = materials[0].series.map((point) => point.label);
    return {
      tooltip: tooltipConfig('axis'),
      legend: legendConfig({ top: 0, right: 0 }),
      grid: gridConfig({ top: 36, bottom: 4 }),
      xAxis: categoryAxis(labels, { boundaryGap: false, interval: 12 }),
      yAxis: valueAxis({ name: '指数（首日 = 100）', scale: true, decimals: 1 }),
      series: materials.map((item, index) =>
        lineSeries(item.name, this.normalize(item.series.map((point) => point.value)), {
          color: colors[index % colors.length],
          smooth: true,
          symbol: false,
        }),
      ),
    };
  });

  protected readonly filteredLanes = computed(() => {
    const level = this.laneLevel();
    return this.page().shippingLanes.filter((lane) => level === 'all' || lane.level === level);
  });

  protected readonly sortedLanes = computed(() => {
    const key = this.laneSort();
    const dir = this.laneDir() === 'asc' ? 1 : -1;
    const list = [...this.filteredLanes()];
    list.sort((a, b) => this.compareLane(a, b, key) * dir);
    return list;
  });

  protected readonly lanePageCount = computed(() =>
    Math.max(1, Math.ceil(this.sortedLanes().length / LANE_PAGE_SIZE)),
  );

  protected readonly pagedLanes = computed(() => {
    const start = (this.lanePage() - 1) * LANE_PAGE_SIZE;
    return this.sortedLanes().slice(start, start + LANE_PAGE_SIZE);
  });

  protected readonly filteredRisks = computed<readonly ExternalRiskItem[]>(() => {
    const category = this.riskCategory();
    const level = this.riskLevel();
    const keyword = this.riskKeyword().trim().toLowerCase();
    const list = this.page().externalRisks.filter((risk) => {
      if (category !== 'all' && risk.category !== category) {
        return false;
      }
      if (level !== 'all' && risk.level !== level) {
        return false;
      }
      if (keyword.length > 0) {
        const haystack = `${risk.title} ${risk.metric} ${risk.note}`.toLowerCase();
        if (!haystack.includes(keyword)) {
          return false;
        }
      }
      return true;
    });
    const key = this.riskSort();
    const dir = this.riskDir() === 'asc' ? 1 : -1;
    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (key) {
        case 'title':
          return a.title.localeCompare(b.title, 'zh-Hans-CN') * dir;
        case 'level':
          return (LEVEL_WEIGHT[a.level] - LEVEL_WEIGHT[b.level]) * dir;
        case 'impactAmount':
          return (a.impactAmount - b.impactAmount) * dir;
        default:
          return 0;
      }
    });
    return sorted;
  });

  protected readonly riskFiltersActive = computed(
    () =>
      this.riskCategory() !== 'all' ||
      this.riskLevel() !== 'all' ||
      this.riskKeyword().trim().length > 0,
  );

  protected readonly laneSubtitle = computed(() => {
    const lane = this.selectedLane();
    return lane ? `${lane.origin} → ${lane.destination} · ${lane.rate.toLocaleString('zh-CN')} USD / 40ft` : '';
  });

  protected readonly indexChange = computed(() => {
    const index = this.page().shippingIndex;
    return {
      direction: index.changePct >= 0 ? ('up' as const) : ('down' as const),
      text: `${index.changePct >= 0 ? '+' : ''}${index.changePct.toFixed(1)}% 环比`,
      favorable: index.changePct <= 0,
    };
  });

  protected fxChange(rate: FxRateSeries): { direction: 'up' | 'down' | 'flat'; text: string; favorable: boolean } {
    const direction = rate.changePct > 0 ? ('up' as const) : rate.changePct < 0 ? ('down' as const) : ('flat' as const);
    const sign = rate.changePct > 0 ? '+' : '';
    return {
      direction,
      text: `${sign}${rate.changePct.toFixed(2)}%（${sign}${rate.changeAbs.toFixed(4)}）`,
      favorable: rate.quote === 'CNY' ? rate.changePct <= 0 : rate.changePct >= 0,
    };
  }

  protected materialChange(changePct: number): { direction: 'up' | 'down' | 'flat'; text: string; favorable: boolean } {
    const direction = changePct > 0 ? ('up' as const) : changePct < 0 ? ('down' as const) : ('flat' as const);
    const sign = changePct > 0 ? '+' : '';
    return {
      direction,
      text: `${sign}${changePct.toFixed(1)}% 环比`,
      favorable: changePct <= 0,
    };
  }

  protected sparkOf(rate: FxRateSeries): readonly number[] {
    return rate.series.slice(-30).map((point) => point.value);
  }

  protected sparkOfSeries(series: readonly { readonly value: number }[]): readonly number[] {
    return series.slice(-30).map((point) => point.value);
  }

  protected changeClass(value: number): string {
    if (value > 0) {
      return 'text-orange';
    }
    return value < 0 ? 'text-green' : 'text-secondary';
  }

  protected fxFacts(rate: FxRateSeries): readonly KeyValueItem[] {
    return [
      { label: '近 30 天最高', value: rate.high30.toFixed(4) },
      { label: '近 30 天最低', value: rate.low30.toFixed(4) },
      { label: '基准货币', value: rate.base },
      { label: '报价货币', value: rate.quote },
    ];
  }

  protected policyFacts(risk: {
    readonly id: string;
    readonly region: string;
    readonly impactAmount: number;
    readonly probability: string;
    readonly window: string;
  }): readonly KeyValueItem[] {
    return [
      { label: '风险编号', value: risk.id },
      { label: '影响区域', value: risk.region },
      { label: '影响金额', value: `${risk.impactAmount.toLocaleString('zh-CN')} 万元`, tone: 'orange' },
      { label: '预计生效窗口', value: risk.window },
      { label: '生效概率（假设）', value: risk.probability },
    ];
  }

  protected laneFacts(lane: ShippingLane): readonly KeyValueItem[] {
    return [
      { label: '起运港', value: lane.origin },
      { label: '目的港', value: lane.destination },
      { label: '运价（USD / 40ft）', value: lane.rate.toLocaleString('zh-CN') },
      { label: '环比变化', value: `${lane.changePct > 0 ? '+' : ''}${lane.changePct.toFixed(1)}%` },
      { label: '平均时效', value: `${lane.transitDays} 天` },
      { label: '时效变化', value: `${lane.transitChangeDays > 0 ? '+' : ''}${lane.transitChangeDays} 天` },
      { label: '订舱难度', value: `${lane.bookingDifficulty} / 100` },
      { label: '风险等级', value: `${lane.level} ${riskLevelMeta(lane.level).label}` },
    ];
  }

  protected onTab(id: string): void {
    this.tab.set(id as RadarTab);
  }

  protected onLaneSort(change: SortChange): void {
    this.laneSort.set(change.key as LaneSortKey);
    this.laneDir.set(change.direction);
    this.lanePage.set(1);
  }

  protected goLanePage(next: number): void {
    this.lanePage.set(Math.min(Math.max(1, next), this.lanePageCount()));
  }

  protected openLane(lane: ShippingLane): void {
    this.selectedLane.set(lane);
    this.drawerOpen.set(true);
  }

  protected closeLane(): void {
    this.drawerOpen.set(false);
    this.selectedLane.set(null);
  }

  protected onRiskKeyword(event: Event): void {
    this.riskKeyword.set((event.target as HTMLInputElement).value);
  }

  protected onRiskSort(change: SortChange): void {
    this.riskSort.set(change.key as MaterialSortKey);
    this.riskDir.set(change.direction);
  }

  protected resetRiskFilters(): void {
    this.riskCategory.set('all');
    this.riskLevel.set('all');
    this.riskKeyword.set('');
  }

  protected onAssign(action: SuggestedAction): void {
    this.assignSourceTitle.set(action.text);
    this.assignFacts.set([
      { label: '建议动作', value: action.text },
      { label: '动作类型', value: action.actionType },
      { label: '优先级', value: action.priority },
      { label: '责任人', value: action.owner },
      { label: '截止时间', value: action.dueDate },
    ]);
    this.assignOpen.set(true);
  }

  protected confirmAssign(): void {
    this.assignOpen.set(false);
    this.state.pushToast('外部风险应对动作已记录（Demo 示例数据）', 'success');
    void this.router.navigate(['/inventory']);
  }

  private normalize(values: readonly number[]): number[] {
    const first = values[0] ?? 1;
    const base = first === 0 ? 1 : first;
    return values.map((value) => Number(((value / base) * 100).toFixed(2)));
  }

  private compareLane(a: ShippingLane, b: ShippingLane, key: LaneSortKey): number {
    switch (key) {
      case 'lane':
        return a.lane.localeCompare(b.lane, 'zh-Hans-CN');
      case 'rate':
        return a.rate - b.rate;
      case 'changePct':
        return a.changePct - b.changePct;
      case 'transitDays':
        return a.transitDays - b.transitDays;
      case 'bookingDifficulty':
        return a.bookingDifficulty - b.bookingDifficulty;
      case 'level':
        return LEVEL_WEIGHT[a.level] - LEVEL_WEIGHT[b.level];
      default:
        return 0;
    }
  }
}
