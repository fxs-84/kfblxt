import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useSharesByEncounter, useRevokeShare, useCreateShare } from "./useShare";
import { generateHomeworkTemplate } from "../agent/agent-utils";
import { useTreatmentPlans } from "../treatment/useTreatment";
import { formatDate } from "../../lib/format";

interface SharePanelProps { encounterId: string; patientId: string; interventionIds?: string[] }

export function SharePanel({ encounterId, patientId }: SharePanelProps) {
  const { data: shares = [] } = useSharesByEncounter(encounterId);
  const revokeShare = useRevokeShare();
  const createShare = useCreateShare();
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("");
  const [homework, setHomework] = useState("");
  const [nextVisit, setNextVisit] = useState("");
  /* mutation.isPending 取代本地 saving */
  const saving = createShare.isPending;

  /* P3-10: 智能作业模板 */
  const { data: encounterPlans = [] } = useTreatmentPlans(encounterId);
  const handleFillHomework = () => {
    const ids = encounterPlans.flatMap((p) => p.interventionIds);
    if (ids.length === 0) return;
    setHomework(generateHomeworkTemplate(ids));
  };

  const handleGenerate = async () => {
    await createShare.mutateAsync({
      encounterId,
      patientId,
      homework: homework.trim() || undefined,
      nextVisit: nextVisit ? new Date(nextVisit) : undefined,
      message: message.trim() || undefined,
    });
    setShowForm(false); setMessage(""); setHomework(""); setNextVisit("");
  };

  /* 用 ?share=<token> 形态而非 /share/<token>:
     前者走主站根路径,GitHub Pages 返回 HTTP 200;
     后者虽然 SPA 也能跑,但 GitHub Pages 对未匹配路径返回 404,
     微信内置 webview 和部分浏览器看到 404 状态码就拒绝渲染,
     即使 body 是完整 SPA HTML。
     PatientViewPage 同时从 useParams 和 useSearchParams 拿 token,
     老链接 /share/<token> 也不会失效。 */
  const shareUrl = (token: string) => `${window.location.origin}/?share=${token}`;

  return (
    <div className="card panel" style={{ marginBottom: "var(--space-4)" }}>
      <div className="panel__head">
        <h3 className="panel__title">📤 分享给患者</h3>
        <span className="panel__hint">患者扫码或点链接查看诊治摘要</span>
      </div>

      {!showForm && shares.length === 0 && (
        <div style={{ padding: "0 var(--space-5) var(--space-4)" }}>
          <button className="btn btn--primary" onClick={() => setShowForm(true)}>
            + 生成分享链接
          </button>
        </div>
      )}

      {showForm && (
        <div style={{ padding: "0 var(--space-5) var(--space-4)", borderBottom: "1px solid var(--color-border)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            <div className="field">
              <label>家庭作业 / 居家训练指导
                <button type="button" className="btn btn--ghost" style={{ fontSize: "10px", padding: "0 6px", marginLeft: "var(--space-2)" }}
                  onClick={handleFillHomework} title="根据治疗计划自动生成">🧠 自动生成</button>
              </label>
              <textarea rows={3} value={homework} onChange={(e) => setHomework(e.target.value)}
                placeholder="如:每天 VOR 训练 30 下×3 组;肩胛骨稳定训练 1min/侧×2 组;注意保持收下巴"
                style={{ width: "100%", padding: "var(--space-2)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", font: "inherit", resize: "vertical" }} />
            </div>
            <div style={{ display: "flex", gap: "var(--space-3)" }}>
              <div className="field" style={{ flex: 1 }}>
                <label>给患者的留言</label>
                <input value={message} onChange={(e) => setMessage(e.target.value)}
                  placeholder="如:坚持训练,下周复诊时我们评估进展"
                  style={{ padding: "var(--space-2)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", font: "inherit" }} />
              </div>
              <div className="field" style={{ width: 160 }}>
                <label>下次复诊</label>
                <input type="date" value={nextVisit} onChange={(e) => setNextVisit(e.target.value)}
                  style={{ padding: "var(--space-2)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", font: "inherit" }} />
              </div>
            </div>
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              <button className="btn btn--primary" disabled={saving} onClick={handleGenerate}>
                {saving ? "生成中…" : "生成分享链接"}
              </button>
              <button className="btn btn--ghost" onClick={() => setShowForm(false)}>取消</button>
            </div>
          </div>
        </div>
      )}

      {/* 已有分享 */}
      {shares.length > 0 && (
        <div style={{ padding: "var(--space-4) var(--space-5)" }}>
          {shares.map((s) => {
            const url = shareUrl(s.token);
            return (
              <div key={s.id} className="share-card">
                <div className="share-card__info">
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-1)" }}>
                    <span className={`badge ${s.revoked ? "badge--abnormal" : "badge--normal"}`}>
                      {s.revoked ? "已撤销" : "有效"}
                    </span>
                    <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
                      {formatDate(s.createdAt)} · 有效期至 {formatDate(s.expiresAt)}
                    </span>
                  </div>
                  {s.homework && <p style={{ fontSize: "var(--text-sm)", margin: "4px 0" }}>📝 作业: {s.homework}</p>}
                  {s.nextVisit && <p style={{ fontSize: "var(--text-sm)", margin: "4px 0" }}>📅 复诊: {formatDate(s.nextVisit)}</p>}
                  <div className="share-card__link">
                    <input readOnly value={url}
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                      style={{ flex: 1, padding: "var(--space-1) var(--space-2)", border: "1px solid var(--color-border)", borderRadius: 4, fontSize: "var(--text-xs)", fontFamily: "var(--font-mono)", background: "var(--color-surface-sunken)" }} />
                    <button className="btn btn--ghost" style={{ fontSize: "var(--text-xs)", padding: "2px 8px" }}
                      onClick={() => navigator.clipboard?.writeText(url)}>复制</button>
                  </div>
                  <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
                    {!s.revoked && (
                      <button className="btn btn--ghost" style={{ fontSize: "var(--text-xs)", color: "var(--color-abnormal)" }}
                        onClick={() => revokeShare.mutate(s.id)}>撤销分享</button>
                    )}
                    {!showForm && (
                      <button className="btn btn--primary" style={{ fontSize: "var(--text-xs)" }}
                        onClick={() => setShowForm(true)}>+ 新建分享</button>
                    )}
                  </div>
                </div>
                {!s.revoked && (
                  <div className="share-card__qr" title="扫码查看">
                    <QRCodeSVG value={url} size={112} level="M" />
                    <div className="share-card__qr-hint">扫码查看</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
