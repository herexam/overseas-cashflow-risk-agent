import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { SentinelDataService } from '../../core/services/sentinel-data.service';
import { StateService } from '../../core/services/state.service';
import { WsTooltipDirective } from '../../shared/ui';
import { NAV_GROUPS, NAV_ICONS, type NavIconName } from '../nav.config';

/**
 * 左侧主导航。
 *
 * 分组与条目完全来自 nav.config，折叠态（StateService.sidebarCollapsed）只保留图标，
 * 并通过 wsTooltip 暴露条目标签，避免折叠后失去可发现性。
 */
@Component({
  selector: 'app-sidebar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, WsTooltipDirective],
  template: `
    <div class="sidebar" [class.is-collapsed]="state.sidebarCollapsed()">
      <div class="sidebar__brand">
        <span class="brand__mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20">
            <path
              d="M5 6l2.6 12L12 9l4.4 9L19 6"
              fill="none"
              stroke="#fff"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </span>
        @if (!state.sidebarCollapsed()) {
          <span class="brand__text">
            <span class="brand__name">沃太能源</span>
            <span class="brand__sub">ALPHAESS</span>
          </span>
        }
      </div>

      <div class="sidebar__divider"></div>

      <div class="sidebar__product">
        @if (!state.sidebarCollapsed()) {
          <span class="product__name">WorkCap Sentinel</span>
          <span class="product__sub">现金哨兵</span>
        }
      </div>

      <nav class="sidebar__nav">
        @for (group of NAV_GROUPS; track group.group) {
          <div class="nav-group">
            @if (!state.sidebarCollapsed()) {
              <p class="nav-group__title">{{ group.group }}</p>
            }
            @for (item of group.items; track item.route) {
              <a
                class="nav-item"
                [routerLink]="item.route"
                routerLinkActive="is-active"
                [wsTooltip]="state.sidebarCollapsed() ? item.label : ''"
                [attr.aria-label]="item.label"
              >
                <svg
                  class="nav-item__icon"
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.7"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path [attr.d]="iconPath(item.icon)" />
                </svg>
                @if (!state.sidebarCollapsed()) {
                  <span class="nav-item__label">{{ item.label }}</span>
                }
                @if (item.badge === 'alerts') {
                  <span class="nav-item__badge">{{ data.openAlertCount() }}</span>
                }
              </a>
            }
          </div>
        }
      </nav>

      <div class="sidebar__foot">
        <div class="sidebar__divider"></div>
        @if (!state.sidebarCollapsed()) {
          <p class="sidebar__note">数据为 Demo 示例</p>
          <p class="sidebar__note">非真实经营数据</p>
          <p class="sidebar__version">v0.1.0</p>
        }
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      flex: 0 0 auto;
    }

    .sidebar {
      width: var(--sidebar-w);
      display: flex;
      flex-direction: column;
      background: var(--bg-surface);
      border-right: 1px solid var(--border);
      position: sticky;
      top: 0;
      height: 100vh;
      overflow-y: auto;
      transition: width 0.16s ease;
    }

    .sidebar.is-collapsed {
      width: var(--sidebar-w-collapsed);
    }

    .sidebar__brand {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: var(--sp-4) var(--sp-4) var(--sp-3);
    }

    .brand__mark {
      flex: 0 0 auto;
      width: 28px;
      height: 28px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: var(--brand-primary);
      border-radius: var(--radius-sm);
    }

    .brand__text {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .brand__name {
      font-size: 14px;
      font-weight: 600;
      color: var(--brand-ink);
      line-height: 1.3;
    }

    .brand__sub {
      font-size: 10px;
      font-weight: 500;
      color: var(--text-muted);
      letter-spacing: 0.12em;
      line-height: 1.3;
    }

    .sidebar__divider {
      height: 1px;
      background: var(--border);
    }

    .sidebar__product {
      display: flex;
      flex-direction: column;
      padding: var(--sp-3) var(--sp-4);
    }

    .product__name {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
      line-height: 1.4;
    }

    .product__sub {
      font-size: 11px;
      color: var(--text-muted);
      line-height: 1.4;
    }

    .sidebar__nav {
      flex: 1;
      min-height: 0;
      padding: var(--sp-2) var(--sp-3) var(--sp-4);
    }

    .nav-group + .nav-group {
      margin-top: var(--sp-4);
    }

    .nav-group__title {
      margin: 0 0 var(--sp-2);
      padding: 0 10px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-muted);
    }

    .nav-item {
      position: relative;
      display: flex;
      align-items: center;
      gap: 10px;
      height: 34px;
      padding: 0 10px;
      border-radius: var(--radius-sm);
      font-size: 13px;
      color: var(--text-secondary);
      text-decoration: none;
      cursor: pointer;
    }

    .nav-item:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }

    .nav-item.is-active {
      background: var(--brand-soft);
      color: var(--brand-primary);
      font-weight: 600;
    }

    .nav-item__icon {
      flex: 0 0 auto;
    }

    .nav-item__label {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .nav-item__badge {
      flex: 0 0 auto;
      min-width: 18px;
      height: 18px;
      padding: 0 5px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: var(--radius-pill);
      background: var(--brand-primary);
      color: var(--text-inverse);
      font-size: 11px;
      font-weight: 600;
    }

    .sidebar.is-collapsed .nav-item {
      justify-content: center;
      padding: 0;
    }

    .sidebar.is-collapsed .nav-item__badge {
      position: absolute;
      top: 3px;
      right: 6px;
      min-width: 15px;
      height: 15px;
      padding: 0 4px;
      font-size: 10px;
    }

    .sidebar__foot {
      padding-bottom: var(--sp-3);
    }

    .sidebar__note {
      margin: var(--sp-3) var(--sp-4) 0;
      font-size: 11px;
      color: var(--text-muted);
      line-height: 1.5;
    }

    .sidebar__note + .sidebar__note {
      margin-top: 0;
    }

    .sidebar__version {
      margin: var(--sp-2) var(--sp-4) 0;
      font-size: 11px;
      color: var(--text-muted);
    }
  `,
})
export class Sidebar {
  protected readonly NAV_GROUPS = NAV_GROUPS;

  protected readonly state = inject(StateService);
  protected readonly data = inject(SentinelDataService);

  protected iconPath(icon: NavIconName): string {
    return NAV_ICONS[icon];
  }
}
