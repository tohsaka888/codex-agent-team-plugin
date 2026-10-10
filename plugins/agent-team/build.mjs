import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { Script } from 'node:vm';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFile(resolve(here, name), 'utf8');
const webOnly = process.argv.includes('--web-only');
for (const standalone of webOnly ? [true] : [false, true]) {
  const source = await read('web/board.mjs');
  const importEnd = source.match(/^(?:import[\s\S]*?;\r?\n)+/)[0].length;
  // 使用经典脚本并将异步初始化包在函数中，避免依赖 iframe 的模块加载策略。
  const wrapped =
    source.slice(0, importEnd) +
    '\n(async () => {\n' +
    source.slice(importEnd) +
    '\n})().catch(error => { document.getElementById("bridge").textContent = "脚本初始化失败：" + error.message; });';
  const result = await build({
    stdin: {
      contents: wrapped,
      resolveDir: resolve(here, 'web'),
      sourcefile: 'board.mjs',
      loader: 'js',
    },
    plugins: standalone
      ? [
          {
            name: 'browser-bridge',
            setup(builder) {
              builder.onResolve({ filter: /host-bridge\.mjs$/ }, () => ({
                path: resolve(here, 'web/browser-bridge.mjs'),
              }));
            },
          },
        ]
      : [],
    metafile: true,
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    minify: true,
  });
  const output = resolve(here, standalone ? 'dist/web' : 'dist');
  await mkdir(output, { recursive: true });
  if (
    standalone &&
    Object.keys(result.metafile.inputs).some((name) => name.includes('node_modules'))
  )
    throw new Error('独立浏览器意外导入第三方宿主依赖');
  const polish = (await read('web/polish.css')) + '\n' + (await read('web/timeline.css'));
  const base = await read('web/base.css');
  const shell = (await read('web/board.html'))
    .replace('<!-- BASE_STYLE -->', () => `<style>${base}</style>`)
    .replace('<!-- POLISH -->', () => `<style>${polish}</style>`);
  // replacement 字符串会将 bundle 中的 $&、$`、$' 当成替换指令，破坏脚本。
  const html = shell.replace(
    '<!-- BUNDLE -->',
    () => `<script>${result.outputFiles[0].text.replaceAll('</script', '<\\/script')}</script>`,
  );
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  if (scripts.length !== 1 || html.includes('<!-- BUNDLE -->'))
    throw new Error('HTML bundle injection failed');
  new Script(scripts[0][1], { filename: 'board.bundle.js' });
  await writeFile(resolve(output, 'board.html'), html);
  console.log('Built ' + resolve(output, 'board.html'));
}
for (const entry of ['web-server.mjs', 'open-web.mjs']) {
  await build({
    entryPoints: [resolve(here, entry)],
    outfile: resolve(here, 'dist/web', entry),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    plugins: [
      {
        name: 'portable-only',
        setup(builder) {
          builder.onResolve({ filter: /(?:readonly-state|execution-document)\.mjs$/ }, () => ({
            path: resolve(here, 'standalone-unavailable.mjs'),
          }));
        },
      },
    ],
  });
}
await writeFile(
  resolve(here, 'dist/web/package.json'),
  JSON.stringify(
    {
      name: 'agent-team-web',
      private: true,
      type: 'module',
      scripts: { start: 'node web-server.mjs', open: 'node open-web.mjs' },
    },
    null,
    2,
  ),
);
