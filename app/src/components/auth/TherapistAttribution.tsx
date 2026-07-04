import { useProfile, ROLE_LABEL } from "../../lib/profiles";

interface TherapistAttributionProps {
  /** 治疗师 userId(由 createdBy/updatedBy 字段提供) */
  userId: string | undefined | null;
  /** 显示时间(createdAt 或 updatedAt) */
  at?: Date | string | null;
  /** 上下文标签,如"创建"、"最后更新"、"操作" */
  label?: string;
  /** 紧凑模式:行内显示 */
  compact?: boolean;
}

/**
 * 治疗师归属展示:
 * - 默认显示"由 张医师 创建 · 2 小时前"
 * - 没有 userId 时显示"未指定"
 */
export function TherapistAttribution({
  userId,
  at,
  label = "创建",
  compact = false,
}: TherapistAttributionProps) {
  const profile = useProfile(userId);
  const time = at ? formatRelativeTime(at) : null;

  if (!profile) {
    return (
      <span className={`attribution attribution--empty ${compact ? "attribution--compact" : ""}`}>
        {label}: <em>未指定</em>
        {time && <> · <span className="attribution__time">{time}</span></>}
      </span>
    );
  }

  return (
    <span className={`attribution ${compact ? "attribution--compact" : ""}`}>
      {label}: <strong>{profile.fullName}</strong>
      <span className="attribution__role">·{ROLE_LABEL[profile.role]}</span>
      {time && <> · <span className="attribution__time">{time}</span></>}
    </span>
  );
}

function formatRelativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  if (diff < 30 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`;
  return d.toLocaleDateString("zh-CN");
}
