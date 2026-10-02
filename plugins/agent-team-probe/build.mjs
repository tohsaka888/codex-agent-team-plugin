import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { Script } from 'node:vm';
const source = await readFile('web/board.mjs', 'utf8');
const importEnd = source.match(/^(?:import[^\n]*\n)+/)[0].length;
// 使用经典脚本并将异步初始化包在函数中，避免依赖 iframe 的模块加载策略。
const wrapped = source.slice(0, importEnd) + '\n(async () => {\n' + source.slice(importEnd) + '\n})().catch(error => { document.getElementById("bridge").textContent = "脚本初始化失败：" + error.message; });';
const result = await build({ stdin: { contents: wrapped, resolveDir: process.cwd() + '/web', sourcefile: 'board.mjs', loader: 'js' }, bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2022', minify: true });
await mkdir('dist', { recursive: true });
const polish = await readFile('web/polish.css','utf8');
const shell = (await readFile('web/board.html', 'utf8')).replace('<!-- POLISH -->',()=>'<style>'+polish+'</style>');
// replacement 字符串会将 bundle 中的 $&、$`、$' 当成替换指令，破坏脚本。
const html = shell.replace('<!-- BUNDLE -->', () => `<script>${result.outputFiles[0].text.replaceAll('</script', '<\\/script')}</script>`);
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
if (scripts.length !== 1 || html.includes('<!-- BUNDLE -->')) throw new Error('HTML bundle injection failed');
new Script(scripts[0][1], { filename: 'board.bundle.js' });
await writeFile('dist/board.html', html);
console.log('Built dist/board.html');
