import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type {
  EvidenceCard,
  FivePartAnalysis,
  SuggestedAction,
  WhyItem,
} from '../../core/models/analysis.model';
import { WsIcon } from './icon/icon';
import { WsNatureBadge } from './primitives';
import { WsActionLabelPipe, WsPriorityLabelPipe } from '../pipes/label.pipes';
import { WsAmountPipe } from '../pipes/format.pipes';

const LIKELIHOOD_LABEL: Record<WhyItem['likelihood'], string> = {
  high: '高',
  medium: '中',
  low: '低',
};

/** 证据来源卡片：来源系统 / 指标 / 当前值 / 基准 / 口径 / 数据性质。 */
@Component({
  selector: 'ws-evidence-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [WsNatureBadge, WsIcon],
  template: `
    <article class="ev">
      <header class="ev__head">
        <span class="ev__source">
          <ws-icon name="database" [size]="12" />
          {{ evidence().sourceSystem }}
        </span>
        <ws-nature-badge [nature]="evidence().nature" />
      </header>

      <div class="ev__metric">{{ evidence().metric }}</div>

      <div class="ev__values">
        <span class="ev__value">{{ evidence().value }}</span>
        <span class="ev__baseline">基准 {{ evidence().baseline }}</span>
      </div>

      <dl class="ev__meta">
        <div class="ev__row">
          <dt>数据截止</dt>
          <dd>{{ evidence().asOf }}</dd>
        </div>
        <div class="ev__row ev__row--stack">
          <dt>口径</dt>
          <dd>{{ evidence().definition }}</dd>
        </div>
      </dl>
    </article>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
    }

    .ev {
      display: flex;
      flex-direction: column;
      gap: var(--sp-2);
      height: 100%;
      padding: var(--sp-3) var(--sp-4);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      background: var(--bg-surface);
    }

    .ev__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--sp-2);
    }

    .ev__source {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      min-width: 0;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.02em;
      color: var(--brand-ink);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .ev__metric {
      font-size: 12px;
      color: var(--text-secondary);
    }

    .ev__values {
      display: flex;
      align-items: baseline;
      gap: var(--sp-2);
      flex-wrap: wrap;
    }

    .ev__value {
      font-size: 16px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      color: var(--text-primary);
    }

    .ev__baseline {
      font-size: 11px;
      color: var(--text-muted);
      font-variant-numeric: tabular-nums;
    }

    .ev__meta {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin: 0;
      padding-top: var(--sp-2);
      border-top: 1px solid var(--border);
    }

    .ev__row {
      display: flex;
      gap: var(--sp-2);
      font-size: 11px;
      line-height: 1.5;
    }

    .ev__row dt {
      flex: 0 0 auto;
      color: var(--text-muted);
    }

    .ev__row dd {
      margin: 0;
      min-width: 0;
      color: var(--text-secondary);
    }

    .ev__row--stack {
      flex-direction: column;
      gap: 1px;
    }
  `,
})
export class WsEvidenceCard {
  readonly evidence = input.required<EvidenceCard>();
}

/**
 * 五段式 AI 分析。全系统唯一 AI 输出格式，段落顺序固定，不得重排。
 * ① 发生了什么 ② 为什么发生 ③ 可能造成什么影响 ④ 现在应该做什么 ⑤ 证据与数据来源
 */
@Component({
  selector: 'ws-five-part',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    WsIcon,
    WsEvidenceCard,
    WsActionLabelPipe,
    WsPriorityLabelPipe,
    WsAmountPipe,
  ],
  template: `
    <section class="fy">
      <header class="fy__head">
        <div class="fy__brand">
          <span class="fy__mark"><ws-icon name="sparkle" [size]="13" /></span>
          <div class="fy__brand-main">
            <h3 class="fy__title">{{ title() }}</h3>
            <p class="fy__sub">
              五段式风险解释 · 证据可追溯 {{ analysis().integrity.traceable }}/{{
                analysis().integrity.total
              }}
            </p>
          </div>
        </div>
        <span class="fy__integrity" [class.is-warn]="integrityOk() === false">
          {{ integrityOk() ? '证据完整' : '证据不完整' }}
        </span>
      </header>

      @if (analysis().degradedNote; as note) {
        <div class="ws-warn-banner">
          <ws-icon name="alert" [size]="14" />
          <span>{{ note }}</span>
        </div>
      }

      <ol class="fy__parts">
        <li class="part">
          <span class="part__no">1</span>
          <div class="part__body">
            <h4 class="part__title">发生了什么</h4>
            <p class="part__text">{{ analysis().whatHappened }}</p>
          </div>
        </li>

        <li class="part">
          <span class="part__no">2</span>
          <div class="part__body">
            <h4 class="part__title">为什么发生</h4>
            <ul class="why">
              @for (item of analysis().why; track item.text) {
                <li class="why__item">
                  <span class="why__likelihood" [class]="'why__likelihood tone-' + likelihoodTone(item)">
                    可能性{{ likelihoodLabel(item) }}
                  </span>
                  <span class="why__text">{{ item.text }}</span>
                </li>
              }
            </ul>
          </div>
        </li>

        <li class="part">
          <span class="part__no">3</span>
          <div class="part__body">
            <h4 class="part__title">可能造成什么影响</h4>
            <ul class="impact">
              @for (item of analysis().impact; track item.text) {
                <li class="impact__item">
                  <ws-icon name="alert" [size]="12" />
                  <span class="impact__text">{{ item.text }}</span>
                  @if (item.metric) {
                    <span class="impact__metric">{{ item.metric }}</span>
                  }
                  @if (item.delta) {
                    <span class="impact__delta">{{ item.delta }}</span>
                  }
                </li>
              }
            </ul>
          </div>
        </li>

        <li class="part">
          <span class="part__no">4</span>
          <div class="part__body">
            <h4 class="part__title">现在应该做什么</h4>
            <ul class="act">
              @for (item of analysis().actions; track item.id) {
                <li class="act__item">
                  <div class="act__main">
                    <div class="act__row">
                      <span class="ws-tag">{{ item.priority | wsPriority }}</span>
                      <span class="ws-tag">{{ item.actionType | wsAction }}</span>
                      @if (item.releaseAmount !== undefined) {
                        <span class="act__cash">
                          可释放 {{ item.releaseAmount | wsAmount }}
                        </span>
                      }
                    </div>
                    <p class="act__text">{{ item.text }}</p>
                    <p class="act__meta">
                      责任人 {{ item.owner }} · 截止 {{ item.dueDate }}
                      @if (item.route) {
                        · <a class="act__link" [href]="item.route">查看相关页面</a>
                      }
                    </p>
                  </div>
                  <button
                    type="button"
                    class="ws-btn ws-btn--sm"
                    (click)="assignAction.emit(item)"
                  >
                    <ws-icon name="target" [size]="13" />
                    指派动作
                  </button>
                </li>
              }
            </ul>
          </div>
        </li>

        <li class="part part--last">
          <span class="part__no">5</span>
          <div class="part__body">
            <h4 class="part__title">证据与数据来源</h4>
            <div class="evidence">
              @for (card of analysis().evidence; track card.id) {
                <ws-evidence-card [evidence]="card" />
              }
            </div>
          </div>
        </li>
      </ol>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }

    .fy {
      display: flex;
      flex-direction: column;
      gap: var(--sp-4);
      padding: var(--sp-5);
      border: 1px solid var(--status-info-border);
      border-radius: var(--radius-lg);
      background: linear-gradient(180deg, var(--brand-soft) 0%, var(--bg-surface) 120px);
    }

    .fy__head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--sp-4);
    }

    .fy__brand {
      display: flex;
      align-items: center;
      gap: var(--sp-3);
      min-width: 0;
    }

    .fy__mark {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 26px;
      flex: 0 0 auto;
      border-radius: var(--radius-sm);
      background: var(--brand-primary);
      color: var(--text-inverse);
    }

    .fy__title {
      margin: 0;
      font-size: 15px;
      font-weight: 600;
      color: var(--brand-ink);
    }

    .fy__sub {
      margin: 0;
      font-size: 11px;
      color: var(--text-secondary);
    }

    .fy__integrity {
      flex: 0 0 auto;
      padding: 2px 8px;
      border: 1px solid var(--status-green-border);
      border-radius: var(--radius-pill);
      background: var(--status-green-soft);
      color: var(--status-green);
      font-size: 11px;
      font-weight: 600;
    }

    .fy__integrity.is-warn {
      border-color: var(--status-yellow-border);
      background: var(--status-yellow-soft);
      color: var(--status-yellow);
    }

    .fy__parts {
      display: flex;
      flex-direction: column;
      gap: var(--sp-4);
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .part {
      display: flex;
      gap: var(--sp-3);
      padding-bottom: var(--sp-4);
      border-bottom: 1px solid var(--border);
    }

    .part--last {
      padding-bottom: 0;
      border-bottom: 0;
    }

    .part__no {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      flex: 0 0 auto;
      margin-top: 1px;
      border-radius: var(--radius-sm);
      background: var(--bg-surface);
      border: 1px solid var(--border-strong);
      color: var(--brand-primary);
      font-size: 11px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }

    .part__body {
      display: flex;
      flex-direction: column;
      gap: var(--sp-2);
      min-width: 0;
      flex: 1 1 auto;
    }

    .part__title {
      margin: 0;
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .part__text {
      margin: 0;
      font-size: 13px;
      line-height: 1.7;
      color: var(--text-secondary);
    }

    .why,
    .impact,
    .act {
      display: flex;
      flex-direction: column;
      gap: var(--sp-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .why__item {
      display: flex;
      align-items: baseline;
      gap: var(--sp-2);
      font-size: 12px;
      line-height: 1.6;
    }

    .why__likelihood {
      flex: 0 0 auto;
      padding: 1px 6px;
      border: 1px solid var(--tone-border);
      border-radius: var(--radius-sm);
      background: var(--tone-soft);
      color: var(--tone);
      font-size: 10px;
      font-weight: 600;
    }

    .why__text {
      color: var(--text-secondary);
    }

    .impact__item {
      display: flex;
      align-items: baseline;
      gap: var(--sp-2);
      flex-wrap: wrap;
      font-size: 12px;
      line-height: 1.6;
      color: var(--text-secondary);
    }

    .impact__item ws-icon {
      color: var(--status-orange);
      align-self: center;
    }

    .impact__metric {
      color: var(--text-muted);
    }

    .impact__delta {
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      color: var(--status-orange);
    }

    .act__item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--sp-4);
      padding: var(--sp-3) var(--sp-4);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      background: var(--bg-surface);
    }

    .act__main {
      display: flex;
      flex-direction: column;
      gap: 3px;
      min-width: 0;
    }

    .act__row {
      display: flex;
      align-items: center;
      gap: var(--sp-2);
      flex-wrap: wrap;
    }

    .act__cash {
      font-size: 11px;
      font-weight: 600;
      color: var(--status-green);
      font-variant-numeric: tabular-nums;
    }

    .act__text {
      margin: 0;
      font-size: 12.5px;
      line-height: 1.6;
      color: var(--text-primary);
    }

    .act__meta {
      margin: 0;
      font-size: 11px;
      color: var(--text-muted);
    }

    .act__link {
      color: var(--brand-primary);
      text-decoration: none;
    }

    .act__link:hover {
      text-decoration: underline;
    }

    .evidence {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: var(--sp-3);
    }

    @media (max-width: 900px) {
      .act__item {
        flex-direction: column;
        align-items: flex-start;
      }
    }
  `,
})
export class WsFivePart {
  readonly analysis = input.required<FivePartAnalysis>();
  readonly title = input('Sentinel AI 分析');

  readonly assignAction = output<SuggestedAction>();

  protected integrityOk(): boolean {
    const { traceable, total } = this.analysis().integrity;
    return total > 0 && traceable >= total;
  }

  protected likelihoodLabel(item: WhyItem): string {
    return LIKELIHOOD_LABEL[item.likelihood];
  }

  protected likelihoodTone(item: WhyItem): string {
    if (item.likelihood === 'high') {
      return 'red';
    }
    return item.likelihood === 'medium' ? 'orange' : 'plain';
  }
}
