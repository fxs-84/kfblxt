/**
 * Agent 工具函数 — 供各 UI 组件嵌入调用的"智能建议"生成器。
 * 所有函数为纯计算,从 agent-memory 读取数据做推断,不写任何数据。
 */
import { getAgentStats, getInterventionEffectiveness, getVasHistory } from "./agent-memory";
import { INTERVENTIONS_CATALOG } from "../treatment/interventions-catalog";
import type { FollowupRecord } from "../followup/followup.repository";

/** P3-2: 计算患者优先级分数(越高越靠前) */
export function calcPatientPriority(
  patientId: string,
  vasSeries: Array<{ vas: number }>,
  pendingFollowups: FollowupRecord[],
  hasIncompleteDiagnosis: boolean,
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  // 有未完成的诊断+100
  if (hasIncompleteDiagnosis) { score += 100; reasons.push("未完成诊断"); }

  // VAS反弹(最近一次VAS比之前高)+80
  if (vasSeries.length >= 2) {
    const latest = vasSeries[vasSeries.length - 1].vas;
    const previous = vasSeries[vasSeries.length - 2].vas;
    if (latest > previous) { score += 80; reasons.push("VAS反弹"); }
    if (latest >= 7) { score += 60; reasons.push("高疼痛(VAS≥7)"); }
  }

  // 即将复诊+50
  const now = Date.now();
  const urgentFUs = pendingFollowups.filter((f) => {
    const days = (new Date(f.dueDate).getTime() - now) / 86400000;
    return f.status === "待复诊" && days >= 0 && days <= 3;
  });
  if (urgentFUs.length > 0) { score += 50; reasons.push(`${urgentFUs.length}条即将复诊`); }

  return { score, reasons };
}

/** P3-8: 基于历史疗效预测本次复评结果 */
export function predictOutcome(
  interventionIds: string[],
): { predicted: "显效" | "有效" | "进步" | "不确定"; confidence: number; basis: string } {
  if (interventionIds.length === 0) return { predicted: "不确定", confidence: 0, basis: "无干预记录" };

  let totalRate = 0;
  let count = 0;
  const names: string[] = [];

  for (const id of interventionIds) {
    const eff = getInterventionEffectiveness(id);
    if (eff.total > 0) {
      totalRate += eff.rate;
      count++;
      const name = INTERVENTIONS_CATALOG.find((i) => i.id === id)?.name ?? id;
      names.push(`${name}:${Math.round(eff.rate * 100)}%`);
    }
  }

  if (count === 0) return { predicted: "不确定", confidence: 0, basis: "无历史数据" };

  const avgRate = totalRate / count;
  const basis = names.join(" ");

  if (avgRate >= 0.7) return { predicted: "显效", confidence: avgRate, basis };
  if (avgRate >= 0.5) return { predicted: "有效", confidence: avgRate, basis };
  return { predicted: "进步", confidence: avgRate, basis };
}

/** P3-10: 根据干预组合自动生成居家训练作业模板 */
export function generateHomeworkTemplate(interventionIds: string[]): string {
  const lines: string[] = [];

  for (const id of interventionIds) {
    const def = INTERVENTIONS_CATALOG.find((i) => i.id === id);
    if (!def) continue;

    if (id === "vor-training") lines.push("👁 VOR 训练:稳定眼球→稳定脊柱。坐正,凝视前方固定点,头缓慢左右转动,6秒一组,30下/天×3组。");
    else if (id === "breathing-training") lines.push("🫁 腹式呼吸:3秒吸气/6秒呼气,10-15次/组,每天7组。漱喉咙30秒(激活迷走神经)。");
    else if (id === "scapular-stability") lines.push("💪 肩胛骨稳定:单手扶墙,对侧身体外推,肩胛骨下沉+内收,保持1分钟/侧。");
    else if (id === "neural-desensitization") lines.push("🖐 神经脱敏:找到痛点或麻木区域,用指尖轻柔按压20秒,不超过20秒,每天3-5点。");
    else if (id === "mirror-therapy") lines.push("🪞 镜像训练:用镜子遮住患侧,注视健侧运动图像,想象患侧也在做同样动作,5分钟。");
    else if (id === "stability-core") lines.push("🧘 核心稳定:平板支撑(20秒→60秒渐进),死虫式交替,鸟狗式交替,2-3组/天。");
    else if (id === "balance-static") lines.push("⚖️ 静态平衡:双脚并拢站立30秒→单脚站→闭眼单脚站→软垫上站,逐步渐进。");
    else if (id === "balance-dynamic") lines.push("🚶 动态平衡:行走中转头左看→右看→上看→下看;跨过障碍物;手推车式走路。");
    else if (id === "strength-eccentric") lines.push("🏋️ 离心训练:动作下落阶段放慢至4-6秒,负荷=最大重量的60-75%,5-8次×3组。");
    else if (id === "flexibility-stretch") lines.push("🤸 牵伸训练:每个部位静态拉伸15-30秒×3-5次,不引起锐痛,每天早晚各一次。");
    else if (id.includes("integration")) lines.push("🧒 反射整合训练:每天跨中线运动+节律性摇摆,缓慢慢速,配合节拍器40bpm。");
    else if (id === "dietary-intervention") lines.push("🥗 饮食管理:增加蔬菜摄入,减少精制碳水,排除可能过敏食物(奶/蛋/麦),确保充足维D。");
    else lines.push(`📋 ${def.name}:按治疗师指导参数进行,注意不诱发症状加重。`);
  }

  if (lines.length === 0) lines.push("按照本次治疗师指导的方案坚持每天训练。如有不适及时联系。");

  lines.push("\n⚠ 训练原则:量力而行,不引起锐痛。如有不适或症状加重,暂停并联系。");
  return lines.join("\n\n");
}

/** P3-11: 基于疗效趋势建议复诊间隔(天数) */
export function suggestFollowupInterval(
  vasHistory: Array<{ vas: number }>,
): { intervalDays: number; rationale: string } {
  if (vasHistory.length < 2) return { intervalDays: 7, rationale: "初诊建议1周内复诊评估初始反应" };

  const latest = vasHistory[vasHistory.length - 1].vas;
  const previous = vasHistory[vasHistory.length - 2].vas;
  const delta = latest - previous; // 负→改善,正→恶化

  if (delta <= -3) return { intervalDays: 14, rationale: "显著改善(VAS↓≥3),建议2周复诊" };
  if (delta < 0) return { intervalDays: 7, rationale: "有改善(VAS↓),建议1周复诊" };
  if (delta === 0) return { intervalDays: 5, rationale: "VAS持平,建议5天内复诊调整方案" };
  return { intervalDays: 3, rationale: "VAS反弹↑,建议3天内复诊评估" };
}

/** P3-12: 自动趋势总结(用于患者概览) */
export function generateTrendSummary(
  vasHistory: Array<{ date: string; vas: number }>,
  sessionCount: number,
): { summary: string; trend: "improving" | "stable" | "worsening" } {
  if (vasHistory.length < 2) {
    return { summary: "数据不足,完成 2 次以上就诊后 Agent 将自动生成趋势解读。", trend: "stable" };
  }

  const first = vasHistory[0].vas;
  const latest = vasHistory[vasHistory.length - 1].vas;
  const delta = latest - first;
  const maxVas = Math.max(...vasHistory.map((v) => v.vas));
  const minVas = Math.min(...vasHistory.map((v) => v.vas));
  const improvement = first - latest;

  if (delta <= -3) return {
    trend: "improving",
    summary: `VAS 从 ${first} 降至 ${latest}(共 ${vasHistory.length} 次就诊),改善 ${improvement} 分,趋势显著向好。峰值 VAS ${maxVas},已降至 ${minVas}。建议继续当前方案并评估功能恢复。`,
  };
  if (delta < 0) return {
    trend: "improving",
    summary: `VAS 从 ${first} 缓慢降至 ${latest},改善 ${improvement} 分,趋势向好。峰值 ${maxVas}→${minVas}。建议增加复评频率以确认疗效。`,
  };
  if (delta === 0) return {
    trend: "stable",
    summary: `VAS 维持在 ${latest},共 ${vasHistory.length} 次就诊,波动范围 ${minVas}-${maxVas}。建议重新评估治疗方案,考虑调整干预组合。`,
  };
  return {
    trend: "worsening",
    summary: `⚠ VAS 从 ${first} 升至 ${latest},恶化 ${Math.abs(delta)} 分。峰值 ${maxVas}。建议紧急复诊,重新定位诊断并考虑转诊。`,
  };
}
