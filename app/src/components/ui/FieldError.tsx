/**
 * FieldError — 字段级错误提示组件。
 *
 * 职责单一:渲染一个 role=alert 的 span,供 <input> 通过 aria-describedby 关联。
 * 业务 error 文案为空时,渲染 null。
 */

interface FieldErrorProps {
  /** 错误提示元素的 id,与 input 的 aria-describedby 指向同一字符串 */
  id: string;
  /** 错误文案。为空/falsy 时不渲染。 */
  message?: string | null | undefined;
}

export function FieldError({ id, message }: FieldErrorProps): React.ReactNode {
  if (!message) return null;
  return (
    <span id={id} role="alert" className="field__error">
      {message}
    </span>
  );
}
