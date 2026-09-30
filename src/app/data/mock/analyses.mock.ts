/**
 * 五段式 AI 分析文案库（Demo 示例数据）。
 *
 * 【Demo 示例数据】本文件中的全部文案、金额、台数与日期均为按业务逻辑构造的示例数据，
 * 仅用于演示「WorkCap Sentinel 现金哨兵」的五段式风险分析能力与交互流程，
 * 不代表沃太能源（AlphaESS）任何时点的真实经营数据，也不构成任何经营或投资建议。
 *
 * 五段式结构（原 PRD 强制格式）：
 *   ① 发生了什么  ② 为什么发生  ③ 可能造成什么影响  ④ 现在应该做什么  ⑤ 证据与数据来源
 *
 * 约定：金额单位统一为「万元」（另有明确标注的除外）；每条分析的证据完整率恒为 100%
 * （integrity.traceable === integrity.total）。
 */

import type { EvidenceCard, FivePartAnalysis, SuggestedAction, WhyItem } from '../../core/models';
import { addDays, clamp, round, wan } from './_random';

/** SKU 级五段式分析的输入口径（库存页、预警中心、风险雷达共用） */
export interface SkuAnalysisInput {
  readonly sku: string;
  readonly name: string;
  readonly warehouseName: string;
  readonly country: string;
  /** 在库台数 */
  readonly qty: number;
  /** 在途台数 */
  readonly inTransitQty: number;
  /** 库存货值（万元） */
  readonly value: number;
  /** 加权平均库龄（天） */
  readonly agingDays: number;
  /** 订单覆盖月数 */
  readonly orderCoverageMonths: number;
  /** 超期库存占比 0–1 */
  readonly overstockRatio: number;
  /** 预计跌价准备（万元） */
  readonly impairmentRisk: number;
  /** 季度仓储成本（万元） */
  readonly holdingCostQuarter: number;
  /** 现金占用（万元） */
  readonly cashOccupied: number;
  /** 对 CCC 的边际影响（天） */
  readonly cccImpactDays: number;
  readonly owner: string;
  readonly dueDate: string;
}

/** 客户级五段式分析的输入口径（应收页、催收队列共用） */
export interface CustomerAnalysisInput {
  readonly name: string;
  readonly country: string;
  /** 应收余额（万元） */
  readonly receivable: number;
  /** 最长逾期天数 */
  readonly overdueDays: number;
  /** 加权平均账龄（天） */
  readonly agingDays: number;
  readonly creditRating: string;
  /** 预计可回款金额（万元） */
  readonly expectedCollection: number;
  readonly owner: string;
  readonly dueDate: string;
}

/* ------------------------------------------------------------------ */
/* ① 德国海外仓库存积压（主案例）                                       */
/* ------------------------------------------------------------------ */

export const INVENTORY_AGING_ANALYSIS: FivePartAnalysis = {
  whatHappened:
    '德国法兰克福海外仓 5kWh 家用储能电池包（ESS-BAT-05K-DE）库存积压持续恶化：库龄超 90 天库存由 328 台升至 428 台，在库合计 1,240 台、货值 2,860 万元，加权平均库龄由 74 天上升至 90 天。该 SKU 订单覆盖仅 1.2 个月，远低于 2.5–3.5 个月的健康区间，超期库存占比已达 41%；海外仓仍有 380 台在途批次将在未来 4–6 周陆续到货，其中已预付货款 648 万元。',
  why: [
    {
      text: '海外仓基于欧洲旺季销售预期提前备货，法兰克福仓该 SKU 按乐观需求曲线下达采购，到货节奏快于实际动销',
      likelihood: 'high',
    },
    {
      text: '欧洲户用储能需求增速低于备货假设，德国市场新增装机增速回落，经销商提货周期由 45 天拉长至 75 天',
      likelihood: 'high',
    },
    {
      text: '新型号 5kWh 二代上市后老型号动销下降，经销商将陈列与推荐顺位转向新型号',
      likelihood: 'medium',
    },
    {
      text: '在途 380 台的到货计划未随库存水位变化同步调整，采购与海外仓之间缺少滚动复核机制',
      likelihood: 'medium',
    },
  ],
  impact: [
    {
      text: '该批库存全额占用营运资金，在去化完成前无法通过销售回笼',
      metric: '现金占用',
      delta: '+900 万元',
    },
    {
      text: '老型号面临新型号替代，按可变现净值测算需计提跌价准备',
      metric: '预计跌价准备',
      delta: '860 万元',
    },
    {
      text: '海外仓持续承担堆存、操作与保险成本，去化周期越长成本越高',
      metric: '季度仓储成本',
      delta: '+45 万元',
    },
    {
      text: '库存周转天数上升，现金转换周期被进一步拉长',
      metric: 'CCC 边际影响',
      delta: '+6 天',
    },
  ],
  actions: [
    {
      id: 'ACT-INV-01',
      text: '暂停 ESS-BAT-05K-DE 新增采购申请，直至该 SKU 订单覆盖回升至 2.5 个月以上',
      actionType: 'pause',
      priority: 'P0',
      owner: '李崇（海外仓运营）',
      dueDate: '2026-09-22',
      releaseAmount: 1180,
      route: '/inventory',
    },
    {
      id: 'ACT-INV-02',
      text: '与供应商协商将 380 台在途批次分批延后 30–45 天入库，优先延后尚未发运的批次',
      actionType: 'delay',
      priority: 'P1',
      owner: '周敏（采购计划）',
      dueDate: '2026-09-26',
      releaseAmount: 420,
      route: '/inventory',
    },
    {
      id: 'ACT-INV-03',
      text: '优先消化法兰克福仓库存：对德国、荷兰重点经销商推出 5kWh 组合促销，目标 30 天内去化 300 台',
      actionType: 'reduce',
      priority: 'P1',
      owner: '李崇（海外仓运营）',
      dueDate: '2026-10-10',
      route: '/inventory',
    },
    {
      id: 'ACT-INV-04',
      text: '评估向鹿特丹仓、米兰仓跨区调拨 150–200 台，优先满足订单覆盖低于 1.5 个月的区域市场',
      actionType: 'transfer',
      priority: 'P2',
      owner: '李崇（海外仓运营）',
      dueDate: '2026-10-15',
      route: '/inventory',
    },
    {
      id: 'ACT-INV-05',
      text: '将本次库存水位、采购冻结与调拨结论纳入下周 S&OP 会议，同步修订 Q4 滚动备货计划',
      actionType: 'continue',
      priority: 'P2',
      owner: '赵鹏（供应链计划）',
      dueDate: '2026-09-25',
      route: '/scenario',
    },
  ],
  evidence: [
    {
      id: 'EV-INV-01',
      sourceSystem: 'WMS · 库龄快照',
      metric: '加权平均库龄',
      value: '90 天',
      baseline: '上期 74 天',
      asOf: '2026-09-15 07:30',
      nature: 'demo',
      definition: '按库存金额加权的在库天数，含在途已入库部分',
    },
    {
      id: 'EV-INV-02',
      sourceSystem: 'ERP · 库存价值表',
      metric: '库存货值',
      value: '2,860 万元',
      baseline: '目标 2,000 万元',
      asOf: '2026-09-15 07:35',
      nature: 'demo',
      definition: '法兰克福海外仓该 SKU 在库存货值，按移动加权平均单位成本计价，不含在途与关税',
    },
    {
      id: 'EV-INV-03',
      sourceSystem: 'ERP · 销售订单',
      metric: '订单覆盖月数',
      value: '1.2 个月',
      baseline: '健康区间 2.5–3.5 个月',
      asOf: '2026-09-15 07:40',
      nature: 'demo',
      definition: '在库库存台数 ÷ 未来 3 个月滚动月均预测出货台数，剔除已锁定订单以外的预测部分',
    },
    {
      id: 'EV-INV-04',
      sourceSystem: 'TMS · 在途跟踪',
      metric: '在途台数',
      value: '380 台',
      baseline: '上月同期 260 台',
      asOf: '2026-09-15 07:45',
      nature: 'demo',
      definition: '已发运未入库的批次台数合计，含海运在途与到港待清关部分',
    },
    {
      id: 'EV-INV-05',
      sourceSystem: 'ERP · 采购订单',
      metric: '已预付货款',
      value: '648 万元',
      baseline: '未到货占比 100%',
      asOf: '2026-09-15 07:50',
      nature: 'demo',
      definition: '在途批次对应的已支付预付款合计，按采购订单付款条件（预付 30%、发货前付清）汇总',
    },
    {
      id: 'EV-INV-06',
      sourceSystem: '资金系统 · 现金流预测',
      metric: 'CCC 边际影响',
      value: '+6 天',
      baseline: '集团 CCC 108 天',
      asOf: '2026-09-15 08:00',
      nature: 'demo',
      definition: '该 SKU 库存占用的增量天数，按库存货值 ÷ 集团日均销售成本测算并四舍五入到天',
    },
  ],
  integrity: { traceable: 6, total: 6 },
};

/** 库存积压风险摘要（风险卡片用，≤30 字） */
export const INVENTORY_AGING_SUMMARY = '法兰克福仓电池包 428 台超期，占用现金 900 万元';

/* ------------------------------------------------------------------ */
/* ② 美国关税 / 贸易政策风险                                          */
/* ------------------------------------------------------------------ */

export const POLICY_TARIFF_ANALYSIS: FivePartAnalysis = {
  whatHappened:
    '美国贸易代表办公室将储能锂电池及配套逆变器纳入加征关税清单，进口关税自 2026-10-01 起由 7.5% 上调至 25%。公司对美在手订单、在途批次与美国仓在库货值合计 1,980 万元直接受影响，其中已报关未清关 620 万元、在途 780 万元、美国仓在库 580 万元；按现行到岸报价测算，新增关税将侵蚀毛利约 286 万元，并额外产生约 320 万元的关税预付现金占用。',
  why: [
    {
      text: '美国关税清单调整属外部政策变化，储能电池与逆变器被同时纳入加征范围，无过渡豁免期',
      likelihood: 'high',
    },
    {
      text: '在手订单采用固定到岸价报价，未约定关税成本分担条款，关税上调成本主要由公司承担',
      likelihood: 'high',
    },
    {
      text: '部分批次未能在政策生效前完成抢运与报关，距 10 月 1 日生效仅剩两周窗口',
      likelihood: 'medium',
    },
    {
      text: '美国渠道以价格敏感型分销为主，终端提价空间有限，关税难以全额向下游转嫁',
      likelihood: 'medium',
    },
  ],
  impact: [
    {
      text: '对美在手订单、在途批次与在库库存的货值敞口',
      metric: '受影响货值',
      delta: '1,980 万元',
    },
    {
      text: '按完税价格测算，新增关税直接侵蚀对美业务毛利',
      metric: '毛利侵蚀',
      delta: '-286 万元',
    },
    {
      text: '先征后返的关税预付将占用营运资金，影响 Q4 现金余额',
      metric: '关税预付现金占用',
      delta: '+320 万元',
    },
    {
      text: '在途批次若无法在下单窗口内清关，将延迟交付并触发渠道补货缺口',
      metric: '交付延期',
      delta: '3 个批次 / 780 万元',
    },
  ],
  actions: [
    {
      id: 'ACT-POL-01',
      text: '暂停对美新增报价与接单，直至完成关税成本重算与新版价格表审批',
      actionType: 'pause',
      priority: 'P0',
      owner: '林嘉（国际业务合规）',
      dueDate: '2026-09-18',
      releaseAmount: 320,
      route: '/inventory',
    },
    {
      id: 'ACT-POL-02',
      text: '延后 3 个非紧俏批次的发运与清关，避开政策生效首周的高税率与清关拥堵',
      actionType: 'delay',
      priority: 'P1',
      owner: '张玥（北美销售）',
      dueDate: '2026-09-24',
      route: '/scenario',
    },
    {
      id: 'ACT-POL-03',
      text: '与 Top 5 美国客户协商关税分担与价格调整条款，目标客户分担比例不低于 60%',
      actionType: 'reduce',
      priority: 'P1',
      owner: '张玥（北美销售）',
      dueDate: '2026-10-02',
      route: '/receivables',
    },
    {
      id: 'ACT-POL-04',
      text: '评估经加拿大、墨西哥中转及向欧洲、澳洲市场转移的分流方案，测算落地成本差异',
      actionType: 'transfer',
      priority: 'P2',
      owner: '林嘉（国际业务合规）',
      dueDate: '2026-10-16',
      route: '/scenario',
    },
    {
      id: 'ACT-POL-05',
      text: '将关税影响纳入政策风险周报与 Q4 现金流重预测，按周滚动更新受敞口金额',
      actionType: 'continue',
      priority: 'P2',
      owner: '陈曦（北美应收）',
      dueDate: '2026-10-20',
      route: '/cash-fx',
    },
  ],
  evidence: [
    {
      id: 'EV-POL-01',
      sourceSystem: '海关政策 · USTR 公告',
      metric: '储能电池进口关税',
      value: '25%',
      baseline: '政策生效前 7.5%',
      asOf: '2026-09-12 21:00',
      nature: 'demo',
      definition: '加征清单适用于储能锂电池及配套逆变器，2026-10-01 00:00（美东时间）起执行，无过渡期',
    },
    {
      id: 'EV-POL-02',
      sourceSystem: 'ERP · 销售订单',
      metric: '对美在手订单货值',
      value: '1,980 万元',
      baseline: '其中在途 780 万元',
      asOf: '2026-09-15 08:05',
      nature: 'demo',
      definition: '口径含已报关未清关 620 万元、海运在途 780 万元、美国仓在库 580 万元，按订单确认汇率折算',
    },
    {
      id: 'EV-POL-03',
      sourceSystem: 'ERP · 成本测算',
      metric: '新增关税金额',
      value: '286 万元',
      baseline: '完税价格按货值 82% 估算',
      asOf: '2026-09-15 08:10',
      nature: 'demo',
      definition: '（25% − 7.5%）× 受影响完税价格，不含反倾销与 301 附加项，汇率与运费按当期锁定值',
    },
    {
      id: 'EV-POL-04',
      sourceSystem: 'TMS · 在途跟踪',
      metric: '受影响在途批次',
      value: '3 个批次',
      baseline: '合计货值 780 万元',
      asOf: '2026-09-15 08:15',
      nature: 'demo',
      definition: '预计到港时间落在 2026-10-01 之后的在途批次，按提单与预计到港日归集',
    },
    {
      id: 'EV-POL-05',
      sourceSystem: '合同管理 · 客户条款',
      metric: '含关税分担条款的合同占比',
      value: '0%',
      baseline: '目标 ≥ 60%',
      asOf: '2026-09-15 08:20',
      nature: 'demo',
      definition: '对美有效销售合同中约定关税、税费由买方承担或双方分担的条款占比，按合同金额加权',
    },
    {
      id: 'EV-POL-06',
      sourceSystem: '资金系统 · 现金流预测',
      metric: '关税预付现金占用',
      value: '+320 万元',
      baseline: 'Q4 末现金余额目标 8,420 万元',
      asOf: '2026-09-15 08:25',
      nature: 'demo',
      definition: '按先征后返节奏估算的月度平均垫付资金，含清关代理保证金，按 45 天占压周期滚动',
    },
  ],
  integrity: { traceable: 6, total: 6 },
};

/** 关税政策风险摘要（风险卡片用，≤30 字） */
export const POLICY_TARIFF_SUMMARY = '美国关税升至 25%，影响货值 1,980 万元';

/* ------------------------------------------------------------------ */
/* ③ 重点客户回款延期                                                  */
/* ------------------------------------------------------------------ */

export const RECEIVABLE_DELAY_ANALYSIS: FivePartAnalysis = {
  whatHappened:
    '重点客户 OSW Energy GmbH（德国）应收余额 3,480 万元，占集团应收总额约 12%，其中逾期 68 天金额 1,972 万元、逾期率 57%，加权平均账龄 96 天、已超出合同账期。客户最近一次回款为 2026-06-24，近 3 个月回款金额较去年同期下降约 46%；预计 2026-10-08 前可回收 2,260 万元（占应收余额 65%），仍有 1,220 万元回款缺口需通过催收与授信管理跟进。',
  why: [
    {
      text: '客户终端销售放缓，德国家庭储能安装商提货周期由 45 天拉长至 75 天，渠道库存周转明显下降',
      likelihood: 'high',
    },
    {
      text: '客户将有限资金优先投入新品铺货与安装团队扩张，到期订单的付款顺位后移',
      likelihood: 'medium',
    },
    {
      text: '合同账期 90 天与终端分期回款周期（120 天以上）错配，客户实际以终端回款支付货款',
      likelihood: 'high',
    },
    {
      text: '信用管理未在账龄超过 60 天时启动额度下调与出货冻结，BB 级客户敞口仍在扩大',
      likelihood: 'medium',
    },
  ],
  impact: [
    {
      text: '逾期部分占用营运资金，直接影响 Q4 现金回笼节奏',
      metric: '逾期金额',
      delta: '1,972 万元',
    },
    {
      text: '按 BB 级客户 8% 计提比例测算，需补充计提坏账准备',
      metric: '坏账准备',
      delta: '278 万元',
    },
    {
      text: '应收账款周转天数上升，与集团 DSO 标杆进一步偏离',
      metric: 'DSO 影响',
      delta: '+9 天',
    },
    {
      text: '应收占用叠加法兰克福仓库存占用，现金转换周期被拉长',
      metric: 'CCC 边际影响',
      delta: '+4 天',
    },
  ],
  actions: [
    {
      id: 'ACT-AR-01',
      text: '冻结 OSW Energy GmbH 新增发货与授信使用，直至逾期金额回落至 500 万元以内',
      actionType: 'pause',
      priority: 'P0',
      owner: '王倩（欧洲应收）',
      dueDate: '2026-09-17',
      releaseAmount: 1972,
      route: '/receivables',
    },
    {
      id: 'ACT-AR-02',
      text: '将对德国客户的月度发货量下调 60%，催收期间控制敞口继续扩大',
      actionType: 'reduce',
      priority: 'P0',
      owner: '王倩（欧洲应收）',
      dueDate: '2026-09-22',
      route: '/inventory',
    },
    {
      id: 'ACT-AR-03',
      text: '由欧洲区负责人与客户财务负责人建立专项沟通，要求 5 个工作日内提交书面付款计划并每周跟进',
      actionType: 'continue',
      priority: 'P1',
      owner: '王倩（欧洲应收）',
      dueDate: '2026-09-30',
      route: '/receivables',
    },
    {
      id: 'ACT-AR-04',
      text: '评估以法兰克福仓 5kWh 库存抵扣应收的以货抵债方案，抵账额度不超过 600 万元',
      actionType: 'transfer',
      priority: 'P1',
      owner: '何静（信用管理）',
      dueDate: '2026-10-10',
      route: '/inventory',
    },
    {
      id: 'ACT-AR-05',
      text: '延后该客户 10 月新订单排产，待首笔回款到账后按周释放产能并将授信下调至 3,000 万元',
      actionType: 'delay',
      priority: 'P2',
      owner: '何静（信用管理）',
      dueDate: '2026-10-15',
      route: '/scenario',
    },
  ],
  evidence: [
    {
      id: 'EV-AR-01',
      sourceSystem: '应收回款 · 账龄分析',
      metric: '应收余额',
      value: '3,480 万元',
      baseline: '授信额度 4,200 万元',
      asOf: '2026-09-15 07:20',
      nature: 'demo',
      definition: '按客户归集的已开票未收款余额，含质保金外挂部分，不含预收款与在途未开票订单',
    },
    {
      id: 'EV-AR-02',
      sourceSystem: '应收账龄 · 逾期明细',
      metric: '逾期金额',
      value: '1,972 万元',
      baseline: '逾期率 57%',
      asOf: '2026-09-15 07:22',
      nature: 'demo',
      definition: '超过合同约定到期日仍未收款的发票金额合计，按发票到期日与截止日差额逐笔认定',
    },
    {
      id: 'EV-AR-03',
      sourceSystem: '应收账龄 · 加权口径',
      metric: '加权平均账龄',
      value: '96 天',
      baseline: '合同账期 90 天',
      asOf: '2026-09-15 07:25',
      nature: 'demo',
      definition: '按应收余额加权的发票在外天数，从开票日起算至数据截止日，不含已核销部分',
    },
    {
      id: 'EV-AR-04',
      sourceSystem: '客户回款 · 银行流水',
      metric: '近 3 个月回款',
      value: '640 万元',
      baseline: '去年同期 1,180 万元',
      asOf: '2026-09-15 07:28',
      nature: 'demo',
      definition: '客户名下账户实际到账金额合计，按银行流水对账单归集，剔除退款与冲销分录',
    },
    {
      id: 'EV-AR-05',
      sourceSystem: '信用管理 · 评级模型',
      metric: '客户信用评级',
      value: 'BB',
      baseline: '上季度 A',
      asOf: '2026-09-14 18:00',
      nature: 'demo',
      definition: '按财务实力、回款历史、所在国风险三维度评分的季度评级结果，BB 对应 12 个月展望负面',
    },
    {
      id: 'EV-AR-06',
      sourceSystem: '资金系统 · 现金流预测',
      metric: 'CCC 边际影响',
      value: '+4 天',
      baseline: '集团 CCC 108 天',
      asOf: '2026-09-15 08:00',
      nature: 'demo',
      definition: '逾期金额 ÷ 集团日均销售收入测算的增量周转天数，按当前逾期结构静态估算',
    },
  ],
  integrity: { traceable: 6, total: 6 },
};

/* ------------------------------------------------------------------ */
/* ④ 欧洲海运时效恶化                                                  */
/* ------------------------------------------------------------------ */

export const LOGISTICS_TRANSIT_ANALYSIS: FivePartAnalysis = {
  whatHappened:
    '中国至欧洲海外仓的海运时效持续恶化：受红海绕行与鹿特丹港拥堵叠加影响，平均在途时效由 32 天延长至 46 天、增幅 44%。当前在途 5 个批次、货值 1,120 万元受影响，其中 2 个批次预计延误 12–18 天，将错过德国与荷兰渠道的 10 月补货窗口，并已产生滞港与滞箱费用约 38 万元。',
  why: [
    {
      text: '红海航线绕行好望角成为常态，单航次航程增加约 10 天，欧洲线船期稳定性下降',
      likelihood: 'high',
    },
    {
      text: '鹿特丹港堆场拥堵，船舶靠泊与提箱等待时间由 2 天增至 6 天，后半程提货节奏失控',
      likelihood: 'high',
    },
    {
      text: '旺季集中出运，10 月欧洲线舱位预订率超过 95%，改配舱位与加急方案的可选空间有限',
      likelihood: 'medium',
    },
    {
      text: '海外仓与货代之间未建立到港预报联动机制，延误信息传递滞后 3–5 天，补货决策被动',
      likelihood: 'medium',
    },
  ],
  impact: [
    {
      text: '在途批次货值延后到达，海外仓可用库存低于计划水位',
      metric: '在途货值',
      delta: '1,120 万元',
    },
    {
      text: '滞港、滞箱与堆存费用超出季度预算，直接计入海外仓运营成本',
      metric: '滞港与滞箱费',
      delta: '+38 万元',
    },
    {
      text: '渠道补货窗口被压缩，德国、荷兰经销商出现阶段性缺货风险',
      metric: '补货延迟',
      delta: '12–18 天',
    },
    {
      text: '在途存货占压时间延长，资金周转天数被动增加',
      metric: 'CCC 边际影响',
      delta: '+3 天',
    },
  ],
  actions: [
    {
      id: 'ACT-LOG-01',
      text: '暂停新增非紧急批次的发运计划，避免集中到港造成海外仓堆存与提箱拥堵',
      actionType: 'pause',
      priority: 'P1',
      owner: '周敏（采购计划）',
      dueDate: '2026-09-19',
      route: '/inventory',
    },
    {
      id: 'ACT-LOG-02',
      text: '将 2 个高优先级批次改配直航快船并锁定包舱，确保赶上 10 月渠道补货窗口',
      actionType: 'transfer',
      priority: 'P0',
      owner: '吴桐（国际物流）',
      dueDate: '2026-09-20',
      releaseAmount: 460,
      route: '/scenario',
    },
    {
      id: 'ACT-LOG-03',
      text: '与货代协商延后 3 个低优先级批次起运时间，平滑到港节奏并减少滞箱费用',
      actionType: 'delay',
      priority: 'P1',
      owner: '吴桐（国际物流）',
      dueDate: '2026-09-28',
      route: '/inventory',
    },
    {
      id: 'ACT-LOG-04',
      text: '向德国、荷兰经销商同步更新到货承诺，协商分批交付以降低缺货对渠道的冲击',
      actionType: 'reduce',
      priority: 'P1',
      owner: '张玥（北美销售）',
      dueDate: '2026-10-06',
      route: '/alerts',
    },
    {
      id: 'ACT-LOG-05',
      text: '建立到港预报与延误预警联动机制，将船期偏差纳入周度物流复盘议程',
      actionType: 'continue',
      priority: 'P2',
      owner: '吴桐（国际物流）',
      dueDate: '2026-10-20',
      route: '/radar',
    },
  ],
  evidence: [
    {
      id: 'EV-LOG-01',
      sourceSystem: 'TMS · 在途跟踪',
      metric: '平均在途时效',
      value: '46 天',
      baseline: '原 32 天',
      asOf: '2026-09-15 07:10',
      nature: 'demo',
      definition: '从工厂发货至海外仓完成入库的平均天数，按近 30 天到货批次滚动计算，含清关等待',
    },
    {
      id: 'EV-LOG-02',
      sourceSystem: '货代 · 舱位与运价',
      metric: '欧洲线运价',
      value: '3,180 美元/40HQ',
      baseline: '上月 2,460 美元/40HQ',
      asOf: '2026-09-15 07:15',
      nature: 'demo',
      definition: '上海至鹿特丹即期市场报价，含燃油附加费与旺季附加费，不含两端陆运与清关费用',
    },
    {
      id: 'EV-LOG-03',
      sourceSystem: 'WMS · 到港预报',
      metric: '受影响在途批次',
      value: '5 个批次',
      baseline: '合计货值 1,120 万元',
      asOf: '2026-09-15 07:18',
      nature: 'demo',
      definition: '预计到港时间较原计划延后 7 天以上的在途批次，按提单号归集并关联销售订单',
    },
    {
      id: 'EV-LOG-04',
      sourceSystem: '海外仓 · 堆存结算',
      metric: '滞港与滞箱费',
      value: '38 万元',
      baseline: '季度预算 15 万元',
      asOf: '2026-09-15 07:24',
      nature: 'demo',
      definition: '本季度已结算的滞港费、滞箱费与超期堆存费合计，按货代与码头账单口径归集',
    },
    {
      id: 'EV-LOG-05',
      sourceSystem: 'ERP · 销售订单',
      metric: '10 月渠道补货计划',
      value: '1,450 万元',
      baseline: '当前可保障供货 330 万元',
      asOf: '2026-09-15 07:30',
      nature: 'demo',
      definition: '德国、荷兰渠道已确认的 10 月补货订单金额，可保障部分按在库可发货库存倒算',
    },
    {
      id: 'EV-LOG-06',
      sourceSystem: '资金系统 · 现金流预测',
      metric: 'CCC 边际影响',
      value: '+3 天',
      baseline: '集团 CCC 108 天',
      asOf: '2026-09-15 08:00',
      nature: 'demo',
      definition: '在途货值延后入库折算的周转天数增量，按在途货值 ÷ 集团日均销售成本测算',
    },
  ],
  integrity: { traceable: 6, total: 6 },
};

/* ------------------------------------------------------------------ */
/* ⑤ 欧元汇率波动                                                      */
/* ------------------------------------------------------------------ */

export const FX_VOLATILITY_ANALYSIS: FivePartAnalysis = {
  whatHappened:
    '欧元兑人民币由月初 8.42 下行至 8.31，单月贬值 1.3%，为近 12 个月最大单月跌幅。集团外币净敞口约 1.5 亿元，其中本月新增的 1,460 万元欧元收入敞口尚未完成远期锁汇，按当前汇率测算已产生汇兑损失约 19 万元；若 Q4 欧元继续贬值 2%，全年汇兑损失将扩大至约 48 万元，并对欧元报价业务的毛利率形成约 0.6 个百分点的压力。',
  why: [
    {
      text: '欧洲央行降息节奏快于市场预期，欧元对人民币与美元同步走弱，短期缺乏反弹催化',
      likelihood: 'high',
    },
    {
      text: '集团外币敞口以欧元为主，净敞口约 1.5 亿元中仍有 10% 未做远期锁汇，即期波动直接穿透损益',
      likelihood: 'high',
    },
    {
      text: '锁汇按月度节奏集中执行，月中新增订单与应收在月末前处于裸敞口状态，存在时间差',
      likelihood: 'medium',
    },
    {
      text: '欧洲渠道以欧元计价、成本以人民币计价，汇率波动不经过价格传导即直接冲击毛利',
      likelihood: 'medium',
    },
  ],
  impact: [
    {
      text: '本月新增欧元收入敞口尚未锁汇，直接暴露于即期汇率波动',
      metric: '未锁汇欧元敞口',
      delta: '1,460 万元',
    },
    {
      text: '按 8.42 至 8.31 的贬值幅度测算，本月已确认汇兑损失',
      metric: '已实现汇兑损失',
      delta: '-19 万元',
    },
    {
      text: '若 Q4 欧元再贬值 2%，未锁汇部分将进一步扩大损失',
      metric: '欧元再贬损失',
      delta: '-29 万元',
    },
    {
      text: '欧元报价业务的收入折算减少，毛利率承压但成本端无对冲空间',
      metric: '欧洲业务毛利率',
      delta: '-0.6 个百分点',
    },
  ],
  actions: [
    {
      id: 'ACT-FX-01',
      text: '对本月新增 1,460 万元欧元敞口追加 3 个月远期锁汇，使覆盖比例提升至 95%',
      actionType: 'continue',
      priority: 'P0',
      owner: '沈括（资金管理）',
      dueDate: '2026-09-18',
      releaseAmount: 1460,
      route: '/cash-fx',
    },
    {
      id: 'ACT-FX-02',
      text: '暂停沿用 8.42 的报价汇率假设，新报价统一切换至 8.25 的保守汇率并留出缓冲',
      actionType: 'pause',
      priority: 'P0',
      owner: '张玥（北美销售）',
      dueDate: '2026-09-19',
      route: '/cash-fx',
    },
    {
      id: 'ACT-FX-03',
      text: '与欧洲重点客户协商提高欧元结算中的预付款比例并缩短账期，压降裸敞口规模',
      actionType: 'reduce',
      priority: 'P1',
      owner: '王倩（欧洲应收）',
      dueDate: '2026-09-30',
      route: '/receivables',
    },
    {
      id: 'ACT-FX-04',
      text: '评估将部分欧元敞口调整为美元或人民币结算的合同结构方案，测算对报价竞争力的影响',
      actionType: 'transfer',
      priority: 'P2',
      owner: '沈括（资金管理）',
      dueDate: '2026-10-17',
      route: '/scenario',
    },
    {
      id: 'ACT-FX-05',
      text: '将汇率敏感性分析纳入 Q4 现金流预测与月度经营会材料，按周更新敞口与锁汇台账',
      actionType: 'continue',
      priority: 'P2',
      owner: '沈括（资金管理）',
      dueDate: '2026-10-22',
      route: '/dashboard',
    },
  ],
  evidence: [
    {
      id: 'EV-FX-01',
      sourceSystem: '汇率中心 · 每日中间价',
      metric: 'EUR/CNY',
      value: '8.31',
      baseline: '月初 8.42',
      asOf: '2026-09-15 08:00',
      nature: 'demo',
      definition: '中国外汇交易中心公布的欧元兑人民币中间价，取数据截止日最近一个交易日收盘值',
    },
    {
      id: 'EV-FX-02',
      sourceSystem: '资金系统 · 敞口台账',
      metric: '外币净敞口',
      value: '1.5 亿元',
      baseline: '已锁汇比例 90%',
      asOf: '2026-09-15 07:55',
      nature: 'demo',
      definition: '外币计价资产减负债后的净额，按币种折算为人民币，含应收、应付与在途未开票部分',
    },
    {
      id: 'EV-FX-03',
      sourceSystem: '资金系统 · 敞口台账',
      metric: '本月新增未锁汇敞口',
      value: '1,460 万元',
      baseline: '目标覆盖比例 95%',
      asOf: '2026-09-15 07:56',
      nature: 'demo',
      definition: '9 月新增订单与应收中尚未签订远期、期权等对冲工具的名义金额合计',
    },
    {
      id: 'EV-FX-04',
      sourceSystem: '财务 · 汇兑损益',
      metric: '单月汇兑损失',
      value: '19 万元',
      baseline: '上月 -4 万元',
      asOf: '2026-09-15 07:58',
      nature: 'demo',
      definition: '未锁汇外币资产按期末即期汇率重估产生的损益，不含已锁汇部分的远期公允价值变动',
    },
    {
      id: 'EV-FX-05',
      sourceSystem: 'ERP · 欧洲报价单',
      metric: '欧元计价收入占比',
      value: '38%',
      baseline: '上季度 35%',
      asOf: '2026-09-15 07:59',
      nature: 'demo',
      definition: '欧元计价收入占集团合并收入的比例，按季度滚动十二个月口径计算',
    },
    {
      id: 'EV-FX-06',
      sourceSystem: '资金系统 · 现金流预测',
      metric: 'CCC 边际影响',
      value: '+2 天',
      baseline: '集团 CCC 108 天',
      asOf: '2026-09-15 08:00',
      nature: 'demo',
      definition: '汇率下行导致欧元回款折算收入减少而间接拉长的周转天数，按敞口规模静态估算',
    },
  ],
  integrity: { traceable: 6, total: 6 },
};

/* ------------------------------------------------------------------ */
/* 参数化文案生成器                                                    */
/* ------------------------------------------------------------------ */

/**
 * 基于主案例模板生成 SKU 级五段式分析。
 * 五段的因果逻辑沿用 INVENTORY_AGING_ANALYSIS 模板，所有量值替换为入参的真实数字。
 */
export function skuAnalysis(input: SkuAnalysisInput): FivePartAnalysis {
  const template = INVENTORY_AGING_ANALYSIS;
  const coverageTarget = 2.5;
  const coverageGap = round(clamp(coverageTarget - input.orderCoverageMonths, 0.1, 2.4), 1);
  const overstockPct = Math.round(input.overstockRatio * 100);
  const releaseAmount = Math.round(input.value * 0.38);

  const why: readonly WhyItem[] = [
    {
      text: `${input.warehouseName}基于海外旺季销售预期提前备货，${input.name}（${input.sku}）按乐观需求曲线下达采购，到货节奏快于实际动销`,
      likelihood: template.why[0].likelihood,
    },
    {
      text: `${input.country}市场实际需求增速低于销售端备货假设，渠道提货周期拉长，出货未达滚动计划`,
      likelihood: template.why[1].likelihood,
    },
    {
      text: `新型号迭代上市后老型号动销下降，${input.name} 在经销商端的陈列与推荐顺位后移`,
      likelihood: template.why[2].likelihood,
    },
    {
      text: `已下单的 ${input.inTransitQty} 台在途批次未随库存水位变化同步调整，采购与海外仓之间缺少滚动复核机制`,
      likelihood: template.why[3].likelihood,
    },
  ];

  const actions: readonly SuggestedAction[] = [
    {
      id: `${input.sku}-ACT-01`,
      text: `暂停 ${input.sku} 新增采购申请，直至该 SKU 订单覆盖回升至 ${coverageTarget} 个月以上`,
      actionType: 'pause',
      priority: 'P0',
      owner: input.owner,
      dueDate: input.dueDate,
      releaseAmount,
      route: '/inventory',
    },
    {
      id: `${input.sku}-ACT-02`,
      text: `与供应商协商将 ${input.inTransitQty} 台在途批次分批延后 30–45 天入库，优先延后尚未发运的批次`,
      actionType: 'delay',
      priority: 'P1',
      owner: '周敏（采购计划）',
      dueDate: addDays(input.dueDate, 7),
      route: '/inventory',
    },
    {
      id: `${input.sku}-ACT-03`,
      text: `优先消化 ${input.warehouseName}库存：对${input.country}重点客户推出组合促销，目标 30 天内去化 25%`,
      actionType: 'reduce',
      priority: 'P1',
      owner: input.owner,
      dueDate: addDays(input.dueDate, 21),
      route: '/inventory',
    },
    {
      id: `${input.sku}-ACT-04`,
      text: '评估向订单覆盖更紧的区域仓跨区调拨，优先满足订单覆盖低于 1.5 个月的市场',
      actionType: 'transfer',
      priority: 'P2',
      owner: input.owner,
      dueDate: addDays(input.dueDate, 28),
      route: '/inventory',
    },
    {
      id: `${input.sku}-ACT-05`,
      text: '将本次库存水位、采购冻结与调拨结论纳入下周 S&OP 会议，同步修订 Q4 滚动备货计划',
      actionType: 'continue',
      priority: 'P2',
      owner: '赵鹏（供应链计划）',
      dueDate: input.dueDate,
      route: '/scenario',
    },
  ];

  const overrides: readonly { readonly value: string; readonly baseline: string }[] = [
    { value: `${input.agingDays} 天`, baseline: `上期 ${Math.max(0, input.agingDays - 16)} 天` },
    {
      value: `${wan(input.value)} 万元`,
      baseline: `目标 ${wan(Math.round((input.value * 0.7) / 100) * 100)} 万元`,
    },
    { value: `${input.orderCoverageMonths} 个月`, baseline: '健康区间 2.5–3.5 个月' },
    {
      value: `${input.inTransitQty} 台`,
      baseline: `上月同期 ${Math.round((input.inTransitQty * 0.68) / 10) * 10} 台`,
    },
    { value: `${wan(Math.round(input.value * 0.2266))} 万元`, baseline: '未到货占比 100%' },
    { value: `+${input.cccImpactDays} 天`, baseline: '集团 CCC 108 天' },
  ];

  const evidence: readonly EvidenceCard[] = template.evidence.map((card, index) => {
    const override = overrides[index % overrides.length];
    return {
      id: `${input.sku}-EV-0${index + 1}`,
      sourceSystem: card.sourceSystem,
      metric: card.metric,
      value: override.value,
      baseline: override.baseline,
      asOf: card.asOf,
      nature: 'demo',
      definition: card.definition,
    };
  });

  return {
    whatHappened: `${input.warehouseName}（${input.country}）的 ${input.name}（${input.sku}）在库 ${input.qty} 台、货值 ${wan(input.value)} 万元，加权平均库龄 ${input.agingDays} 天，超期库存占比 ${overstockPct}%；订单覆盖仅 ${input.orderCoverageMonths} 个月，低于 ${coverageTarget} 个月的健康下限约 ${coverageGap} 个月，另有 ${input.inTransitQty} 台在途批次仍将陆续到货。`,
    why,
    impact: [
      {
        text: '该批库存占用营运资金，在去化完成前无法通过销售回笼',
        metric: '现金占用',
        delta: `+${wan(input.cashOccupied)} 万元`,
      },
      {
        text: '老型号面临新型号替代，按可变现净值测算需计提跌价准备',
        metric: '预计跌价准备',
        delta: `${wan(input.impairmentRisk)} 万元`,
      },
      {
        text: '海外仓持续承担堆存、操作与保险成本，去化周期越长成本越高',
        metric: '季度仓储成本',
        delta: `+${wan(input.holdingCostQuarter)} 万元`,
      },
      {
        text: '库存周转天数上升，现金转换周期被进一步拉长',
        metric: 'CCC 边际影响',
        delta: `+${input.cccImpactDays} 天`,
      },
    ],
    actions,
    evidence,
    integrity: { traceable: evidence.length, total: evidence.length },
  };
}

/**
 * 基于应收延期模板生成客户级五段式分析。
 * 五段的因果逻辑沿用 RECEIVABLE_DELAY_ANALYSIS 模板，所有量值替换为入参的真实数字。
 */
export function customerAnalysis(input: CustomerAnalysisInput): FivePartAnalysis {
  const template = RECEIVABLE_DELAY_ANALYSIS;
  const hasOverdue = input.overdueDays > 0;
  const overdueAmount = hasOverdue
    ? Math.round(input.receivable * clamp(input.overdueDays / 120, 0.05, 0.6))
    : 0;
  const overdueRatio = input.receivable > 0 ? Math.round((overdueAmount / input.receivable) * 100) : 0;
  const recoveryRatio =
    input.receivable > 0 ? Math.round((input.expectedCollection / input.receivable) * 100) : 0;
  const gapAmount = Math.max(0, input.receivable - input.expectedCollection);
  const cccDays = Math.round(clamp(input.overdueDays / 17, 1, 9));
  const dsoDays = Math.round(clamp(input.agingDays / 11, 1, 15));

  const situation = hasOverdue
    ? `${input.name}（${input.country}）应收余额 ${wan(input.receivable)} 万元，其中逾期 ${input.overdueDays} 天金额 ${wan(overdueAmount)} 万元、逾期率 ${overdueRatio}%，加权平均账龄 ${input.agingDays} 天、已超出合同账期`
    : `${input.name}（${input.country}）应收余额 ${wan(input.receivable)} 万元，当前无逾期，加权平均账龄 ${input.agingDays} 天，仍处于常规账期区间`;

  const why: readonly WhyItem[] = [
    {
      text: `${input.name}终端销售放缓，${input.country}渠道提货周期拉长、库存周转下降，回款节奏同步后移`,
      likelihood: template.why[0].likelihood,
    },
    {
      text: '客户将有限资金优先投入新品铺货与安装团队扩张，到期订单的付款顺位后移',
      likelihood: template.why[1].likelihood,
    },
    {
      text: '合同账期约 90 天与终端分期回款周期（120 天以上）错配，客户实际以终端回款支付货款',
      likelihood: template.why[2].likelihood,
    },
    {
      text:
        input.agingDays > 60
          ? `信用管理未在账龄超过 60 天时启动额度下调与出货冻结，${input.creditRating} 级客户敞口仍在扩大`
          : `该客户账龄仍在健康区间，风险主要来自终端销售波动，需保持月度账龄复核`,
      likelihood: template.why[3].likelihood,
    },
  ];

  const actions: readonly SuggestedAction[] = [
    {
      id: `AR-01-${input.name}`,
      text: hasOverdue
        ? `冻结 ${input.name} 新增发货与授信使用，直至逾期金额回落至 ${wan(Math.round(overdueAmount * 0.25))} 万元以内`
        : `维持 ${input.name} 常规账期管理并按月复核账龄结构，暂不新增信用额度`,
      actionType: 'pause',
      priority: hasOverdue ? 'P0' : 'P2',
      owner: input.owner,
      dueDate: input.dueDate,
      ...(overdueAmount > 0 ? { releaseAmount: overdueAmount } : {}),
      route: '/receivables',
    },
    {
      id: `AR-02-${input.name}`,
      text: hasOverdue
        ? `由 ${input.owner} 与客户财务负责人建立专项沟通，要求 5 个工作日内提交书面付款计划与现金流安排`
        : `由 ${input.owner} 保持月度对账，并在发票到期前 15 天发送付款提示`,
      actionType: 'continue',
      priority: 'P1',
      owner: input.owner,
      dueDate: addDays(input.dueDate, 7),
      route: '/receivables',
    },
    {
      id: `AR-03-${input.name}`,
      text: `将 ${input.name} 的月度发货量下调 ${hasOverdue ? '50%' : '10%'}，控制应收敞口继续扩大`,
      actionType: 'reduce',
      priority: 'P1',
      owner: input.owner,
      dueDate: addDays(input.dueDate, 14),
      route: '/inventory',
    },
    {
      id: `AR-04-${input.name}`,
      text: `评估以库存抵扣应收的以货抵债方案，涉及金额不超过 ${wan(Math.round(input.receivable * 0.2))} 万元`,
      actionType: 'transfer',
      priority: 'P2',
      owner: '何静（信用管理）',
      dueDate: addDays(input.dueDate, 21),
      route: '/inventory',
    },
    {
      id: `AR-05-${input.name}`,
      text: `按 ${wan(input.expectedCollection)} 万元回款计划重算 Q4 现金流，回款缺口 ${wan(gapAmount)} 万元纳入信用管理周会跟踪`,
      actionType: 'delay',
      priority: 'P2',
      owner: '何静（信用管理）',
      dueDate: addDays(input.dueDate, 28),
      route: '/cash-fx',
    },
  ];

  const overrides: readonly { readonly value: string; readonly baseline: string }[] = [
    {
      value: `${wan(input.receivable)} 万元`,
      baseline: `授信额度 ${wan(Math.round((input.receivable * 1.2) / 100) * 100)} 万元`,
    },
    { value: `${wan(overdueAmount)} 万元`, baseline: `逾期率 ${overdueRatio}%` },
    { value: `${input.agingDays} 天`, baseline: '合同账期 90 天' },
    { value: input.creditRating, baseline: '授信准入下限 BBB' },
    { value: `${wan(input.expectedCollection)} 万元`, baseline: `计划回款日 ${input.dueDate}` },
    { value: `+${cccDays} 天`, baseline: '集团 CCC 108 天' },
  ];

  const evidence: readonly EvidenceCard[] = template.evidence.map((card, index) => {
    const override = overrides[index % overrides.length];
    return {
      id: `${input.name}-EV-0${index + 1}`,
      sourceSystem: card.sourceSystem,
      metric: card.metric,
      value: override.value,
      baseline: override.baseline,
      asOf: card.asOf,
      nature: 'demo',
      definition: card.definition,
    };
  });

  return {
    whatHappened: `${situation}。客户信用评级为 ${input.creditRating}，预计 ${input.dueDate} 前可回款 ${wan(input.expectedCollection)} 万元（占应收余额 ${recoveryRatio}%），仍有 ${wan(gapAmount)} 万元回款缺口需通过催收与授信管理跟进。`,
    why,
    impact: [
      {
        text: '逾期部分占用营运资金，直接影响 Q4 现金回笼节奏',
        metric: '逾期金额',
        delta: `${wan(overdueAmount)} 万元`,
      },
      {
        text: `按 ${input.creditRating} 级客户 8% 计提比例测算，需补充计提坏账准备`,
        metric: '坏账准备',
        delta: `${wan(Math.round(input.receivable * 0.08))} 万元`,
      },
      {
        text: '应收账款周转天数上升，与集团 DSO 标杆进一步偏离',
        metric: 'DSO 影响',
        delta: `+${dsoDays} 天`,
      },
      {
        text: '应收占用资金叠加库存占用，现金转换周期被拉长',
        metric: 'CCC 边际影响',
        delta: `+${cccDays} 天`,
      },
    ],
    actions,
    evidence,
    integrity: { traceable: evidence.length, total: evidence.length },
  };
}
