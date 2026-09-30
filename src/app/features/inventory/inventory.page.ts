import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { EChartsOption } from 'echarts';

import { BRAKE_ACTIONS, RISK_LEVELS, brakeActionMeta } from '../../core/models';
import type { BrakeAction, RiskLevel, SkuRow, SuggestedAction, Warehouse } from '../../core/models';
import { SentinelDataService } from '../../core/services/sentinel-data.service';
import { StateService } from '../../core/services/state.service';
import { DEMO_AS_OF_DATE, monthLabels } from '../../data/mock/_random';
import {
  CHART_COLORS,
  WsAmountPipe,
  WsBrakeBadge,
  WsCard,
  WsChart,
  WsDatePipe,
  WsDemoNote,
  WsEmptyState,
  WsIcon,
  WsMetricTile,
  WsModal,
  WsNumPipe,
  WsPercentPipe,
  WsProgressBar,
  WsRiskBadge,
  WsSegmented,
  WsSortHeader,
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
import type { SegmentedOption, SortChange } from '../../shared/ui';
import { SkuDrawer } from './sku-drawer';

/** SKU 明细表可排序列 */
type SortKey =
  | 'sku'
  | 'name'
  | 'qty'
  | 'inTransitQty'
  | 'value'
  | 'agingDays'
  | 'orderCoverageMonths'
  | 'overstockRatio'
  | 'score';

const PAGE_SIZE = 10;

/** 库龄分桶序号（第 4、5 桶即 91–180 天与 180 天以上） */
const OVERDUE_BUCKET_INDEX = 3;

@Component({
  selector: 'app-inventory-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    WsAmountPipe,
    WsBrakeBadge,
    WsCard,
    WsChart,
    WsDatePipe,
    WsDemoNote,
    WsEmptyState,
    WsIcon,
    WsMetricTile,
    WsModal,
    WsNumPipe,
    WsPercentPipe,
    WsProgressBar,
    WsRiskBadge,
    WsSegmented,
    WsSortHeader,
    WsTooltipDirective,
    SkuDrawer,
  ],
  template: `
    <div class="page">
      <div class="meta">
        <ws-icon name="warehouse" [size]="14" />
        <span>数据截止 {{ state.lastRefreshedAt() }}</span>
        <span class="meta__sep">·</span>
        <span>海外仓 {{ overview().warehouseCount }} 个</span>
        <span class="meta__sep">·</span>
        <span>重点 SKU {{ overview().skuCount }} 个</span>
        <span class="meta__sep">·</span>
        <span>库龄 90 天以上货值 {{ overdueValue() | wsAmount }}</span>
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
          label="库存总货值"
          [value]="overview().totalValue"
          kind="amount"
          [spark]="valueTrend()"
          hint="全部海外仓在库库存的货值合计（万元）"
        />
        <ws-metric-tile
          label="库存台数"
          [value]="overview().totalQty"
          kind="num"
          unit="台"
          [spark]="qtyTrend()"
          hint="在库台数合计，趋势为近 12 个月合计口径"
        />
        <ws-metric-tile
          label="在途台数"
          [value]="overview().inTransitQty"
          kind="num"
          unit="台"
          hint="已发运 / 生产中 / 待排产的在途库存合计，可持续评估是否延后"
        />
        <ws-metric-tile
          label="超期库存占比"
          [value]="overdueRatio()"
          kind="percent"
          [decimals]="1"
          level="L3"
          hint="库龄 90 天以上货值 ÷ 库存总货值"
        />
        <ws-metric-tile
          label="加权平均库龄"
          [value]="overview().avgAgingDays"
          kind="num"
          unit="天"
          hint="按 SKU 库龄简单平均，仅用于演示口径对比"
        />
        <ws-metric-tile
          label="DIO 库存周转天数"
          [value]="overview().dio"
          kind="num"
          unit="天"
          route="/cash-fx"
          hint="点击进入现金流与外汇，查看 DIO 对 CCC 的传导"
        />
      </div>

      <div class="charts">
        <ws-card title="库龄结构" subtitle="按库龄分桶的库存货值分布（万元），随下方筛选联动">
          <ws-chart
            [options]="agingOption()"
            [height]="304"
            [loading]="refreshing()"
            [empty]="filtered().length === 0"
            emptyTitle="当前筛选条件下暂无库龄数据"
          />
        </ws-card>
        <ws-card title="库存货值 · 国家分布" subtitle="按海外仓所在国汇总的库存货值（万元）">
          <ws-chart
            [options]="countryOption()"
            [height]="304"
            [loading]="refreshing()"
            [empty]="filtered().length === 0"
            emptyTitle="当前筛选条件下暂无国家维度数据"
          />
        </ws-card>
      </div>

      <ws-card title="全球海外仓" subtitle="库容使用率、库存货值与超期占比，点击仓库卡片可筛选下方 SKU 明细">
        <ng-template #cardActions>
          <span class="ws-caption">共 {{ data.warehouses.length }} 个海外仓 · 2 个高风险仓</span>
        </ng-template>
        <div class="wh-grid">
          @for (wh of data.warehouses; track wh.id) {
            <button
              type="button"
              class="wh"
              [class.is-active]="warehouseFilter() === wh.id"
              [attr.aria-pressed]="warehouseFilter() === wh.id"
              (click)="selectWarehouse(wh)"
            >
              <div class="wh__head">
                <span class="wh__name">{{ wh.name }}</span>
                <ws-risk-badge [level]="wh.level" [compact]="true" />
              </div>
              <div class="wh__sub">{{ wh.operator }} · {{ wh.country }}</div>
              <ws-progress
                [value]="wh.capacityUsage"
                [tone]="wh.capacityUsage >= 0.85 ? 'red' : wh.capacityUsage >= 0.7 ? 'orange' : 'blue'"
                label="库容使用率"
              />
              <div class="wh__foot">
                <span>货值 {{ wh.totalValue | wsAmount }}</span>
                <span class="wh__dot">·</span>
                <span>{{ wh.skuCount }} 个 SKU</span>
                <span class="ws-spacer"></span>
                <span class="wh__overdue">超期 {{ wh.overstockRatio | wsPercent }}</span>
              </div>
            </button>
          }
        </div>
      </ws-card>

      <ws-card title="SKU 库存明细" subtitle="按国家 / 仓库 / 产品线 / 风险等级筛选，点击行可打开风险详情">
        <ng-template #cardActions>
          <span class="ws-caption">命中 {{ sorted().length }} / {{ overview().skuCount }} 个 SKU</span>
        </ng-template>

        <div class="toolbar">
          <label class="ws-search">
            <ws-icon class="ws-search__icon" name="search" [size]="14" />
            <input
              class="ws-input ws-input--sm"
              type="search"
              placeholder="搜索 SKU 编码 / 产品名称 / 仓库"
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
            <span class="toolbar__label">仓库</span>
            <select class="ws-select ws-select--sm" [value]="warehouseFilter()" (change)="onWarehouseChange($event)">
              <option value="all">全部仓库</option>
              @for (wh of data.warehouses; track wh.id) {
                <option [value]="wh.id">{{ wh.name }}</option>
              }
            </select>
          </label>

          <label class="toolbar__field">
            <span class="toolbar__label">产品线</span>
            <select class="ws-select ws-select--sm" [value]="productFilter()" (change)="onProductChange($event)">
              <option value="all">全部产品线</option>
              @for (line of productOptions(); track line) {
                <option [value]="line">{{ line }}</option>
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
            <table class="ws-table table--skus">
              <thead>
                <tr>
                  <th
                    wsSort="sku"
                    [activeKey]="sortKey()"
                    [direction]="sortDir()"
                    defaultDirection="asc"
                    (sorted)="onSort($event)"
                  >
                    SKU 编码
                  </th>
                  <th
                    wsSort="name"
                    [activeKey]="sortKey()"
                    [direction]="sortDir()"
                    defaultDirection="asc"
                    (sorted)="onSort($event)"
                  >
                    产品
                  </th>
                  <th>海外仓</th>
                  <th>国家</th>
                  <th
                    class="is-numeric"
                    wsSort="qty"
                    [activeKey]="sortKey()"
                    [direction]="sortDir()"
                    (sorted)="onSort($event)"
                  >
                    库存(台)
                  </th>
                  <th
                    class="is-numeric"
                    wsSort="inTransitQty"
                    [activeKey]="sortKey()"
                    [direction]="sortDir()"
                    (sorted)="onSort($event)"
                  >
                    在途(台)
                  </th>
                  <th
                    class="is-numeric"
                    wsSort="value"
                    [activeKey]="sortKey()"
                    [direction]="sortDir()"
                    (sorted)="onSort($event)"
                  >
                    货值(万元)
                  </th>
                  <th
                    class="is-numeric"
                    wsSort="agingDays"
                    [activeKey]="sortKey()"
                    [direction]="sortDir()"
                    (sorted)="onSort($event)"
                  >
                    库龄(天)
                  </th>
                  <th
                    class="is-numeric"
                    wsSort="orderCoverageMonths"
                    [activeKey]="sortKey()"
                    [direction]="sortDir()"
                    (sorted)="onSort($event)"
                  >
                    订单覆盖(月)
                  </th>
                  <th
                    class="is-numeric"
                    wsSort="overstockRatio"
                    [activeKey]="sortKey()"
                    [direction]="sortDir()"
                    (sorted)="onSort($event)"
                  >
                    超期占比
                  </th>
                  <th
                    wsSort="score"
                    [activeKey]="sortKey()"
                    [direction]="sortDir()"
                    (sorted)="onSort($event)"
                  >
                    风险等级
                  </th>
                  <th>建议动作</th>
                </tr>
              </thead>
              <tbody>
                @for (row of paged(); track row.id) {
                  <tr
                    class="row--clickable"
                    tabindex="0"
                    (click)="openSku(row)"
                    (keydown.enter)="openSku(row)"
                  >
                    <td class="cell-code">{{ row.sku }}</td>
                    <td class="cell-name">{{ row.name }}</td>
                    <td>{{ row.warehouseName }}</td>
                    <td>{{ row.country }}</td>
                    <td class="is-numeric">{{ row.qty | wsNum }}</td>
                    <td class="is-numeric">{{ row.inTransitQty | wsNum }}</td>
                    <td class="is-numeric">{{ row.value | wsNum }}</td>
                    <td
                      class="is-numeric"
                      [class.text-orange]="row.agingDays >= 90 && row.agingDays < 150"
                      [class.text-red]="row.agingDays >= 150"
                    >
                      {{ row.agingDays }}
                    </td>
                    <td
                      class="is-numeric"
                      [class.text-red]="row.orderCoverageMonths < 1.5"
                      [class.text-orange]="row.orderCoverageMonths >= 1.5 && row.orderCoverageMonths < 2.5"
                    >
                      {{ row.orderCoverageMonths | wsNum:1 }}
                    </td>
                    <td class="is-numeric">{{ row.overstockRatio | wsPercent }}</td>
                    <td><ws-risk-badge [level]="row.level" [compact]="true" /></td>
                    <td><ws-brake-badge [action]="row.suggestedAction" /></td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="12">
                      <ws-empty-state
                        title="没有符合条件的 SKU"
                        description="请放宽国家、仓库、产品线或风险等级筛选条件。"
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
              <button
                type="button"
                [attr.aria-current]="p === page() ? 'true' : null"
                (click)="goPage(p)"
              >
                {{ p }}
              </button>
            }
            <button type="button" [disabled]="page() >= pageCount()" (click)="goPage(page() + 1)">下一页</button>
          </div>
        </div>
      </ws-card>

      <ws-card
        title="建议踩刹车清单"
        subtitle="订单覆盖不足或库龄超期的 SKU 处置建议，按可释放现金降序排列"
      >
        <ng-template #cardActions>
          <span class="ws-badge ws-badge--blue">可释放现金合计 {{ brakeReleaseTotal() | wsAmount }}</span>
          <span class="ws-caption">{{ brakeList().length }} 个 SKU</span>
        </ng-template>

        <div class="ws-table-wrap">
          <div class="ws-table-scroll">
            <table class="ws-table table--brake">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th class="is-numeric">库存(台)</th>
                  <th class="is-numeric">在途(台)</th>
                  <th class="is-numeric">订单覆盖(月)</th>
                  <th class="is-numeric">库龄(天)</th>
                  <th>风险等级</th>
                  <th>建议动作</th>
                  <th class="is-numeric">可释放现金</th>
                  <th>责任人</th>
                  <th>截止时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                @for (row of brakeList(); track row.id) {
                  <tr>
                    <td class="cell-code">
                      <div>{{ row.sku }}</div>
                      <div class="cell-sub">{{ row.name }}</div>
                    </td>
                    <td class="is-numeric">{{ row.qty | wsNum }}</td>
                    <td class="is-numeric">{{ row.inTransitQty | wsNum }}</td>
                    <td class="is-numeric">{{ row.orderCoverageMonths | wsNum:1 }}</td>
                    <td class="is-numeric">{{ row.agingDays }}</td>
                    <td><ws-risk-badge [level]="row.level" [compact]="true" /></td>
                    <td>
                      <span [wsTooltip]="actionHint(row.suggestedAction)" tooltipPlacement="top">
                        <ws-brake-badge [action]="row.suggestedAction" />
                      </span>
                    </td>
                    <td class="is-numeric text-blue">{{ row.releaseCash | wsNum }}</td>
                    <td class="cell-owner">{{ row.owner }}</td>
                    <td>{{ row.dueDate | wsDate }}</td>
                    <td class="cell-actions">
                      <button type="button" class="ws-btn ws-btn--ghost ws-btn--sm" (click)="openSku(row)">
                        详情
                      </button>
                      <button type="button" class="ws-btn ws-btn--ghost ws-btn--sm" (click)="openAssign(row)">
                        指派
                      </button>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="11">
                      <ws-empty-state
                        title="当前筛选下没有需要踩刹车的 SKU"
                        description="调整筛选条件，或查看全部 SKU 明细。"
                        icon="check"
                      />
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>

        <div class="brake-note">
          <ws-icon name="info" [size]="14" />
          <span>
            清单口径：建议动作不为「继续采购」的重点 SKU，按可释放现金（万元）降序排列。
            可释放现金为 Demo 示例口径的估算值，用于展示 Agent 的排序与解释能力。
          </span>
        </div>
      </ws-card>

      <ws-sku-drawer
        [sku]="selected()"
        [open]="drawerOpen()"
        (closed)="closeDrawer()"
        (assign)="openAssign($event)"
        (assignAction)="openAssignFromAction($event)"
        (toScenario)="goScenario($event)"
      />

      <ws-modal
        [open]="assignOpen()"
        [title]="assignTitle()"
        subtitle="动作指派会写入该 SKU 的处置建议（Demo 仅保存在浏览器内存）"
        [width]="580"
        (closed)="closeAssign()"
      >
        <div class="form">
          <div class="ws-field">
            <span class="ws-field__label">建议动作</span>
            <ws-segmented
              ariaLabel="建议动作"
              [value]="assignAction()"
              [options]="brakeOptions"
              (changed)="onAssignAction($event)"
            />
            <span class="ws-caption">{{ assignActionHint() }}</span>
          </div>

          <div class="form__row">
            <label class="ws-field">
              <span class="ws-field__label">责任人</span>
              <input
                class="ws-input"
                type="text"
                placeholder="如：王倩（供应链计划）"
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
              placeholder="补充处置说明，例如：与在途 380 台一并评估延后入库"
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
      color: var(--border-strong);
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

    .wh-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(248px, 1fr));
      gap: var(--sp-3);
    }
    .wh {
      display: flex;
      flex-direction: column;
      gap: var(--sp-3);
      padding: var(--sp-4);
      text-align: left;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      cursor: pointer;
      font: inherit;
      color: inherit;
      transition:
        border-color 0.16s ease,
        box-shadow 0.16s ease;
    }
    .wh:hover {
      border-color: var(--brand-soft-strong);
      box-shadow: var(--shadow-sm);
    }
    .wh.is-active {
      border-color: var(--brand-primary);
      box-shadow: 0 0 0 1px var(--brand-primary);
    }
    .wh__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--sp-2);
    }
    .wh__name {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
    }
    .wh__sub {
      font-size: 12px;
      color: var(--text-secondary);
      margin-top: calc(-1 * var(--sp-2));
    }
    .wh__foot {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
      color: var(--text-secondary);
      font-variant-numeric: tabular-nums;
    }
    .wh__dot {
      color: var(--border-strong);
    }
    .wh__overdue {
      color: var(--status-orange);
      font-weight: 600;
    }

    .toolbar {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--sp-3);
      margin-bottom: var(--sp-4);
    }
    .toolbar .ws-search {
      min-width: 260px;
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

    .table--skus {
      min-width: 1320px;
    }
    .table--brake {
      min-width: 1240px;
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
    .cell-name {
      min-width: 180px;
    }
    .cell-sub {
      font-family: var(--font-sans);
      font-size: 11px;
      color: var(--text-muted);
      white-space: nowrap;
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
    .brake-note {
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
    .brake-note ws-icon {
      color: var(--brand-primary);
      flex: none;
      margin-top: 2px;
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
      .tiles,
      .form__row {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
})
export class InventoryPage {
  protected readonly data = inject(SentinelDataService);
  protected readonly state = inject(StateService);
  private readonly router = inject(Router);

  protected readonly overview = this.data.inventoryOverview;

  /* ---------------- 筛选 / 排序 / 分页 ---------------- */
  protected readonly countryFilter = signal('all');
  protected readonly warehouseFilter = signal('all');
  protected readonly productFilter = signal('all');
  protected readonly levelFilter = signal('all');
  protected readonly keyword = signal('');
  protected readonly sortKey = signal<SortKey>('score');
  protected readonly sortDir = signal<'asc' | 'desc'>('desc');
  protected readonly page = signal(1);
  protected readonly refreshing = signal(false);

  /* ---------------- 抽屉 / 指派弹窗 ---------------- */
  protected readonly selected = signal<SkuRow | null>(null);
  protected readonly drawerOpen = signal(false);
  protected readonly assignOpen = signal(false);
  protected readonly assignTarget = signal<SkuRow | null>(null);
  protected readonly assignAction = signal<BrakeAction>('pause');
  protected readonly assignOwner = signal('');
  protected readonly assignDue = signal('');
  protected readonly assignNote = signal('');

  protected readonly brakeOptions: readonly SegmentedOption[] = BRAKE_ACTIONS.map((item) => ({
    value: item.action,
    label: item.label,
    hint: item.hint,
  }));

  protected readonly levelOptions: readonly SegmentedOption[] = [
    { value: 'all', label: '全部等级' },
    ...RISK_LEVELS.map((item) => ({ value: item.level, label: `${item.level} ${item.label}` })),
  ];

  private focusApplied = false;

  constructor() {
    effect(() => {
      const ids = this.state.focusSkuIds();
      if (ids.length === 0) {
        this.focusApplied = false;
        return;
      }
      if (this.focusApplied) return;
      this.focusApplied = true;
      const first = this.data.getSku(ids[0]);
      if (first) {
        this.selected.set(first);
        this.drawerOpen.set(true);
      }
    });
  }

  /* ---------------- 选项 ---------------- */
  protected readonly countryOptions = computed(() => {
    const seen = new Map<string, string>();
    for (const wh of this.data.warehouses) {
      if (!seen.has(wh.countryCode)) seen.set(wh.countryCode, wh.country);
    }
    return [...seen.entries()].map(([value, label]) => ({ value, label }));
  });

  protected readonly productOptions = computed(() => {
    const set = new Set<string>();
    for (const row of this.data.skus()) set.add(row.productLine);
    return [...set];
  });

  /* ---------------- 派生数据 ---------------- */
  protected readonly filtered = computed(() => {
    const country = this.countryFilter();
    const warehouse = this.warehouseFilter();
    const product = this.productFilter();
    const level = this.levelFilter();
    const keyword = this.keyword().trim().toLowerCase();
    return this.data.skus().filter((row) => {
      if (country !== 'all' && row.countryCode !== country) return false;
      if (warehouse !== 'all' && row.warehouseId !== warehouse) return false;
      if (product !== 'all' && row.productLine !== product) return false;
      if (level !== 'all' && row.level !== (level as RiskLevel)) return false;
      if (keyword) {
        const hay = `${row.sku} ${row.name} ${row.warehouseName} ${row.productLine}`.toLowerCase();
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
      this.warehouseFilter() !== 'all' ||
      this.productFilter() !== 'all' ||
      this.levelFilter() !== 'all' ||
      this.keyword().trim().length > 0,
  );

  protected readonly brakeList = computed(() =>
    this.filtered()
      .filter((row) => row.suggestedAction !== 'continue')
      .sort((a, b) => b.releaseCash - a.releaseCash),
  );

  protected readonly brakeReleaseTotal = computed(() =>
    this.brakeList().reduce((sum, row) => sum + row.releaseCash, 0),
  );

  /** 库龄 90 天以上货值（第 4、5 桶） */
  protected readonly overdueValue = computed(() => {
    let total = 0;
    for (const row of this.data.skus()) {
      for (let index = OVERDUE_BUCKET_INDEX; index < row.agingBuckets.length; index += 1) {
        total += row.agingBuckets[index].value;
      }
    }
    return Math.round(total);
  });

  protected readonly overdueRatio = computed(() => {
    const totalValue = this.data.skus().reduce((sum, row) => sum + row.value, 0);
    return totalValue === 0 ? 0 : this.overdueValue() / totalValue;
  });

  /** 近 12 个月合计库存台数趋势 */
  private readonly qtyTrendSeries = computed(() => {
    const rows = this.filtered().length > 0 ? this.filtered() : this.data.skus();
    const months = monthLabels(DEMO_AS_OF_DATE, 12);
    return months.map((_, index) => rows.reduce((sum, row) => sum + (row.trend[index] ?? 0), 0));
  });

  protected readonly qtyTrend = computed(() => this.qtyTrendSeries());

  protected readonly valueTrend = computed(() => {
    const qty = this.qtyTrendSeries();
    const avgCost = this.overview().totalQty === 0 ? 0 : this.overview().totalValue / this.overview().totalQty;
    return qty.map((value) => Math.round(value * avgCost));
  });

  /* ---------------- 图表 ---------------- */
  protected readonly agingOption = computed<EChartsOption>(() => {
    const totals = new Map<string, number>();
    for (const row of this.filtered()) {
      for (const bucket of row.agingBuckets) {
        totals.set(bucket.bucket, (totals.get(bucket.bucket) ?? 0) + bucket.value);
      }
    }
    if (totals.size === 0) return emptyChartOption('当前筛选条件下暂无库龄数据');
    const slices = [...totals.entries()].map(([name, value]) => ({ name, value: Math.round(value) }));
    const overdue = slices.slice(OVERDUE_BUCKET_INDEX).reduce((sum, slice) => sum + slice.value, 0);
    const total = slices.reduce((sum, slice) => sum + slice.value, 0);
    const ratio = total === 0 ? 0 : ((overdue / total) * 100).toFixed(1);
    return {
      tooltip: tooltipConfig('item'),
      legend: legendConfig({ bottom: 0, top: undefined }),
      graphic: donutCenterLabel(`${ratio}%`, '库龄 90 天以上'),
      series: [
        pieSeries('库龄结构', slices, {
          radius: ['52%', '72%'],
          center: ['50%', '44%'],
        }),
      ],
    };
  });

  protected readonly countryOption = computed<EChartsOption>(() => {
    const totals = new Map<string, number>();
    for (const row of this.filtered()) {
      totals.set(row.country, (totals.get(row.country) ?? 0) + row.value);
    }
    if (totals.size === 0) return emptyChartOption('当前筛选条件下暂无国家维度数据');
    const entries = [...totals.entries()].sort((a, b) => b[1] - a[1]);
    return {
      tooltip: tooltipConfig('axis'),
      grid: gridConfig({ left: 56, right: 16, top: 28, bottom: 32 }),
      xAxis: categoryAxis(
        entries.map(([name]) => name),
        { boundaryGap: true },
      ),
      yAxis: valueAxis({ name: '万元', scale: true, interval: 2000 }),
      series: [
        barSeries(
          '库存货值',
          entries.map(([, value]) => Math.round(value)),
          { color: CHART_COLORS.blue, showLabel: true, labelUnit: '' },
        ),
      ],
    };
  });

  protected readonly trendOption = computed<EChartsOption>(() => {
    const rows = this.filtered();
    if (rows.length === 0) return emptyChartOption('当前筛选条件下暂无趋势数据');
    return {
      tooltip: tooltipConfig('axis'),
      grid: gridConfig({ left: 56, right: 16, top: 28, bottom: 32 }),
      xAxis: categoryAxis(monthLabels(DEMO_AS_OF_DATE, 12), { boundaryGap: false }),
      yAxis: valueAxis({ name: '万元', scale: true }),
      series: [areaSeries('库存货值', this.valueTrend(), { color: CHART_COLORS.blue })],
    };
  });

  protected readonly valueTrendOption = this.trendOption;

  protected readonly flowOption = computed<EChartsOption>(() => {
    const rows = this.filtered();
    if (rows.length === 0) return emptyChartOption('当前筛选条件下暂无在库与在途对比数据');
    const inStock = rows.reduce((sum, row) => sum + row.qty, 0);
    const inTransit = rows.reduce((sum, row) => sum + row.inTransitQty, 0);
    return {
      tooltip: tooltipConfig('item'),
      legend: legendConfig({ bottom: 0, top: undefined }),
      graphic: donutCenterLabel(`1:${(inTransit / (inStock || 1)).toFixed(2)}`, '在库 : 在途'),
      series: [
        pieSeries(
          '在库与在途',
          [
            { name: '在库(台)', value: inStock, color: CHART_COLORS.blue },
            { name: '在途(台)', value: inTransit, color: CHART_COLORS.amber },
          ],
          { radius: ['56%', '76%'], center: ['50%', '44%'], showLabel: false },
        ),
      ],
    };
  });

  protected readonly lineCompareOption = computed<EChartsOption>(() => {
    const rows = this.filtered();
    if (rows.length === 0) return emptyChartOption('当前筛选条件下暂无库存与出货对比数据');
    const months = monthLabels(DEMO_AS_OF_DATE, 12);
    const stock = months.map((_, index) => rows.reduce((sum, row) => sum + (row.trend[index] ?? 0), 0));
    const shipment = months.map((_, index) =>
      rows.reduce((sum, row) => sum + (row.monthlyShipment[index]?.value ?? 0), 0),
    );
    return {
      tooltip: tooltipConfig('axis'),
      legend: legendConfig({ top: 0, right: 0, bottom: undefined }),
      grid: gridConfig({ left: 56, right: 16, top: 36, bottom: 32 }),
      xAxis: categoryAxis(months, { boundaryGap: false }),
      yAxis: valueAxis({ name: '台', scale: true }),
      series: [
        areaSeries('在库台数', stock, { color: CHART_COLORS.blue }),
        lineSeries('月出货台数', shipment, { color: CHART_COLORS.teal, dashed: true }),
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

  protected onWarehouseChange(event: Event): void {
    this.warehouseFilter.set((event.target as HTMLSelectElement).value);
    this.page.set(1);
  }

  protected onProductChange(event: Event): void {
    this.productFilter.set((event.target as HTMLSelectElement).value);
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

  protected selectWarehouse(wh: Warehouse): void {
    this.warehouseFilter.set(this.warehouseFilter() === wh.id ? 'all' : wh.id);
    this.countryFilter.set('all');
    this.page.set(1);
  }

  protected resetFilters(): void {
    this.countryFilter.set('all');
    this.warehouseFilter.set('all');
    this.productFilter.set('all');
    this.levelFilter.set('all');
    this.keyword.set('');
    this.page.set(1);
  }

  protected goPage(page: number): void {
    this.page.set(Math.min(Math.max(1, page), this.pageCount()));
  }

  protected refreshData(): void {
    if (this.refreshing()) return;
    this.refreshing.set(true);
    this.state.refresh();
    window.setTimeout(() => this.refreshing.set(false), 520);
  }

  protected openSku(row: SkuRow): void {
    this.selected.set(row);
    this.drawerOpen.set(true);
  }

  protected closeDrawer(): void {
    this.drawerOpen.set(false);
  }

  protected goScenario(sku: SkuRow): void {
    this.state.setFocusSkus([sku.id]);
    this.state.setScenarioNote(`来源：库存风险中心 · ${sku.sku}（${sku.name}）`);
    void this.router.navigate(['/scenario']);
  }

  /* ---------------- 动作指派 ---------------- */
  protected openAssign(row: SkuRow): void {
    this.assignTarget.set(row);
    this.assignAction.set(row.suggestedAction);
    this.assignOwner.set(row.owner);
    this.assignDue.set(row.dueDate);
    this.assignNote.set('');
    this.assignOpen.set(true);
  }

  protected openAssignFromAction(action: SuggestedAction): void {
    const target = this.selected();
    if (!target) return;
    this.assignTarget.set(target);
    this.assignAction.set(action.actionType);
    this.assignOwner.set(action.owner);
    this.assignDue.set(action.dueDate);
    this.assignNote.set(action.text);
    this.assignOpen.set(true);
  }

  protected closeAssign(): void {
    this.assignOpen.set(false);
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

  protected readonly assignTitle = computed(() => {
    const target = this.assignTarget();
    return target ? `指派动作 · ${target.sku}` : '指派动作';
  });

  protected readonly assignActionHint = computed(() => brakeActionMeta(this.assignAction()).hint);

  protected readonly assignValid = computed(
    () => this.assignOwner().trim().length > 0 && this.assignDue().trim().length > 0,
  );

  protected confirmAssign(): void {
    const target = this.assignTarget();
    if (!target || !this.assignValid()) return;
    this.data.assignAction({
      skuId: target.id,
      action: this.assignAction(),
      owner: this.assignOwner().trim(),
      dueDate: this.assignDue(),
      note: this.assignNote().trim(),
    });
    this.assignOpen.set(false);
  }

  protected actionHint(action: BrakeAction): string {
    return brakeActionMeta(action).hint;
  }

  /* ---------------- 工具 ---------------- */
  private sortValue(row: SkuRow, key: SortKey): number | string {
    if (key === 'sku') return row.sku;
    if (key === 'name') return row.name;
    const numeric: Record<Exclude<SortKey, 'sku' | 'name'>, number> = {
      qty: row.qty,
      inTransitQty: row.inTransitQty,
      value: row.value,
      agingDays: row.agingDays,
      orderCoverageMonths: row.orderCoverageMonths,
      overstockRatio: row.overstockRatio,
      score: row.score,
    };
    return numeric[key];
  }

  private compare(a: SkuRow, b: SkuRow, key: SortKey): number {
    const va = this.sortValue(a, key);
    const vb = this.sortValue(b, key);
    if (typeof va === 'string' && typeof vb === 'string') {
      return va.localeCompare(vb, 'zh-Hans-CN');
    }
    return Number(va) - Number(vb);
  }
}
