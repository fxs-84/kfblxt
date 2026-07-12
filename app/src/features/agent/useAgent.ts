import { useCallback } from "react";
import {
  recordDiagnosis,
  recordOutcome,
  recordPersonalAction,
  getAgentStats,
  getInterventionEffectiveness,
  rankDiagnosisByHistory,
  type OutcomeRecord,
} from "./agent-memory";
import { getSession } from "../../lib/session";
import { INTERVENTIONS_CATALOG } from "../treatment/interventions-catalog";

/**
 * Agent hook — 暴露给全系统的"学习钩子"。
 * 每个临床操作完成后调用对应的 record 函数,Agent 自动学习。
 */
export function useAgent() {
  const sess = getSession();

  /** 诊断保存后调用 */
  const onDiagnosisCreated = useCallback(
    (fields: {
      levels: string[];
      mechanisms: string[];
      regionSummary: string;
      interventions?: string[];
      patientId?: string;
    }) => {
      // 记录模式
      recordDiagnosis(
        fields.levels,
        fields.mechanisms,
        fields.regionSummary,
        fields.interventions ?? [],
      );
      // 记录个人偏好
      recordPersonalAction("create_diagnosis", `诊断: ${fields.levels.join("/")} · ${fields.mechanisms.join("+")}`, {
        diagnosisLevels: fields.levels,
        patientId: fields.patientId,
        therapistId: sess.userId,
      });
    },
    [sess.userId],
  );

  /** 治疗计划创建后调用 */
  const onTreatmentCreated = useCallback(
    (fields: {
      interventionIds: string[];
      diagnosisLevels?: string[];
      mechanisms?: string[];
      regionSummary?: string;
      patientId?: string;
    }) => {
      fields.interventionIds
        .map((id) => INTERVENTIONS_CATALOG.find((i) => i.id === id)?.name ?? id)
        .join("、");
      if (fields.diagnosisLevels && fields.mechanisms && fields.regionSummary) {
        recordDiagnosis(
          fields.diagnosisLevels,
          fields.mechanisms,
          fields.regionSummary,
          fields.interventionIds,
        );
      }
      for (const id of fields.interventionIds) {
        recordPersonalAction("create_treatment", `干预: ${INTERVENTIONS_CATALOG.find((i) => i.id === id)?.name ?? id}`, {
          interventionId: id,
          diagnosisLevels: fields.diagnosisLevels,
          patientId: fields.patientId,
          therapistId: sess.userId,
        });
      }
    },
    [sess.userId],
  );

  /** 复评保存后调用 */
  const onOutcomeRecorded = useCallback(
    (fields: {
      planId: string;
      patternKey: string;
      interventionIds: string[];
      outcome: OutcomeRecord["outcome"];
      node: OutcomeRecord["node"];
    }) => {
      recordOutcome(fields.planId, fields.patternKey, fields.interventionIds, fields.outcome, fields.node);
      recordPersonalAction("record_outcome", `复评: ${fields.outcome} (${fields.node})`, {});
    },
    [],
  );

  /** SOAP 存档后调用 */
  const onSoapSaved = useCallback(
    (soap: string, patientId?: string) => {
      recordPersonalAction("save_soap", "保存 SOAP 笔记", {
        soapNote: soap.slice(0, 200),
        patientId,
        therapistId: sess.userId,
      });
    },
    [sess.userId],
  );

  /** 结束就诊 */
  const onEncounterClosed = useCallback(
    (encounterId: string, patientId?: string) => {
      recordPersonalAction("close_encounter", `结束就诊`, {
        entityId: encounterId,
        patientId,
        therapistId: sess.userId,
      });
    },
    [sess.userId],
  );

  /** 创建客户 */
  const onPatientCreated = useCallback(
    (patientId: string, name: string) => {
      recordPersonalAction("create_patient", `新建客户: ${name}`, {
        entityId: patientId,
        patientId,
        therapistId: sess.userId,
      });
    },
    [sess.userId],
  );

  return {
    stats: getAgentStats(),
    onDiagnosisCreated,
    onTreatmentCreated,
    onOutcomeRecorded,
    onSoapSaved,
    onEncounterClosed,
    onPatientCreated,
    getEffectiveness: getInterventionEffectiveness,
    rankDiagnosis: rankDiagnosisByHistory,
  };
}
