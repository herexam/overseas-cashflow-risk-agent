import type { EChartsOption } from 'echarts';

/**
 * ECharts 统一视觉配置。
 * 极简主义：浅灰网格线、无坐标轴线噪音、深蓝 tooltip、克制配色。
 */

export const CHART_COLORS = {
  blue: '#2563eb',
  teal: '#0d9488',
  amber: '#d97706',
  violet: '#7c3aed',
  red: '#dc2626',
  slate: '#64748b',
} as const;

export const CHART_PALETTE: readonly string[] = [
  CHART_COLORS.blue,
  CHART_COLORS.teal,
  CHART_COLORS.amber,
  CHART_COLORS.violet,
  CHART_COLORS.red,
  CHART_COLORS.slate,
];

export const CHART_GRID_LINE = '#eef2f6';
export const CHART_AXIS_LINE = '#e2e8f0';
export const CHART_LABEL = '#64748b';
export const CHART_INK = '#0b2a5b';

export type ChartSeries = Exclude<NonNullable<EChartsOption['series']>, readonly unknown[]>;
export type ChartXAxis = NonNullable<EChartsOption['xAxis']>;
export type ChartYAxis = NonNullable<EChartsOption['yAxis']>;
export type ChartGrid = NonNullable<EChartsOption['grid']>;
export type ChartLegend = NonNullable<EChartsOption['legend']>;
export type ChartTooltip = NonNullable<EChartsOption['tooltip']>;

export interface AxisOptions {
  readonly name?: string;
  readonly min?: number;
  readonly max?: number;
  readonly interval?: number;
  readonly decimals?: number;
  readonly unit?: string;
  readonly scale?: boolean;
  readonly splitLine?: boolean;
}

export interface SeriesOptions {
  readonly color?: string;
  readonly smooth?: boolean;
  readonly area?: boolean;
  readonly dashed?: boolean;
  readonly yAxisIndex?: number;
  readonly symbol?: boolean;
  readonly stack?: string;
  readonly barWidth?: number | string;
  readonly showLabel?: boolean;
  readonly labelUnit?: string;
  readonly labelFormatter?: (value: number) => string;
}

export function tooltipConfig(trigger: 'axis' | 'item' = 'axis'): ChartTooltip {
  return {
    trigger,
    backgroundColor: CHART_INK,
    borderWidth: 0,
    padding: [8, 12],
    textStyle: { color: '#ffffff', fontSize: 12 },
    axisPointer: { type: 'line', lineStyle: { color: CHART_AXIS_LINE, width: 1 } },
    extraCssText: 'border-radius:8px;box-shadow:0 8px 24px rgba(15,23,42,.18);',
  };
}

export function gridConfig(
  opts: { readonly left?: number; readonly right?: number; readonly top?: number; readonly bottom?: number } = {},
): ChartGrid {
  return {
    left: opts.left ?? 8,
    right: opts.right ?? 16,
    top: opts.top ?? 32,
    bottom: opts.bottom ?? 8,
    containLabel: true,
  };
}

export function legendConfig(
  opts: { readonly top?: number; readonly right?: number; readonly bottom?: number } = {},
): ChartLegend {
  return {
    top: opts.top ?? 0,
    right: opts.right ?? 0,
    bottom: opts.bottom,
    itemWidth: 10,
    itemHeight: 10,
    itemGap: 16,
    icon: 'roundRect',
    textStyle: { color: CHART_LABEL, fontSize: 12 },
  };
}

export function categoryAxis(
  data: readonly string[],
  opts: { readonly boundaryGap?: boolean; readonly name?: string; readonly interval?: number } = {},
): ChartXAxis {
  return {
    type: 'category',
    data: [...data],
    name: opts.name,
    boundaryGap: opts.boundaryGap ?? true,
    axisLine: { lineStyle: { color: CHART_AXIS_LINE } },
    axisTick: { show: false },
    axisLabel: { color: CHART_LABEL, fontSize: 11, interval: opts.interval ?? 0, hideOverlap: true },
  };
}

export function valueAxis(opts: AxisOptions = {}): ChartYAxis {
  const decimals = opts.decimals;
  return {
    type: 'value',
    name: opts.name,
    min: opts.min,
    max: opts.max,
    interval: opts.interval,
    scale: opts.scale ?? false,
    splitLine: {
      show: opts.splitLine ?? true,
      lineStyle: { color: CHART_GRID_LINE, type: 'dashed' },
    },
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: {
      color: CHART_LABEL,
      fontSize: 11,
      formatter: (value: number) => `${decimals === undefined ? value : value.toFixed(decimals)}${opts.unit ?? ''}`,
    },
  };
}

/**
 * 横向柱状图的数值轴（X 轴）。
 * ECharts 的类型把 xAxis / yAxis 的 mainType 严格区分，此处做一次显式拓宽，
 * 运行期对象本身即为合法的数值轴配置。
 */
export function horizontalValueAxis(opts: AxisOptions = {}): ChartXAxis {
  return valueAxis(opts) as unknown as ChartXAxis;
}

export function lineSeries(
  name: string,
  data: readonly number[],
  opts: SeriesOptions = {},
): ChartSeries {
  return {
    type: 'line',
    name,
    data: [...data],
    smooth: opts.smooth ?? true,
    symbol: opts.symbol === true ? 'circle' : 'none',
    symbolSize: 6,
    yAxisIndex: opts.yAxisIndex,
    stack: opts.stack,
    lineStyle: {
      width: 2,
      color: opts.color,
      type: opts.dashed === true ? 'dashed' : 'solid',
    },
    itemStyle: { color: opts.color },
    label: {
      show: opts.showLabel ?? false,
      position: 'top',
      color: CHART_LABEL,
      fontSize: 11,
      formatter: (params: { value?: unknown }) =>
        `${opts.labelFormatter ? opts.labelFormatter(Number(params.value)) : String(params.value ?? '')}${opts.labelUnit ?? ''}`,
    },
  };
}

export function areaSeries(
  name: string,
  data: readonly number[],
  opts: SeriesOptions = {},
): ChartSeries {
  return {
    type: 'line',
    name,
    data: [...data],
    smooth: opts.smooth ?? true,
    symbol: 'none',
    yAxisIndex: opts.yAxisIndex,
    lineStyle: { width: 2, color: opts.color },
    itemStyle: { color: opts.color },
    areaStyle: { color: opts.color, opacity: 0.12 },
  };
}

export function barSeries(
  name: string,
  data: readonly number[],
  opts: SeriesOptions = {},
): ChartSeries {
  return {
    type: 'bar',
    name,
    data: [...data],
    stack: opts.stack,
    yAxisIndex: opts.yAxisIndex,
    barWidth: opts.barWidth ?? '52%',
    itemStyle: { color: opts.color, borderRadius: [3, 3, 0, 0] },
    label: {
      show: opts.showLabel ?? false,
      position: 'top',
      color: CHART_LABEL,
      fontSize: 11,
      formatter: (params: { value?: unknown }) =>
        `${opts.labelFormatter ? opts.labelFormatter(Number(params.value)) : String(params.value ?? '')}${opts.labelUnit ?? ''}`,
    },
  };
}

export interface PieSlice {
  readonly name: string;
  readonly value: number;
  readonly color?: string;
}

export function pieSeries(
  name: string,
  data: readonly PieSlice[],
  opts: { readonly radius?: readonly [string, string]; readonly center?: readonly [string, string]; readonly showLabel?: boolean } = {},
): ChartSeries {
  return {
    type: 'pie',
    name,
    radius: opts.radius ? [opts.radius[0], opts.radius[1]] : ['58%', '76%'],
    center: opts.center ? [opts.center[0], opts.center[1]] : ['50%', '50%'],
    avoidLabelOverlap: true,
    itemStyle: { borderColor: '#ffffff', borderWidth: 2 },
    label: {
      show: opts.showLabel ?? true,
      color: CHART_LABEL,
      fontSize: 11,
      formatter: '{b} {d}%',
    },
    labelLine: { show: opts.showLabel ?? true, length: 8, length2: 8, lineStyle: { color: CHART_AXIS_LINE } },
    data: data.map((slice) => ({
      name: slice.name,
      value: slice.value,
      itemStyle: slice.color ? { color: slice.color } : undefined,
    })),
  };
}

/** 环形图中心文字（用于风险分布等占比型图表）。 */
export function donutCenterLabel(text: string, sub: string): EChartsOption['graphic'] {
  return {
    type: 'group',
    left: 'center',
    top: 'center',
    children: [
      {
        type: 'text',
        style: { text, fill: CHART_INK, fontSize: 22, fontWeight: 600, align: 'center' },
      },
      {
        type: 'text',
        top: 26,
        style: { text: sub, fill: CHART_LABEL, fontSize: 11, align: 'center' },
      },
    ],
  };
}

/** 空状态图表占位（无数据时避免出现空白画布）。 */
export function emptyChartOption(message = '暂无数据'): EChartsOption {
  return {
    title: {
      text: message,
      left: 'center',
      top: 'center',
      textStyle: { color: CHART_LABEL, fontSize: 13, fontWeight: 400 },
    },
  };
}
