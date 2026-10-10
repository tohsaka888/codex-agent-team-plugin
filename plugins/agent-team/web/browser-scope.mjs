// 团队URL由HTTP按teamId解析宿主root；前端不猜造会话身份。
export function initialBrowserSession(params) {
  return params.get('teamId') ? undefined : params.get('rootSessionId') || undefined;
}
