import { Pipe, type PipeTransform } from '@angular/core';

import {
  ALERT_STATUS_LABEL,
  brakeActionMeta,
  DATA_NATURE_LABEL,
  PRIORITY_LABEL,
  riskLevelMeta,
  RISK_TYPE_LABEL,
  type AlertStatus,
  type BrakeAction,
  type DataNature,
  type Priority,
  type RiskLevel,
  type RiskType,
} from '../../core/models';

/** L4 → 高风险 */
@Pipe({ name: 'wsRisk' })
export class WsRiskLabelPipe implements PipeTransform {
  transform(value: RiskLevel | null | undefined): string {
    return value ? riskLevelMeta(value).label : '—';
  }
}

/** L4 → 24小时内响应 */
@Pipe({ name: 'wsRiskSla' })
export class WsRiskSlaPipe implements PipeTransform {
  transform(value: RiskLevel | null | undefined): string {
    return value ? riskLevelMeta(value).slaText : '—';
  }
}

/** pause → 暂停采购 */
@Pipe({ name: 'wsAction' })
export class WsActionLabelPipe implements PipeTransform {
  transform(value: BrakeAction | null | undefined): string {
    return value ? brakeActionMeta(value).label : '—';
  }
}

/** pending → 待处理 */
@Pipe({ name: 'wsStatus' })
export class WsStatusLabelPipe implements PipeTransform {
  transform(value: AlertStatus | null | undefined): string {
    return value ? ALERT_STATUS_LABEL[value] : '—';
  }
}

/** inventory → 库存风险 */
@Pipe({ name: 'wsRiskType' })
export class WsRiskTypeLabelPipe implements PipeTransform {
  transform(value: RiskType | null | undefined): string {
    return value ? RISK_TYPE_LABEL[value] : '—';
  }
}

/** demo → Demo 示例数据 */
@Pipe({ name: 'wsNature' })
export class WsNatureLabelPipe implements PipeTransform {
  transform(value: DataNature | null | undefined): string {
    return value ? DATA_NATURE_LABEL[value] : '—';
  }
}

/** P0 → 立即执行 */
@Pipe({ name: 'wsPriority' })
export class WsPriorityLabelPipe implements PipeTransform {
  transform(value: Priority | null | undefined): string {
    return value ? PRIORITY_LABEL[value] : '—';
  }
}
