export { sessionUrl } from './session-url.mjs';
export async function openNavigation({ url, app, embedded, onError }) {
  try {
    if (!url || !/^codex:\/\/threads\/[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(url))
      throw new Error('导航地址不可用');
    if (!embedded) throw new Error('请在 Codex 内嵌看板中打开此链接');
    const result = await app.openLink({ url }, { timeout: 10000 });
    if (result?.isError) throw new Error('Codex 宿主未能打开链接');
    return true;
  } catch (error) {
    onError(error.message);
    return false;
  }
}
export function canOpenNativeFile(app) {
  return Boolean(app.getHostCapabilities?.()?.experimental?.['openai/files']);
}
export async function openNativeFile(app, path) {
  if (!canOpenNativeFile(app)) throw new Error('当前宿主未声明原生文件标签页能力');
  if (typeof path !== 'string' || !path.trim()) throw new Error('文件路径不可用');
  const { z } = await import('zod');
  const result = await app.request(
    { method: 'openai/files/open', params: { path } },
    z.object({ isError: z.boolean().optional() }).passthrough(),
    { timeout: 10000 },
  );
  if (result.isError) throw new Error('宿主未能打开文件标签页');
  return true;
}
