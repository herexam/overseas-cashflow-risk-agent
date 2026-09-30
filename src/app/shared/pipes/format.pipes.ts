import { Pipe, type PipeTransform } from '@angular/core';

const DASH = '—';

/** 把未知输入安全转成数字，失败返回 null（模板里统一显示为 —） */
function toNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function group(value: number, decimals: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** 纯数字千分位。用法：`{{ 8420 | wsNum }}` → 8,420 */
@Pipe({ name: 'wsNum' })
export class WsNumPipe implements PipeTransform {
  transform(value: number | null | undefined, decimals = 0): string {
    const parsed = toNumber(value);
    return parsed === null ? DASH : group(parsed, decimals);
  }
}

/**
 * 金额（单位：万元，与全站口径一致）。
 * 用法：`{{ 32910 | wsAmount }}` → 32,910 万元
 */
@Pipe({ name: 'wsAmount' })
export class WsAmountPipe implements PipeTransform {
  transform(value: number | null | undefined, decimals = 0, withUnit = true): string {
    const parsed = toNumber(value);
    if (parsed === null) {
      return DASH;
    }
    return withUnit ? `${group(parsed, decimals)} 万元` : group(parsed, decimals);
  }
}

/**
 * 比率转百分比。入参为小数（0.214 → 21.4%），与 Mock 中的 ratio 字段口径一致。
 */
@Pipe({ name: 'wsPercent' })
export class WsPercentPipe implements PipeTransform {
  transform(value: number | null | undefined, decimals = 1): string {
    const parsed = toNumber(value);
    return parsed === null ? DASH : `${(parsed * 100).toFixed(decimals)}%`;
  }
}

/**
 * 已换算为「百分点」的数值，带正负号。入参为 6.4 → +6.4%。
 */
@Pipe({ name: 'wsRate' })
export class WsRatePipe implements PipeTransform {
  transform(value: number | null | undefined, decimals = 2): string {
    const parsed = toNumber(value);
    if (parsed === null) {
      return DASH;
    }
    const sign = parsed > 0 ? '+' : '';
    return `${sign}${parsed.toFixed(decimals)}%`;
  }
}

/** 带正负号的绝对值，用于差额展示。 */
@Pipe({ name: 'wsSigned' })
export class WsSignedPipe implements PipeTransform {
  transform(value: number | null | undefined, decimals = 0, unit = ''): string {
    const parsed = toNumber(value);
    if (parsed === null) {
      return DASH;
    }
    const sign = parsed > 0 ? '+' : '';
    return `${sign}${group(parsed, decimals)}${unit}`;
  }
}

/** 日期展示。`'short'` 输出 MM-DD，默认输出 YYYY-MM-DD。 */
@Pipe({ name: 'wsDate' })
export class WsDatePipe implements PipeTransform {
  transform(value: string | null | undefined, mode: 'full' | 'short' | 'month' = 'full'): string {
    if (!value) {
      return DASH;
    }
    const normalized = value.trim().replace(/\//g, '-');
    const datePart = normalized.split(' ')[0] ?? normalized;
    const segments = datePart.split('-');
    if (segments.length !== 3) {
      return value;
    }
    const [year, month, day] = segments;
    if (mode === 'short') {
      return `${month}-${day}`;
    }
    if (mode === 'month') {
      return `${year}-${month}`;
    }
    return datePart;
  }
}
