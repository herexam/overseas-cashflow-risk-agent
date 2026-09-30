import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  TemplateRef,
  contentChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { WsIcon } from './icon/icon';

/** 覆盖层滚动锁：抽屉与弹窗共用计数，避免互相解锁。 */
let scrollLockCount = 0;

function lockScroll(): void {
  scrollLockCount += 1;
  document.body.style.overflow = 'hidden';
}

function unlockScroll(): void {
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (scrollLockCount === 0) {
    document.body.style.overflow = '';
  }
}

/** 跟随 open 变化登记 / 释放滚动锁，并在组件销毁时兜底释放。 */
function bindScrollLock(source: () => boolean): void {
  const destroyRef = inject(DestroyRef);
  let locked = false;

  effect(() => {
    const isOpen = source();
    if (isOpen === locked) {
      return;
    }
    locked = isOpen;
    if (isOpen) {
      lockScroll();
    } else {
      unlockScroll();
    }
  });

  destroyRef.onDestroy(() => {
    if (locked) {
      locked = false;
      unlockScroll();
    }
  });
}

/**
 * 右侧抽屉：风险详情、客户详情、SKU 详情等长内容。
 * 面板常驻 DOM（仅位移隐藏），保证内容投影状态稳定。
 */
@Component({
  selector: 'ws-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, WsIcon],
  host: {
    '(document:keydown.escape)': 'onClose()',
  },
  template: `
    @if (open()) {
      <div class="ws-overlay" (click)="onClose()"></div>
    }
    <aside
      class="ws-drawer"
      [class.is-open]="open()"
      [style.width.px]="width()"
      role="dialog"
      aria-modal="true"
      [attr.aria-hidden]="!open()"
      [attr.aria-label]="title()"
    >
      <header class="ws-drawer__head">
        <div class="dhead">
          @if (eyebrow()) {
            <span class="dhead__eyebrow">{{ eyebrow() }}</span>
          }
          <h2 class="dhead__title">{{ title() }}</h2>
          @if (subtitle()) {
            <p class="dhead__subtitle">{{ subtitle() }}</p>
          }
        </div>
        <button
          type="button"
          class="ws-btn ws-btn--ghost ws-btn--icon"
          (click)="onClose()"
          aria-label="关闭"
        >
          <ws-icon name="close" [size]="16" />
        </button>
      </header>

      <div class="ws-drawer__body">
        <ng-content />
      </div>

      <footer class="ws-drawer__foot">
        @if (foot(); as tpl) {
          <ng-container [ngTemplateOutlet]="tpl" />
        } @else {
          <button type="button" class="ws-btn" (click)="onClose()">关闭</button>
        }
      </footer>
    </aside>
  `,
  styles: `
    :host {
      display: contents;
    }

    .ws-drawer {
      transform: translateX(102%);
      visibility: hidden;
      pointer-events: none;
      transition:
        transform 0.2s ease-out,
        visibility 0.2s ease-out;
      animation: none;
    }

    .ws-drawer.is-open {
      transform: translateX(0);
      visibility: visible;
      pointer-events: auto;
    }

    .dhead {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .dhead__eyebrow {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--brand-primary);
    }

    .dhead__title {
      margin: 0;
      font-size: 17px;
      font-weight: 600;
      line-height: 1.4;
      color: var(--text-primary);
    }

    .dhead__subtitle {
      margin: 0;
      font-size: 12px;
      line-height: 1.5;
      color: var(--text-secondary);
    }
  `,
})
export class WsDrawer {
  readonly open = input.required<boolean>();
  readonly title = input.required<string>();
  readonly subtitle = input('');
  readonly eyebrow = input('');
  readonly width = input(620);

  readonly closed = output<void>();

  protected readonly foot = contentChild<TemplateRef<unknown>>('drawerFoot');

  constructor() {
    bindScrollLock(() => this.open());
  }

  protected onClose(): void {
    if (this.open()) {
      this.closed.emit();
    }
  }
}

/** 居中对话框：动作指派、参数确认、二次确认。 */
@Component({
  selector: 'ws-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, WsIcon],
  host: {
    '(document:keydown.escape)': 'onClose()',
  },
  template: `
    @if (open()) {
      <div class="ws-overlay ws-overlay--modal" (click)="onClose()"></div>
    }
    <div
      class="ws-modal"
      [class.is-open]="open()"
      [style.width.px]="width()"
      role="dialog"
      aria-modal="true"
      [attr.aria-hidden]="!open()"
      [attr.aria-label]="title()"
    >
      <header class="ws-modal__head">
        <div class="mhead">
          <div class="mhead__main">
            <h2 class="mhead__title">{{ title() }}</h2>
            @if (subtitle()) {
              <p class="mhead__subtitle">{{ subtitle() }}</p>
            }
          </div>
          <button
            type="button"
            class="ws-btn ws-btn--ghost ws-btn--icon"
            (click)="onClose()"
            aria-label="关闭"
          >
            <ws-icon name="close" [size]="16" />
          </button>
        </div>
      </header>

      <div class="ws-modal__body">
        <ng-content />
      </div>

      <footer class="ws-modal__foot">
        @if (foot(); as tpl) {
          <ng-container [ngTemplateOutlet]="tpl" />
        } @else {
          <button type="button" class="ws-btn" (click)="onClose()">取消</button>
        }
      </footer>
    </div>
  `,
  styles: `
    :host {
      display: contents;
    }

    .ws-modal {
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
      transition:
        opacity 0.16s ease-out,
        visibility 0.16s ease-out;
      animation: none;
    }

    .ws-modal.is-open {
      opacity: 1;
      visibility: visible;
      pointer-events: auto;
    }

    .mhead {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--sp-4);
    }

    .mhead__main {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .mhead__title {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .mhead__subtitle {
      margin: 0;
      font-size: 12px;
      color: var(--text-secondary);
    }
  `,
})
export class WsModal {
  readonly open = input.required<boolean>();
  readonly title = input.required<string>();
  readonly subtitle = input('');
  readonly width = input(520);

  readonly closed = output<void>();

  protected readonly foot = contentChild<TemplateRef<unknown>>('modalFoot');

  constructor() {
    bindScrollLock(() => this.open());
  }

  protected onClose(): void {
    if (this.open()) {
      this.closed.emit();
    }
  }
}
