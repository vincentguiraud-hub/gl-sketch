// Construit dist/index.html (application autonome, un seul fichier) + dist/version.json
import * as esbuild from 'esbuild'; import fs from 'fs';
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const build = new Date().toISOString();
const r = await esbuild.build({ entryPoints: ['src/main.js'], bundle: true, format: 'iife', minify: true, write: false, loader: { '.json': 'json' }, target: 'es2020', legalComments: 'none',
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __APP_BUILD__: JSON.stringify(build) } });
const js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = fs.readFileSync('template.html', 'utf8').replace('<script>/*APP*/</script>', () => '<script>' + js + '</script>');
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/index.html', html);
fs.writeFileSync('dist/version.json', JSON.stringify({ version: pkg.version, build }));
fs.writeFileSync('dist/.nojekyll', '');
if (fs.existsSync('versions.json')) fs.copyFileSync('versions.json', 'dist/versions.json');
console.log('G&L Sketch', pkg.version, '→ dist/index.html', (html.length / 1024).toFixed(0) + ' Ko');
