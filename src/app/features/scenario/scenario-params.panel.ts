import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import type { ScenarioParams } from '../../core/models';
import { ScenarioEngineService } from '../../core/services/scenario-engine.service';
import { SentinelDataService } from '../../core/services/sentinel-data.service';
import { StateService } from '../../core/services/state.service';
import { WsBadge, WsCard, WsIcon, WsSectionTitle } from '../../shared/ui';

/** 可调参数键（不含 template 与 focusSkuIds）。 */
type ScenarioParamKey =
  | 'shippingDelayDays'
  | 'collectionDelayDays'
  | 'orderChangePct'
  | 'fxChangePct'
  | 'rateChangePct';

interface ParamSpec {
  readonly key: ScenarioParamKey;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly hint: string;
  readonly text: (value: number) => string;
}

/**
 * 逐参数构造 patch：避免用 `{ [key]: value }` 生成 `{ [x: string]: number }`
 * 与 `Partial<ScenarioParams>` 不兼容。
 */
const PARAM_PATCH: Record<ScenarioParamKey, (value: number) => Partial<ScenarioParams>> = {
  shippingDelayDays: (value) => ({ shippingDelayDays: value }),
  collectionDelayDays: (value) => ({ collectionDelayDays: value }),
  orderChangePct: (value) => ({ orderChangePct: value }),
  fxChangePct: (value) => ({ fxChangePct: value }),
  rateChangePct: (value) => ({ rateChangePct: value }),
};

const signed = (value: number, unit: string): string =>
  `${value > 0 ? '+' : ''}${value}${unit}`;

const PARAMS: readonly ParamSpec[] = [
  {
    key: 'shippingDelayDays',
    label: '海运延迟',
    min: 0,
    max: 60,
    step: 5,
    hint: '主要航线航程延误天数。',
    text: (value) => signed(value, ' 天'),
  },
  {
    key: 'collectionDelayDays',
    label: '回款延期',
    min: 0,
    max: 60,
    step: 5,
    hint: '重点客户回款平均延后天数。',
    text: (value) => signed(value, ' 天'),
  },
  {
    key: 'orderChangePct',
    label: '订单变化',
    min: -40,
    max: 20,
    step: 5,
    hint: '未来 90 天订单量相对基准的变化。',
    text: (value) => signed(value, '%'),
  },
  {
    key: 'fxChangePct',
    label: '汇率变化',
    min: -10,
    max: 10,
    step: 1,
    hint: '人民币对美元 / 欧元汇率变动幅度。',
    text: (value) => signed(value, '%'),
  },
  {
    key: 'rateChangePct',
    label: '利率变化',
    min: 0,
    max: 5,
    step: 0.5,
    hint: '融资成本变动（百分点）。',
    text: (value) => signed(value, ' 个百分点'),
  },
];

/**
 * 情景推演左侧参数面板。
 *
 * 只负责「选模板 / 调参数 / 带入聚焦 SKU / 触发运行」，
 * 所有参数与结果状态都写在 `ScenarioEngineService` 里，组件本身无本地状态。
 */
@Component({
  selector: 'app-scenario-params',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [WsBadge, WsCard, WsIcon, WsSectionTitle],
  template: `
    <ws-card title="情景参数" subtitle="调整外部冲击变量，推演经营指标变化">
      <ws-section-title title="场景模板" hint="点击套用预设参数">
        @if (engine.activeTemplate() === 'custom') {
          <ws-badge tone="blue">自定义场景</ws-badge>
        }
      </ws-section-title>

      <div class="tpl">
        @for (t of engine.templates; track t.id) {
          <button
            type="button"
            class="tpl__card"
            [class.is-active]="engine.activeTemplate() === t.id"
            [attr.aria-pressed]="engine.activeTemplate() === t.id"
            (click)="engine.applyTemplate(t.id)"
          >
            <span class="tpl__code">{{ t.code }}</span>
            <span class="tpl__name">{{ t.name }}</span>
            <span class="tpl__desc">{{ t.description }}</span>
          </button>
        }
      </div>

      <ws-section-title title="参数调整" hint="拖动滑块即时调整" />

      <div class="prm">
        @for (p of params; track p.key) {
          <div class="prm__row">
            <div class="prm__head">
              <span class="prm__label">{{ p.label }}</span>
              <span class="prm__value">{{ p.text(engine.params()[p.key]) }}</span>
            </div>
            <input
              class="ws-range"
              type="range"
              [min]="p.min"
              [max]="p.max"
              [step]="p.step"
              [value]="engine.params()[p.key]"
              [attr.aria-label]="p.label"
              (input)="onParam(p.key, $event)"
            />
            <p class="prm__hint">{{ p.hint }}</p>
          </div>
        }
      </div>

      @if (state.focusSkuIds().length) {
        <ws-section-title title="聚焦 SKU" [hint]="focusCount()" />
        <div class="focus">
          @for (id of state.focusSkuIds(); track id) {
            <span class="ws-tag focus__tag">
              {{ skuName(id) }}
              <button
                type="button"
                class="focus__x"
                [attr.aria-label]="'移除 ' + skuName(id)"
                (click)="removeFocus(id)"
              >
                <ws-icon name="close" [size]="12" />
              </button>
            </span>
          }
        </div>
      }

      <div class="acts">
        <button
          type="button"
          class="ws-btn ws-btn--primary"
          [disabled]="engine.running()"
          (click)="engine.run()"
        >
          <ws-icon name="play" [size]="14" />
          {{ engine.running() ? '推演中…' : '运行模拟' }}
        </button>
        <button type="button" class="ws-btn ws-btn--ghost" (click)="engine.reset()">
          <ws-icon name="refresh" [size]="14" />
          重置参数
        </button>
      </div>

      @if (engine.isDirty()) {
        <div class="ws-warn-banner">参数已修改，结果尚未更新，请重新运行模拟。</div>
      }
    </ws-card>
  `,
  styles: `
    :host {
      display: block;
    }

    ws-section-title + .tpl,
    ws-section-title + .prm,
    ws-section-title + .focus {
      margin-top: var(--sp-3);
    }

    ws-section-title:not(:first-of-type) {
      margin-top: var(--sp-5);
    }

    .tpl {
      display: flex;
      flex-direction: column;
      gap: var(--sp-2);
    }

    .tpl__card {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 2px;
      width: 100%;
      padding: var(--sp-3) var(--sp-3) var(--sp-3) var(--sp-4);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      background: var(--bg-surface);
      text-align: left;
      font: inherit;
      cursor: pointer;
      overflow: hidden;
    }

    .tpl__card::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 3px;
      background: transparent;
    }

    .tpl__card:hover {
      border-color: var(--border-strong);
      background: var(--bg-hover);
    }

    .tpl__card.is-active {
      border-color: var(--brand-primary);
      background: var(--brand-soft);
    }

    .tpl__card.is-active::before {
      background: var(--brand-primary);
    }

    .tpl__code {
      font-size: 15px;
      font-weight: 600;
      color: var(--brand-ink);
    }

    .tpl__name {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .tpl__desc {
      font-size: 12px;
      line-height: 1.6;
      color: var(--text-secondary);
    }

    .prm {
      display: flex;
      flex-direction: column;
      gap: var(--sp-4);
    }

    .prm__head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--sp-2);
    }

    .prm__label {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .prm__value {
      font-size: 13px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      color: var(--brand-primary);
    }

    .prm__hint {
      margin: var(--sp-1) 0 0;
      font-size: 11px;
      color: var(--text-muted);
    }

    .prm input.ws-range {
      display: block;
    }

    .focus {
      display: flex;
      flex-wrap: wrap;
      gap: var(--sp-2);
    }

    .focus__tag {
      gap: var(--sp-1);
      padding-right: var(--sp-1);
    }

    .focus__x {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      padding: 0;
      border: 0;
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--text-muted);
      cursor: pointer;
    }

    .focus__x:hover {
      background: var(--bg-hover);
      color: var(--status-red);
    }

    .acts {
      display: flex;
      gap: var(--sp-2);
      margin-top: var(--sp-5);
    }

    .acts .ws-btn {
      flex: 1 1 auto;
    }

    .ws-warn-banner {
      margin-top: var(--sp-3);
    }
  `,
})
export class ScenarioParamsPanel {
  protected readonly engine = inject(ScenarioEngineService);
  protected readonly state = inject(StateService);
  private readonly data = inject(SentinelDataService);

  protected readonly params = PARAMS;

  protected readonly focusCount = (): string => `${this.state.focusSkuIds().length} 项由库存中心带入`;

  protected onParam(key: ScenarioParamKey, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.engine.patchParams(PARAM_PATCH[key](value));
  }

  protected skuName(id: string): string {
    return this.data.getSku(id)?.name ?? id;
  }

  protected removeFocus(id: string): void {
    this.state.setFocusSkus(this.state.focusSkuIds().filter((item) => item !== id));
  }
}
