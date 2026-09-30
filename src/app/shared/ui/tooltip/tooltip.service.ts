import { Injectable, signal } from '@angular/core';

export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipState {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly placement: TooltipPlacement;
}

const GAP = 10;
const EDGE = 8;

/**
 * 轻量 Tooltip 覆盖层状态。
 *
 * 说明：全站只渲染一个浮层（挂在 App 根节点），由 `wsTooltip` 指令在
 * mouseenter / focusin 时写入坐标。这样避免了为每个元素创建一份浮层 DOM。
 */
@Injectable({ providedIn: 'root' })
export class TooltipService {
  private readonly stateSignal = signal<TooltipState | null>(null);
  readonly state = this.stateSignal.asReadonly();

  show(text: string, host: DOMRect, placement: TooltipPlacement = 'top'): void {
    if (!text) {
      return;
    }
    const resolved: TooltipPlacement =
      placement === 'top' && host.top < 48 ? 'bottom' : placement;

    let x = host.left + host.width / 2;
    let y = resolved === 'bottom' ? host.bottom + GAP : host.top - GAP;

    if (resolved === 'left') {
      x = host.left - GAP;
      y = host.top + host.height / 2;
    } else if (resolved === 'right') {
      x = host.right + GAP;
      y = host.top + host.height / 2;
    }

    x = Math.min(Math.max(x, EDGE), window.innerWidth - EDGE);

    this.stateSignal.set({ text, x, y, placement: resolved });
  }

  hide(): void {
    this.stateSignal.set(null);
  }
}
