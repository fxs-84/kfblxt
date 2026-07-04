-- 0003 分享快照:让患者在任何设备扫码都能看到完整临床数据
-- PatientViewPage 需要 encounter / 查体 / 诊断 / 治疗计划 / 附件,
-- 但这些数据存储在 localStorage,患者设备上不存在。
-- 创建 share 时把所有临床数据快照到 snapshot JSONB 列里。

alter table public.shares add column if not exists snapshot jsonb;
