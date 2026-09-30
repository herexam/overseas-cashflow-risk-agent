import { ChangeDetectionStrategy, Component, Directive, ElementRef, inject, input } from '@angular/core';

import { TooltipPlacement, TooltipService } from './tooltip.service';

/**
 * 给任意元素挂 Tooltip：`<button [wsTooltip]="'说明文字'">`。
 * 空字符串不触发，避免空浮层。
 */
@Directive({
  selector: '[wsTooltip]',
  host: {
    '(mouseenter)': 'onShow()',
    '(focusin)': 'onShow()',
    '(mouseleave)': 'onHide()',
    '(focusout)': 'onHide()',
    '(click)': 'onHide()',
  },
})
export class WsTooltipDirective {
  readonly wsTooltip = input<string>('');
  readonly tooltipPlacement = input<TooltipPlacement>('top');

  private readonly svc = inject(TooltipService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected onShow(): void {
    const text = this.wsTooltip();
    if (!text) {
      return;
    }
    this.svc.show(text, this.host.nativeElement.getBoundingClientRect(), this.tooltipPlacement());
  }

  protected onHide(): void {
    this.svc.hide();
  }
}

@Component({
  selector: 'ws-tooltip-layer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (state(); as s) {
      <div class="ws-tooltip" [class]="'ws-tooltip--' + s.placement" [style.left.px]="s.x" [style.top.px]="s.y">
        {{ s.text }}
      </div>
    }
  `,
  styles: `
    .ws-tooltip {
      position: fixed;
      z-index: var(--z-tooltip);
      max-width: 280px;
      padding: 6px 10px;
      border-radius: var(--radius-sm);
      background: var(--brand-ink);
      color: #fff;
      font-size: 12px;
      line-height: 1.5;
      pointer-events: none;
      box-shadow: var(--shadow-sm);
      animation: ws-fade 0.12s ease-out;
    }

    .ws-tooltip--top {
      transform: translate(-50%, -100%);
    }

    .ws-tooltip--bottom {
      transform: translate(-50%, 0);
    }

    .ws-tooltip--left {
      transform: translate(-100%, -50%);
    }

    .ws-tooltip--right {
      transform: translate(0, -50%);
    }
  `,
})
export class WsTooltipLayer {
  private readonly svc = inject(TooltipService);
  protected readonly state = this.svc.state;
}
