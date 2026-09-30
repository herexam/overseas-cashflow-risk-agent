import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * 未匹配路由的兜底页。
 *
 * 保持克制：只说明「页面不存在」并给一条回驾驶舱的出口，不做额外装饰。
 */
@Component({
  selector: 'app-not-found-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="page">
      <p class="page__code">404</p>
      <h2 class="page__title">页面不存在</h2>
      <p class="page__desc">请通过左侧导航进入业务模块</p>
      <a class="ws-btn ws-btn--primary" routerLink="/dashboard">返回风险驾驶舱</a>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .page {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--sp-3);
      min-height: 52vh;
      text-align: center;
    }

    .page__code {
      margin: 0;
      font-size: 48px;
      font-weight: 600;
      line-height: 1;
      color: var(--text-muted);
    }

    .page__title {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .page__desc {
      margin: 0;
      font-size: 13px;
      color: var(--text-secondary);
    }

    .page a {
      margin-top: var(--sp-2);
      text-decoration: none;
    }
  `,
})
export class NotFoundPage {}
