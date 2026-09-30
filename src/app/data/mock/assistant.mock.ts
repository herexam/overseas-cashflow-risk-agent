/**
 * AI 助手（Agent 问答）Mock 数据
 *
 * 本文件所有问答内容、指标数值、行动建议均为 Demo 示例数据，
 * 仅用于「WorkCap Sentinel（现金哨兵）」产品演示，不代表沃太能源（AlphaESS）真实经营数据。
 * 金额单位统一为万元（另有标注的字段除外）。
 */

import type { AssistantAnswer, AssistantMessage, AssistantQuestion } from '../../core/models';
import { DEMO_AS_OF_TIME } from './_random';

/* ------------------------------------------------------------------ */
/* 快捷问题（5 条，与产品演示脚本一一对应）                            */
/* ------------------------------------------------------------------ */

export const ASSISTANT_QUESTIONS: readonly AssistantQuestion[] = [
  {
    id: 'Q1',
    text: '现在最大的现金流风险是什么？',
    category: 'cash',
    metrics: ['M1', 'M2', 'M3', 'M8'],
  },
  {
    id: 'Q2',
    text: '哪些库存需要立即踩刹车？',
    category: 'inventory',
    metrics: ['M4', 'M5'],
  },
  {
    id: 'Q3',
    text: '哪些客户需要优先催收？',
    category: 'receivable',
    metrics: ['M6', 'M7', 'M11'],
  },
  {
    id: 'Q4',
    text: '如果海运延迟 30 天，会发生什么？',
    category: 'scenario',
    metrics: ['M4', 'M8'],
  },
  {
    id: 'Q5',
    text: '给我生成今天的 CFO 晨会摘要。',
    category: 'brief',
    metrics: ['M1', 'M2', 'M6', 'M12'],
  },
];

/* ------------------------------------------------------------------ */
/* Q1 现金流风险                                                       */
/* ------------------------------------------------------------------ */

const ANSWER_Q1: AssistantAnswer = {
  questionId: 'Q1',
  conclusion: '60 天现金缺口 1,180 万元是最大风险，源自库存积压与回款延期。',
  reasons: [
    '现金余额 8,420 万元、安全线 6,000 万元，60 天窗口最低余额跌到 4,820 万元，缺口 1,180 万元。',
    '90 天窗口缺口进一步扩大到 2,360 万元，最低余额 3,640 万元，风险等级升到 L4。',
    '德国法兰克福仓电池包超期积压、占用现金 900 万元；应收周转天数 104 天，回款节奏整体后移。',
    '90 天内到期债务 4,180 万元，其中 30 天内 2,100 万元，与回款低谷期高度重叠。',
  ],
  evidence: [
    {
      id: 'EV-Q1-1',
      sourceSystem: '资金系统 · 现金头寸',
      metric: '现金余额',
      value: '8,420 万元',
      baseline: '安全线 6,000 万元 / 上周 8,840 万元',
      asOf: '2026-09-15 07:30',
      nature: 'demo',
      definition: '口径：集团合并口径可动用现金余额，含境外账户按当期汇率折算。',
    },
    {
      id: 'EV-Q1-2',
      sourceSystem: '资金系统 · 现金流预测',
      metric: '60 天最低现金余额',
      value: '4,820 万元（缺口 1,180 万元）',
      baseline: '安全线 6,000 万元',
      asOf: '2026-09-15 07:30',
      nature: 'demo',
      definition: '口径：按已确认订单、应收账龄与到期债务滚动外推，取 60 天窗口最低点。',
    },
    {
      id: 'EV-Q1-3',
      sourceSystem: '资金系统 · 现金流预测',
      metric: '90 天现金缺口',
      value: '2,360 万元',
      baseline: '60 天缺口 1,180 万元',
      asOf: '2026-09-15 07:30',
      nature: 'demo',
      definition: '口径：90 天窗口最低余额 3,640 万元与 6,000 万元安全线的差额。',
    },
    {
      id: 'EV-Q1-4',
      sourceSystem: 'WMS · 库龄快照',
      metric: '超期库存占用现金',
      value: '900 万元',
      baseline: '超期库存占比 21.4%',
      asOf: '2026-09-15 07:00',
      nature: 'demo',
      definition: '口径：库龄超过 90 天的库存按最近采购成本计价，仅统计已入海外仓部分。',
    },
    {
      id: 'EV-Q1-5',
      sourceSystem: 'ERP · 债务与融资台账',
      metric: '90 天内到期债务',
      value: '4,180 万元',
      baseline: '30 天内 2,100 万元 / 60 天内 3,260 万元',
      asOf: '2026-09-15 07:10',
      nature: 'demo',
      definition: '口径：银行流贷、供应链票据、信用证与融资租赁的合同到期本金合计。',
    },
    {
      id: 'EV-Q1-6',
      sourceSystem: 'BI · 营运资本月报',
      metric: '现金转换周期 CCC',
      value: '108 天',
      baseline: '目标 98 天（DIO 92 + DSO 104 − DPO 88）',
      asOf: '2026-09-15 06:50',
      nature: 'demo',
      definition: '口径：存货周转天数 + 应收周转天数 − 应付周转天数。',
    },
  ],
  impacts: [
    {
      text: '若不做干预，60 天窗口末现金余额将跌破安全线。',
      metric: '60 天现金缺口',
      delta: '+1,180 万元',
    },
    {
      text: '90 天窗口缺口扩大到红色区间，融资成本被动抬升。',
      metric: '90 天现金缺口',
      delta: '+2,360 万元',
    },
    {
      text: '现金安全度已跌破 70 分关注线，管理层需按周跟踪。',
      metric: '现金安全度 M1',
      delta: '−3 分',
    },
    {
      text: '现金转换周期较目标多占用约 900 万元营运资金。',
      metric: 'CCC',
      delta: '+10 天',
    },
  ],
  actions: [
    {
      id: 'ACT-Q1-1',
      text: '对德国仓超期电池包暂停补货并启动清库，目标释放现金 1,180 万元。',
      actionType: 'pause',
      priority: 'P0',
      owner: '李崇（海外仓运营）',
      dueDate: '2026-09-25',
      releaseAmount: 1180,
      route: '/inventory',
    },
    {
      id: 'ACT-Q1-2',
      text: '对欧洲前五大经销商启动集中催收，逾期账款 3,248 万元按周跟踪回款计划。',
      actionType: 'reduce',
      priority: 'P0',
      owner: '王琳（欧洲应收）',
      dueDate: '2026-09-30',
      route: '/receivables',
    },
    {
      id: 'ACT-Q1-3',
      text: '与主办行协商 30 天内到期的 2,100 万元流贷展期至 11 月，避开回款低谷。',
      actionType: 'delay',
      priority: 'P1',
      owner: '赵敏（资金管理）',
      dueDate: '2026-09-22',
      route: '/cash-fx',
    },
    {
      id: 'ACT-Q1-4',
      text: '将超期库存对应的采购预付款转为电芯供应商账期，缓释同期现金流出。',
      actionType: 'transfer',
      priority: 'P2',
      owner: '陈志远（供应链计划）',
      dueDate: '2026-10-10',
      route: '/cash-fx',
    },
    {
      id: 'ACT-Q1-5',
      text: '把现金安全度与 60／90 天缺口纳入每日晨会跟踪，缺口扩大 5% 即升级 L4 预警。',
      actionType: 'continue',
      priority: 'P1',
      owner: '周宁（CFO 办公室）',
      dueDate: '2026-09-18',
      route: '/dashboard',
    },
  ],
  thinkingSteps: [
    {
      step: '第 1 步 · 拉取现金头寸与债务台账',
      detail: '读取资金头寸台账，确认现金余额 8,420 万元、安全线 6,000 万元、90 天内到期债务 4,180 万元。',
      source: 'D11 资金头寸 / D13 债务与融资',
    },
    {
      step: '第 2 步 · 计算 30／60／90 天现金缺口',
      detail: '按已确认订单与到期债务滚动外推，三段窗口缺口分别为 0 / 1,180 / 2,360 万元。',
      source: 'D12 银行流水 / D8 应收账龄',
    },
    {
      step: '第 3 步 · 匹配库存库龄与现金占用',
      detail: '库龄明细显示超期库存占比 21.4%，锁定德国法兰克福仓电池包案例，占用现金 900 万元。',
      source: 'D1 库存快照 / D2 库龄明细',
    },
    {
      step: '第 4 步 · 叠加外部汇率与政策信号',
      detail: '欧元兑人民币 8.3145、日内 +1.18%，欧元净敞口 8,300 万元；美国关税调整影响货值 1,980 万元。',
      source: 'E1 汇率行情 / E4 关税与贸易政策',
    },
    {
      step: '第 5 步 · 生成行动建议并按可释放现金排序',
      detail: '综合授信额度与客户回款记录，输出 5 条行动建议并指派责任人与完成时限。',
      source: 'D9 客户回款记录 / D10 授信额度',
    },
  ],
  relatedLinks: [
    { label: '现金流与外汇', route: '/cash-fx' },
    { label: '库存健康度', route: '/inventory' },
    { label: '应收管理', route: '/receivables' },
  ],
};

/* ------------------------------------------------------------------ */
/* Q2 库存踩刹车                                                       */
/* ------------------------------------------------------------------ */

const ANSWER_Q2: AssistantAnswer = {
  questionId: 'Q2',
  conclusion: '德国仓电池包等超期库存需立即踩刹车，首轮可释放现金 1,180 万元。',
  reasons: [
    'SKU ESS-BAT-05K-DE 在法兰克福仓结存 1,240 台、货值 2,860 万元，库龄 90 天，仅覆盖 1.2 个月需求。',
    '该 SKU 在途仍有 380 台、约 877 万元，继续到货会二次积压；德国仓已超期 428 台，占用现金 900 万元。',
    '整体库存货值 32,910 万元、超期占比 21.4%，库存周转天数 92 天，高于 75 天绿色阈值。',
    '海运延迟与欧洲订单走平会继续压低周转，情景外推下库存周转天数将升至 110 天。',
  ],
  evidence: [
    {
      id: 'EV-Q2-1',
      sourceSystem: 'WMS · 库存快照',
      metric: '德国仓 ESS-BAT-05K-DE 结存',
      value: '1,240 台 / 2,860 万元',
      baseline: '标准库存 900 台，在途 380 台',
      asOf: '2026-09-15 07:00',
      nature: 'demo',
      definition: '口径：法兰克福仓可用库存，按最近采购成本计价，不含已售未发部分。',
    },
    {
      id: 'EV-Q2-2',
      sourceSystem: 'WMS · 库龄快照',
      metric: '超期库存占比',
      value: '21.4%',
      baseline: '绿色阈值 15% / 关注 20%',
      asOf: '2026-09-15 07:00',
      nature: 'demo',
      definition: '口径：库龄超过 90 天的库存货值占全部库存货值的比例。',
    },
    {
      id: 'EV-Q2-3',
      sourceSystem: 'ERP · 库龄明细',
      metric: '该 SKU 库龄',
      value: '90 天',
      baseline: '健康阈值 60 天',
      asOf: '2026-09-15 07:05',
      nature: 'demo',
      definition: '口径：按批次入库日期加权计算的平均在库天数。',
    },
    {
      id: 'EV-Q2-4',
      sourceSystem: 'ERP · 销售预测',
      metric: '订单覆盖月数',
      value: '1.2 个月',
      baseline: '目标 2.0 个月',
      asOf: '2026-09-15 07:05',
      nature: 'demo',
      definition: '口径：现有库存台数 ÷ 最近 3 个月平均月出货台数。',
    },
    {
      id: 'EV-Q2-5',
      sourceSystem: 'BI · 库存健康度',
      metric: '库存周转天数 DIO',
      value: '92 天',
      baseline: '绿色阈值 75 天',
      asOf: '2026-09-15 06:50',
      nature: 'demo',
      definition: '口径：期末库存货值 ÷ 期间平均日销售成本。',
    },
    {
      id: 'EV-Q2-6',
      sourceSystem: '资金系统 · 现金占用',
      metric: '超期库存占用现金',
      value: '900 万元',
      baseline: '该 SKU 可释放现金 1,180 万元',
      asOf: '2026-09-15 07:30',
      nature: 'demo',
      definition: '口径：超期库存按可变现净值估算占用的营运资金。',
    },
  ],
  impacts: [
    {
      text: '若按原节奏到货，在途 380 台将新增占用资金。',
      metric: '在途库存货值',
      delta: '+877 万元',
    },
    {
      text: '库存周转天数进一步恶化，营运资金被长期锁定。',
      metric: 'DIO',
      delta: '+18 天',
    },
    {
      text: '超期占比越过红色区间将触发 L4 预警并占用海外仓库容。',
      metric: '超期库存占比',
      delta: '+8.6 个百分点',
    },
    {
      text: '该 SKU 每延后一个月去化，约推迟等量现金回收。',
      metric: '库存资金占用',
      delta: '+约 240 万元/月',
    },
  ],
  actions: [
    {
      id: 'ACT-Q2-1',
      text: '暂停 ESS-BAT-05K-DE 在德国仓的补货，并锁定 380 台在途库存不再新增调拨。',
      actionType: 'pause',
      priority: 'P0',
      owner: '李崇（海外仓运营）',
      dueDate: '2026-09-25',
      releaseAmount: 877,
      route: '/inventory',
    },
    {
      id: 'ACT-Q2-2',
      text: '对法兰克福仓 428 台超期电池包执行折价清库，目标 30 天内释放现金 900 万元。',
      actionType: 'reduce',
      priority: 'P0',
      owner: '李崇（海外仓运营）',
      dueDate: '2026-09-30',
      releaseAmount: 900,
      route: '/inventory',
    },
    {
      id: 'ACT-Q2-3',
      text: '将 380 台在途库存改配至需求更旺的鹿特丹仓与米兰仓，避免二次积压。',
      actionType: 'transfer',
      priority: 'P1',
      owner: '陈志远（供应链计划）',
      dueDate: '2026-10-08',
      route: '/inventory',
    },
    {
      id: 'ACT-Q2-4',
      text: '与电芯供应商协商把 10 月采购预付款延后 30 天支付，平抑现金流出。',
      actionType: 'delay',
      priority: 'P1',
      owner: '陈志远（供应链计划）',
      dueDate: '2026-09-28',
      route: '/scenario',
    },
    {
      id: 'ACT-Q2-5',
      text: '把超期库存占比纳入海外仓运营周报，超过 25% 自动升级预警。',
      actionType: 'continue',
      priority: 'P2',
      owner: '周宁（CFO 办公室）',
      dueDate: '2026-09-19',
      route: '/alerts',
    },
  ],
  thinkingSteps: [
    {
      step: '第 1 步 · 拉取库存快照',
      detail: '库存快照显示库存货值 32,910 万元、结存 18,640 台，海外仓 8 个。',
      source: 'D1 库存快照',
    },
    {
      step: '第 2 步 · 匹配库龄明细',
      detail: '库龄明细标记超期库存占比 21.4%，其中法兰克福仓电池包超期 428 台。',
      source: 'D2 库龄明细',
    },
    {
      step: '第 3 步 · 定位具体 SKU',
      detail: '定位到 ESS-BAT-05K-DE：1,240 台 / 2,860 万元 / 库龄 90 天 / 覆盖 1.2 个月。',
      source: 'D1 库存快照 / D2 库龄明细',
    },
    {
      step: '第 4 步 · 核对在途与订单需求',
      detail: '在途库存显示该 SKU 尚有 380 台未到仓，销售订单显示欧洲需求环比走平。',
      source: 'D3 在途库存 / D4 销售订单',
    },
    {
      step: '第 5 步 · 生成刹车建议',
      detail: '按可释放现金排序，输出暂停补货、折价清库、跨仓调拨与账期谈判四类动作。',
      source: 'D6 采购订单 / D7 供应商交期',
    },
  ],
  relatedLinks: [
    { label: '库存健康度', route: '/inventory' },
    { label: '情景推演', route: '/scenario' },
    { label: '风险预警', route: '/alerts' },
  ],
};

/* ------------------------------------------------------------------ */
/* Q3 优先催收客户                                                     */
/* ------------------------------------------------------------------ */

const ANSWER_Q3: AssistantAnswer = {
  questionId: 'Q3',
  conclusion: '优先催收欧洲前五大客户，逾期 3,248 万元、逾期率 11.2%。',
  reasons: [
    '应收余额约 2.9 亿元（29,000 万元），应收周转天数 104 天，高于 96 天绿色阈值。',
    '逾期账款合计 3,248 万元，逾期率 11.2%，其中逾期 60 天以上 1,860 万元，主要集中在欧洲经销商。',
    '前五大客户集中度 48.2%，已越过 45% 绿色阈值，单一客户延期会放大整体回款风险。',
    '欧元兑人民币 8.3145、日内 +1.18%，汇率对回款有利，但客户付款节奏未见改善。',
  ],
  evidence: [
    {
      id: 'EV-Q3-1',
      sourceSystem: 'ERP · 应收账龄',
      metric: '应收余额',
      value: '29,000 万元',
      baseline: '上周 28,120 万元',
      asOf: '2026-09-15 07:00',
      nature: 'demo',
      definition: '口径：未税应收余额，含未到期与逾期账款，按期末汇率折算为人民币。',
    },
    {
      id: 'EV-Q3-2',
      sourceSystem: 'ERP · 应收账龄',
      metric: '应收逾期率',
      value: '11.2%',
      baseline: '绿色阈值 8% / 关注 10%',
      asOf: '2026-09-15 07:00',
      nature: 'demo',
      definition: '口径：逾期账款金额 ÷ 应收余额。',
    },
    {
      id: 'EV-Q3-3',
      sourceSystem: 'ERP · 应收账龄',
      metric: '逾期账款金额',
      value: '3,248 万元',
      baseline: '其中逾期 60 天以上 1,860 万元',
      asOf: '2026-09-15 07:00',
      nature: 'demo',
      definition: '口径：按合同约定付款日与实际收款日比对统计，不含已确认坏账。',
    },
    {
      id: 'EV-Q3-4',
      sourceSystem: 'BI · 营运资本月报',
      metric: '应收周转天数 DSO',
      value: '104 天',
      baseline: '绿色阈值 96 天',
      asOf: '2026-09-15 06:50',
      nature: 'demo',
      definition: '口径：平均应收余额 ÷ 期间日均营业收入。',
    },
    {
      id: 'EV-Q3-5',
      sourceSystem: 'CRM · 客户档案',
      metric: '前五大客户收入集中度',
      value: '48.2%',
      baseline: '绿色阈值 45%',
      asOf: '2026-09-15 07:20',
      nature: 'demo',
      definition: '口径：前五大客户近 12 个月收入 ÷ 全部收入。',
    },
    {
      id: 'EV-Q3-6',
      sourceSystem: 'CRM · 客户回款记录',
      metric: '重点客户回款状态',
      value: '2 家欧洲经销商近 45 天无到账',
      baseline: '合同账期 90 天',
      asOf: '2026-09-15 07:20',
      nature: 'demo',
      definition: '口径：按银行到账流水与客户合同账期逐笔匹配。',
    },
  ],
  impacts: [
    {
      text: '逾期账款每拖 30 天，约多占用营运资金 270 万元。',
      metric: 'DSO',
      delta: '+30 天',
    },
    {
      text: '现金转换周期同步拉长，进一步挤压采购与备货现金。',
      metric: 'CCC',
      delta: '+30 天',
    },
    {
      text: '回款后移直接抬高短期现金缺口。',
      metric: '60 天现金缺口',
      delta: '+1,160 万元',
    },
    {
      text: '逾期率越过红色区间将影响银行授信评级与信用保险费率。',
      metric: '应收逾期率',
      delta: '+3.8 个百分点',
    },
  ],
  actions: [
    {
      id: 'ACT-Q3-1',
      text: '对逾期 60 天以上的 1,860 万元启动一对一催收，要求本周内提交付款计划。',
      actionType: 'reduce',
      priority: 'P0',
      owner: '王琳（欧洲应收）',
      dueDate: '2026-09-19',
      route: '/receivables',
    },
    {
      id: 'ACT-Q3-2',
      text: '对逾期客户暂停新订单发货，控制风险敞口继续扩大。',
      actionType: 'pause',
      priority: 'P0',
      owner: '王琳（欧洲应收）',
      dueDate: '2026-09-18',
      route: '/receivables',
    },
    {
      id: 'ACT-Q3-3',
      text: '为 2 家资金紧张的欧洲经销商提供 30 天账期展期，换取银行保函或信用保险覆盖。',
      actionType: 'delay',
      priority: 'P1',
      owner: '孙浩（信用管理）',
      dueDate: '2026-09-26',
      route: '/receivables',
    },
    {
      id: 'ACT-Q3-4',
      text: '对欧元应收账款加做 3,000 万元远期结汇，锁定 8.3145 附近汇率。',
      actionType: 'transfer',
      priority: 'P1',
      owner: '赵敏（资金管理）',
      dueDate: '2026-09-23',
      route: '/cash-fx',
    },
    {
      id: 'ACT-Q3-5',
      text: '将前五大客户集中度与应收周转天数纳入月度信用例会跟踪。',
      actionType: 'continue',
      priority: 'P2',
      owner: '孙浩（信用管理）',
      dueDate: '2026-09-30',
      route: '/settings',
    },
  ],
  thinkingSteps: [
    {
      step: '第 1 步 · 拉取应收账龄',
      detail: '应收余额 29,000 万元，逾期 3,248 万元，逾期率 11.2%，逾期 60 天以上 1,860 万元。',
      source: 'D8 应收账龄',
    },
    {
      step: '第 2 步 · 匹配客户回款记录',
      detail: '2 家欧洲经销商近 45 天无到账记录，合同账期 90 天，已进入逾期区间。',
      source: 'D9 客户回款记录',
    },
    {
      step: '第 3 步 · 核对授信与客户集中度',
      detail: '3 家客户授信额度使用率超过 80%，前五大客户收入集中度 48.2%。',
      source: 'D10 授信额度 / D4 销售订单',
    },
    {
      step: '第 4 步 · 叠加汇率与外部需求信号',
      detail: '欧元兑人民币 8.3145、日内 +1.18%，行业需求景气指数未见回升，回款改善动能不足。',
      source: 'E1 汇率行情 / E7 行业需求景气',
    },
    {
      step: '第 5 步 · 生成催收优先级排序',
      detail: '按逾期金额与逾期天数排序，输出催收、停发、展期与锁汇四类建议。',
      source: 'D9 客户回款记录 / D10 授信额度',
    },
  ],
  relatedLinks: [
    { label: '应收管理', route: '/receivables' },
    { label: '现金流与外汇', route: '/cash-fx' },
    { label: '风险预警', route: '/alerts' },
  ],
};

/* ------------------------------------------------------------------ */
/* Q4 海运延迟 30 天情景                                               */
/* ------------------------------------------------------------------ */

const ANSWER_Q4: AssistantAnswer = {
  questionId: 'Q4',
  conclusion: '海运延迟 30 天，60 天缺口升至 2,340 万元，等级升 L4。',
  reasons: [
    '上海 → 鹿特丹航线运价 4,260 USD/FEU、较上月 +9.2%，在途时效由 32 天延长到 38 天。',
    '在途库存到货整体后移，海外仓可售库存下降、库存被动积压，库存周转天数由 92 天升至 110 天。',
    '库存变现与客户回款同步延后，现金转换周期由 108 天拉长到 126 天。',
    '60 天与 90 天现金缺口各扩大 1,160 万元，风险等级由 L3 升至 L4。',
  ],
  evidence: [
    {
      id: 'EV-Q4-1',
      sourceSystem: 'Radar · 航线运价',
      metric: '上海 → 鹿特丹运价',
      value: '4,260 USD/FEU',
      baseline: '上月 3,900 USD/FEU（+9.2%）',
      asOf: '2026-09-15 07:30',
      nature: 'demo',
      definition: '口径：40 尺高柜即期报价，含燃油与旺季附加费，为 Demo 模拟行情。',
    },
    {
      id: 'EV-Q4-2',
      sourceSystem: 'Radar · 航线时效',
      metric: '上海 → 鹿特丹在途时效',
      value: '38 天',
      baseline: '基准 32 天（+6 天）',
      asOf: '2026-09-15 07:30',
      nature: 'demo',
      definition: '口径：订舱确认日到目的港靠泊的中位在途天数。',
    },
    {
      id: 'EV-Q4-3',
      sourceSystem: 'Radar · 运价指数',
      metric: '全球集装箱运价综合指数',
      value: '3,128 点',
      baseline: '上周 2,940 点（周环比 +6.4%）',
      asOf: '2026-09-15 07:30',
      nature: 'demo',
      definition: '口径：综合全球主干航线运价的加权指数，为 Demo 模拟口径。',
    },
    {
      id: 'EV-Q4-4',
      sourceSystem: 'WMS · 在途库存',
      metric: '德国仓在途电池包',
      value: '380 台 / 约 877 万元',
      baseline: '原计划 10 月中旬到仓',
      asOf: '2026-09-15 07:00',
      nature: 'demo',
      definition: '口径：已订舱未到仓库存，按最近采购成本计价。',
    },
    {
      id: 'EV-Q4-5',
      sourceSystem: 'ERP · 库龄明细',
      metric: '库存周转天数 DIO',
      value: '92 天 → 110 天',
      baseline: '绿色阈值 75 天',
      asOf: '2026-09-15 07:05',
      nature: 'demo',
      definition: '口径：情景外推按到货整体后移 30 天重算库存与销售成本节奏。',
    },
    {
      id: 'EV-Q4-6',
      sourceSystem: '资金系统 · 现金流预测',
      metric: '60 天现金缺口',
      value: '1,180 万元 → 2,340 万元',
      baseline: '安全线 6,000 万元',
      asOf: '2026-09-15 07:30',
      nature: 'demo',
      definition: '口径：在基准预测上叠加货物到港与回款同步延迟 30 天的情景假设。',
    },
  ],
  impacts: [
    {
      text: '短期现金缓冲被进一步吃掉，进入红色预警区间。',
      metric: '60 天现金缺口',
      delta: '+1,160 万元',
    },
    {
      text: '中长期缺口同步扩大，融资安排需提前。',
      metric: '90 天现金缺口',
      delta: '+1,160 万元',
    },
    {
      text: '在途与海外仓库存双高，占用资金显著上升。',
      metric: '库存货值',
      delta: '+1,420 万元',
    },
    {
      text: '现金转换效率恶化，营运资金缺口随之扩大。',
      metric: 'CCC',
      delta: '+18 天',
    },
  ],
  actions: [
    {
      id: 'ACT-Q4-1',
      text: '对欧洲航线在途订单改走宁波 → 鹿特丹备选航线，压缩 4–6 天在途时效。',
      actionType: 'transfer',
      priority: 'P0',
      owner: '陈曦（国际物流）',
      dueDate: '2026-09-22',
      route: '/scenario',
    },
    {
      id: 'ACT-Q4-2',
      text: '把 10 月欧洲补货订单延后 3 周下单，避免与延迟到货叠加造成积压。',
      actionType: 'delay',
      priority: 'P0',
      owner: '陈志远（供应链计划）',
      dueDate: '2026-09-26',
      route: '/inventory',
    },
    {
      id: 'ACT-Q4-3',
      text: '抢在延迟到货前完成德国仓 428 台超期电池包清库，释放库容与现金 900 万元。',
      actionType: 'pause',
      priority: 'P1',
      owner: '李崇（海外仓运营）',
      dueDate: '2026-09-30',
      releaseAmount: 900,
      route: '/inventory',
    },
    {
      id: 'ACT-Q4-4',
      text: '把 1,160 万元的缺口增量纳入 60 天资金计划，提前锁定备用授信额度。',
      actionType: 'continue',
      priority: 'P0',
      owner: '赵敏（资金管理）',
      dueDate: '2026-09-19',
      route: '/cash-fx',
    },
    {
      id: 'ACT-Q4-5',
      text: '评估已订舱未发运的 380 台库存退关或转口至中东仓的可行性。',
      actionType: 'reduce',
      priority: 'P2',
      owner: '陈曦（国际物流）',
      dueDate: '2026-10-06',
      route: '/radar',
    },
  ],
  thinkingSteps: [
    {
      step: '第 1 步 · 拉取外部运价与航线时效',
      detail: '全球集装箱运价综合指数 3,128 点、周环比 +6.4%；欧线在途时效较基准延长 6 天。',
      source: 'E2 海运运价指数 / E3 航线时效',
    },
    {
      step: '第 2 步 · 匹配在途与海外仓库存',
      detail: '在途库存显示德国仓在途电池包 380 台、约 877 万元，原计划 10 月中旬到仓。',
      source: 'D3 在途库存',
    },
    {
      step: '第 3 步 · 情景外推库存与周转',
      detail: '按到货整体后移 30 天重算，库存周转天数 92 → 110 天，库存货值 32,910 → 34,330 万元。',
      source: 'D1 库存快照 / D2 库龄明细',
    },
    {
      step: '第 4 步 · 外推现金缺口与风险等级',
      detail: '60 天缺口 1,180 → 2,340 万元，90 天缺口 2,360 → 3,520 万元，风险等级 L3 → L4。',
      source: 'D11 资金头寸 / D13 债务与融资',
    },
    {
      step: '第 5 步 · 生成应对动作',
      detail: '输出改航线、延后下单、提前清库与备用额度四类动作，并标注责任人与时限。',
      source: 'D7 供应商交期 / E5 港口拥堵',
    },
  ],
  relatedLinks: [
    { label: '情景推演', route: '/scenario' },
    { label: '风险雷达', route: '/radar' },
    { label: '库存健康度', route: '/inventory' },
  ],
};

/* ------------------------------------------------------------------ */
/* Q5 CFO 晨会摘要                                                     */
/* ------------------------------------------------------------------ */

const ANSWER_Q5: AssistantAnswer = {
  questionId: 'Q5',
  conclusion: '现金安全度 68 分，60 天缺口 1,180 万元，响应率 84%。',
  reasons: [
    '现金余额 8,420 万元，60 天窗口最低余额 4,820 万元，缺口 1,180 万元，已低于 6,000 万元安全线。',
    '三大主因：德国法兰克福仓库存积压（影响 2,860 万元）、欧洲经销商回款延期（1,860 万元）、60 天现金缺口（1,180 万元）。',
    '外部信号同步恶化：欧元兑人民币 8.3145、周内 +1.18%；WCI 运价指数 3,128 点、周环比 +6.4%；美国关税调整影响货值 1,980 万元。',
    '48 小时预警响应率 84%，低于 90% 目标，4 条 L4 预警仍在处理中，需在晨会明确责任人与时限。',
  ],
  evidence: [
    {
      id: 'EV-Q5-1',
      sourceSystem: 'BI · 现金安全度模型',
      metric: '现金安全度 M1',
      value: '68 分',
      baseline: '目标 70 分 / 红色阈值 60 分',
      asOf: '2026-09-15 07:30',
      nature: 'demo',
      definition: '口径：现金余额、滚动缺口、回款进度与可用融资额度加权评分（0–100 分）。',
    },
    {
      id: 'EV-Q5-2',
      sourceSystem: '资金系统 · 现金流预测',
      metric: '60 天现金缺口',
      value: '1,180 万元',
      baseline: '30 天缺口 0 / 90 天缺口 2,360 万元',
      asOf: '2026-09-15 07:30',
      nature: 'demo',
      definition: '口径：滚动预测最低余额与 6,000 万元安全线的差额，无缺口记为 0。',
    },
    {
      id: 'EV-Q5-3',
      sourceSystem: 'ERP · 应收账龄',
      metric: '应收周转天数 DSO',
      value: '104 天',
      baseline: '绿色阈值 96 天 / 逾期率 11.2%',
      asOf: '2026-09-15 07:00',
      nature: 'demo',
      definition: '口径：平均应收余额 ÷ 期间日均营业收入。',
    },
    {
      id: 'EV-Q5-4',
      sourceSystem: '预警中心 · 响应台账',
      metric: '48 小时预警响应率',
      value: '84%',
      baseline: '目标 90% / L3 阈值 85%',
      asOf: '2026-09-15 07:40',
      nature: 'demo',
      definition: '口径：48 小时内流转至处理中或已解决的预警条数 ÷ 同期新增预警总数。',
    },
    {
      id: 'EV-Q5-5',
      sourceSystem: 'Radar · 汇率与运价',
      metric: '欧元兑人民币 / WCI 指数',
      value: '8.3145 / 3,128 点',
      baseline: '周内 +1.18% / 周环比 +6.4%',
      asOf: '2026-09-15 07:30',
      nature: 'demo',
      definition: '口径：汇率取当日中间价，运价取周度综合指数，均为 Demo 模拟数据。',
    },
    {
      id: 'EV-Q5-6',
      sourceSystem: 'Radar · 政策风险',
      metric: '美国储能产品关税调整影响货值',
      value: '1,980 万元',
      baseline: '现有关税税率 25%',
      asOf: '2026-09-15 07:30',
      nature: 'demo',
      definition: '口径：按受影响出口货值乘以税率变动幅度估算，窗口 2026Q4。',
    },
  ],
  impacts: [
    {
      text: '今日需在晨会明确三大风险的责任人与完成时限。',
      metric: '风险处置时效',
      delta: '3 项 P0 待分解',
    },
    {
      text: '预警响应率未达目标，可能延误高风险事项的上报与处置。',
      metric: '预警响应率 M12',
      delta: '−6 个百分点',
    },
    {
      text: '库存与回款双线承压，60 天窗口缓冲仅剩 4,820 万元。',
      metric: '60 天最低现金余额',
      delta: '−3,600 万元',
    },
    {
      text: '汇率与运价上行将同步抬高出海成本与库存占用。',
      metric: '外币净敞口',
      delta: '14,200 万元',
    },
  ],
  actions: [
    {
      id: 'ACT-Q5-1',
      text: '晨会确认德国仓超期电池包清库责任人与 9 月 30 日时限，目标释放现金 900 万元。',
      actionType: 'pause',
      priority: 'P0',
      owner: '李崇（海外仓运营）',
      dueDate: '2026-09-30',
      releaseAmount: 900,
      route: '/inventory',
    },
    {
      id: 'ACT-Q5-2',
      text: '本周启动欧洲前五大客户集中催收，逾期 3,248 万元逐户落实付款计划。',
      actionType: 'reduce',
      priority: 'P0',
      owner: '王琳（欧洲应收）',
      dueDate: '2026-09-19',
      route: '/receivables',
    },
    {
      id: 'ACT-Q5-3',
      text: '把 60 天缺口的 1,180 万元纳入资金计划，9 月 22 日前完成 2,100 万元流贷展期谈判。',
      actionType: 'delay',
      priority: 'P0',
      owner: '赵敏（资金管理）',
      dueDate: '2026-09-22',
      route: '/cash-fx',
    },
    {
      id: 'ACT-Q5-4',
      text: '对 4 条处理中的 L4 预警补齐责任人，48 小时响应率本周内回到 90% 以上。',
      actionType: 'continue',
      priority: 'P1',
      owner: '周宁（CFO 办公室）',
      dueDate: '2026-09-18',
      route: '/alerts',
    },
    {
      id: 'ACT-Q5-5',
      text: '把晨会摘要生成动作固化为每日 08:30 自动推送，覆盖现金、库存与应收三维度。',
      actionType: 'continue',
      priority: 'P2',
      owner: '周宁（CFO 办公室）',
      dueDate: '2026-09-25',
      route: '/assistant',
    },
  ],
  thinkingSteps: [
    {
      step: '第 1 步 · 汇总当日核心指标',
      detail: '拉取 M1 现金安全度 68 分、M2 30 天缺口 0、M6 应收周转天数 104 天、M12 预警响应率 84%。',
      source: 'D11 资金头寸 / D8 应收账龄',
    },
    {
      step: '第 2 步 · 归集三大风险与金额',
      detail: '德国仓库存积压 2,860 万元、欧洲回款延期 1,860 万元、60 天现金缺口 1,180 万元。',
      source: 'D1 库存快照 / D9 客户回款记录',
    },
    {
      step: '第 3 步 · 叠加外部信号',
      detail: '欧元兑人民币 8.3145、周内 +1.18%；WCI 运价指数 3,128 点、周环比 +6.4%；美国关税影响货值 1,980 万元。',
      source: 'E1 汇率行情 / E2 海运运价指数 / E4 关税与贸易政策',
    },
    {
      step: '第 4 步 · 核对预警处置时效',
      detail: '预警中心 48 小时响应率 84%，低于 90% 目标，4 条 L4 预警仍在处理中。',
      source: 'D12 银行流水 / D10 授信额度',
    },
    {
      step: '第 5 步 · 生成晨会摘要与行动清单',
      detail: '按可释放现金与紧急程度排序，输出 5 条今日行动并指派责任人。',
      source: 'D13 债务与融资 / D14 产品成本',
    },
  ],
  relatedLinks: [
    { label: '驾驶舱', route: '/dashboard' },
    { label: '风险预警', route: '/alerts' },
    { label: 'AI 助手', route: '/assistant' },
  ],
};

/* ------------------------------------------------------------------ */
/* 导出：问答索引（key 为问题 id）                                     */
/* ------------------------------------------------------------------ */

export const ASSISTANT_ANSWERS: Record<string, AssistantAnswer> = {
  Q1: ANSWER_Q1,
  Q2: ANSWER_Q2,
  Q3: ANSWER_Q3,
  Q4: ANSWER_Q4,
  Q5: ANSWER_Q5,
};

/* ------------------------------------------------------------------ */
/* 会话欢迎语与追问建议                                                */
/* ------------------------------------------------------------------ */

export const ASSISTANT_WELCOME: AssistantMessage = {
  id: 'MSG-000',
  role: 'agent',
  createdAt: DEMO_AS_OF_TIME,
  text:
    '你好，我是 WorkCap Sentinel 现金哨兵助手。我已连接资金系统、WMS、ERP 与外部行情四类数据，' +
    '可以回答现金流、库存、应收、情景推演与晨会摘要五类问题，并给出证据链与行动建议。' +
    '当前为 Demo 演示模式，所有数值均为示例数据，不代表沃太能源真实经营数据。',
};

export const ASSISTANT_SUGGESTED_FOLLOWUPS: readonly string[] = [
  '哪些库存的库龄已经超过 90 天？',
  '如果欧元升值 3%，对现金和外汇敞口有什么影响？',
  '美国关税上调 25% 会影响多少出口货值？',
  '请把 90 天现金缺口的应对动作按优先级排序。',
];
