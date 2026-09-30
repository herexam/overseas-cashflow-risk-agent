import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChild,
  input,
  TemplateRef,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import type { ChangeIndicator, RiskLevel } from '../../core/models';
import {
  WsAmountPipe,
  WsNumPipe,
  WsPercentPipe,
  WsRatePipe,
} from '../pipes/format.pipes';
import { WsRiskBadge, WsTrendIndicator, type WsTone } from './primitives';
import { WsSparkline } from './sparkline';
import { WsTooltipDirective } from './tooltip/tooltip';

/** 通用卡片容器。可选头部动作区通过 `<ng-template #cardActions>` 投影。 */
@Component({
  selector: 'ws-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet],
  host: {
    '[class.ws-card]': 'true',
    '[class.ws-card--flush]': 'flush()',
  },
  template: `
    @if (title() || actions()) {
      <div class="ws-card__head">
        <div class="head-main">
          @if (title()) {
            <div class="ws-card__title">{{ title() }}</div>
          }
          @if (subtitle()) {
            <div class="ws-card__subtitle">{{ subtitle() }}</div>
          }
        </div>
        @if (actions(); as a) {
          <div class="head-actions">
            <ng-container [ngTemplateOutlet]="a" />
          </div>
        }
      </div>
    }
    <ng-content />
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .head-main {
      min-width: 0;
    }
    .head-actions {
      display: flex;
      align-items: center;
      gap: var(--sp-2);
      flex: 0 0 auto;
    }
  `,
})
export class WsCard {
  readonly title = input('');
  readonly subtitle = input('');
  readonly flush = input(false, { transform: booleanAttribute });
  protected readonly actions = contentChild<TemplateRef<unknown>>('cardActions');
}

export type MetricKind = 'num' | 'amount' | 'percent' | 'rate' | 'plain';

/** 指标磁贴（驾驶舱核心指标卡）。 */
@Component({
  selector: 'ws-metric-tile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    RouterLink,
    WsRiskBadge,
    WsTrendIndicator,
    WsSparkline,
    WsMetricTile,
    WsNumPipe,
    WsAmountPipe,
    WsPercentPipe,
    WsRatePipe,
    WsTooltipDirective,
  ],
  host: {
    '[class.is-link]': '!!route()',
  },
  template: `
    <ng-template #inner>
      <div class="tile__head">
        <span class="tile__label">{{ label() }}</span>
        @if (level(); as lv) {
          <ws-risk-badge [level]="lv" [compact]="true" />
        }
      </div>
      <div class="tile__value-row">
        <span class="tile__value">
          @switch (kind()) {
            @case ('amount') {
              {{ value() | wsAmount: decimals() }}
            }
            @case ('percent') {
              {{ value() | wsPercent: decimals() }}
            }
            @case ('rate') {
              {{ value() | wsRate: decimals() }}
            }
            @case ('plain') {
              {{ value() }}
            }
            @default {
              {{ value() | wsNum: decimals() }}
            }
          }
        </span>
        @if (unit()) {
          <span class="tile__unit">{{ unit() }}</span>
        }
      </div>
      @if (change() || note() || spark().length > 1) {
        <div class="tile__foot">
          @if (change(); as c) {
            <ws-trend [change]="c" />
          }
          @if (note()) {
            <span class="tile__note">{{ note() }}</span>
          }
          <span class="ws-spacer"></span>
          @if (spark().length > 1) {
            <ws-sparkline [data]="spark()" [tone]="sparkTone()" [height]="20" />
          }
        </div>
      }
    </ng-template>
    @if (route(); as r) {
      <a class="tile__link" [routerLink]="r" [wsTooltip]="hint()" [tooltipPlacement]="'bottom'">
        <ng-container [ngTemplateOutlet]="inner" />
      </a>
    } @else {
      <div class="tile__link tile__link--static" [wsTooltip]="hint()" [tooltipPlacement]="'bottom'">
        <ng-container [ngTemplateOutlet]="inner" />
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-xs);
      transition:
        border-color 0.16s ease,
        box-shadow 0.16s ease,
        transform 0.16s ease;
    }
    :host(.is-link:hover) {
      border-color: var(--brand-soft-strong);
      box-shadow: var(--shadow-sm);
      transform: translateY(-1px);
    }
    .tile__link {
      display: flex;
      flex-direction: column;
      gap: var(--sp-3);
      padding: var(--sp-4);
      color: inherit;
      text-decoration: none;
      height: 100%;
      box-sizing: border-box;
    }
    .tile__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--sp-2);
    }
    .tile__label {
      font-size: 12px;
      color: var(--text-secondary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .tile__value-row {
      display: flex;
      align-items: baseline;
      gap: 4px;
      margin-top: auto;
    }
    .tile__value {
      font-size: 26px;
      font-weight: 600;
      line-height: 1.1;
      letter-spacing: -0.01em;
      color: var(--brand-ink);
      font-variant-numeric: tabular-nums;
    }
    .tile__unit {
      font-size: 12px;
      color: var(--text-secondary);
    }
    .tile__foot {
      display: flex;
      align-items: center;
      gap: var(--sp-2);
      min-height: 20px;
    }
    .tile__note {
      font-size: 11px;
      color: var(--text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  `,
})
export class WsMetricTile {
  readonly label = input.required<string>();
  readonly value = input.required<number>();
  readonly kind = input<MetricKind>('num');
  readonly decimals = input(0);
  readonly unit = input('');
  readonly change = input<ChangeIndicator | null>(null);
  readonly spark = input<readonly number[]>([]);
  readonly level = input<RiskLevel | null>(null);
  readonly hint = input('');
  readonly note = input('');
  readonly route = input<string | null>(null);

  protected readonly sparkTone = computed<WsTone>(() => {
    const lv = this.level();
    if (lv === 'L4') return 'red';
    if (lv === 'L3') return 'orange';
    if (lv === 'L2') return 'yellow';
    if (lv === 'L1') return 'green';
    return 'blue';
  });
}
