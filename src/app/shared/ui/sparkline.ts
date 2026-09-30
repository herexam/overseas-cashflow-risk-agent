import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { toneTextClass, type WsTone } from './primitives';

interface SparkCoord {
  readonly x: number;
  readonly y: number;
}

/** 极简迷你趋势线（纯内联 SVG，不依赖图表库，用于指标卡）。 */
@Component({
  selector: 'ws-sparkline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      [attr.width]="width()"
      [attr.height]="height()"
      viewBox="0 0 100 28"
      preserveAspectRatio="none"
      [class]="'spark ' + toneClass()"
      aria-hidden="true"
      focusable="false"
    >
      <path [attr.d]="areaPath()" fill="currentColor" opacity="0.12" stroke="none" />
      <polyline
        [attr.points]="points()"
        fill="none"
        stroke="currentColor"
        [attr.stroke-width]="1.5"
        vector-effect="non-scaling-stroke"
        stroke-linejoin="round"
        stroke-linecap="round"
      />
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
    }
    .spark {
      display: block;
      overflow: visible;
    }
  `,
})
export class WsSparkline {
  readonly data = input<readonly number[]>([]);
  readonly tone = input<WsTone>('blue');
  readonly height = input(28);
  readonly width = input(72);

  protected readonly toneClass = computed(() => toneTextClass(this.tone()));

  private readonly coords = computed<readonly SparkCoord[]>(() => {
    const data = this.data();
    if (data.length === 0) return [];
    const min = Math.min(...data);
    const max = Math.max(...data);
    const flat = max === min;
    const span = flat ? 1 : max - min;
    const top = 4;
    const bottom = 24;
    return data.map((value, index) => ({
      x: data.length === 1 ? 50 : (index / (data.length - 1)) * 100,
      y: flat ? (top + bottom) / 2 : bottom - ((value - min) / span) * (bottom - top),
    }));
  });

  protected readonly points = computed(() =>
    this.coords()
      .map((c) => `${c.x.toFixed(2)},${c.y.toFixed(2)}`)
      .join(' '),
  );

  protected readonly areaPath = computed(() => {
    const coords = this.coords();
    if (coords.length === 0) return '';
    const first = coords[0];
    const last = coords[coords.length - 1];
    const body = coords.map((c) => `L${c.x.toFixed(2)},${c.y.toFixed(2)}`).join('');
    return `M${first.x.toFixed(2)},28${body}L${last.x.toFixed(2)},28Z`;
  });
}
