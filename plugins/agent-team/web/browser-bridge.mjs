export const app = {};
export const browserOnly = true;
export const applyHostStyleVariables = () => {};
export const applyHostFonts = () => {};
export const canOpenNativeFile = () => false;
export const openNativeFile = async () => {
  throw new Error('独立网页未接入宿主文件导航');
};
