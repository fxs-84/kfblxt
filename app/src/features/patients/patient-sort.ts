import type { Patient } from "./patient.schema";

/**
 * 客户列表按建档日期由近到远(降序)排序。
 * - 不可变:返回新数组,不修改入参
 * - 健壮:createdAt 缺省时视为 epoch=0(沉底),不抛错
 *
 * 业务语义:"最近建档"优先,治疗师日常在工作站翻看时最关心新增档案
 */
export function sortPatientsByCreatedDesc(list: readonly Patient[]): Patient[] {
  return [...list].sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tb - ta; // desc:新的在前
  });
}
