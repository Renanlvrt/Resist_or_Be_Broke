// Reproducible previews from the actual Vue components. These are not browser screenshots.
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
const server = await createServer({ configFile: false, plugins: [vue()], server: { middlewareMode: true }, appType: 'custom' });
await mkdir('artifacts', { recursive: true });
try {
  const { default: Dashboard } = await server.ssrLoadModule('/components/Dashboard.vue');
  const markup = await renderToString(createSSRApp(Dashboard));
  const css = await readFile('components/style.css', 'utf8');
  await writeFile('artifacts/monthly-recap.html', `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pocket — actual recap component preview</title><style>body{margin:0;background:#70716d}${css}</style></head><body><div class="pocket-root">${markup}</div><script>document.querySelector('button').onclick=()=>document.querySelector('.dashboard').remove()</script></body></html>`);
  const { default: Bloub } = await server.ssrLoadModule('/components/BloubBot.vue');
  let icon = await renderToString(createSSRApp(Bloub, { shape: 'hexagone', color: 'ambre', expression: 'attentif', state: 'idle', frozenAt: 1, size: 128, follow: false }));
  icon = icon.replaceAll('viewbox=', 'viewBox=').replace(/\s(data-[\w-]+)(?=\s|>)/g, ' $1=""');
  icon = icon.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ').replace('viewBox="-158 -158 316 316"', 'viewBox="-112 -112 224 224"');
  await writeFile('artifacts/bloub-icon.svg', icon);
  let tiles = '';
  const backgrounds = ['#FFFFFF', '#929292', '#436487', '#171717'];
  for (let i = 0; i < backgrounds.length; i++) {
    const x = i * 280;
    let svg = await renderToString(createSSRApp(Bloub, { shape: 'hexagone', color: 'ambre', expression: 'attentif', state: 'idle', frozenAt: 1, size: 240, follow: false }));
    svg = svg.replaceAll('viewbox=', 'viewBox=');
    svg = svg.replace(/\s(data-[\w-]+)(?=\s|>)/g, ' $1=""');
    svg = svg.replace('<svg ', '<svg x="20" y="30" ');
    tiles += `<g transform="translate(${x} 0)"><rect width="280" height="310" fill="${backgrounds[i]}"/>${svg}<text x="140" y="288" text-anchor="middle" font-family="Arial" font-size="12" fill="${i < 2 ? '#333333' : '#FFFFFF'}">${backgrounds[i]}</text></g>`;
  }
  await writeFile('artifacts/bloub-backgrounds.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="310" viewBox="0 0 1120 310">${tiles}</svg>`);
  console.log('Created artifacts/monthly-recap.html and artifacts/bloub-backgrounds.svg from the actual Vue components.');
} finally { await server.close(); }
