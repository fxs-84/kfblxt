import { useParams, Link } from "react-router-dom";
import { PatientMembershipPage } from "./PatientMembershipPage";

/**
 * 路由包装:解析 :id 传给 PatientMembershipPage,
 * 顶部加一个返回按钮,方便从明细页回患者详情。
 */
export function PatientMembershipRoutePage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <div style={{ padding: 24 }}>缺少患者 ID</div>;

  return (
    <div style={{ padding: "var(--space-6)" }}>
      <div style={{ marginBottom: "var(--space-3)" }}>
        <Link to={`/patients/${id}`} className="btn btn--ghost" style={{ fontSize: "var(--text-sm)" }}>
          ← 返回患者详情
        </Link>
      </div>
      <PatientMembershipPage patientId={id} />
    </div>
  );
}
