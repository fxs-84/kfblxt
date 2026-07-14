/**
 * 客户分享 — 治疗师为每次就诊生成只读分享链接,客户扫码/点开即可查看。
 * 包含:就诊摘要、治疗计划(家庭作业)、下次复诊时间、附件(检查报告/疗效对比)。
 * shareToken = 加密随机串,mock 阶段用 UUID,接 Supabase 后加 JWT 签名防篡改。
 */

export interface ShareLink {
  id: string;
  encounterId: string;
  patientId: string;
  orgId: string;
  createdAt: Date;
  /** 分享 token(URL 参数) */
  token: string;
  /** 是否已失效(手动撤销) */
  revoked: boolean;
  /** 有效期(默认 30 天),超期自动失效 */
  expiresAt: Date;
  /** 家庭作业备注(治疗师写给客户的居家训练指导) */
  homework?: string;
  /** 下次复诊时间 */
  nextVisit?: Date;
  /** 分享消息(治疗师留言) */
  message?: string;
  /** 临床数据快照 — 创建分享时打入,客户设备无需 localStorage */
  snapshot?: ShareSnapshot | null;
  /** URL hash 编码的临床数据 — 客户扫码直接解码渲染,无需 Supabase */
  hashData?: string;
}

export type ShareInterventionDose = {
  durationMin?: number;
  sets?: number;
  intensity?: "轻度" | "中度" | "重度";
  note?: string;
};

/** 分享快照 — 打包 PatientViewPage 所需的全部临床数据 */
export interface ShareSnapshot {
  encounter: {
    encounterDate: string;
    visitType: string;
    chiefComplaint: {
      regions: string[];
      distributionNote?: string;
      nature: string[];
      vas: number;
      durationText: string;
    };
  } | null;
  sessions: Array<{
    id: string;
    results: Record<string, unknown>;
    createdAt: string;
  }>;
  diagnosis: {
    levels: string[];
    mechanisms: string[];
    reasoning: string;
    side?: string;
    segments?: string[];
    nerves?: string[];
    cutaneousNerveIds?: string[];
  } | null;
  plans: SharePlan[];
  attachments: Array<{
    id: string;
    category: string;
    fileName: string;
    dataUrl: string;
    timeline?: string;
    comparisonGroup?: string;
  }>;
}

/** 治疗计划在分享快照中的形态;含每条干预的逐项剂量 */
export interface SharePlan {
  id: string;
  phase: string;
  frequency: string;
  duration: string;
  interventionIds: string[];
  /** 逐项剂量(训练时长/组数/强度/备注);可选,旧 plan 可缺省 */
  interventionDoses?: Record<string, ShareInterventionDose>;
  goals?: string[];
}
