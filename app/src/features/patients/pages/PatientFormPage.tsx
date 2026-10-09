import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useParams } from "react-router-dom";
import { z } from "zod";
import { useCreatePatient, useUpdatePatient, usePatient } from "../usePatients";
import { getSession } from "../../../lib/session";
import { FieldError } from "../../../components/ui/FieldError";
import { birthDateFromAge, calcAge } from "../../../lib/format";

// 机构 org_id 由会话注入,不作为表单字段。
// 存储仍是 birthDate,但表单对用户暴露「年龄」— 保存时反推出生日期(取 age 年前的今天),
// 显示侧统一走 calcAge(birthDate),年龄随日历自动增长,无需每年手动维护。
const formSchema = z.object({
  medicalRecordNo: z
    .string()
    .trim()
    .max(64, "病历号过长")
    .optional()
    .or(z.literal("")),
  name: z.string().trim().min(1, "姓名不能为空").max(80),
  sex: z.enum(["male", "female", "other"]),
  age: z.coerce
    .number({ message: "年龄必须是数字" })
    .int("年龄必须是整数")
    .min(0, "年龄不能为负")
    .max(150, "年龄超出合理范围"),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\-() ]{5,20}$/u, "联系电话格式不正确")
    .optional()
    .or(z.literal("")),
  dominantHand: z.enum(["left", "right", "ambidextrous"]).optional().or(z.literal("")),
});
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

  // 编辑模式:加载已有数据填入表单(birthDate → 年龄展示)
  useEffect(() => {
    if (isEdit && existing) {
      reset({
        medicalRecordNo: existing.medicalRecordNo ?? "",
        name: existing.name ?? "",
        sex: existing.sex as "male" | "female" | "other",
        age: calcAge(existing.birthDate),
        phone: existing.phone ?? "",
        dominantHand: (existing.dominantHand as "left" | "right" | "ambidextrous" | "") ?? "",
      });
    }
  }, [isEdit, existing, reset]);

  const onSubmit = handleSubmit((values) => {
    setSubmitError(null);
    try {
      const parsed = formSchema.parse(values);
      // 年龄 → birthDate。编辑模式若年龄未变,保留原 birthDate(避免生日漂移到"今天")
      const birthDate =
        isEdit && existing && calcAge(existing.birthDate) === parsed.age
          ? existing.birthDate
          : birthDateFromAge(parsed.age);
      const payload = {
        medicalRecordNo: parsed.medicalRecordNo,
        name: parsed.name,
        sex: parsed.sex,
        birthDate,
        phone: parsed.phone,
        dominantHand: parsed.dominantHand,
        orgId: getSession().orgId,
      };
      if (isEdit && id) {
        updatePatient.mutate(
          { id, patch: payload },
          {
            onSuccess: () => navigate(`/patients/${id}`),
            onError: (e: unknown) => {
              console.error("[编辑客户] 保存失败:", e);
              setSubmitError(e instanceof Error ? e.message : String(e));
            },
          },
        );
      } else {
        createPatient.mutate(payload, {
          onSuccess: (created) => navigate(`/patients/${created.id}`),
          onError: (e) => {
            console.error("[新建客户] 保存失败:", e);
            setSubmitError(e instanceof Error ? e.message : String(e));
          },
        });
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
            <input id="mrn" aria-invalid={Boolean(errors.medicalRecordNo)}
              aria-describedby={errors.medicalRecordNo ? "patient-mrn-error" : undefined}
              {...register("medicalRecordNo")} placeholder="如:ANRM-0001,留空则自动生成" />
            <FieldError id="patient-mrn-error" message={errors.medicalRecordNo?.message} />
          </div>
          <div className="field">
            <label htmlFor="name">姓名</label>
            <input id="name" aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? "patient-name-error" : undefined}
              autoComplete="name"
              {...register("name")} />
            <FieldError id="patient-name-error" message={errors.name?.message} />
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
            <label htmlFor="age">年龄(岁)</label>
            <input id="age" type="number" min={0} max={150} step={1} aria-invalid={Boolean(errors.age)}
              aria-describedby={errors.age ? "patient-age-error" : undefined}
              placeholder="如:29"
              {...register("age")} />
            <FieldError id="patient-age-error" message={errors.age?.message} />
            <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
              只需填整数年龄,系统自动换算出生日期;之后每年年龄自动增长,无需回来改。
            </span>
          </div>
          <div className="field">
            <label htmlFor="phone">联系电话</label>
            <input id="phone" aria-invalid={Boolean(errors.phone)}
              aria-describedby={errors.phone ? "patient-phone-error" : undefined}
              autoComplete="tel"
              {...register("phone")} />
            <FieldError id="patient-phone-error" message={errors.phone?.message} />
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
