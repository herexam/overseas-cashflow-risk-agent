import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** 全站图标名（极简线性图标，统一 24×24 视觉基准）。 */
export type WsIconName =
  | 'info'
  | 'alert'
  | 'check'
  | 'close'
  | 'plus'
  | 'more'
  | 'trash'
  | 'edit'
  | 'search'
  | 'filter'
  | 'calendar'
  | 'clock'
  | 'refresh'
  | 'download'
  | 'external'
  | 'chevron-up'
  | 'chevron-down'
  | 'chevron-left'
  | 'chevron-right'
  | 'arrow-up'
  | 'arrow-down'
  | 'arrow-right'
  | 'user'
  | 'users'
  | 'bell'
  | 'database'
  | 'shield'
  | 'lock'
  | 'list'
  | 'pin'
  | 'play'
  | 'send'
  | 'sparkle'
  | 'target'
  | 'scale'
  | 'globe'
  | 'ship'
  | 'warehouse';

const ICON_PATHS: Record<WsIconName, string> = {
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 8h.01M11.5 11.5h1v5h1',
  alert: 'M12 3.6 2.4 20.4h19.2L12 3.6M12 10v4.2M12 17.6h.01',
  check: 'M4.5 12.5 9.5 17.5 19.5 6.5',
  close: 'M6 6 18 18M18 6 6 18',
  plus: 'M12 4.5v15M4.5 12h15',
  more: 'M6 12h.01M12 12h.01M18 12h.01',
  trash: 'M4.5 6.5h15M9 6.5V4h6v2.5M6.5 6.5 7.5 20h9l1-13.5M10.5 10v6M13.5 10v6',
  edit: 'M4 20h4.5L20 8.5 15.5 4 4 15.5zM13.5 6l4.5 4.5',
  search: 'M11 3.8a7.2 7.2 0 1 0 0 14.4 7.2 7.2 0 0 0 0-14.4M16.3 16.3 21 21',
  filter: 'M3.5 6h17M6.5 12h11M10 18h4',
  calendar: 'M4 6.5h16v13.5H4zM4 11h16M8.5 3.5v5M15.5 3.5v5',
  clock: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17M12 7v5.4l3.6 2.1',
  refresh: 'M20.5 12a8.5 8.5 0 1 1-2.9-6.4M20.5 4.5v5h-5',
  download: 'M12 3.5v11.5M7 10.5 12 15.5 17 10.5M4.5 20.5h15',
  external: 'M14 3.5h6.5V10M20.5 3.5 11 13M17.5 14v6.5h-14v-14H10',
  'chevron-up': 'M6 14.5 12 8.5 18 14.5',
  'chevron-down': 'M6 9.5 12 15.5 18 9.5',
  'chevron-left': 'M14.5 6 8.5 12 14.5 18',
  'chevron-right': 'M9.5 6 15.5 12 9.5 18',
  'arrow-up': 'M12 19.5V4.5M5.5 11 12 4.5 18.5 11',
  'arrow-down': 'M12 4.5v15M5.5 13 12 19.5 18.5 13',
  'arrow-right': 'M4.5 12h15M13 5.5 19.5 12 13 18.5',
  user: 'M12 4.5a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2M5 20.5c0-3.7 3.1-6.4 7-6.4s7 2.7 7 6.4',
  users:
    'M9.5 5a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4M3.5 20c0-3.3 2.7-5.7 6-5.7s6 2.4 6 5.7M16.5 5.4a3.2 3.2 0 0 1 0 6.2M18 14.6c1.6.7 2.6 2 2.6 3.6',
  bell: 'M12 3a5 5 0 0 0-5 5v4.2L4.8 15.5h14.4L17 12.2V8a5 5 0 0 0-5-5M10 18.5a2 2 0 0 0 4 0',
  database:
    'M12 3.5c4.4 0 8 1.1 8 2.5s-3.6 2.5-8 2.5-8-1.1-8-2.5 3.6-2.5 8-2.5M4 6v12c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5V6M4 12c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5',
  shield: 'M12 3l7 3v6c0 4.1-2.9 7.2-7 9-4.1-1.8-7-4.9-7-9V6z',
  lock: 'M6.5 10.5h11v10h-11zM9 10.5V7.5a3 3 0 0 1 6 0v3',
  list: 'M8 6h12.5M8 12h12.5M8 18h12.5M3.8 6h.01M3.8 12h.01M3.8 18h.01',
  pin: 'M12 21v-6.5M7.5 3.5h9l-1 6 2.5 5H6l2.5-5z',
  play: 'M8 5.2 18.5 12 8 18.8z',
  send: 'M3.5 12 20.5 3.5l-6.4 17.5-3.3-7.4z',
  sparkle:
    'M11 3l1.9 4.9L17.8 9.8l-4.9 1.9L11 16.6 9.1 11.7 4.2 9.8l4.9-1.9zM17.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z',
  target:
    'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 11.6a.4.4 0 1 0 0 .8.4.4 0 0 0 0-.8',
  scale: 'M12 3.5v17M6 7l-3 7h6zM18 7l-3 7h6zM5 7h14M8 20.5h8',
  globe:
    'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M3 12h18M12 3c2.6 2.6 4 5.7 4 9s-1.4 6.4-4 9c-2.6-2.6-4-5.7-4-9s1.4-6.4 4-9',
  ship: 'M4 17.5V7h9v10.5M13 11h4l3 3v3.5h-7M7 20.5a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4M17 20.5a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4',
  warehouse: 'M3.5 20.5V9.5L12 4l8.5 5.5v11M9 20.5v-6h6v6',
};

@Component({
  selector: 'ws-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      [attr.stroke-width]="strokeWidth()"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path [attr.d]="path()" />
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
      line-height: 0;
    }
  `,
})
export class WsIcon {
  readonly name = input.required<WsIconName>();
  readonly size = input(16);
  readonly strokeWidth = input(1.7);

  protected readonly path = computed<string>(() => ICON_PATHS[this.name()] ?? ICON_PATHS.info);
}
