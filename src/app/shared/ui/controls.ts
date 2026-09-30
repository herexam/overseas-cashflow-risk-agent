import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export interface SegmentedOption {
  readonly value: string;
  readonly label: string;
  readonly hint?: string;
}

/** 分段控件：时间窗口、口径切换、视图切换。 */
@Component({
  selector: 'ws-segmented',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ws-btn-group seg" role="group" [attr.aria-label]="ariaLabel()">
      @for (opt of options(); track opt.value) {
        <button
          type="button"
          [class.seg__btn--lg]="size() === 'md'"
          [attr.aria-pressed]="opt.value === value()"
          [attr.title]="opt.hint ?? opt.label"
          (click)="pick(opt.value)"
        >
          {{ opt.label }}
        </button>
      }
    </div>
  `,
  styles: `
    :host {
      display: inline-flex;
      max-width: 100%;
    }

    .seg {
      max-width: 100%;
      overflow-x: auto;
    }

    .seg button {
      white-space: nowrap;
    }

    .seg__btn--lg {
      height: 34px !important;
      padding: 0 var(--sp-4) !important;
      font-size: 13px !important;
    }
  `,
})
export class WsSegmented {
  readonly value = input.required<string>();
  readonly options = input.required<readonly SegmentedOption[]>();
  readonly size = input<'sm' | 'md'>('sm');
  readonly ariaLabel = input('');

  readonly changed = output<string>();

  protected pick(next: string): void {
    if (next !== this.value()) {
      this.changed.emit(next);
    }
  }
}

export interface TabItem {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
  readonly badge?: string | number;
}

/** 下划线式标签页：同一页面内的视角切换。 */
@Component({
  selector: 'ws-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tabs" role="tablist">
      @for (tab of tabs(); track tab.id) {
        <button
          type="button"
          class="tabs__item"
          role="tab"
          [class.is-active]="tab.id === active()"
          [attr.aria-selected]="tab.id === active()"
          [attr.title]="tab.hint ?? ''"
          (click)="pick(tab.id)"
        >
          <span>{{ tab.label }}</span>
          @if (tab.badge !== undefined && tab.badge !== '') {
            <span class="tabs__badge">{{ tab.badge }}</span>
          }
        </button>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      max-width: 100%;
    }

    .tabs {
      display: flex;
      align-items: center;
      gap: var(--sp-5);
      border-bottom: 1px solid var(--border);
      overflow-x: auto;
    }

    .tabs__item {
      display: inline-flex;
      align-items: center;
      gap: var(--sp-2);
      padding: 0 0 var(--sp-3);
      border: 0;
      border-bottom: 2px solid transparent;
      background: transparent;
      font-size: 13px;
      font-weight: 500;
      color: var(--text-secondary);
      white-space: nowrap;
      cursor: pointer;
      transition: color 0.12s ease-out;
    }

    .tabs__item:hover {
      color: var(--text-primary);
    }

    .tabs__item.is-active {
      color: var(--brand-primary);
      border-bottom-color: var(--brand-primary);
      font-weight: 600;
    }

    .tabs__badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 18px;
      height: 18px;
      padding: 0 5px;
      border-radius: var(--radius-pill);
      background: var(--bg-subtle);
      color: var(--text-secondary);
      font-size: 10px;
      font-weight: 600;
    }

    .tabs__item.is-active .tabs__badge {
      background: var(--brand-soft);
      color: var(--brand-primary);
    }
  `,
})
export class WsTabs {
  readonly tabs = input.required<readonly TabItem[]>();
  readonly active = input.required<string>();

  readonly changed = output<string>();

  protected pick(id: string): void {
    if (id !== this.active()) {
      this.changed.emit(id);
    }
  }
}

export interface SortChange {
  readonly key: string;
  readonly direction: 'asc' | 'desc';
}

/**
 * 可排序表头。作为 <th> 上的属性使用：
 * <th wsSort="value" [activeKey]="sortKey()" [direction]="sortDir()" (sorted)="onSort($event)">金额</th>
 */
@Component({
  selector: 'th[wsSort]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    scope: 'col',
    '[class.is-sorted]': 'active()',
  },
  template: `
    <button type="button" class="ws-th-sort" [class.is-active]="active()" (click)="toggle()">
      <ng-content />
      <svg class="ws-th-sort__icon" width="10" height="10" viewBox="0 0 12 12" fill="currentColor">
        <path [attr.d]="iconPath()" />
      </svg>
    </button>
  `,
  styles: `
    :host {
      white-space: nowrap;
    }
  `,
})
export class WsSortHeader {
  readonly wsSort = input.required<string>();

  readonly activeKey = input('');
  readonly direction = input<'asc' | 'desc'>('desc');
  readonly defaultDirection = input<'asc' | 'desc'>('desc');

  readonly sorted = output<SortChange>();

  protected active(): boolean {
    return this.activeKey() === this.wsSort();
  }

  protected toggle(): void {
    const key = this.wsSort();
    const next: 'asc' | 'desc' = this.active()
      ? this.direction() === 'asc'
        ? 'desc'
        : 'asc'
      : this.defaultDirection();
    this.sorted.emit({ key, direction: next });
  }

  protected iconPath(): string {
    if (!this.active()) {
      return 'M6 2 9 5.5H3zM6 10 3 6.5h6z';
    }
    return this.direction() === 'asc' ? 'M6 2 10 8H2z' : 'M6 10 2 4h8z';
  }
}
