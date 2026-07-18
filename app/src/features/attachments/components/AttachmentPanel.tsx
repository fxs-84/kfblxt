import { useState, useRef } from "react";
import { useAttachments, useCreateAttachment, useDeleteAttachment } from "../useAttachments";
import { ATTACHMENT_CATEGORIES, type AttachmentCategory } from "../attachment.types";
import type { AttachmentRecord } from "../attachment.repository";
import { formatDate } from "../../../lib/format";

interface AttachmentPanelProps { encounterId: string }

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function isImage(mime: string): boolean { return mime.startsWith("image/"); }
function isVideo(mime: string): boolean { return mime.startsWith("video/"); }
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentPanel({ encounterId }: AttachmentPanelProps) {
  const { data: attachments = [] } = useAttachments(encounterId);
  const createAttachment = useCreateAttachment();
  const deleteAttachment = useDeleteAttachment();
  const [category, setCategory] = useState<AttachmentCategory>("检查报告");
  const [timeline, setTimeline] = useState<"治疗前" | "治疗中" | "治疗后">("治疗前");
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const dataUrl = await readFileAsDataUrl(file);
        await createAttachment.mutateAsync({
          encounterId, category, fileName: file.name, mimeType: file.type,
          dataUrl, sizeBytes: file.size,
          note: note.trim() || undefined,
          timeline: category === "疗效对比" ? timeline : undefined,
          comparisonGroup: category === "疗效对比" ? timeline : undefined,
        });
      }
      setNote("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "上传失败");
    } finally {
      setUploading(false);
    }
  };

  const reports = attachments.filter((a) => a.category === "检查报告");
  const comparisons = attachments.filter((a) => a.category === "疗效对比");
  const groups = {
    before: comparisons.filter((a) => a.timeline === "治疗前"),
    during: comparisons.filter((a) => a.timeline === "治疗中"),
    after: comparisons.filter((a) => a.timeline === "治疗后"),
  };

  const renderThumb = (att: AttachmentRecord) => {
    if (isImage(att.mimeType)) {
      return <img src={att.dataUrl} alt={att.fileName} className="attachment-thumb__img" />;
    }
    if (isVideo(att.mimeType)) {
      return <video src={att.dataUrl} className="attachment-thumb__vid" muted preload="metadata" />;
    }
    return <div className="attachment-thumb__doc"><span className="attachment-thumb__icon">📄</span><span>{att.mimeType}</span></div>;
  };

  const renderCard = (att: AttachmentRecord) => (
    <div key={att.id} className="attachment-card">
      <a className="attachment-card__thumb" href={att.dataUrl} target="_blank" rel="noreferrer"
        title="点击查看原文件">
        {renderThumb(att)}
      </a>
      <div className="attachment-card__info">
        <span className="attachment-card__name" title={att.fileName}>{att.fileName}</span>
        <span className="attachment-card__meta">{formatSize(att.sizeBytes)} · {formatDate(att.createdAt)}</span>
        {att.note && <span className="attachment-card__note">{att.note}</span>}
      </div>
      <button type="button" className="attachment-card__del" onClick={() => deleteAttachment.mutate(att.id)} title="删除">✕</button>
    </div>
  );

  const compareGroups = [
    { key: "before" as const, label: "治疗前" },
    { key: "during" as const, label: "治疗中" },
    { key: "after" as const, label: "治疗后" },
  ];

  return (
    <div className="card panel" style={{ marginBottom: "var(--space-4)" }}>
      <div className="panel__head">
        <h3 className="panel__title">检查报告 / 疗效对比</h3>
        <span className="panel__hint">{attachments.length} 个文件</span>
      </div>

      {/* 上传区 */}
      <div style={{ padding: "0 var(--space-5) var(--space-4)" }}>
        <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
          <select className="exam-grade" value={category}
            onChange={(e) => setCategory(e.target.value as AttachmentCategory)}>
            {ATTACHMENT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          {category === "疗效对比" && (
            <select className="exam-grade" value={timeline}
              onChange={(e) => setTimeline(e.target.value as "治疗前" | "治疗中" | "治疗后")}>
              <option value="治疗前">治疗前</option>
              <option value="治疗中">治疗中</option>
              <option value="治疗后">治疗后</option>
            </select>
          )}
          <input placeholder="备注(可选)" value={note} onChange={(e) => setNote(e.target.value)}
            style={{ flex: 1, minWidth: 120, padding: "2px 6px", border: "1px solid var(--color-border)", borderRadius: 4, fontSize: "var(--text-xs)" }} />
          <input ref={fileInputRef} type="file" multiple accept="image/*,video/*,.pdf"
            style={{ display: "none" }}
            onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }} />
          <button type="button" className="btn btn--primary" style={{ fontSize: "var(--text-xs)", padding: "3px 14px" }}
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}>
            {uploading ? "上传中…" : "📎 上传"}
          </button>
        </div>
        {error && <div className="field__error" style={{ marginTop: "var(--space-2)" }}>{error}</div>}
      </div>

      {/* 检查报告 */}
      {reports.length > 0 && (
        <div style={{ borderTop: "1px solid var(--color-border)", padding: "var(--space-4) var(--space-5)" }}>
          <div className="summary-section__title" style={{ marginTop: 0 }}>检查报告 ({reports.length})</div>
          <div className="attachment-grid">
            {reports.map(renderCard)}
          </div>
        </div>
      )}

      {/* 疗效对比 */}
      {comparisons.length > 0 && (
        <div style={{ borderTop: "1px solid var(--color-border)", padding: "var(--space-4) var(--space-5)" }}>
          <div className="summary-section__title" style={{ marginTop: 0 }}>疗效对比 ({comparisons.length})</div>
          {compareGroups.map(({ key, label }) => {
            const items = groups[key];
            if (items.length === 0) return null;
            return (
              <div key={key} style={{ marginBottom: "var(--space-3)" }}>
                <span className={`badge badge--${key === "before" ? "abnormal" : key === "during" ? "caution" : "normal"}`}
                  style={{ marginBottom: "var(--space-2)" }}>{label} ({items.length})</span>
                <div className="attachment-grid">
                  {items.map(renderCard)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {attachments.length === 0 && (
        <div className="empty" style={{ padding: "var(--space-8)" }}>
          暂无附件,上传检查报告或治疗前后对比照片。
        </div>
      )}
    </div>
  );
}
