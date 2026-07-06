import { useState, useEffect } from "react";
import { useForm, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  encounterInputSchema,
  SYMPTOM_GROUPS,
  SYMPTOM_GROUP_KEYS,
  type SymptomGroup,
  type Encounter,
} from "../encounter.schema";
import { useCreateEncounter, useUpdateEncounter } from "../useEncounters";
import { getSession } from "../../../lib/session";
import { BodyMap } from "../../../components/bodymap/BodyMap";

const encounterFormSchema = encounterInputSchema.omit({ orgId: true, patientId: true });
type EncounterFormValues = z.input<typeof encounterFormSchema>;

interface EncounterFormProps {
  patientId: string;
  /** 编辑模式:传入现有 encounter */
  existing?: Encounter;
  onDone: () => void;
}

export function EncounterForm({ patientId, existing, onDone }: EncounterFormProps) {
  const createEncounter = useCreateEncounter();
  const updateEncounter = useUpdateEncounter();
  const isEdit = Boolean(existing);
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EncounterFormValues>({
    resolver: zodResolver(encounterFormSchema),
    defaultValues: existing
      ? {
          encounterDate: existing.encounterDate.toISOString().slice(0, 10),
          visitType: existing.visitType,
          status: existing.status,
          chiefComplaint: {
            regions: existing.chiefComplaint.regions,
            distributionNote: existing.chiefComplaint.distributionNote ?? "",
            nature: existing.chiefComplaint.nature,
            vas: existing.chiefComplaint.vas,
            durationText: existing.chiefComplaint.durationText,
            onset: existing.chiefComplaint.onset ?? "",
          },
          amount: existing.amount ?? 0,
          soapNote: existing.soapNote ?? "",
        }
      : {
          visitType: "初诊",
          encounterDate: new Date().toISOString().slice(0, 10),
          chiefComplaint: { regions: [], nature: [], vas: 0 },
        },
  });

  const [symptomOpen, setSymptomOpen] = useState<Set<SymptomGroup>>(
    existing ? new Set() : new Set(["疼痛", "感觉异常"]),
  );

  // 编辑模式下,根据已有症状性质自动展开分组
  useEffect(() => {
    if (!existing) return;
    const existingNature = new Set(existing.chiefComplaint.nature);
    const groupsToOpen = new Set<SymptomGroup>();
    for (const g of SYMPTOM_GROUP_KEYS) {
      if (SYMPTOM_GROUPS[g].some(n => existingNature.has(n))) groupsToOpen.add(g);
    }
    setSymptomOpen(groupsToOpen);
  }, [existing?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* P2: 体区→症状组映射 */
  const REGION_TO_GROUPS: Record<string, SymptomGroup[]> = {
    "head": ["疼痛","前庭/平衡","视听/颅神经","认知/精神"],
    "neck": ["疼痛","前庭/平衡","感觉异常","视听/颅神经"],
    "chest": ["疼痛","自主神经","感觉异常"],
    "forearm": ["感觉异常","运动障碍","功能受限","疼痛"],
    "hand": ["感觉异常","运动障碍","功能受限"],
    "quadriceps": ["疼痛","运动障碍","步态/姿势","功能受限"],
    "hamstring": ["疼痛","运动障碍","步态/姿势"],
    "calves": ["感觉异常","步态/姿势","运动障碍","疼痛"],
    "foot": ["感觉异常","步态/姿势","功能受限"],
    "knees": ["疼痛","步态/姿势","功能受限"],
    "gluteal": ["疼痛","感觉异常","步态/姿势"],
    "lower-back": ["疼痛","感觉异常","运动障碍","功能受限"],
    "upper-back": ["疼痛","感觉异常","运动障碍"],
    "trapezius": ["疼痛","感觉异常","运动障碍"],
    "abs": ["自主神经","运动障碍"],
  };

  const watchedRegions = useWatch({ control, name: "chiefComplaint.regions" }) ?? [];

  /* 选体区时自动展开最相关的症状组 */
  useEffect(() => {
    const regions = watchedRegions as string[];
    if (regions.length === 0) return;
    const scored = new Map<SymptomGroup, number>();
    for (const r of regions) {
      const base = r.replace(/^left-|^right-|-内侧$|-外侧$|-中$/g, "");
      const groups = REGION_TO_GROUPS[base];
      if (groups) for (const g of groups) scored.set(g, (scored.get(g) ?? 0) + 1);
    }
    if (scored.size === 0) return;
    const top = [...scored.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g]) => g);
    setSymptomOpen((prev) => { const n = new Set(prev); for (const g of top) n.add(g); return n; });
  }, [JSON.stringify(watchedRegions)]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleGroup = (g: SymptomGroup) => {
    const next = new Set(symptomOpen);
    if (next.has(g)) next.delete(g); else next.add(g);
    setSymptomOpen(next);
  };

  const onSubmit = handleSubmit(async (values) => {
    const parsed = encounterFormSchema.parse(values);
    if (existing) {
      await updateEncounter.mutateAsync({
        id: existing.id!,
        patch: {
          encounterDate: new Date(String(parsed.encounterDate)),
          visitType: parsed.visitType,
          status: parsed.status ?? "进行中",
          chiefComplaint: parsed.chiefComplaint,
          amount: parsed.amount,
          soapNote: parsed.soapNote,
        },
      });
    } else {
      await createEncounter.mutateAsync({
        ...parsed,
        orgId: getSession().orgId,
        patientId,
      });
    }
    onDone();
  });

  return (
    <form className="card encounter-form" onSubmit={onSubmit} noValidate>
      <div className="encounter-form__body">
        <div className="encounter-form__map">
          <span className="field-label">症状定位(点击标记)</span>
          <Controller
            control={control}
            name="chiefComplaint.regions"
            render={({ field }) => (
              <BodyMap value={field.value ?? []} onChange={field.onChange} />
            )}
          />
          {errors.chiefComplaint?.regions && (
            <span className="field__error">{errors.chiefComplaint.regions.message}</span>
          )}
        </div>

        <div className="encounter-form__fields">
          <div className="form-grid form-grid--tight">
            <div className="field">
              <label htmlFor="encounterDate">就诊日期</label>
              <input id="encounterDate" type="date" {...register("encounterDate")} />
            </div>
            <div className="field">
              <label htmlFor="visitType">就诊类型</label>
              <select id="visitType" {...register("visitType")}>
                <option value="初诊">初诊</option>
                <option value="复诊">复诊</option>
              </select>
            </div>
            <div className="field field--full">
              <label htmlFor="distributionNote">皮区 / 部位备注(选填)</label>
              <input id="distributionNote" {...register("chiefComplaint.distributionNote")}
                placeholder="如:S1 皮区、坐骨神经走行" />
            </div>

            {/* 分组症状选择器 */}
            <div className="field field--full">
              <span className="field-label">症状性质(可多选,按系统分组)</span>
              <div className="symptom-groups">
                {SYMPTOM_GROUP_KEYS.map((group) => {
                  const open = symptomOpen.has(group);
                  const natures = SYMPTOM_GROUPS[group];
                  return (
                    <div key={group} className="symptom-group">
                      <button type="button" className="symptom-group__toggle"
                        onClick={() => toggleGroup(group)}>
                        <span className="symptom-group__chevron">{open ? "▾" : "▸"}</span>
                        {group}
                        <span className="symptom-group__hint">{natures.length}</span>
                      </button>
                      {open && (
                        <div className="chip-group symptom-group__chips">
                          {natures.map((n) => (
                            <label key={n} className="chip">
                              <input type="checkbox" value={n}
                                {...register("chiefComplaint.nature")} />
                              {n}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {errors.chiefComplaint?.nature && (
                <span className="field__error">{errors.chiefComplaint.nature.message}</span>
              )}
            </div>

            <div className="field">
              <label htmlFor="vas">疼痛 VAS(0-10)</label>
              <input id="vas" type="number" min={0} max={10}
                {...register("chiefComplaint.vas", { valueAsNumber: true })} />
              {errors.chiefComplaint?.vas && (
                <span className="field__error">{errors.chiefComplaint.vas.message}</span>
              )}
            </div>
            <div className="field">
              <label htmlFor="durationText">病程</label>
              <input id="durationText" {...register("chiefComplaint.durationText")}
                placeholder="如:3个月" />
              {errors.chiefComplaint?.durationText && (
                <span className="field__error">{errors.chiefComplaint.durationText.message}</span>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="form-actions">
        <button type="submit" className="btn btn--primary" disabled={isSubmitting}>
          {isSubmitting ? "保存中…" : (isEdit ? "保存修改" : "保存就诊")}
        </button>
        <button type="button" className="btn btn--ghost" onClick={onDone}>取消</button>
      </div>
    </form>
  );
}
