import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import type { EChartsOption } from 'echarts';
import * as echarts from 'echarts';
import { WsEmptyState, WsSkeleton } from './primitives';

type EChartsInstance = echarts.ECharts;

/**
 * ECharts 容器封装。
 * - zoneless：options 变更由 signal effect 驱动，不依赖变更检测。
 * - resize：容器 ResizeObserver + 侧边栏折叠等布局变化兜底。
 * - 空 / 加载态：覆盖层渲染，避免出现「空白图表区」。
 */
@Component({
  selector: 'ws-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [WsEmptyState, WsSkeleton],
  template: `
    <div class="chart-host" [style.height.px]="height()">
      <div class="chart-canvas" #canvas></div>
      @if (loading()) {
        <div class="chart-veil">
          <ws-skeleton [height]="height() - 16" />
        </div>
      } @else if (empty()) {
        <div class="chart-veil">
          <ws-empty-state [title]="emptyTitle()" description="当前筛选条件下没有可展示的数据" />
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
    }

    .chart-host {
      position: relative;
      width: 100%;
    }

    .chart-canvas {
      width: 100%;
      height: 100%;
    }

    .chart-veil {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bg-surface);
      border-radius: var(--radius-md);
    }
  `,
})
export class WsChart {
  readonly options = input.required<EChartsOption>();
  readonly height = input(260);
  readonly loading = input(false);
  readonly empty = input(false);
  readonly emptyTitle = input('暂无数据');

  private readonly canvasRef = viewChild<ElementRef<HTMLElement>>('canvas');
  private readonly destroyRef = inject(DestroyRef);

  private instance: EChartsInstance | null = null;
  private boundEl: HTMLElement | null = null;
  private observer: ResizeObserver | null = null;
  private pending: EChartsOption | null = null;

  constructor() {
    effect(() => {
      const el = this.canvasRef()?.nativeElement;
      const option = this.options();
      const hidden = this.empty();

      if (!el) {
        return;
      }

      this.attach(el);

      if (hidden) {
        this.pending = null;
        return;
      }

      this.pending = option;
      if (this.instance) {
        this.instance.setOption(option, true);
        this.scheduleResize();
      }
    });

    this.destroyRef.onDestroy(() => this.teardown());
  }

  /** 绑定容器：首次需要等容器完成布局后再 init，避免 ECharts 0 尺寸告警。 */
  private attach(el: HTMLElement): void {
    if (this.boundEl === el) {
      return;
    }

    this.teardown();
    this.boundEl = el;

    this.observer = new ResizeObserver(() => {
      this.initIfSized();
      this.instance?.resize();
    });
    this.observer.observe(el);

    this.initIfSized();
  }

  private initIfSized(): void {
    const el = this.boundEl;
    if (!el || this.instance) {
      return;
    }
    if (el.clientWidth === 0 || el.clientHeight === 0) {
      return;
    }

    this.instance = echarts.init(el, undefined, { renderer: 'canvas' });
    if (this.pending) {
      this.instance.setOption(this.pending, true);
      this.scheduleResize();
    }
  }

  private scheduleResize(): void {
    const inst = this.instance;
    if (!inst) {
      return;
    }
    setTimeout(() => {
      inst.resize();
    }, 0);
  }

  private teardown(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.instance?.dispose();
    this.instance = null;
    this.boundEl = null;
  }
}
