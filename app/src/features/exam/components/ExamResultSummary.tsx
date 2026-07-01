import { EXAM_CATALOG } from "../exam-catalog";
import type { ExamSession } from "../exam.types";
import { CATEGORY_LABELS, type ExamCategory } from "../exam.types";

interface ExamResultSummaryProps {
  session: ExamSession;
}

function formatVal(v: unknown): string {
  if (v === undefined || v === null || v === "") return "—";
  if (typeof v === "boolean") return v ? "阳性" : "阴性";
  return String(v);
}

export function ExamResultSummary({ session }: ExamResultSummaryProps) {
  const itemsByCat = new Map<ExamCategory, Array<{ name: string; left: string; right: string }>>();
  for (const def of EXAM_CATALOG) {
    const result = session.results[def.id];
    if (!result || (!result.left && !result.right && !result.value)) continue;
    const left = result.left !== undefined ? formatVal(result.left) : "";
    const right = result.right !== undefined ? formatVal(result.right) : "";
    const single = result.value !== undefined ? formatVal(result.value) : "";
    const cat = itemsByCat.get(def.category) ?? [];
    cat.push({
      name: def.name,
      left: def.side !== "single" ? left : "",
      right: def.side !== "single" ? right : "",
    });
    if (single && def.side === "single") cat[cat.length - 1].left = single;
    itemsByCat.set(def.category, cat);
  }

  const categories = [...itemsByCat.entries()].filter(([, items]) => items.length > 0);

  if (categories.length === 0) return <div className="empty">暂无查体记录。</div>;

  return (
    <div className="exam-summary">
      {categories.map(([cat, items]) => (
        <div key={cat} className="exam-summary__row">
          <span className="exam-summary__cat">{CATEGORY_LABELS[cat]}:</span>
          {items.map((item, i) => {
            const hasAbnormal =
              item.left !== "正常" && item.left !== "阴性" && item.left !== "—" && item.left !== "" ||
              item.right !== "正常" && item.right !== "阴性" && item.right !== "—" && item.right !== "";
            return (
              <span
                key={i}
                className={`exam-summary__item ${hasAbnormal ? "exam-summary__item--pos" : ""}`}
              >
                {item.name}
                {item.left !== "—" && item.left !== "" ? ` ${item.left}` : ""}
                {item.right !== "—" && item.right !== "" ? ` / ${item.right}` : ""}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}
