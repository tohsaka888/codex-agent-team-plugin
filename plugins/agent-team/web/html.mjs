// 模板换行按 HTML 普通空白处理，保留属性与文本之间的分隔。
// 动态文本须由调用者 escapeHtml；已渲染片段保持原样。
export function html(strings, ...values) {
  return strings.reduce((result, part, index) => {
    const markup = part.replace(/\r?\n[\t ]*/g, ' ');
    return result + markup + (index < values.length ? String(values[index]) : '');
  }, '');
}
