import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  encounterInputSchema,
  SYMPTOM_GROUPS,
  SYMPTOM_GROUP_KEYS,
  type SymptomGroup,
} from "../encounter.schema";
import { useCreateEncounter } from "../useEncounters";
import { getSession } from "../../../lib/session";
import { BodyMap } from "../../../components/bodymap/BodyMap";

const encounterFormSchema = encounterInputSchema.omit({ orgId: true, patientId: true });
type EncounterFormValues = z.input<typeof encounterFormSchema>;

interface EncounterFormProps {
  patientId: string;
  onDone: () => void;
}

export function EncounterForm({ patientId, onDone }: EncounterFormProps) {
  const createEncounter = useCreateEncounter();
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<EncounterFormValues>({
    resolver: zodResolver(encounterFormSchema),
    defaultValues: {
      visitType: "初诊",
      encounterDate: new Date().toISOString().slice(0, 10),
      chiefComplaint: { regions: [], nature: [], vas: 0 },
    },
  });

  const [symptomOpen, setSymptomOpen] = useState<Set<SymptomGroup>>(new Set(["疼痛", "感觉异常"]));

  const toggleGroup = (g: SymptomGroup) => {
    const next = new Set(symptomOpen);
    if (next.has(g)) next.delete(g); else next.add(g);
    setSymptomOpen(next);
  };

  const onSubmit = handleSubmit(async (values) => {
    const parsed = encounterFormSchema.parse(values);
    await createEncounter.mutateAsync({
      ...parsed,
      orgId: getSession().orgId,
      patientId,
    });
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
          {isSubmitting ? "保存中…" : "保存就诊"}
        </button>
        <button type="button" className="btn btn--ghost" onClick={onDone}>取消</button>
      </div>
    </form>
  );
}
