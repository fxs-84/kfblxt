import { useState, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { usePatient, useDeletePatient } from "../usePatients";
import { usePatientEncounters, useCloseEncounter, useUpdateEncounter } from "../../encounters/useEncounters";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { EncounterForm } from "../../encounters/components/EncounterForm";
import { EncounterTable } from "../../encounters/components/EncounterTable";
import { EncounterSummary } from "../../encounters/components/EncounterSummary";
import { CloseChecklist } from "../../encounters/components/CloseChecklist";
import { VasTrendChart } from "../../encounters/components/VasTrendChart";
import { vasSeries, aggregateRegions } from "../../encounters/encounter.select";
import { BodyMap } from "../../../components/bodymap/BodyMap";
import { ExamForm } from "../../exam/components/ExamForm";
import { ExamResultSummary } from "../../exam/components/ExamResultSummary";
import { useAllExamSessions } from "../../exam/useExam";
import { TreatmentPanel } from "../../treatment/components/TreatmentPanel";
import { DiagnosisPanel } from "../../diagnosis/components/DiagnosisPanel";
import { AttachmentPanel } from "../../attachments/components/AttachmentPanel";
import { BillingPanel } from "../../billing/BillingPanel";
import { TrendSummaryCard } from "../../agent/TrendSummaryCard";
import { FollowupPanel } from "../../followup/FollowupPanel";
import { SharePanel } from "../../share/SharePanel";
import { AIAssistantPanel, type AIBackfillHandlers } from "../../ai/AIAssistantPanel";
import { useCreateDiagnosis, useDiagnosis } from "../../diagnosis/useDiagnosis";
import { useCreateTreatmentPlan } from "../../treatment/useTreatment";
import type { NeuroLevel, Mechanism, SpinalSegment, NerveTrunk } from "../../diagnosis/localization.types";
import { calcAge, SEX_LABELS, HAND_LABELS, formatDate } from "../../../lib/format";
import { TherapistAttribution } from "../../../components/auth/TherapistAttribution";
import { OperationTimeline } from "../../../components/auth/OperationTimeline";

type TabType = "overview" | "encounters" | "treatment";

export function PatientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: patient, isLoading } = usePatient(id);
  const { data: encounters } = usePatientEncounters(id);
  const { data: allSessions = [] } = useAllExamSessions();
  const closeEncounter = useCloseEncounter();
  const updateEncounter = useUpdateEncounter();
  const createDiagnosis = useCreateDiagnosis();
  const createTreatmentPlan = useCreateTreatmentPlan();
  const deletePatient = useDeletePatient();

  const [tab, setTab] = useState<TabType>("overview");
  const [showForm, setShowForm] = useState(false);
  const [examEncounterId, setExamEncounterId] = useState<string | null>(null);
  const [diagnosisEid, setDiagnosisEid] = useState<string | null>(null);
  const [summaryEncounterId, setSummaryEncounterId] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [checklistEid, setChecklistEid] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const examSectionRef = useRef<HTMLDivElement>(null);
  const diagnosisSectionRef = useRef<HTMLDivElement>(null);

  const openExam = (eid: string) => {
    setDiagnosisEid(null);
    setExamEncounterId(eid === examEncounterId ? null : eid);
    // 等 panel 渲染完成再滚动
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        examSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        if (examSectionRef.current) {
          examSectionRef.current.style.boxShadow = "0 0 0 3px var(--color-accent)";
          setTimeout(() => { if (examSectionRef.current) examSectionRef.current.style.boxShadow = ""; }, 1500);
        }
      });
    });
  };
  const openDiagnosis = (eid: string) => {
    setExamEncounterId(null);
    setDiagnosisEid(eid === diagnosisEid ? null : eid);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        diagnosisSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  };

  const handleConfirmDelete = async () => {
    await deletePatient.mutateAsync(id!);
    navigate("/patients");
  };

  const activeDiagnosisEncounterId = examEncounterId ?? (encounters && encounters.length > 0 ? encounters[0].id : undefined);
  const { data: activeDiagnosis } = useDiagnosis(activeDiagnosisEncounterId);

  if (isLoading) return <div className="empty">加载中…</div>;
  if (!patient) return <div className="empty">未找到该患者。</div>;

  const list = encounters ?? [];
  const series = vasSeries(list);
  const { regions, intensity } = aggregateRegions(list);
  const latestVas = series.at(-1)?.vas;
  const peakVas = series.length ? Math.max(...series.map((p) => p.vas)) : undefined;

  const sessionByEncounter = new Map<string, typeof allSessions[0]>();
  for (const s of allSessions) {
    if (!sessionByEncounter.has(s.encounterId)) sessionByEncounter.set(s.encounterId, s);
  }

  const handleCloseEncounter = async (eid: string, force = false) => {
    if (!force) {
      setChecklistEid(eid);
      return;
    }
    setClosing(true);
    await closeEncounter.mutateAsync(eid);
    setSummaryEncounterId(eid);
    setExamEncounterId(null);
    setChecklistEid(null);
    setClosing(false);
  };

  return (
    <>
      <header className="page-header">
        <div>
          <p className="page-subtitle"><Link to="/patients">患者</Link> / {patient.medicalRecordNo}</p>
          <h1 className="page-title">{patient.name}</h1>
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <button
            className="btn btn--ghost"
            onClick={() => setConfirmDelete(true)}
            style={{ color: "var(--color-abnormal)" }}
            title="软删除此患者(可在管理员视图恢复)"
          >
            删除
          </button>
          <button className="btn btn--primary" onClick={() => { setTab("encounters"); setShowForm(true); }}>+ 新建就诊</button>
        </div>
      </header>

      <section className="patient-banner card">
        <div className="patient-banner__avatar">{patient.name.slice(0, 1)}</div>
        <div className="patient-banner__meta">
          <span className="chip-static">{SEX_LABELS[patient.sex]}</span>
          <span className="chip-static">{calcAge(patient.birthDate)} 岁</span>
          <span className="chip-static">{patient.dominantHand ? HAND_LABELS[patient.dominantHand] : "利手未评估"}</span>
          {patient.phone && <span className="chip-static">☏ {patient.phone}</span>}
          <TherapistAttribution
            userId={patient.createdBy}
            at={patient.createdAt}
            label="建档"
          />
        </div>
      </section>

      <nav className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "overview"} className={`tab ${tab === "overview" ? "tab--active" : ""}`} onClick={() => setTab("overview")}>概览</button>
        <button role="tab" aria-selected={tab === "encounters"} className={`tab ${tab === "encounters" ? "tab--active" : ""}`} onClick={() => setTab("encounters")}>就诊记录 · {list.length}</button>
        <button role="tab" aria-selected={tab === "treatment"} className={`tab ${tab === "treatment" ? "tab--active" : ""}`} onClick={() => setTab("treatment")}>治疗计划</button>
      </nav>

      {tab === "overview" && (
        <>
          <TrendSummaryCard patientId={patient.id} />
          <div className="overview-grid">
            <div className="card panel">
              <div className="panel__head"><h3 className="panel__title">症状定位图</h3><span className="panel__hint">颜色越深 = 历次 VAS 峰值越高</span></div>
              {regions.length === 0 ? <div className="empty">尚无标记。</div> : <BodyMap value={regions} intensity={intensity} />}
            </div>
            <div className="card panel">
              <div className="panel__head"><h3 className="panel__title">VAS 疼痛趋势</h3><span className="panel__hint">绿/黄/红 = 轻/中/重</span></div>
              <VasTrendChart data={series} />
              <div className="stat-row">
                <div className="stat"><span className="stat__value">{list.length}</span><span className="stat__label">就诊次数</span></div>
                <div className="stat"><span className="stat__value">{latestVas ?? "—"}</span><span className="stat__label">最新 VAS</span></div>
                <div className="stat"><span className="stat__value">{peakVas ?? "—"}</span><span className="stat__label">峰值 VAS</span></div>
              </div>
            </div>
          </div>
          <BillingPanel patientId={patient.id} />
          <FollowupPanel patientId={patient.id} />
        </>
      )}

      {tab === "encounters" && (
        <>
          {showForm ? (
            <div style={{ marginBottom: "1.5rem" }}><EncounterForm patientId={patient.id} onDone={() => setShowForm(false)} /></div>
          ) : (
            <div style={{ marginBottom: "1rem" }}><button className="btn btn--ghost" onClick={() => setShowForm(true)}>+ 新建就诊</button></div>
          )}

          <div className="card">
            <EncounterTable
              encounters={list}
              onExam={openExam}
              activeExamId={examEncounterId ?? undefined}
              onCloseEncounter={handleCloseEncounter}
              onOpenDiagnosis={openDiagnosis}
            />
          </div>

          {/* 定位诊断(任意就诊) */}
          {diagnosisEid && (
            <div ref={diagnosisSectionRef} style={{ marginTop: "1.5rem" }}>
              <DiagnosisPanel encounterId={diagnosisEid} />
              <div style={{ textAlign: "right", marginTop: "var(--space-3)" }}>
                <button className="btn btn--ghost" onClick={() => setDiagnosisEid(null)}>收起</button>
              </div>
            </div>
          )}

          {/* 查体 + 诊断 + 附件(进行中就诊) */}
          {examEncounterId && (
            <div ref={examSectionRef} style={{ marginTop: "1.5rem", border: "2px solid var(--color-accent)", borderRadius: 8, padding: "var(--space-3)", background: "var(--color-accent-weak, #e6f0fa)22" }}>
              <div style={{ marginBottom: "var(--space-3)", fontSize: 13, fontWeight: 600, color: "var(--color-accent)" }}>
                📋 正在处理就诊:{formatDate(list.find(e => e.id === examEncounterId)?.encounterDate ?? new Date())} · {list.find(e => e.id === examEncounterId)?.visitType}
                <button type="button" className="btn btn--ghost" style={{ float: "right", fontSize: 11, padding: "2px 10px" }} onClick={() => setExamEncounterId(null)}>收起</button>
              </div>
              {sessionByEncounter.has(examEncounterId)
                ? <ExamResultSummary session={sessionByEncounter.get(examEncounterId)!} />
                : <ExamForm encounterId={examEncounterId} onDone={() => setExamEncounterId(null)} />}
              <DiagnosisPanel encounterId={examEncounterId} />
              <AttachmentPanel encounterId={examEncounterId} />
              <SharePanel encounterId={examEncounterId} patientId={patient.id} />

              {/* 结束就诊按钮 */}
              <div style={{ textAlign: "right", marginTop: "var(--space-4)" }}>
                <button className="btn btn--primary" disabled={closing} onClick={() => handleCloseEncounter(examEncounterId)}>
                  {closing ? "保存中…" : "✓ 结束本次就诊"}
                </button>
              </div>
            </div>
          )}

          {/* 已结束就诊摘要 */}
          {summaryEncounterId && (() => {
            const enc = list.find((e) => e.id === summaryEncounterId);
            if (!enc) return null;
            return (
              <EncounterSummary encounter={enc} patientName={patient.name} patientSex={patient.sex} />
            );
          })()}

          {checklistEid && (() => {
            const enc = list.find((e) => e.id === checklistEid);
            if (!enc) return null;
            return (
              <CloseChecklist
                encounterId={checklistEid}
                hasSoap={Boolean(enc.soapNote)}
                closing={closing}
                onConfirm={() => handleCloseEncounter(checklistEid, true)}
                onCancel={() => setChecklistEid(null)}
              />
            );
          })()}
        </>
      )}

      {tab === "treatment" && list.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <TreatmentPanel encounterId={list[0].id} />
          {list.slice(1).map((e) => <TreatmentPanel key={e.id} encounterId={e.id} />)}
        </div>
      )}
      {tab === "treatment" && list.length === 0 && <div className="empty">尚无就诊记录,请先创建就诊。</div>}

      {list.length > 0 && (() => {
        const activeEncounter = examEncounterId ? list.find((e) => e.id === examEncounterId) ?? list[0] : list[0];
        const scene: "诊前" | "诊中" | "诊后" = activeEncounter.status === "已结束" ? "诊后" : "诊中";
        const handlers: AIBackfillHandlers = {
          onAdoptDiagnosis: (fields) => {
            createDiagnosis.mutate({
              encounterId: activeEncounter.id,
              levels: (fields.levels as NeuroLevel[]) ?? [],
              mechanisms: (fields.mechanisms as Mechanism[]) ?? [],
              segments: fields.segments as SpinalSegment[] | undefined,
              nerves: fields.nerves as NerveTrunk[] | undefined,
              cutaneousNerveIds: fields.cutaneousNerveIds,
              side: (fields.side as "left" | "right" | "bilateral" | "midline") ?? "left",
              reasoning: fields.reasoning ?? "",
            });
          },
          onAdoptIntervention: (interventionId) => {
            createTreatmentPlan.mutate({
              encounterId: activeEncounter.id,
              phase: "急性期",
              frequency: "待定",
              duration: "待定",
              interventionIds: [interventionId],
              goals: [{ term: "short", description: "待补充(请在治疗计划中完善)", metric: "" }],
            });
          },
          onSaveSoap: (soap) => {
            updateEncounter.mutate({ id: activeEncounter.id, patch: { soapNote: soap } });
          },
        };
        return (
          <AIAssistantPanel
            scene={scene}
            encounter={activeEncounter}
            examSessions={allSessions}
            diagnosis={activeDiagnosis ?? null}
            backfill={handlers}
          />
        );
      })()}
      <p className="disclaimer">本系统为临床辅助记录工具,查体量表阈值待医师签字确认,不作为独立诊断依据。</p>

      <OperationTimeline
        patientId={id!}
        patientCreatedAt={patient.createdAt}
        patientCreatedBy={patient.createdBy}
      />

      <ConfirmDialog
        open={confirmDelete}
        title="删除患者档案"
        message={`将软删除「${patient.name}」(${patient.medicalRecordNo})。该操作标记 deletedAt,患者列表/详情自动隐藏,但 RLS 保留记录以便审计与恢复。仅管理员可执行。`}
        confirmLabel="确认删除"
        cancelLabel="取消"
        danger
        onConfirm={handleConfirmDelete}
        onClose={() => setConfirmDelete(false)}
      />
    </>
  );
}
