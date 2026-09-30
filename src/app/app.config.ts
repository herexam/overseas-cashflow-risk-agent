import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';

import { routes } from './app.routes';

/**
 * 应用级 Provider。
 *
 * 说明：
 *  1. Demo 全程使用 zoneless 变更检测 + Signals，不引入 zone.js；
 *  2. 全部数据来自本地 Mock，不注册 HttpClient；
 *  3. 路由切换后回到页面顶部，避免长表格页面切换时的「停在半空」观感。
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(
      routes,
      withInMemoryScrolling({ scrollPositionRestoration: 'top', anchorScrolling: 'disabled' }),
    ),
  ],
};
