/**
 * 患者分享 — 治疗师为每次就诊生成只读分享链接,患者扫码/点开即可查看。
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
  /** 家庭作业备注(治疗师写给患者的居家训练指导) */
  homework?: string;
  /** 下次复诊时间 */
  nextVisit?: Date;
  /** 分享消息(治疗师留言) */
  message?: string;
  /** 临床数据快照 — 创建分享时打入,患者设备无需 localStorage */
  snapshot?: ShareSnapshot | null;
}

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
  plans: Array<{
    id: string;
    phase: string;
    frequency: string;
    duration: string;
    interventionIds: string[];
    goals?: string[];
  }>;
  attachments: Array<{
    id: string;
    category: string;
    fileName: string;
    dataUrl: string;
    timeline?: string;
    comparisonGroup?: string;
  }>;
}
