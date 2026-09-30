import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';

import {
  ASSISTANT_CATEGORY_LABEL,
  type AssistantAnswer,
  type AssistantCategory,
  type AssistantQuestion,
  type AssistantThinkingStep,
  type DataSource,
  type DataSourceCategory,
  type Priority,
  type RiskLevel,
} from '../../core/models';
import { SentinelDataService } from '../../core/services/sentinel-data.service';
import { StateService } from '../../core/services/state.service';
import {
  ASSISTANT_ANSWERS,
  ASSISTANT_QUESTIONS,
  ASSISTANT_SUGGESTED_FOLLOWUPS,
  ASSISTANT_WELCOME,
} from '../../data/mock/assistant.mock';
import {
  WsActionLabelPipe,
  WsAmountPipe,
  WsBadge,
  WsCard,
  WsDatePipe,
  WsDemoNote,
  WsEmptyState,
  WsIcon,
  WsNatureBadge,
  WsNumPipe,
  WsPercentPipe,
  WsPriorityLabelPipe,
  WsRiskBadge,
  WsSectionTitle,
  WsTooltipDirective,
  toneTextClass,
  type WsTone,
} from '../../shared/ui';

/* ------------------------------------------------------------------ */
/* 组件内部模型                                                        */
/* ------------------------------------------------------------------ */

/** 一条会话消息（把 Mock 的 AssistantMessage 展开成组件需要的形态）。 */
interface ChatTurn {
  readonly id: string;
  readonly role: 'user' | 'agent';
  readonly createdAt: string;
  readonly text: string;
  readonly categoryLabel: string;
  readonly metrics: readonly string[];
  readonly visibleSteps: readonly AssistantThinkingStep[];
  readonly thinking: boolean;
  readonly answer: AssistantAnswer | null;
  /** 未命中知识库时的补充说明，渲染在结论之上 */
  readonly lead: string;
  readonly briefRequested: boolean;
}

/** 右侧「当前经营快照」的一行。 */
interface SnapshotRow {
  readonly key: string;
  readonly label: string;
  readonly value: number;
  readonly kind: 'amount' | 'num' | 'percent';
  readonly unit: string;
  readonly tone: WsTone;
  readonly hint: string;
  readonly note: string;
}

/** 右侧「数据源」的一个分组。 */
interface SourceGroup {
  readonly category: DataSourceCategory;
  readonly label: string;
  readonly rows: readonly DataSource[];
  readonly total: number;
}

/** 一次提问携带的展示元信息。 */
interface TurnMeta {
  readonly categoryLabel: string;
  readonly metrics: readonly string[];
  readonly lead: string;
}

/* ------------------------------------------------------------------ */
/* 常量                                                                */
/* ------------------------------------------------------------------ */

/** 每个推理步骤之间的间隔（毫秒）。 */
const STEP_MS = 260;

/** 自由输入未命中知识库时的兜底说明。 */
const UNMATCHED_LEAD = '未在演示知识库中找到完全匹配的问题，以下是最接近的分析：';

const CATEGORY_TONE: Record<AssistantCategory, WsTone> = {
  cash: 'blue',
  inventory: 'orange',
  receivable: 'red',
  scenario: 'yellow',
  brief: 'green',
};

const PRIORITY_TONE: Record<Priority, WsTone> = {
  P0: 'red',
  P1: 'orange',
  P2: 'plain',
};

const SOURCE_GROUP_LABEL: Record<DataSourceCategory, string> = {
  internal: '内部系统接入',
  external: '外部信号接入',
};

const SOURCE_GROUP_ORDER: readonly DataSourceCategory[] = ['internal', 'external'];

/** 每组数据源最多展示的条数。 */
const SOURCE_PREVIEW = 5;

/** 关键词路由规则，顺序敏感：先命中先返回。 */
const ROUTING_RULES: readonly { readonly id: string; readonly keywords: readonly string[] }[] = [
  { id: 'Q1', keywords: ['现金', '缺口'] },
  { id: 'Q2', keywords: ['库存', '踩刹车', 'sku'] },
  { id: 'Q3', keywords: ['应收', '客户', '催收', '回款'] },
  { id: 'Q4', keywords: ['海运', '延迟', '物流'] },
  { id: 'Q5', keywords: ['晨会', '摘要', '简报'] },
];

/** 命中返回问题 id，未命中返回 null。 */
function matchQuestionId(text: string): string | null {
  const normalized = text.toLowerCase();
  for (const rule of ROUTING_RULES) {
    if (rule.keywords.some((keyword) => normalized.includes(keyword))) {
      return rule.id;
    }
  }
  return null;
}

/** Sentinel 的品牌标记：圆角方块 + 白色 sparkle。 */
const MARK_PATH = 'M12 4l1.8 5.2L19 11l-5.2 1.8L12 18l-1.8-5.2L5 11l5.2-1.8z';

@Component({
  selector: 'app-assistant-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    WsActionLabelPipe,
    WsAmountPipe,
    WsBadge,
    WsCard,
    WsDatePipe,
    WsDemoNote,
    WsEmptyState,
    WsIcon,
    WsNatureBadge,
    WsNumPipe,
    WsPercentPipe,
    WsPriorityLabelPipe,
    WsRiskBadge,
    WsSectionTitle,
    WsTooltipDirective,
  ],
  template: `
    <div class="page">
      <section class="chat">
        <header class="agent">
          <span class="agent__mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path [attr.d]="markPath" fill="var(--text-inverse)" />
            </svg>
          </span>
          <span class="agent__id">
            <span class="agent__name">Sentinel AI</span>
            <span class="agent__sub">沃太能源 WorkCap Sentinel · 营运资本风险 Agent</span>
          </span>
          <span class="ws-spacer"></span>
          <ws-badge [tone]="statusTone()" [dot]="true">{{ state.aiStatusText() }}</ws-badge>
          <button type="button" class="ws-btn ws-btn--ghost ws-btn--sm" (click)="resetConversation()">
            <ws-icon name="trash" [size]="14" />
            清空对话
          </button>
        </header>

        <ws-card>
          <ws-section-title title="快捷问题" hint="点击直接查看 Sentinel AI 的分析" />
          <div class="qgrid">
            @for (question of questions; track question.id) {
              <button
                type="button"
                class="qcard"
                [disabled]="busy()"
                (click)="ask(question)"
              >
                <span class="qcard__top">
                  <ws-badge [tone]="categoryTone(question)">{{ categoryLabel[question.category] }}</ws-badge>
                </span>
                <span class="qcard__text">{{ question.text }}</span>
                @if (question.metrics.length > 0) {
                  <span class="qcard__metrics">
                    @for (metric of question.metrics; track metric) {
                      <span class="ws-tag">{{ metric }}</span>
                    }
                  </span>
                }
              </button>
            } @empty {
              <ws-empty-state title="暂无快捷问题" description="演示知识库未提供预设问题。" />
            }
          </div>
        </ws-card>

        <div class="stream" #scrollHost>
          @for (turn of turns(); track turn.id) {
            @if (turn.role === 'user') {
              <div class="msg msg--user">
                <div class="bubble">
                  <p class="bubble__text">{{ turn.text }}</p>
                  <div class="bubble__meta">
                    <span>{{ turn.categoryLabel }}</span>
                    @for (metric of turn.metrics; track metric) {
                      <span class="msg__tag">{{ metric }}</span>
                    }
                    <span>{{ timestampLabel(turn) }}</span>
                  </div>
                </div>
              </div>
            } @else {
              <div class="msg msg--agent">
                <span class="msg__avatar" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="13" height="13">
                    <path [attr.d]="markPath" fill="var(--text-inverse)" />
                  </svg>
                </span>
                <article class="agent-card">
                  @if (turn.lead) {
                    <p class="lead">{{ turn.lead }}</p>
                  }

                  @if (turn.thinking) {
                    <div class="thinking">
                      <div class="thinking__head">
                        <span class="thinking__bars" aria-hidden="true"><i></i><i></i><i></i></span>
                        <span class="thinking__label">正在检索数据…</span>
                      </div>
                      @if (turn.visibleSteps.length > 0) {
                        <ol class="steps">
                          @for (step of turn.visibleSteps; track step.step) {
                            <li class="step">
                              <span class="step__no">{{ $index + 1 }}</span>
                              <span class="step__body">
                                <span class="step__title">{{ step.step }}</span>
                                <span class="step__detail">{{ step.detail }}</span>
                              </span>
                              <span class="ws-tag">{{ step.source }}</span>
                            </li>
                          }
                        </ol>
                      }
                    </div>
                  } @else if (turn.answer; as answer) {
                    <div class="five">
                      <section class="sec">
                        <span class="sec__label">结论</span>
                        <p class="conclusion">{{ answer.conclusion }}</p>
                      </section>

                      <section class="sec">
                        <span class="sec__label">原因</span>
                        @if (answer.reasons.length > 0) {
                          <ol class="ord">
                            @for (reason of answer.reasons; track $index) {
                              <li>{{ reason }}</li>
                            }
                          </ol>
                        } @else {
                          <ws-empty-state title="暂无原因分析" description="本次回答未返回原因项。" />
                        }
                      </section>

                      <section class="sec">
                        <span class="sec__label">数据依据</span>
                        @if (answer.evidence.length > 0) {
                          <ul class="evi">
                            @for (item of answer.evidence; track item.id) {
                              <li class="evi__row" [wsTooltip]="item.definition">
                                <ws-icon name="database" [size]="14" />
                                <span class="evi__main">
                                  <span class="evi__metric">{{ item.metric }}</span>
                                  <span class="evi__value">{{ item.value }}</span>
                                </span>
                                <span class="evi__side">
                                  <span class="evi__src">{{ item.sourceSystem }}</span>
                                  <ws-nature-badge [nature]="item.nature" />
                                </span>
                              </li>
                            }
                          </ul>
                        } @else {
                          <ws-empty-state title="暂无数据依据" description="本次回答未返回证据项。" />
                        }
                      </section>

                      <section class="sec">
                        <span class="sec__label">风险影响</span>
                        @if (answer.impacts.length > 0) {
                          <ul class="imp">
                            @for (impact of answer.impacts; track $index) {
                              <li class="imp__row">
                                <ws-icon name="alert" [size]="14" />
                                <span class="imp__text">{{ impact.text }}</span>
                                @if (impact.metric) {
                                  <span class="ws-tag">{{ impact.metric }}</span>
                                }
                                @if (impact.delta) {
                                  <span class="ws-tag">{{ impact.delta }}</span>
                                }
                              </li>
                            }
                          </ul>
                        } @else {
                          <ws-empty-state title="暂无风险影响" description="本次回答未返回影响项。" />
                        }
                      </section>

                      <section class="sec">
                        <span class="sec__label">建议动作</span>
                        @if (answer.actions.length > 0) {
                          <ol class="act">
                            @for (action of answer.actions; track action.id) {
                              <li class="act__row">
                                <span class="act__no">{{ $index + 1 }}</span>
                                <span class="act__body">
                                  <span class="act__text">{{ action.text }}</span>
                                  <span class="act__meta">
                                    <ws-badge [tone]="priorityTone(action.priority)">
                                      {{ action.priority | wsPriority }}
                                    </ws-badge>
                                    <span class="ws-tag">{{ action.actionType | wsAction }}</span>
                                    @if (action.releaseAmount !== undefined) {
                                      <span class="ws-tag">
                                        可释放 {{ action.releaseAmount | wsAmount }}
                                      </span>
                                    }
                                    <span class="act__sub">{{ action.owner }} · {{ action.dueDate | wsDate }}</span>
                                  </span>
                                </span>
                                @if (action.route) {
                                  <button
                                    type="button"
                                    class="ws-btn ws-btn--ghost ws-btn--sm act__go"
                                    (click)="navigate(action.route)"
                                  >
                                    前往处理
                                  </button>
                                }
                              </li>
                            }
                          </ol>
                        } @else {
                          <ws-empty-state title="暂无建议动作" description="本次回答未返回行动项。" />
                        }
                      </section>
                    </div>

                    @if (answer.relatedLinks.length > 0) {
                      <div class="links">
                        @for (link of answer.relatedLinks; track link.route) {
                          <button
                            type="button"
                            class="ws-btn ws-btn--ghost ws-btn--sm"
                            (click)="navigate(link.route)"
                          >
                            <ws-icon name="arrow-right" [size]="14" />
                            {{ link.label }}
                          </button>
                        }
                      </div>
                    }

                    <div class="signature">
                      <span>
                        推理步骤 {{ answer.thinkingSteps.length }} 步 · 数据截至 {{ asOfDate }}
                      </span>
                      <span class="ws-spacer"></span>
                      @if (turn.briefRequested) {
                        <span class="brief">
                          @if (data.briefing()) {
                            正在生成新的 CFO 晨会摘要…
                          } @else {
                            已生成新的 CFO 晨会摘要（第 {{ data.briefVersion() }} 版）
                          }
                        </span>
                      }
                    </div>
                  } @else {
                    <p class="plain">{{ turn.text }}</p>
                  }
                </article>
              </div>
            }
          } @empty {
            <ws-empty-state title="暂无对话" description="从上方快捷问题开始提问。" />
          }
        </div>

        <div class="composer">
          <div class="composer__row">
            <textarea
              class="ws-textarea"
              placeholder="向 Sentinel AI 提问，例如：本月的现金缺口主要来自哪里？"
              [value]="draft()"
              (input)="onInput($event)"
              (keydown.enter)="onEnter($event)"
            ></textarea>
            <button
              type="button"
              class="ws-btn ws-btn--primary ws-btn--icon"
              [disabled]="!canSend()"
              aria-label="发送"
              (click)="submitDraft()"
            >
              <ws-icon name="send" [size]="16" />
            </button>
          </div>
          <p class="composer__note">演示环境：回答基于内置示例知识库，非实时模型输出</p>
        </div>
      </section>

      <aside class="side">
        <ws-card title="当前经营快照" subtitle="与驾驶舱同口径，单位：万元">
          <dl class="snap">
            @for (row of snapshotRows(); track row.key) {
              <div class="snap__row" [wsTooltip]="row.hint">
                <dt class="snap__label">{{ row.label }}</dt>
                <dd [class]="snapshotValueClass(row)">
                  @switch (row.kind) {
                    @case ('percent') {
                      {{ row.value | wsPercent }}
                    }
                    @case ('num') {
                      {{ row.value | wsNum }}
                    }
                    @default {
                      {{ row.value | wsAmount }}
                    }
                  }
                  @if (row.unit) {
                    <span class="snap__unit">{{ row.unit }}</span>
                  }
                </dd>
                @if (row.note) {
                  <span class="snap__note">{{ row.note }}</span>
                }
              </div>
            } @empty {
              <ws-empty-state title="暂无快照" description="数据服务未返回经营快照。" />
            }
          </dl>
        </ws-card>

        <ws-card title="数据源" [subtitle]="sourceSubtitle">
          @for (group of sourceGroups; track group.category) {
            <div class="src">
              <div class="src__head">
                <span class="src__label">{{ group.label }}</span>
                <span class="src__count">共 {{ group.total }} 项</span>
              </div>
              @if (group.rows.length > 0) {
                <ul class="src__list">
                  @for (source of group.rows; track source.id) {
                    <li class="src__row">
                      <span class="src__name">{{ source.name }}</span>
                      <ws-badge [tone]="sourceTone(source)">{{ sourceStatus(source) }}</ws-badge>
                      <ws-nature-badge [nature]="source.nature" />
                    </li>
                  }
                </ul>
              } @else {
                <ws-empty-state title="暂无数据源" description="该分组当前没有接入的数据源。" />
              }
            </div>
          } @empty {
            <ws-empty-state title="暂无数据源" description="设置页未返回数据源清单。" />
          }
        </ws-card>

        <ws-card title="建议追问" subtitle="点击直接向 Sentinel AI 提问">
          @if (followups.length > 0) {
            <div class="pills">
              @for (item of followups; track item) {
                <button type="button" class="pill" [disabled]="busy()" (click)="askFollowup(item)">
                  {{ item }}
                </button>
              }
            </div>
          } @else {
            <ws-empty-state title="暂无建议追问" description="演示知识库未提供追问建议。" />
          }
        </ws-card>

        <ws-card title="当前预警概览" subtitle="未关闭预警与 L4 高风险">
          <div class="alert__stats">
            <div class="alert__stat">
              <span class="alert__num text-blue">{{ data.openAlertCount() }}</span>
              <span class="alert__cap">未关闭预警</span>
            </div>
            <div class="alert__stat">
              <span class="alert__num text-red">{{ data.l4AlertCount() }}</span>
              <span class="alert__cap">L4 高风险</span>
            </div>
          </div>
          @if (alertRisks.length > 0) {
            <ul class="alert__list">
              @for (risk of alertRisks; track risk.id) {
                <li>
                  <button
                    type="button"
                    class="alert__row"
                    [wsTooltip]="risk.summary"
                    (click)="navigate('/alerts')"
                  >
                    <ws-risk-badge [level]="risk.level" [compact]="true" />
                    <span class="alert__title">{{ risk.title }}</span>
                    <ws-icon name="chevron-right" [size]="14" />
                  </button>
                </li>
              }
            </ul>
          } @else {
            <ws-empty-state title="暂无高优预警" description="当前没有需要优先关注的预警。" />
          }
        </ws-card>
      </aside>

      <footer class="foot">
        <ws-demo-note />
        <span class="foot__text">回答由内置示例知识库驱动，仅用于演示 Agent 交互形态</span>
      </footer>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .page {
      display: grid;
      grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
      gap: var(--sp-5);
      align-items: start;
    }

    /* ---------------- 左侧对话区 ---------------- */

    .chat {
      display: flex;
      flex-direction: column;
      gap: var(--sp-4);
      min-width: 0;
    }

    .agent {
      display: flex;
      align-items: center;
      gap: var(--sp-3);
      padding: var(--sp-3) var(--sp-4);
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-xs);
      min-width: 0;
    }

    .agent__mark,
    .msg__avatar {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
      background: var(--brand-primary);
      border-radius: var(--radius-md);
    }

    .agent__mark {
      width: 28px;
      height: 28px;
    }

    .msg__avatar {
      width: 24px;
      height: 24px;
      border-radius: var(--radius-sm);
    }

    .agent__id {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .agent__name {
      font-size: 16px;
      font-weight: 600;
      color: var(--brand-ink);
      line-height: 1.2;
    }

    .agent__sub {
      font-size: 12px;
      color: var(--text-muted);
    }

    /* ---------------- 快捷问题 ---------------- */

    .qgrid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--sp-3);
    }

    .qcard {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: var(--sp-2);
      padding: var(--sp-3);
      font: inherit;
      color: inherit;
      text-align: left;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      cursor: pointer;
      transition:
        transform 0.16s ease,
        border-color 0.16s ease,
        box-shadow 0.16s ease;
    }

    .qcard:hover:not(:disabled) {
      transform: translateY(-1px);
      border-color: var(--brand-soft-strong);
      box-shadow: var(--shadow-sm);
    }

    .qcard:disabled,
    .pill:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }

    .qcard__top {
      display: flex;
      align-items: center;
      gap: var(--sp-2);
    }

    .qcard__text {
      font-size: 13px;
      font-weight: 600;
      line-height: 1.5;
      color: var(--text-primary);
      word-break: break-word;
    }

    .qcard__metrics {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }

    /* ---------------- 消息流 ---------------- */

    .stream {
      display: flex;
      flex-direction: column;
      gap: var(--sp-4);
      min-height: 320px;
      max-height: 56vh;
      overflow-y: auto;
      overflow-x: hidden;
      padding: var(--sp-1) 2px var(--sp-1) 0;
    }

    .msg {
      display: flex;
      gap: var(--sp-2);
      min-width: 0;
    }

    .msg--user {
      justify-content: flex-end;
    }

    .msg--agent {
      align-items: flex-start;
      justify-content: flex-start;
    }

    .bubble {
      max-width: 70%;
      padding: var(--sp-3) var(--sp-4);
      background: var(--brand-primary);
      color: var(--text-inverse);
      border-radius: var(--radius-lg);
      min-width: 0;
    }

    .bubble__text {
      margin: 0;
      font-size: 13px;
      line-height: 1.6;
      word-break: break-word;
    }

    .bubble__meta {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 6px;
      font-size: 11px;
      opacity: 0.85;
    }

    .msg__tag {
      padding: 0 5px;
      border-radius: var(--radius-pill);
      background: rgba(255, 255, 255, 0.2);
    }

    .agent-card {
      flex: 1 1 auto;
      min-width: 0;
      padding: var(--sp-4);
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-xs);
    }

    .plain {
      margin: 0;
      font-size: 13px;
      line-height: 1.7;
      color: var(--text-primary);
      word-break: break-word;
    }

    .lead {
      margin: 0 0 var(--sp-3);
      padding: var(--sp-2) var(--sp-3);
      background: var(--status-yellow-soft);
      border: 1px solid var(--status-yellow-border);
      border-radius: var(--radius-md);
      font-size: 12px;
      line-height: 1.6;
      color: var(--text-primary);
    }

    /* ---------------- 推理过程 ---------------- */

    .thinking__head {
      display: flex;
      align-items: center;
      gap: var(--sp-2);
      margin-bottom: var(--sp-3);
    }

    .thinking__bars {
      display: inline-flex;
      align-items: flex-end;
      gap: 3px;
      height: 12px;
    }

    .thinking__bars i {
      display: block;
      width: 3px;
      border-radius: var(--radius-pill);
      background: var(--brand-primary);
      transform-origin: bottom;
      animation: think 0.9s ease-in-out infinite;
    }

    .thinking__bars i:nth-child(1) {
      height: 7px;
    }

    .thinking__bars i:nth-child(2) {
      height: 12px;
      animation-delay: 0.15s;
    }

    .thinking__bars i:nth-child(3) {
      height: 9px;
      animation-delay: 0.3s;
    }

    @keyframes think {
      0%,
      100% {
        transform: scaleY(0.35);
      }
      50% {
        transform: scaleY(1);
      }
    }

    .thinking__label {
      font-size: 12px;
      color: var(--text-secondary);
    }

    .steps {
      display: flex;
      flex-direction: column;
      gap: var(--sp-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .step {
      display: flex;
      align-items: flex-start;
      gap: var(--sp-2);
      min-width: 0;
      animation: step-in 0.18s ease;
    }

    @keyframes step-in {
      from {
        opacity: 0;
        transform: translateY(3px);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }

    .step__no,
    .act__no {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
      width: 20px;
      height: 20px;
      border-radius: var(--radius-sm);
      background: var(--brand-soft);
      color: var(--brand-primary);
      font-size: 11px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }

    .step__body {
      display: flex;
      flex-direction: column;
      gap: 2px;
      flex: 1 1 auto;
      min-width: 0;
    }

    .step__title {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .step__detail {
      font-size: 12px;
      line-height: 1.6;
      color: var(--text-secondary);
    }

    .step > .ws-tag {
      flex: 0 0 auto;
      max-width: 42%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* ---------------- 答案五段式 ---------------- */

    .five {
      display: flex;
      flex-direction: column;
      gap: var(--sp-4);
    }

    .sec {
      display: flex;
      flex-direction: column;
      gap: var(--sp-2);
      min-width: 0;
    }

    .sec__label {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.04em;
      color: var(--text-muted);
    }

    .conclusion {
      margin: 0;
      padding: var(--sp-3) var(--sp-4);
      border-left: 3px solid var(--brand-primary);
      border-radius: 0 var(--radius-md) var(--radius-md) 0;
      background: var(--brand-soft);
      color: var(--brand-ink);
      font-size: 14px;
      font-weight: 600;
      line-height: 1.6;
    }

    .ord {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin: 0;
      padding-left: var(--sp-5);
      font-size: 13px;
      line-height: 1.6;
      color: var(--text-primary);
    }

    .evi,
    .imp,
    .act {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .evi__row {
      display: flex;
      align-items: center;
      gap: var(--sp-2);
      padding: var(--sp-2) var(--sp-3);
      background: var(--bg-subtle);
      border-radius: var(--radius-md);
      font-size: 12px;
      min-width: 0;
    }

    .evi__row > ws-icon {
      flex: 0 0 auto;
      color: var(--text-secondary);
    }

    .evi__main {
      display: flex;
      align-items: baseline;
      gap: 6px;
      flex: 1 1 auto;
      min-width: 0;
    }

    .evi__metric {
      color: var(--text-secondary);
      white-space: nowrap;
    }

    .evi__value {
      font-weight: 600;
      color: var(--text-primary);
    }

    .evi__side {
      display: flex;
      align-items: center;
      gap: 6px;
      flex: 0 0 auto;
    }

    .evi__src {
      color: var(--text-muted);
      white-space: nowrap;
    }

    .imp__row {
      display: flex;
      align-items: center;
      gap: var(--sp-2);
      font-size: 13px;
      min-width: 0;
    }

    .imp__row > ws-icon {
      flex: 0 0 auto;
      color: var(--status-orange);
    }

    .imp__text {
      flex: 1 1 auto;
      min-width: 0;
    }

    .act__row {
      display: flex;
      align-items: flex-start;
      gap: var(--sp-2);
      padding-bottom: var(--sp-2);
      border-bottom: 1px dashed var(--border);
      min-width: 0;
    }

    .act__row:last-child {
      padding-bottom: 0;
      border-bottom: none;
    }

    .act__body {
      display: flex;
      flex-direction: column;
      gap: 6px;
      flex: 1 1 auto;
      min-width: 0;
    }

    .act__text {
      font-size: 13px;
      line-height: 1.6;
      color: var(--text-primary);
    }

    .act__meta {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
      font-size: 11px;
      color: var(--text-muted);
    }

    .act__go {
      flex: 0 0 auto;
    }

    .links {
      display: flex;
      flex-wrap: wrap;
      gap: var(--sp-2);
      margin-top: var(--sp-4);
      padding-top: var(--sp-3);
      border-top: 1px solid var(--border);
    }

    .signature {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--sp-2);
      margin-top: var(--sp-3);
      padding-top: var(--sp-2);
      border-top: 1px solid var(--border);
      font-size: 11px;
      color: var(--text-muted);
    }

    .brief {
      font-weight: 600;
      color: var(--brand-primary);
    }

    /* ---------------- 输入区 ---------------- */

    .composer {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 0;
    }

    .composer__row {
      display: flex;
      align-items: flex-end;
      gap: var(--sp-2);
      min-width: 0;
    }

    .composer__row .ws-textarea {
      flex: 1 1 auto;
      min-width: 0;
    }

    .composer__note {
      margin: 0;
      font-size: 11px;
      color: var(--text-muted);
    }

    /* ---------------- 右侧上下文面板 ---------------- */

    .side {
      display: flex;
      flex-direction: column;
      gap: var(--sp-4);
      min-width: 0;
      position: sticky;
      top: calc(var(--topbar-h) + var(--sp-4));
      max-height: calc(100vh - var(--topbar-h) - var(--sp-8));
      overflow-y: auto;
      overflow-x: hidden;
      padding-right: 2px;
    }

    .snap {
      display: flex;
      flex-direction: column;
      margin: 0;
    }

    .snap__row {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: var(--sp-2);
      padding: 7px var(--sp-2);
      border-radius: var(--radius-sm);
    }

    .snap__row:nth-child(odd) {
      background: var(--bg-subtle);
    }

    .snap__label {
      flex: 1 1 auto;
      min-width: 0;
      margin: 0;
      font-size: 12px;
      color: var(--text-secondary);
    }

    .snap__value {
      flex: 0 0 auto;
      margin: 0;
      font-size: 13px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }

    .snap__unit {
      margin-left: 3px;
      font-size: 11px;
      font-weight: 400;
      color: var(--text-muted);
    }

    .snap__note {
      flex: 1 1 100%;
      font-size: 11px;
      color: var(--text-muted);
    }

    .src + .src {
      margin-top: var(--sp-4);
    }

    .src__head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--sp-2);
      margin-bottom: 6px;
    }

    .src__label {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .src__count {
      font-size: 11px;
      color: var(--text-muted);
    }

    .src__list {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .src__row {
      display: flex;
      align-items: center;
      gap: var(--sp-2);
      padding: 5px var(--sp-2);
      background: var(--bg-subtle);
      border-radius: var(--radius-sm);
      min-width: 0;
    }

    .src__name {
      flex: 1 1 auto;
      min-width: 0;
      font-size: 12px;
      color: var(--text-primary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .pills {
      display: flex;
      flex-wrap: wrap;
      gap: var(--sp-2);
    }

    .pill {
      padding: 5px var(--sp-3);
      font: inherit;
      font-size: 12px;
      text-align: left;
      color: var(--text-primary);
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-pill);
      cursor: pointer;
      transition:
        border-color 0.16s ease,
        background 0.16s ease;
    }

    .pill:hover:not(:disabled) {
      border-color: var(--brand-primary);
      background: var(--brand-soft);
      color: var(--brand-ink);
    }

    .alert__stats {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--sp-2);
      margin-bottom: var(--sp-3);
    }

    .alert__stat {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: var(--sp-2) var(--sp-3);
      background: var(--bg-subtle);
      border-radius: var(--radius-md);
    }

    .alert__num {
      font-size: 20px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }

    .alert__cap {
      font-size: 11px;
      color: var(--text-secondary);
    }

    .alert__list {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .alert__row {
      display: flex;
      align-items: center;
      gap: var(--sp-2);
      width: 100%;
      padding: var(--sp-2);
      font: inherit;
      color: inherit;
      text-align: left;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      cursor: pointer;
      transition:
        border-color 0.16s ease,
        background 0.16s ease;
    }

    .alert__row:hover {
      border-color: var(--brand-soft-strong);
      background: var(--brand-soft);
    }

    .alert__title {
      flex: 1 1 auto;
      min-width: 0;
      font-size: 12px;
      line-height: 1.5;
      color: var(--text-primary);
    }

    /* ---------------- 页脚 ---------------- */

    .foot {
      grid-column: 1 / -1;
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--sp-3);
      padding-top: var(--sp-1);
    }

    .foot__text {
      font-size: 11px;
      color: var(--text-muted);
    }

    /* ---------------- 自适应 ---------------- */

    @media (max-width: 1440px) {
      .page {
        grid-template-columns: minmax(0, 1fr);
      }

      .side {
        position: static;
        max-height: none;
        overflow: visible;
        padding-right: 0;
      }

      .stream {
        max-height: 52vh;
      }
    }

    @media (max-width: 1100px) {
      .page {
        gap: var(--sp-4);
      }

      .qgrid {
        grid-template-columns: minmax(0, 1fr);
      }

      .agent {
        flex-wrap: wrap;
      }

      .stream {
        max-height: 48vh;
        min-height: 240px;
      }

      .bubble {
        max-width: 88%;
      }
    }
  `,
})
export class AssistantPage {
  protected readonly data = inject(SentinelDataService);
  protected readonly state = inject(StateService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly markPath = MARK_PATH;
  protected readonly questions = ASSISTANT_QUESTIONS;
  protected readonly followups = ASSISTANT_SUGGESTED_FOLLOWUPS;
  protected readonly categoryLabel = ASSISTANT_CATEGORY_LABEL;
  protected readonly asOfDate = ASSISTANT_WELCOME.createdAt.split(' ')[0] ?? '';

  protected readonly scrollHost = viewChild<ElementRef<HTMLElement>>('scrollHost');

  /** 所有 pending 的定时器 id，用于组件销毁时统一清理。 */
  private readonly timers = new Set<number>();
  private seq = 0;

  protected readonly turns = signal<readonly ChatTurn[]>([this.welcomeTurn()]);
  protected readonly draft = signal('');

  protected readonly busy = computed(() => this.turns().some((turn) => turn.thinking));
  protected readonly canSend = computed(() => this.draft().trim().length > 0 && !this.busy());

  /* ---------------- 右侧面板派生数据 ---------------- */

  protected readonly snap = this.data.dashboardSnapshot;
  protected readonly inventory = this.data.inventoryOverview;
  protected readonly receivable = this.data.receivableOverview;

  protected readonly gap60 = computed(
    () => this.snap().gaps.find((gap) => gap.horizon === 60) ?? null,
  );

  protected readonly fxNet = computed(() =>
    this.data.cashFxPage.exposures.reduce((sum, exposure) => sum + exposure.net, 0),
  );

  protected readonly snapshotRows = computed<readonly SnapshotRow[]>(() => {
    const snapshot = this.snap();
    const inventory = this.inventory();
    const receivable = this.receivable();
    const gap = this.gap60();
    const fxNet = this.fxNet();
    return [
      this.row(
        'cash',
        '现金余额',
        snapshot.cashOnHand,
        'amount',
        '',
        'blue',
        '口径：集团合并口径可动用现金余额，含境外账户按当期汇率折算。',
        `安全线 ${this.wan(this.data.cashFxPage.position.safeLine)}`,
      ),
      this.row(
        'safety',
        '现金安全度',
        snapshot.cashSafetyScore,
        'num',
        '分',
        this.levelTone(snapshot.cashSafetyLevel),
        '口径：M1 现金安全度评分，分数越低代表现金风险越高。',
      ),
      this.row(
        'gap60',
        '60 天现金缺口',
        gap ? gap.amount : 0,
        'amount',
        '',
        'orange',
        '口径：60 天窗口最低现金余额与安全线的差额。',
        gap ? `窗口最低余额 ${this.wan(gap.minBalance)}` : '',
      ),
      this.row(
        'inventory',
        '库存货值',
        inventory.totalValue,
        'amount',
        '',
        'plain',
        `口径：全部仓库库存按最近采购成本计价，平均库龄 ${inventory.avgAgingDays} 天。`,
      ),
      this.row(
        'overstock',
        '超期库存占比',
        inventory.overstockRatio,
        'percent',
        '',
        'orange',
        '口径：L3／L4 库存货值占库存总货值的比例。',
      ),
      this.row(
        'receivable',
        '应收余额',
        receivable.totalReceivable,
        'amount',
        '',
        'plain',
        '口径：全部客户未回款余额合计。',
      ),
      this.row(
        'overdue',
        '应收逾期率',
        receivable.overdueRatio,
        'percent',
        '',
        'red',
        `口径：逾期未回款金额占应收余额的比例，逾期金额 ${this.wan(receivable.overdueAmount)}。`,
      ),
      this.row(
        'dso',
        '应收周转天数 DSO',
        receivable.dso,
        'num',
        '天',
        'plain',
        '口径：应收账款周转天数，反映平均回款周期。',
      ),
      this.row(
        'fx',
        '外币净敞口',
        fxNet,
        'amount',
        '',
        'blue',
        '口径：各币种外币应收减应付后折合人民币的净额合计。',
      ),
    ];
  });

  protected readonly alertRisks = this.data.topRisks.slice(0, 3);

  private readonly sourceStats = this.buildSourceStats();
  protected readonly sourceGroups = this.buildSourceGroups();
  protected readonly sourceSubtitle = `已模拟接入 ${this.sourceStats.simulated} / ${this.sourceStats.total} 项`;

  constructor() {
    this.destroyRef.onDestroy(() => this.clearTimers());
  }

  /* ---------------- 模板动作 ---------------- */

  protected ask(question: AssistantQuestion): void {
    this.runTurn(question.text, ASSISTANT_ANSWERS[question.id], {
      categoryLabel: ASSISTANT_CATEGORY_LABEL[question.category],
      metrics: question.metrics,
      lead: '',
    });
  }

  protected askFollowup(text: string): void {
    this.submitText(text);
  }

  protected submitDraft(): void {
    this.submitText(this.draft());
  }

  protected onInput(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLTextAreaElement) {
      this.draft.set(target.value);
    }
  }

  protected onEnter(event: Event): void {
    if (event instanceof KeyboardEvent && !event.shiftKey) {
      event.preventDefault();
      this.submitDraft();
    }
  }

  protected resetConversation(): void {
    this.clearTimers();
    this.state.setAiStatus('ready');
    this.turns.set([this.welcomeTurn()]);
    this.draft.set('');
    this.state.pushToast('对话已清空（Demo 示例数据）', 'info');
  }

  protected navigate(route: string | undefined): void {
    if (route) {
      void this.router.navigateByUrl(route);
    }
  }

  protected timestampLabel(turn: ChatTurn): string {
    const parts = turn.createdAt.split(' ');
    return parts.length > 1 ? (parts[1] ?? turn.createdAt) : turn.createdAt;
  }

  protected statusTone(): WsTone {
    return this.state.aiStatus() === 'thinking' ? 'blue' : 'green';
  }

  protected categoryTone(question: AssistantQuestion): WsTone {
    return CATEGORY_TONE[question.category];
  }

  protected priorityTone(priority: Priority): WsTone {
    return PRIORITY_TONE[priority];
  }

  protected sourceTone(source: DataSource): WsTone {
    return source.status === 'simulated' ? 'green' : 'plain';
  }

  protected sourceStatus(source: DataSource): string {
    return source.status === 'simulated' ? '已模拟接入' : '待接入';
  }

  protected snapshotValueClass(row: SnapshotRow): string {
    return `snap__value ${toneTextClass(row.tone)}`;
  }

  /* ---------------- 提问流程 ---------------- */

  private submitText(text: string): void {
    const trimmed = text.trim();
    if (trimmed === '' || this.busy()) {
      return;
    }
    const id = matchQuestionId(trimmed);
    if (id === null) {
      this.runTurn(trimmed, ASSISTANT_ANSWERS['Q1'], {
        categoryLabel: '自定义提问',
        metrics: [],
        lead: UNMATCHED_LEAD,
      });
      return;
    }
    const question = ASSISTANT_QUESTIONS.find((item) => item.id === id);
    if (!question) {
      this.runTurn(trimmed, ASSISTANT_ANSWERS[id], {
        categoryLabel: '自定义提问',
        metrics: [],
        lead: '',
      });
      return;
    }
    this.runTurn(trimmed, ASSISTANT_ANSWERS[id], {
      categoryLabel: ASSISTANT_CATEGORY_LABEL[question.category],
      metrics: question.metrics,
      lead: '',
    });
  }

  private runTurn(text: string, answer: AssistantAnswer, meta: TurnMeta): void {
    if (this.busy()) {
      return;
    }
    this.seq += 1;
    const createdAt = this.nowLabel();
    const agentId = `T${this.seq}-A`;
    const briefRequested = answer.questionId === 'Q5';

    const userTurn: ChatTurn = {
      id: `T${this.seq}`,
      role: 'user',
      createdAt,
      text,
      categoryLabel: meta.categoryLabel,
      metrics: meta.metrics,
      visibleSteps: [],
      thinking: false,
      answer: null,
      lead: '',
      briefRequested: false,
    };

    const agentTurn: ChatTurn = {
      id: agentId,
      role: 'agent',
      createdAt,
      text: '',
      categoryLabel: meta.categoryLabel,
      metrics: meta.metrics,
      visibleSteps: [],
      thinking: true,
      answer: null,
      lead: meta.lead,
      briefRequested,
    };

    this.turns.update((list) => [...list, userTurn, agentTurn]);
    this.draft.set('');
    this.state.setAiStatus('thinking');
    this.scrollToBottom();

    const steps = answer.thinkingSteps;
    const finish = (): void => {
      this.turns.update((list) =>
        list.map((turn) => (turn.id === agentId ? { ...turn, thinking: false, answer } : turn)),
      );
      this.state.setAiStatus('ready');
      if (briefRequested) {
        this.data.generateBrief();
      }
      this.scrollToBottom();
    };

    if (steps.length === 0) {
      finish();
      return;
    }

    steps.forEach((step, index) => {
      const isLast = index === steps.length - 1;
      this.schedule(() => {
        this.turns.update((list) =>
          list.map((turn) =>
            turn.id === agentId ? { ...turn, visibleSteps: [...turn.visibleSteps, step] } : turn,
          ),
        );
        if (isLast) {
          finish();
        } else {
          this.scrollToBottom();
        }
      }, STEP_MS * (index + 1));
    });
  }

  private welcomeTurn(): ChatTurn {
    return {
      id: ASSISTANT_WELCOME.id,
      role: 'agent',
      createdAt: ASSISTANT_WELCOME.createdAt,
      text: ASSISTANT_WELCOME.text ?? '',
      categoryLabel: '开场',
      metrics: [],
      visibleSteps: [],
      thinking: false,
      answer: null,
      lead: '',
      briefRequested: false,
    };
  }

  /* ---------------- 工具 ---------------- */

  private row(
    key: string,
    label: string,
    value: number,
    kind: SnapshotRow['kind'],
    unit: string,
    tone: WsTone,
    hint: string,
    note = '',
  ): SnapshotRow {
    return { key, label, value, kind, unit, tone, hint, note };
  }

  private buildSourceGroups(): readonly SourceGroup[] {
    const sources = this.data.settingsPage.dataSources;
    return SOURCE_GROUP_ORDER.map((category) => {
      const matched = sources.filter((source) => source.category === category);
      return {
        category,
        label: SOURCE_GROUP_LABEL[category],
        rows: matched.slice(0, SOURCE_PREVIEW),
        total: matched.length,
      };
    });
  }

  private buildSourceStats(): { readonly total: number; readonly simulated: number } {
    const sources = this.data.settingsPage.dataSources;
    const total = sources.length;
    const simulated = sources.filter((source) => source.status === 'simulated').length;
    return { total, simulated };
  }

  private levelTone(level: RiskLevel): WsTone {
    switch (level) {
      case 'L4':
        return 'red';
      case 'L3':
        return 'orange';
      case 'L2':
        return 'yellow';
      default:
        return 'green';
    }
  }

  private wan(value: number): string {
    return `${value.toLocaleString('en-US')} 万元`;
  }

  private nowLabel(): string {
    const now = new Date();
    const pad = (value: number): string => String(value).padStart(2, '0');
    return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  }

  private schedule(fn: () => void, delay: number): void {
    const id = window.setTimeout(() => {
      this.timers.delete(id);
      fn();
    }, delay);
    this.timers.add(id);
  }

  private clearTimers(): void {
    this.timers.forEach((id) => window.clearTimeout(id));
    this.timers.clear();
  }

  private scrollToBottom(): void {
    this.schedule(() => {
      const element = this.scrollHost()?.nativeElement;
      if (element) {
        element.scrollTop = element.scrollHeight;
      }
    }, 0);
  }
}
