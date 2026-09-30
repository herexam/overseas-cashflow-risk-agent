import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, startWith } from 'rxjs';

import { SentinelDataService } from '../../core/services/sentinel-data.service';
import { StateService, type NoticeItem } from '../../core/services/state.service';
import { WsEmptyState, WsIcon, WsRiskBadge, WsTooltipDirective } from '../../shared/ui';
import { NAV_ITEMS } from '../nav.config';

type SearchGroupName = '页面' | 'SKU' | '客户' | '预警';

interface SearchHit {
  readonly group: SearchGroupName;
  readonly kind: 'page' | 'sku' | 'customer' | 'alert';
  readonly label: string;
  readonly hint: string;
  /** 跳转时要写入 StateService 或路由的标识（页面为 route，实体为业务 id） */
  readonly refId: string;
  readonly route: string;
}

interface SearchGroup {
  readonly group: SearchGroupName;
  readonly hits: readonly SearchHit[];
}

const GROUP_ORDER: readonly SearchGroupName[] = ['页面', 'SKU', '客户', '预警'];
const PER_GROUP_LIMIT = 3;
const TOTAL_LIMIT = 8;

/**
 * 顶部工具条。
 *
 * 左侧标题/副标题来自当前命中路由的 `data`（不写死），右侧聚合数据更新时间、全局搜索、
 * 刷新、通知中心、AI 状态与当前用户；所有业务数字取自 Service。
 */
@Component({
  selector: 'app-topbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [WsEmptyState, WsIcon, WsRiskBadge, WsTooltipDirective],
  template: `
    <div class="topbar__left">
      <h1 class="topbar__title">{{ pageMeta().title }}</h1>
      <p class="topbar__subtitle">{{ pageMeta().subtitle }}</p>
    </div>

    <div class="topbar__right">
      <span class="topbar__clock">
        <ws-icon name="clock" [size]="14" />
        {{ state.lastRefreshedAt() }}
      </span>

      <div class="search">
        <ws-icon name="search" [size]="14" class="search__icon" />
        <input
          class="ws-input ws-input--sm search__input"
          type="search"
          placeholder="搜索页面 / SKU / 客户 / 预警"
          [value]="query()"
          (input)="onQuery($event)"
          (focus)="onFocus()"
          (keydown.escape)="closeSearch()"
        />
        @if (searchOpen()) {
          @if (results().length) {
            <div class="search__panel">
              @for (group of resultGroups(); track group.group) {
                <div class="search__group">
                  <p class="search__group-title">{{ group.group }}</p>
                  @for (hit of group.hits; track hit.kind + hit.refId) {
                    <button type="button" class="search__hit" (click)="openHit(hit)">
                      <span class="search__hit-label">{{ hit.label }}</span>
                      <span class="search__hit-hint">{{ hit.hint }}</span>
                    </button>
                  }
                </div>
              }
            </div>
          } @else if (query()) {
            <div class="search__panel">
              <ws-empty-state title="无匹配结果" description="换个关键词，或从左侧导航进入模块" />
            </div>
          }
        }
      </div>

      <button
        type="button"
        class="ws-btn ws-btn--ghost ws-btn--icon"
        [disabled]="state.refreshing()"
        (click)="state.refresh()"
        [wsTooltip]="'刷新演示数据'"
        aria-label="刷新演示数据"
      >
        <ws-icon name="refresh" [size]="16" />
      </button>

      <div class="topbar__notices">
        <button
          type="button"
          class="ws-btn ws-btn--ghost ws-btn--icon topbar__bell"
          (click)="toggleNotices()"
          aria-label="通知中心"
        >
          <ws-icon name="bell" [size]="16" />
          @if (state.unreadCount() > 0) {
            <span class="topbar__dot">{{ state.unreadCount() }}</span>
          }
        </button>

        @if (noticesOpen()) {
          <div class="notices">
            <div class="notices__head">
              <span class="notices__title">通知</span>
              <button type="button" class="notices__action" (click)="state.markAllNoticesRead()">
                全部标记为已读
              </button>
            </div>
            <div class="notices__list">
              @for (notice of state.notices; track notice.id) {
                <button
                  type="button"
                  class="notice"
                  [class.is-read]="isRead(notice.id)"
                  (click)="openNotice(notice)"
                >
                  @if (!isRead(notice.id)) {
                    <span class="notice__dot"></span>
                  }
                  <span class="notice__body">
                    <span class="notice__title">{{ notice.title }}</span>
                    <span class="notice__meta">
                      <span class="notice__at">{{ notice.at }}</span>
                      <ws-risk-badge [level]="notice.level" [compact]="true" />
                    </span>
                  </span>
                </button>
              } @empty {
                <ws-empty-state title="暂无通知" />
              }
            </div>
          </div>
        }
      </div>

      <span
        class="ws-badge ai-chip"
        [class.ws-badge--blue]="state.aiStatus() === 'thinking'"
        [class.ws-badge--green]="state.aiStatus() === 'ready'"
        [class.ws-badge--plain]="state.aiStatus() === 'idle'"
        [wsTooltip]="'Sentinel AI 当前状态：' + state.aiStatusText()"
      >
        <ws-icon name="sparkle" [size]="12" />
        Sentinel AI {{ state.aiStatusText() }}
      </span>

      <div class="topbar__user">
        <span class="user__avatar">{{ state.currentUser.initials }}</span>
        <span class="user__meta">
          <span class="user__name">{{ state.currentUser.name }}</span>
          <span class="user__role">{{ state.currentUser.role }}</span>
        </span>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--sp-4);
      height: var(--topbar-h);
      padding: 0 var(--sp-6);
      background: var(--bg-surface);
      border-bottom: 1px solid var(--border);
      position: sticky;
      top: 0;
      z-index: 20;
    }

    .topbar__left {
      display: flex;
      flex-direction: column;
      justify-content: center;
      min-width: 0;
      overflow: hidden;
    }

    .topbar__title {
      margin: 0;
      font-size: 15px;
      font-weight: 600;
      color: var(--text-primary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .topbar__subtitle {
      margin: 0;
      font-size: 12px;
      color: var(--text-muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .topbar__right {
      display: flex;
      align-items: center;
      gap: var(--sp-4);
      flex: 0 0 auto;
    }

    .topbar__clock {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: var(--text-secondary);
      white-space: nowrap;
    }

    .search {
      position: relative;
    }

    ws-icon.search__icon {
      position: absolute;
      left: 9px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text-muted);
      pointer-events: none;
      display: inline-flex;
    }

    .search__input {
      width: 260px;
      padding-left: 30px;
    }

    .search__panel {
      position: absolute;
      top: calc(100% + 6px);
      right: 0;
      width: 360px;
      padding: var(--sp-2);
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-md);
      max-height: 420px;
      overflow-y: auto;
      z-index: 30;
    }

    .search__group + .search__group {
      margin-top: var(--sp-2);
    }

    .search__group-title {
      margin: 0 0 4px;
      padding: 0 8px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-muted);
    }

    .search__hit {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 2px;
      width: 100%;
      padding: 6px 8px;
      border: 0;
      background: none;
      border-radius: var(--radius-sm);
      text-align: left;
      cursor: pointer;
    }

    .search__hit:hover {
      background: var(--bg-hover);
    }

    .search__hit-label {
      font-size: 13px;
      color: var(--text-primary);
    }

    .search__hit-hint {
      max-width: 100%;
      font-size: 11px;
      color: var(--text-muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .topbar__notices {
      position: relative;
    }

    .topbar__bell {
      position: relative;
    }

    .topbar__dot {
      position: absolute;
      top: -2px;
      right: -2px;
      min-width: 15px;
      height: 15px;
      padding: 0 4px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: var(--radius-pill);
      background: var(--status-red);
      color: var(--text-inverse);
      font-size: 10px;
      font-weight: 600;
    }

    .notices {
      position: absolute;
      top: calc(100% + 6px);
      right: 0;
      width: 340px;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-md);
      overflow: hidden;
      z-index: 30;
    }

    .notices__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--sp-3) var(--sp-4);
      border-bottom: 1px solid var(--border);
    }

    .notices__title {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .notices__action {
      border: 0;
      padding: 0;
      background: none;
      font-size: 12px;
      color: var(--brand-primary);
      cursor: pointer;
    }

    .notices__list {
      max-height: 380px;
      overflow-y: auto;
    }

    .notice {
      display: flex;
      gap: 8px;
      width: 100%;
      padding: var(--sp-3) var(--sp-4);
      border: 0;
      border-bottom: 1px solid var(--border);
      background: none;
      text-align: left;
      cursor: pointer;
    }

    .notice:last-child {
      border-bottom: 0;
    }

    .notice:hover {
      background: var(--bg-hover);
    }

    .notice__dot {
      flex: 0 0 auto;
      width: 6px;
      height: 6px;
      margin-top: 6px;
      border-radius: 50%;
      background: var(--status-info);
    }

    .notice__body {
      display: flex;
      flex-direction: column;
      gap: 4px;
      flex: 1;
      min-width: 0;
    }

    .notice__title {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
      line-height: 1.45;
    }

    .notice.is-read .notice__title {
      font-weight: 400;
      color: var(--text-secondary);
    }

    .notice__meta {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .notice__at {
      font-size: 11px;
      color: var(--text-muted);
    }

    .ai-chip {
      white-space: nowrap;
    }

    .topbar__user {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .user__avatar {
      width: 30px;
      height: 30px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      background: var(--brand-soft);
      color: var(--brand-primary);
      font-size: 13px;
      font-weight: 600;
    }

    .user__meta {
      display: flex;
      flex-direction: column;
    }

    .user__name {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
      line-height: 1.3;
    }

    .user__role {
      font-size: 11px;
      color: var(--text-muted);
      line-height: 1.3;
    }
  `,
})
export class Topbar {
  protected readonly state = inject(StateService);

  private readonly data = inject(SentinelDataService);
  private readonly router = inject(Router);

  private readonly navEnd = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      startWith(null),
    ),
    { initialValue: null },
  );

  protected readonly pageMeta = computed(() => {
    this.navEnd();
    let route = this.router.routerState.snapshot.root;
    while (route.firstChild) {
      route = route.firstChild;
    }
    const data = route.data;
    return {
      title: (data['title'] as string) ?? '',
      subtitle: (data['subtitle'] as string) ?? '',
    };
  });

  protected readonly query = signal('');
  protected readonly searchOpen = signal(false);
  protected readonly noticesOpen = signal(false);

  protected readonly results = computed<readonly SearchHit[]>(() => {
    const keyword = this.query().trim().toLowerCase();
    if (!keyword) {
      return [];
    }

    const match = (...fields: string[]): boolean =>
      fields.some((field) => field.toLowerCase().includes(keyword));

    const pageHits: SearchHit[] = NAV_ITEMS.filter((item) => match(item.label, item.hint))
      .slice(0, PER_GROUP_LIMIT)
      .map((item) => ({
        group: '页面',
        kind: 'page',
        label: item.label,
        hint: item.hint,
        refId: item.route,
        route: item.route,
      }));

    const skuHits: SearchHit[] = this.data
      .skus()
      .filter((row) => match(row.sku, row.name))
      .slice(0, PER_GROUP_LIMIT)
      .map((row) => ({
        group: 'SKU',
        kind: 'sku',
        label: row.sku,
        hint: `${row.name} · ${row.warehouseName}`,
        refId: row.id,
        route: '/inventory',
      }));

    const customerHits: SearchHit[] = this.data
      .customers()
      .filter((row) => match(row.name))
      .slice(0, PER_GROUP_LIMIT)
      .map((row) => ({
        group: '客户',
        kind: 'customer',
        label: row.name,
        hint: `${row.channelType} · ${row.country}`,
        refId: row.id,
        route: '/receivables',
      }));

    const alertHits: SearchHit[] = this.data
      .alerts()
      .filter((row) => match(row.id, row.title))
      .slice(0, PER_GROUP_LIMIT)
      .map((row) => ({
        group: '预警',
        kind: 'alert',
        label: row.title,
        hint: `${row.id} · ${row.country}`,
        refId: row.id,
        route: '/alerts',
      }));

    return [...pageHits, ...skuHits, ...customerHits, ...alertHits].slice(0, TOTAL_LIMIT);
  });

  protected readonly resultGroups = computed<readonly SearchGroup[]>(() => {
    const hits = this.results();
    return GROUP_ORDER.map((group) => ({
      group,
      hits: hits.filter((hit) => hit.group === group),
    })).filter((entry) => entry.hits.length > 0);
  });

  protected onQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.searchOpen.set(true);
  }

  protected onFocus(): void {
    this.searchOpen.set(true);
  }

  protected closeSearch(): void {
    this.searchOpen.set(false);
  }

  protected openHit(hit: SearchHit): void {
    switch (hit.kind) {
      case 'sku':
        this.state.setFocusSkus([hit.refId]);
        void this.router.navigateByUrl('/inventory');
        break;
      case 'customer':
        void this.router.navigateByUrl('/receivables');
        break;
      case 'alert':
        void this.router.navigateByUrl('/alerts');
        break;
      default:
        void this.router.navigateByUrl(hit.route);
    }
    this.searchOpen.set(false);
    this.query.set('');
  }

  protected toggleNotices(): void {
    this.noticesOpen.update((open) => !open);
  }

  protected isRead(id: string): boolean {
    return this.state.noticeReadIds().includes(id);
  }

  protected openNotice(notice: NoticeItem): void {
    this.state.markNoticeRead(notice.id);
    this.noticesOpen.set(false);
    void this.router.navigateByUrl(notice.route);
  }
}
