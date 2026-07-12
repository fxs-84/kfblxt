import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useParams } from "react-router-dom";
import { z } from "zod";
import { patientSchema } from "../patient.schema";
import { useCreatePatient, useUpdatePatient, usePatient } from "../usePatients";
import { getSession } from "../../../lib/session";

// 机构 org_id 由会话注入,不作为表单字段
const formSchema = patientSchema.omit({ id: true, createdAt: true, orgId: true });
type FormValues = z.input<typeof formSchema>;

export function PatientFormPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const { data: existing, isLoading: loadingPatient } = usePatient(id);

  const createPatient = useCreatePatient();
  const updatePatient = useUpdatePatient();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { sex: "male" },
  });

  // 编辑模式:加载已有数据填入表单
  useEffect(() => {
    if (isEdit && existing) {
      reset({
        medicalRecordNo: existing.medicalRecordNo ?? "",
        name: existing.name ?? "",
        sex: existing.sex as "male" | "female" | "other",
        birthDate: existing.birthDate,
        phone: existing.phone ?? "",
        dominantHand: (existing.dominantHand as "left" | "right" | "ambidextrous" | "") ?? "",
      });
    }
  }, [isEdit, existing, reset]);

  const onSubmit = handleSubmit((values) => {
    setSubmitError(null);
    try {
      const parsed = formSchema.parse(values);
      if (isEdit && id) {
        updatePatient.mutate(
          { id, patch: { ...parsed, orgId: getSession().orgId } },
          {
            onSuccess: () => navigate(`/patients/${id}`),
            onError: (e: unknown) => {
              console.error("[编辑客户] 保存失败:", e);
              setSubmitError(e instanceof Error ? e.message : String(e));
            },
          },
        );
      } else {
        createPatient.mutate(
          { ...parsed, orgId: getSession().orgId },
          {
            onSuccess: (created) => navigate(`/patients/${created.id}`),
            onError: (e) => {
              console.error("[新建客户] 保存失败:", e);
              setSubmitError(e instanceof Error ? e.message : String(e));
            },
          },
        );
      }
    } catch (e: unknown) {
      console.error("[客户表单] 校验失败:", e);
      setSubmitError(e instanceof Error ? `数据校验失败: ${e.message}` : String(e));
    }
  });

  if (isEdit && loadingPatient) return <div className="empty">加载中…</div>;
  if (isEdit && !existing) return <div className="empty">客户不存在。</div>;

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">{isEdit ? "编辑客户信息" : "新建客户"}</h1>
          <p className="page-subtitle">{isEdit ? `修改 ${existing?.name} 的基本信息` : "建立客户档案"}</p>
        </div>
      </header>

      <form className="card" onSubmit={onSubmit} noValidate>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="mrn">病历号(留空自动生成)</label>
            <input id="mrn" {...register("medicalRecordNo")} placeholder="如:ANRM-0001,留空则自动生成" />
            {errors.medicalRecordNo && <span className="field__error">{errors.medicalRecordNo.message}</span>}
          </div>
          <div className="field">
            <label htmlFor="name">姓名</label>
            <input id="name" {...register("name")} />
            {errors.name && <span className="field__error">{errors.name.message}</span>}
          </div>
          <div className="field">
            <label htmlFor="sex">性别</label>
            <select id="sex" {...register("sex")}>
              <option value="male">男</option>
              <option value="female">女</option>
              <option value="other">其他</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="birthDate">出生日期</label>
            <input id="birthDate" type="date" {...register("birthDate")} />
            {errors.birthDate && <span className="field__error">{errors.birthDate.message}</span>}
          </div>
          <div className="field">
            <label htmlFor="phone">联系电话</label>
            <input id="phone" {...register("phone")} />
            {errors.phone && <span className="field__error">{errors.phone.message}</span>}
          </div>
          <div className="field">
            <label htmlFor="dominantHand">利手</label>
            <select id="dominantHand" {...register("dominantHand")}>
              <option value="">未评估</option>
              <option value="right">右利手</option>
              <option value="left">左利手</option>
              <option value="ambidextrous">双利手</option>
            </select>
          </div>
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn--primary" disabled={isSubmitting}>
            {isSubmitting ? "保存中…" : "保存"}
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => navigate(isEdit ? `/patients/${id}` : "/patients")}>
            取消
          </button>
        </div>
        {submitError && (
          <div className="field__error" style={{ marginTop: "var(--space-3)", padding: "var(--space-3)", background: "var(--color-abnormal-weak, #fef0ed)", borderRadius: "var(--radius-sm)", whiteSpace: "pre-wrap" }}>
            ❌ {submitError}
          </div>
        )}
      </form>
    </>
  );
}
