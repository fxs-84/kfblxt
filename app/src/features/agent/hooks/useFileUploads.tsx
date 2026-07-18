/**
 * 文件上传 hook — 从 AgentChat 提取。
 * 管理待发送附件(files + 解析出的文本/base64),非文本文件先弹 PHI 安全确认。
 */
import { useRef, useState } from "react";
import { btnGhost, btnPrimary } from "../ui-styles";

const TEXT_EXTS = [".txt", ".md", ".csv", ".json"];
const B64_EXTS = [
  ".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".doc", ".docx", ".xls", ".xlsx",
  ".mp3", ".wav", ".m4a", ".ogg", ".webm", ".flac", ".aac", ".wma",
  ".mp4", ".mov", ".avi", ".mkv", ".wmv", ".flv", ".mts", ".ts",
];

export const FILE_ACCEPT = [
  ...TEXT_EXTS, ".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".doc", ".docx", ".xls", ".xlsx",
  ".mp3", ".wav", ".m4a", ".ogg", ".webm", ".flac", ".aac", ".wma",
  ".mp4", ".mov", ".avi", ".mkv", ".wmv", ".flv", ".mts", ".ts",
].join(",");

export function useFileUploads() {
  const [files, setFiles] = useState<File[]>([]);
  const [fileTexts, setFileTexts] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<FileList | null>(null);
  const [showFileWarning, setShowFileWarning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFiles = async (selected: FileList) => {
    setUploading(true);
    const fileArr = Array.from(selected);
    const texts: string[] = [];
    for (const file of fileArr) {
      try {
        texts.push(await readFileContent(file));
      } catch {
        texts.push(`[无法读取: ${file.name}]`);
      }
    }
    setFiles((prev) => [...prev, ...fileArr]);
    setFileTexts((prev) => [...prev, ...texts]);
    setUploading(false);
  };

  /** 文件选择入口 — 非纯文本文件先弹安全确认 */
  const handleFiles = async (selected: FileList | null) => {
    if (!selected || selected.length === 0) return;
    const hasNonText = Array.from(selected).some(
      (f) => !TEXT_EXTS.some((ext) => f.name.toLowerCase().endsWith(ext)),
    );
    if (hasNonText) {
      setPendingFiles(selected);
      setShowFileWarning(true);
      return;
    }
    await processFiles(selected);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setFileTexts((prev) => prev.filter((_, i) => i !== index));
  };

  const clearFiles = () => {
    setFiles([]);
    setFileTexts([]);
  };

  /** PHI 安全确认弹窗 — 需要时渲染( unconditional render 也可,内部按 showFileWarning 判断) */
  const fileWarningDialog = showFileWarning ? (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "var(--color-surface)", borderRadius: 12, padding: 24, maxWidth: 420, boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
        <h4 style={{ margin: "0 0 8px" }}>⚠️ 数据安全提示</h4>
        <p style={{ fontSize: 13, lineHeight: 1.7, margin: 0 }}>
          上传的文件(PDF/图片/音频/文档)将以 <strong>base64 编码</strong>发送给你配置的 LLM 服务商
          (如 DeepSeek / Anthropic / OpenAI 等)。
        </p>
        <ul style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "8px 0", paddingLeft: 18 }}>
          <li>文件内容会离开你的浏览器</li>
          <li>请勿上传含客户隐私信息(PHI)的文件</li>
          <li>纯文本文件(.txt/.md/.csv/.json)同样会发送</li>
        </ul>
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button type="button" onClick={() => {
            setShowFileWarning(false);
            if (pendingFiles) { void processFiles(pendingFiles); setPendingFiles(null); }
          }} style={{ ...btnPrimary, flex: 1 }}>我已知晓,继续上传</button>
          <button type="button" onClick={() => { setShowFileWarning(false); setPendingFiles(null); }} style={{ ...btnGhost, flex: 1 }}>取消</button>
        </div>
      </div>
    </div>
  ) : null;

  return { files, fileTexts, uploading, fileInputRef, handleFiles, removeFile, clearFiles, fileWarningDialog };
}

/** 读取上传文件的文本内容(非文本 → base64 data URL,截断 120KB) */
async function readFileContent(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (TEXT_EXTS.some((ext) => name.endsWith(ext))) {
    return await file.text();
  }
  if (B64_EXTS.some((ext) => name.endsWith(ext))) {
    const b64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1] || "");
      reader.onerror = () => reject(new Error("读取失败"));
      reader.readAsDataURL(file);
    });
    const mime = file.type || "application/octet-stream";
    const isAudio = name.match(/\.(mp3|wav|m4a|ogg|flac|aac|wma)$/i);
    const isVideo = name.match(/\.(mp4|mov|avi|mkv|wmv|flv|mts|ts|webm)$/i);
    const label = isVideo ? "base64视频" : isAudio ? "base64音频" : "base64图片/文档";
    const hint = isAudio
      ? `\n提示: 音频文件。支持的模型可转录。`
      : isVideo
      ? `\n提示: 视频文件(前120KB)。支持的模型可提取关键帧。大文件建议先用外部工具转写。`
      : "";
    return `[${label}: data:${mime};base64,${b64.slice(0, 120000)}] (原始: ${b64.length} 字符, ${(file.size / 1024 / 1024).toFixed(1)}MB, 文件名: ${file.name})${hint}`;
  }
  try {
    return await file.text();
  } catch {
    return `[无法读取的文件: ${file.name} (${(file.size / 1024).toFixed(1)}KB)]`;
  }
}
