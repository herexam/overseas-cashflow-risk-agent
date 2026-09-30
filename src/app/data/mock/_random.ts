/**
 * 确定性随机数工具。
 *
 * Demo 中的长序列（90 天汇率、36 个月库存趋势等）不使用硬编码字面量，
 * 而是由固定种子的伪随机数生成器推导，保证：
 *  1. 每次刷新、每次构建结果完全一致，演示可复现；
 *  2. 源文件中不出现成百上千行无意义的数字。
 *
 * 所有生成结果均为 Demo 示例数据。
 */

/** mulberry32 —— 轻量确定性 PRNG */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 字符串 → 32 位种子，便于用业务 ID 当种子 */
export function seedFrom(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * 生成一条平滑的数值序列。
 * @param seed 种子
 * @param count 点数
 * @param base 起始值
 * @param drift 每期趋势增量
 * @param noise 噪声幅度（相对 base 的绝对值）
 * @param digits 小数位
 */
export function genSeries(
  seed: number,
  count: number,
  base: number,
  drift: number,
  noise: number,
  digits = 2,
): number[] {
  const rand = createRandom(seed);
  const out: number[] = [];
  let value = base;
  for (let i = 0; i < count; i += 1) {
    const seasonal = Math.sin((i / Math.max(count - 1, 1)) * Math.PI * 1.6) * noise * 0.6;
    value = value + drift + (rand() - 0.5) * 2 * noise + seasonal;
    if (value < 0) value = Math.abs(value) * 0.2;
    out.push(round(value, digits));
  }
  return out;
}

/** 生成带波动的整数序列（件数、台数等） */
export function genIntSeries(
  seed: number,
  count: number,
  base: number,
  drift: number,
  noise: number,
): number[] {
  return genSeries(seed, count, base, drift, noise, 0).map((n) => Math.max(0, Math.round(n)));
}

/** 在候选项中确定性挑选 */
export function pick<T>(seed: number, options: readonly T[]): T {
  const rand = createRandom(seed);
  return options[Math.floor(rand() * options.length) % options.length];
}

/* ------------------------------------------------------------------ */
/* 日期工具                                                            */
/* ------------------------------------------------------------------ */

/** Demo 统一数据截止时间（所有页面的「数据更新时间」以此为准） */
export const DEMO_AS_OF_DATE = '2026-09-15';
export const DEMO_AS_OF_TIME = '2026-09-15 08:30';

export function addDays(iso: string, days: number): string {
  const base = new Date(`${iso}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

export function shiftMonth(iso: string, months: number): string {
  const base = new Date(`${iso}T00:00:00Z`);
  base.setUTCMonth(base.getUTCMonth() + months);
  return base.toISOString().slice(0, 10);
}

/** 生成以 asOf 结尾、向前回溯 count 天的日期标签序列 */
export function dayLabels(asOf: string, count: number): string[] {
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    out.push(addDays(asOf, -i));
  }
  return out;
}

/** 生成以 asOf 所在月结尾、向前回溯 count 个月的月份标签（YYYY-MM） */
export function monthLabels(asOf: string, count: number): string[] {
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    out.push(shiftMonth(asOf, -i).slice(0, 7));
  }
  return out;
}

/** 简化日期展示：2026-09-15 → 09-15 */
export function shortDay(iso: string): string {
  return iso.slice(5);
}

/** 金额格式化（万元），配合模板管道使用 */
export function wan(value: number, digits = 0): string {
  return `${value.toLocaleString('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}
