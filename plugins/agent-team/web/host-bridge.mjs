import { App, applyHostStyleVariables, applyHostFonts } from '@modelcontextprotocol/ext-apps';
export { applyHostStyleVariables, applyHostFonts };
export { canOpenNativeFile, openNativeFile } from './navigation.mjs';
export const app = new App({ name: 'agent-team-readonly', version: '0.5.0' }, {});
export const browserOnly = false;
