import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { StateService } from './core/services/state.service';
import { Sidebar } from './layout/sidebar/sidebar';
import { Topbar } from './layout/topbar/topbar';
import { WsDisclaimer, WsIcon, WsTooltipLayer } from './shared/ui';

/**
 * 应用外壳：侧边导航 + 顶栏 + 路由出口 + 轻提示栈。
 *
 * 外壳本身不承载业务逻辑，仅从 StateService 读取界面状态（折叠 / 轻提示）。
 */
@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, Sidebar, Topbar, WsDisclaimer, WsIcon, WsTooltipLayer],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly state = inject(StateService);
}
