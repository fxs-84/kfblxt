/**
 * AgentMonitor — 无侵入式学习监控器。
 * 监听 React Query 缓存变化,自动记录临床模式。
 * 放在 AppLayout 里即可全局生效,无需修改任何业务页面。
 */
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { recordPersonalAction } from "./agent-memory";
import { getSession } from "../../lib/session";

export function AgentMonitor() {
  const qc = useQueryClient();
  const seen = useRef(new Set<string>());
  const sess = getSession();

  useEffect(() => {
    const unsub = qc.getQueryCache().subscribe(() => {
      const data = qc.getQueryData(["treatment-plans", "all"]) as Array<{id: string; encounterId: string}> | undefined;
      if (data) {
        for (const plan of data) {
          const key = `plan-${plan.id}`;
          if (!seen.current.has(key)) {
            seen.current.add(key);
            recordPersonalAction("create_treatment", "新增治疗计划", {
              entityId: plan.id,
              therapistId: sess.userId,
            });
          }
        }
      }

      const diags = qc.getQueryData(["diagnosis", "all"]) as Array<{id: string; encounterId: string; levels: string[]}> | undefined;
      if (diags) {
        for (const d of diags) {
          const key = `diag-${d.id}`;
          if (!seen.current.has(key)) {
            seen.current.add(key);
            recordPersonalAction("create_diagnosis", `诊断: ${d.levels.join("/")}`, {
              entityId: d.id,
              diagnosisLevels: d.levels,
              therapistId: sess.userId,
            });
          }
        }
      }
    });

    return () => unsub();
  }, [qc, sess.userId]);

  return null; // 纯逻辑,不渲染
}
