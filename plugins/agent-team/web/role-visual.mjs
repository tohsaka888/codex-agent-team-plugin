import { html } from './html.mjs';
// 展示配色只来自职责白名单；未知职责不推断执行配置或状态。
const shapes = {
  UE: html`
    <rect class="icon-fill" x="3" y="4" width="18" height="16" rx="3" />
    <path d="M3 9h18M8 9v11" />
    <path class="icon-accent" d="m12 16 5-5 2 2-5 5h-2v-2Z" />
  `,
  Coordinator: html`
    <rect class="icon-fill" x="8" y="3" width="8" height="6" rx="2" />
    <path d="M12 9v5M5 17v-3h14v3" />
    <rect x="2" y="17" width="6" height="4" rx="1" />
    <rect x="16" y="17" width="6" height="4" rx="1" />
  `,
  Architect: html`
    <path class="icon-fill" d="m12 3 9 5-9 5-9-5 9-5Z" />
    <path d="m3 12 9 5 9-5M3 16l9 5 9-5" />
  `,
  Developer: html`
    <path d="m8 6-6 6 6 6m8-12 6 6-6 6" />
    <path class="icon-accent" d="m13 3-2 18" />
  `,
  Requirements: html`
    <rect class="icon-fill" x="5" y="3" width="14" height="18" rx="3" />
    <path d="M9 8h6M9 12h6" />
    <path class="icon-accent" d="M9 16h4" />
  `,
  Reviewer: html`
    <path class="icon-fill" d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6l8-4Z" />
    <path class="icon-accent" d="m8 12 3 3 5-6" />
  `,
};
const primaryRole = (role) => {
  const primary = String(role || '')
    .split('/')[0]
    .trim()
    .toLowerCase();
  return Object.keys(shapes).find((name) => name.toLowerCase() === primary) || null;
};
export const roleClass = (role) => primaryRole(role)?.toLowerCase() || 'unknown';
export function roleIcon(role) {
  const primary = primaryRole(role);
  return html`
    <span class="role-glyph role-${roleClass(role)}" aria-hidden="true">
      <svg
        class="role-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.65"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        ${
          primary
            ? shapes[primary]
            : html`
                <circle class="icon-fill" cx="12" cy="8" r="4" />
                <path d="M4 22v-2a8 8 0 0 1 16 0v2" />
              `
        }
      </svg>
    </span>
  `;
}
