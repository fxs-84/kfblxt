/**
 * 表单字段可访问性助手 — 负责生成 input/error 的 id 配对,
 * 并根据 error 状态返回正确的 aria-invalid / aria-describedby。
 *
 * 不接管任何业务字段(onChange/value/blur 由调用方继续管理),
 * 这里只产出"如何使用 id 和无障碍属性"的指导。
 */

import { useMemo } from "react";

export interface UseFieldA11yOptions {
  /** 字段名称,会成为 input id 的同名部分。建议保持页面内唯一。 */
  name: string;
  /** 错误文案。null/empty 表示字段当前有效。 */
  error?: string | null | undefined;
}

export interface UseFieldA11yResult {
  /** input 的 id,直接写到 id={...} 或 label 的 htmlFor */
  id: string;
  /** 错误提示元素的 id */
  errorId: string;
  /** 展开到 <input> 标签上的属性 */
  inputProps: {
    id: string;
    "aria-invalid": boolean;
    "aria-describedby"?: string;
  };
  /** 展开到错误提示元素上的属性 */
  errorProps: {
    id: string;
    role: "alert";
  };
}

export function useFieldA11y(options: UseFieldA11yOptions): UseFieldA11yResult {
  const { name, error } = options;

  return useMemo(() => {
    const id = name;
    const errorId = `${name}-error`;
    const hasError = Boolean(error && error.length > 0);
    return {
      id,
      errorId,
      inputProps: {
        id,
        "aria-invalid": hasError,
        ...(hasError ? { "aria-describedby": errorId } : {}),
      },
      errorProps: {
        id: errorId,
        role: "alert",
      },
    };
  }, [name, error]);
}
