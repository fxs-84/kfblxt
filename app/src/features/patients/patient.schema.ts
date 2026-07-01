import { z } from "zod";

/**
 * 患者档案的系统边界校验。所有患者数据属于某一机构(org_id),
 * 与后端 RLS 的多租户隔离保持一致。sex 用生理性别以支持神经/发育评估参考值。
 */
export const sexEnum = z.enum(["male", "female", "other"]);
export type Sex = z.infer<typeof sexEnum>;

export const patientSchema = z.object({
  id: z.string().uuid().optional(),
  orgId: z.string().uuid(),
  medicalRecordNo: z
    .string()
    .trim()
    .max(64, "病历号过长")
    .optional()
    .or(z.literal("")),
  name: z.string().trim().min(1, "姓名不能为空").max(80),
  sex: sexEnum,
  birthDate: z.coerce.date().refine((d) => d <= new Date(), "出生日期不能晚于今天"),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\-() ]{5,20}$/u, "联系电话格式不正确")
    .optional()
    .or(z.literal("")),
  dominantHand: z.enum(["left", "right", "ambidextrous"]).optional(),
  createdAt: z.coerce.date().optional(),
});

export type Patient = z.infer<typeof patientSchema>;

export type PatientInput = Omit<Patient, "id" | "createdAt">;
