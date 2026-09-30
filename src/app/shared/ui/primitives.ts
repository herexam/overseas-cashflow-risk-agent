import { booleanAttribute, ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  ALERT_STATUS_LABEL,
  brakeActionMeta,
  DATA_NATURE_LABEL,
  riskLevelMeta,
  type AlertStatus,
  type BrakeAction,
  type ChangeIndicator,
  type DataNature,
  type RiskLevel,
} from '../../core/models';
import { DEMO_DATA_NOTICE, DEMO_DATA_SHORT } from '../../data/mock/demo-notice';
import { WsIcon, type WsIconName } from './icon/icon';
import { WsTooltipDirective } from './tooltip/tooltip';

/** 全站语义色名，配合 styles.scss 的 .tone-* / .text-* 工具类使用。 */
export type WsTone = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'plain';

/** 语义色 → 文本色工具类（plain 归入中性色）。 */
export function toneTextClass(tone: WsTone): string {
  return tone === 'plain' ? 'text-secondary' : `text-${tone}`;
}

/** 语义色 → 背景/边框工具类。 */
export function toneSurfaceClass(tone: WsTone): string {
  return `tone-${tone}`;
}

const RISK_SHAPE_PATHS: Record<'square' | 'diamond' | 'triangle' | 'circle', string> = {
  square: 'M2 2h8v8H2z',
  diamond: 'M6 1.2 10.8 6 6 10.8 1.2 6z',
  triangle: 'M6 1.6 11 10.4H1z',
  circle: 'M6 1.8a4.2 4.2 0 1 1 0 8.4 4.2 4.2 0 0 1 0-8.4z',
};

const STATUS_TONE: Record<AlertStatus, WsTone> = {
  pending: 'orange',
  processing: 'blue',
  resolved: 'green',
  closed: 'plain',
};

const NATURE_TONE: Record<DataNature, WsTone> = {
  public: 'blue',
  demo: 'plain',
  assumed: 'yellow',
  pending: 'plain',
  confirm: 'orange',
};

/* ========================= 徽标 ========================= */

@Component({
  selector: 'ws-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span [class]="'ws-badge ws-badge--' + tone()">
      @if (dot()) {
        <span class="ws-dot"></span>
      }
      <ng-content />
    </span>
  `,
  styles: `
    :host {
      display: inline-flex;
    }
  `,
})
export class WsBadge {
  readonly tone = input<WsTone>('plain');
  readonly dot = input(false);
}

/**
 * 风险等级徽标。
 * 颜色 + 形状 + 文字三重编码，避免仅凭颜色表达风险等级。
 */
@Component({
  selector: 'ws-risk-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [WsTooltipDirective],
  template: `
    <span [class]="'ws-badge ws-badge--' + meta().tone" [wsTooltip]="hint()">
      <svg width="9" height="9" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
        <path [attr.d]="shapePath()" />
      </svg>
      <span>{{ compact() ? level() : meta().label }}</span>
    </span>
  `,
  styles: `
    :host {
      display: inline-flex;
    }
  `,
})
export class WsRiskBadge {
  readonly level = input.required<RiskLevel>();
  readonly compact = input(false, { transform: booleanAttribute });

  protected readonly meta = computed(() => riskLevelMeta(this.level()));
  protected readonly shapePath = computed(() => RISK_SHAPE_PATHS[this.meta().shape]);
  protected readonly hint = computed(
    () => `${this.level()} ${this.meta().label} · ${this.meta().scoreText} · ${this.meta().slaText}`,
  );
}

@Component({
  selector: 'ws-status-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span [class]="'ws-badge ws-badge--' + tone()">
      <span class="ws-dot"></span>
      {{ label() }}
    </span>
  `,
  styles: `
    :host {
      display: inline-flex;
    }
  `,
})
export class WsStatusBadge {
  readonly status = input.required<AlertStatus>();

  protected readonly tone = computed(() => STATUS_TONE[this.status()]);
  protected readonly label = computed(() => ALERT_STATUS_LABEL[this.status()]);
}

@Component({
  selector: 'ws-brake-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [WsTooltipDirective],
  template: `
    <span [class]="'ws-badge ws-badge--' + meta().tone" [wsTooltip]="meta().hint">{{ meta().label }}</span>
  `,
  styles: `
    :host {
      display: inline-flex;
    }
  `,
})
export class WsBrakeBadge {
  readonly action = input.required<BrakeAction>();
  protected readonly meta = computed(() => brakeActionMeta(this.action()));
}

/** 数据性质徽标：【公开】/【示例】/【假设】/【待接入】/【需确认】。 */
@Component({
  selector: 'ws-nature-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [WsTooltipDirective],
  template: `
    <span
      [class]="'ws-badge ws-badge--' + tone()"
      [wsTooltip]="'数据性质：' + label() + '。原始 PRD 数据性质标注体系。'"
      >{{ label() }}</span
    >
  `,
  styles: `
    :host {
      display: inline-flex;
    }
  `,
})
export class WsNatureBadge {
  readonly nature = input.required<DataNature>();
  protected readonly tone = computed(() => NATURE_TONE[this.nature()]);
  protected readonly label = computed(() => DATA_NATURE_LABEL[this.nature()]);
}

/* ========================= 趋势 / 进度 ========================= */

@Component({
  selector: 'ws-trend',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [WsIcon],
  template: `
    <span [class]="hostClass()">
      <ws-icon [name]="icon()" [size]="12" [strokeWidth]="2.1" />
      <span>{{ change().text }}</span>
    </span>
  `,
  styles: `
    :host {
      display: inline-flex;
    }
    .ws-trend {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      font-size: 12px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
  `,
})
export class WsTrendIndicator {
  readonly change = input.required<ChangeIndicator>();

  protected readonly hostClass = computed(
    () => `ws-trend ${toneTextClass(this.change().favorable ? 'green' : 'red')}`,
  );
  protected readonly icon = computed<WsIconName>(() => {
    const direction = this.change().direction;
    if (direction === 'up') return 'arrow-up';
    if (direction === 'down') return 'arrow-down';
    return 'arrow-right';
  });
}

@Component({
  selector: 'ws-progress',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [class]="'pb tone-' + tone()">
      @if (label()) {
        <div class="pb__head">
          <span class="pb__label">{{ label() }}</span>
          <span class="pb__val">{{ percentText() }}</span>
        </div>
      }
      <div class="pb__track">
        <div class="pb__fill" [style.width.%]="widthPct()"></div>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .pb__head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--sp-2);
      margin-bottom: 4px;
      font-size: 12px;
    }
    .pb__label {
      color: var(--text-secondary);
    }
    .pb__val {
      color: var(--text-primary);
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
    .pb__track {
      height: 6px;
      border-radius: var(--radius-pill);
      background: var(--bg-subtle);
      overflow: hidden;
    }
    .pb__fill {
      height: 100%;
      border-radius: var(--radius-pill);
      background: var(--tone, var(--brand-primary));
      transition: width 0.28s ease;
    }
  `,
})
export class WsProgressBar {
  /** 0..1 的比值 */
  readonly value = input.required<number>();
  readonly tone = input<WsTone>('blue');
  readonly label = input('');

  protected readonly widthPct = computed(() => Math.min(100, Math.max(0, this.value() * 100)));
  protected readonly percentText = computed(() => `${this.widthPct().toFixed(1)}%`);
}

/* ========================= 空状态 / 骨架屏 ========================= */

@Component({
  selector: 'ws-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [WsIcon],
  template: `
    <div class="ws-empty">
      <ws-icon [name]="icon()" [size]="26" [strokeWidth]="1.4" />
      <div class="ws-empty__title">{{ title() }}</div>
      @if (description()) {
        <p class="es__desc">{{ description() }}</p>
      }
      <ng-content />
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    ws-icon {
      color: var(--text-muted);
    }
    .es__desc {
      max-width: 420px;
      margin: 0;
      font-size: 12px;
      line-height: 1.6;
      color: var(--text-secondary);
    }
  `,
})
export class WsEmptyState {
  readonly title = input.required<string>();
  readonly description = input('');
  readonly icon = input<WsIconName>('info');
}

@Component({
  selector: 'ws-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ws-skeleton" [style.width]="width()" [style.height.px]="height()" [style.border-radius]="radius()"></div>
  `,
  styles: `
    :host {
      display: block;
    }
  `,
})
export class WsSkeleton {
  readonly height = input(16);
  readonly width = input('100%');
  readonly radius = input('var(--radius-sm)');
}

/* ========================= 演示数据声明 ========================= */

@Component({
  selector: 'ws-demo-note',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [WsIcon],
  template: `
    <span class="ws-demo-note">
      <ws-icon name="info" [size]="12" />
      <span>{{ text() }}</span>
    </span>
  `,
  styles: `
    :host {
      display: inline-flex;
    }
  `,
})
export class WsDemoNote {
  readonly text = input(DEMO_DATA_SHORT);
}

@Component({
  selector: 'ws-disclaimer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [WsIcon],
  template: `
    <div class="ws-demo-banner">
      <ws-icon name="shield" [size]="14" />
      <span>{{ text() }}</span>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
  `,
})
export class WsDisclaimer {
  readonly text = input(DEMO_DATA_NOTICE);
}

/* ========================= 键值对 / 分节标题 ========================= */

export interface KeyValueItem {
  readonly label: string;
  readonly value: string;
  readonly tone?: WsTone;
  readonly hint?: string;
}

@Component({
  selector: 'ws-key-value',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [WsTooltipDirective],
  template: `
    <dl class="kv" [style.grid-template-columns]="'repeat(' + columns() + ', minmax(0, 1fr))'">
      @for (item of items(); track item.label) {
        <div class="kv__item">
          <dt class="kv__label">{{ item.label }}</dt>
          <dd [class]="valueClass(item)" [wsTooltip]="item.hint ?? ''">{{ item.value }}</dd>
        </div>
      }
    </dl>
  `,
  styles: `
    :host {
      display: block;
    }
    .kv {
      display: grid;
      gap: var(--sp-3) var(--sp-5);
      margin: 0;
    }
    .kv__item {
      min-width: 0;
    }
    .kv__label {
      font-size: 11px;
      color: var(--text-muted);
      letter-spacing: 0.02em;
    }
    .kv__value {
      margin: 2px 0 0;
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
      font-variant-numeric: tabular-nums;
      word-break: break-word;
    }
  `,
})
export class WsKeyValue {
  readonly items = input.required<readonly KeyValueItem[]>();
  readonly columns = input(2);

  protected valueClass(item: KeyValueItem): string {
    const base = 'kv__value';
    return item.tone ? `${base} ${toneTextClass(item.tone)}` : base;
  }
}

@Component({
  selector: 'ws-section-title',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ws-section-title">
      <h2>{{ title() }}</h2>
      @if (hint()) {
        <span class="st__hint">{{ hint() }}</span>
      }
      <span class="ws-spacer"></span>
      <ng-content />
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .st__hint {
      font-size: 12px;
      color: var(--text-secondary);
    }
  `,
})
export class WsSectionTitle {
  readonly title = input.required<string>();
  readonly hint = input('');
}
