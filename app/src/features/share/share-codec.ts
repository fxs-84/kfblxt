/**
 * 分享快照编解码 — 将临床数据压缩编码到 URL hash,无需后端即可跨设备查看。
 *
 * URL hash 不上传服务器,不受 GitHub Pages 404 限制,也不依赖 Supabase。
 * 文本临床数据(就诊/诊断/计划/查体)通常 < 3KB,可放入 QR 码。
 * 附件图片 dataUrl 体积过大不入 hash,仅保留文件名/分类等元数据。
 */
import type { ShareSnapshot } from "./share.types";

const VERSION = 1;

/** UTF-8 字符串 → URL-safe base64 */
function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  const bin = String.fromCharCode(...bytes);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** URL-safe base64 → UTF-8 字符串 */
function base64ToUtf8(b64url: string): string {
  let b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export interface EncodedShare {
  snapshot: ShareSnapshot;
  message?: string;
  homework?: string;
  nextVisit?: string; // ISO date string
}

/** 将快照 + 分享元数据编码为 URL-safe base64 字符串(hash 参数) */
export function encodeSnapshot(snapshot: ShareSnapshot, extra?: { message?: string; homework?: string; nextVisit?: Date }): string {
  const compact: Record<string, unknown> = {
    v: VERSION,
    e: snapshot.encounter,
    s: snapshot.sessions,
    d: snapshot.diagnosis,
    p: snapshot.plans,
    a: snapshot.attachments.map((a) => ({
      // 只保留元数据,dataUrl 体积太大不入 hash
      id: a.id,
      c: a.category,
      f: a.fileName,
      t: a.timeline,
      g: a.comparisonGroup,
    })),
  };
  if (extra?.message) compact.m = extra.message;
  if (extra?.homework) compact.h = extra.homework;
  if (extra?.nextVisit) compact.n = extra.nextVisit.toISOString();
  return utf8ToBase64(JSON.stringify(compact));
}

/** 从 URL-safe base64 字符串解码快照 + 分享元数据 */
export function decodeSnapshot(encoded: string): EncodedShare | null {
  try {
    const compact = JSON.parse(base64ToUtf8(encoded));
    if (!compact || compact.v !== VERSION) return null;
    return {
      snapshot: {
        encounter: compact.e ?? null,
        sessions: compact.s ?? [],
        diagnosis: compact.d ?? null,
        plans: (compact.p ?? []).map((p: Record<string, unknown>) => ({
          ...p,
          goals: p.g as string[] | undefined,
        })),
        attachments: (compact.a ?? []).map((a: Record<string, unknown>) => ({
          id: a.id as string,
          category: a.c as string,
          fileName: a.f as string,
          dataUrl: "", // hash 不含图片
          timeline: a.t as string | undefined,
          comparisonGroup: a.g as string | undefined,
        })),
      },
      message: compact.m as string | undefined,
      homework: compact.h as string | undefined,
      nextVisit: compact.n as string | undefined,
    };
  } catch {
    return null;
  }
}
