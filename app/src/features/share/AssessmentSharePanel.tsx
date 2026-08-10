import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useCreateAssessmentShare, useAssessmentSharesByEncounter, useRevokeShare } from "./useShare";
import { SCALE_OPTIONS } from "./submit-submission";
import { formatDate } from "../../lib/format";
import type { ScaleId } from "./share.types";

interface AssessmentSharePanelProps {
  encounterId: string;
  patientId: string;
}

export function AssessmentSharePanel({ encounterId, patientId }: AssessmentSharePanelProps) {
  const { data: shares = [] } = useAssessmentSharesByEncounter(encounterId);
  const createShare = useCreateAssessmentShare();
  const revokeShare = useRevokeShare();
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<Set<ScaleId>>(new Set());
  const [message, setMessage] = useState("");
  const [generateError, setGenerateError] = useState<string | null>(null);

  const saving = createShare.isPending;

  const toggle = (id: ScaleId) => {
    setSelected((prev) => {
      const out = new Set(prev);
      if (out.has(id)) out.delete(id);
      else out.add(id);
      return out;
    });
  };

  const handleGenerate = async () => {
    if (selected.size === 0) return;
    setGenerateError(null);
    try {
      await createShare.mutateAsync({
        encounterId,
        patientId,
        mode: "assessment",
        scales: Array.from(selected),
        message: message.trim() || undefined,
      });
    } catch (e) {
      // 失败必须可见(如 Supabase 迁移未跑导致 shares.mode 列不存在)
      setGenerateError(e instanceof Error ? e.message : "生成失败,请重试");
      return;
    }
    setShowForm(false);
    setSelected(new Set());
    setMessage("");
  };

  const shareUrl = (token: string) =>
    `${window.location.origin}${import.meta.env.BASE_URL}?share=${token}`;

  return (
    <div className="card panel" style={{ marginBottom: "var(--space-4)" }}>
      <div className="panel__head">
        <h3 className="panel__title">📱 扫码填表(自评量表)</h3>
        <span className="panel__hint">客户扫码在手机上做量表,完成后自动回传</span>
      </div>

      {/* 空态:展示表单入口 */}
      {!showForm && shares.length === 0 && (
        <div style={{ padding: "0 var(--space-5) var(--space-4)" }}>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => setShowForm(true)}
          >
            + 生成量表二维码
          </button>
        </div>
      )}

      {/* 选择表单 */}
      {showForm && (
        <div
          style={{
            padding: "0 var(--space-5) var(--space-4)",
            borderBottom: "1px solid var(--color-border)",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            <div className="field">
              <label>选择要分发的量表(可多选)</label>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                {SCALE_OPTIONS.map((opt) => {
                  const checked = selected.has(opt.id);
                  return (
                    <label
                      key={opt.id}
                      data-testid={`scale-option-${opt.id}`}
                      style={{
                        display: "flex",
                        gap: 10,
                        padding: "var(--space-2) var(--space-3)",
                        border: `2px solid ${checked ? "var(--color-accent)" : "var(--color-border)"}`,
                        borderRadius: "var(--radius-md)",
                        cursor: "pointer",
                        background: checked ? "var(--color-accent-weak)" : "transparent",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(opt.id)}
                        style={{ flex: "0 0 auto", marginTop: 3 }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600 }}>
                          {opt.emoji} {opt.label} <span style={{ color: "var(--color-text-muted)", fontWeight: 400 }}>· {opt.count} 题</span>
                        </div>
                        <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
                          {opt.desc}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="field">
              <label>给客户的留言(可选)</label>
              <input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="如:请在安静环境作答,大约需要 10 分钟"
                style={{
                  padding: "var(--space-2)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-sm)",
                  font: "inherit",
                }}
              />
            </div>
            {generateError && (
              <p
                data-testid="generate-error"
                style={{
                  color: "var(--color-abnormal)",
                  fontSize: "var(--text-xs)",
                  margin: 0,
                  padding: "var(--space-2) var(--space-3)",
                  background: "var(--color-abnormal-weak)",
                  borderRadius: "var(--radius-sm)",
                }}
              >
                ⚠ 生成失败:{generateError}
              </p>
            )}
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              <button
                type="button"
                className="btn btn--primary"
                disabled={saving || selected.size === 0}
                onClick={handleGenerate}
                data-testid="generate-assessment-share-btn"
              >
                {saving ? "生成中…" : `生成分享二维码(${selected.size} 个量表)`}
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  setShowForm(false);
                  setSelected(new Set());
                  setGenerateError(null);
                }}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 已有分享 */}
      {shares.length > 0 && (
        <div style={{ padding: "var(--space-4) var(--space-5)" }}>
          {shares.map((s) => {
            const url = shareUrl(s.token);
            const scaleList = (s.scales ?? []).map((id) => SCALE_OPTIONS.find((o) => o.id === id)?.emoji ?? id).join(" ");
            const expired = s.expiresAt.getTime() < Date.now();
            const inactive = s.revoked || expired;
            return (
              <div key={s.id} className="share-card">
                <div className="share-card__info">
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--space-2)",
                      marginBottom: "var(--space-1)",
                    }}
                  >
                    <span className={`badge ${s.revoked ? "badge--abnormal" : expired ? "badge--caution" : "badge--normal"}`}>
                      {s.revoked ? "已撤销" : expired ? "已过期" : "有效"}
                    </span>
                    <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
                      {formatDate(s.createdAt)} · 有效期至 {formatDate(s.expiresAt)} · {scaleList}
                    </span>
                  </div>
                {s.message && (
                  <p style={{ fontSize: "var(--text-sm)", margin: "4px 0" }}>💬 {s.message}</p>
                )}
                  <div className="share-card__link">
                    <input
                      readOnly
                      value={url}
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                      data-testid={`assessment-share-url-${s.token}`}
                      style={{
                        flex: 1,
                        padding: "var(--space-1) var(--space-2)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 4,
                        fontSize: "var(--text-xs)",
                        fontFamily: "var(--font-mono)",
                        background: "var(--color-surface-sunken)",
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn--ghost"
                      style={{ fontSize: "var(--text-xs)", padding: "2px 8px" }}
                      onClick={() => {
                        const copy = () => navigator.clipboard?.writeText(url);
                        try {
                          copy()?.catch(() => window.prompt("复制此链接:", url));
                        } catch {
                          window.prompt("复制此链接:", url);
                        }
                      }}
                    >
                      复制
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
                    {!inactive && (
                      <button
                        type="button"
                        className="btn btn--ghost"
                        style={{ fontSize: "var(--text-xs)", color: "var(--color-abnormal)" }}
                        onClick={() => revokeShare.mutate({ token: s.token, encounterId: s.encounterId })}
                      >
                        撤销分享
                      </button>
                    )}
                    {!showForm && (
                      <button
                        type="button"
                        className="btn btn--primary"
                        style={{ fontSize: "var(--text-xs)" }}
                        onClick={() => setShowForm(true)}
                      >
                        + 新建分发
                      </button>
                    )}
                  </div>
                </div>
                {!inactive && (
                  <div className="share-card__qr" title="扫码填表">
                    <QRCodeSVG value={url} size={112} level="M" />
                    <div className="share-card__qr-hint">扫码填表</div>
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