import { getProfileById } from "../../lib/profiles";

interface MyFilterToggleProps {
  /** 是否启用"我创建的"过滤 */
  active: boolean;
  /** 切换回调 */
  onChange: (next: boolean) => void;
  /** 当前治疗师显示名(用于在标签里展示) */
  therapistName?: string;
  /** 总记录数(用于显示对比) */
  totalCount?: number;
  /** 过滤后记录数 */
  filteredCount?: number;
  /** 紧凑模式(不带数字,只一个开关) */
  compact?: boolean;
}

/**
 * 复用"我创建的"过滤开关。
 * 用法:
 *   const [onlyMine, setOnlyMine] = useState(false);
 *   <MyFilterToggle active={onlyMine} onChange={setOnlyMine} />
 */
export function MyFilterToggle({
  active,
  onChange,
  therapistName,
  totalCount,
  filteredCount,
  compact = false,
}: MyFilterToggleProps) {
  const label = therapistName
    ? `只看 ${therapistName} 的`
    : "我创建的";

  return (
    <label
      className={`my-filter ${active ? "my-filter--active" : ""} ${compact ? "my-filter--compact" : ""}`}
      title="只显示当前治疗师创建的记录"
    >
      <input
        type="checkbox"
        checked={active}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="my-filter__label">{label}</span>
      {!compact && totalCount !== undefined && filteredCount !== undefined && (
        <span className="my-filter__count">
          {filteredCount}/{totalCount}
        </span>
      )}
    </label>
  );
}

/** 工具函数:根据 onlyMine 标志和当前 session 过滤 createdBy */
export function applyMyFilter<T extends { createdBy?: string }>(
  items: T[],
  onlyMine: boolean,
  currentUserId: string,
): T[] {
  if (!onlyMine) return items;
  return items.filter((it) => it.createdBy === currentUserId);
}

/** 工具:统计当前治疗师今日创建数 */
export function countCreatedToday<T extends { createdAt: Date | string }>(
  items: T[],
  currentUserId: string,
  getAuthor: (it: T) => string | undefined,
): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return items.filter((it) => {
    if (getAuthor(it) !== currentUserId) return false;
    const t = typeof it.createdAt === "string" ? new Date(it.createdAt).getTime() : it.createdAt.getTime();
    return t >= start;
  }).length;
}

/** 工具:把 userId 解析为 displayName(找不到时返回"未指定") */
export function resolveName(userId: string | undefined | null): string {
  return getProfileById(userId)?.fullName ?? "未指定";
}
