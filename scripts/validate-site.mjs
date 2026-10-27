import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fail = [];
const sourceFiles = [];
function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (item.name === '.git' || item.name === 'node_modules' || item.name === '.github') continue;
    const full = path.join(dir, item.name);
    if (item.isDirectory()) walk(full);
    else sourceFiles.push(full);
  }
}
walk(root);

for (const file of sourceFiles.filter((f) => /\.(?:js|mjs|cjs)$/.test(f))) {
  const res = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (res.status !== 0) fail.push(`Syntax error in ${path.relative(root, file)}:\n${res.stderr || res.stdout}`);
}
for (const file of sourceFiles.filter((f) => /\.(?:js|mjs)$/.test(f))) {
  const code = fs.readFileSync(file, 'utf8');
  const re = /\b(?:from\s*|import\s*\()\s*['"]([^'"]+)['"]/g;
  for (const match of code.matchAll(re)) {
    const spec = match[1];
    if (!spec.startsWith('.')) continue;
    const target = path.resolve(path.dirname(file), spec);
    if (!fs.existsSync(target)) fail.push(`Missing import in ${path.relative(root, file)}: ${spec}`);
  }
}
try {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  if (!manifest.name || !Array.isArray(manifest.icons) || manifest.icons.length === 0) {
    fail.push('manifest.json needs a name and at least one icon.');
  }
  for (const icon of manifest.icons || []) {
    const iconPath = path.resolve(root, icon.src || '');
    if (!icon.src || !iconPath.startsWith(root + path.sep) || !fs.existsSync(iconPath)) {
      fail.push(`Missing or unsafe PWA icon path: ${icon.src}`);
    }
  }
} catch (e) {
  fail.push(`Invalid manifest.json: ${e.message}`);
}
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const ref of index.matchAll(/(?:src|href)="([^"]+)"/g)) {
  const value = ref[1];
  if (/^(?:https?:|data:|#|\/\/|mailto:)/i.test(value)) continue;
  const filePath = path.resolve(root, value.split(/[?#]/)[0]);
  if (!filePath.startsWith(root + path.sep) || !fs.existsSync(filePath)) {
    fail.push(`Missing HTML asset: ${value}`);
  }
}
const sql = fs.readFileSync(path.join(root, 'supabase/schema.sql'), 'utf8');
for (const table of ['profiles', 'seasons', 'teams', 'players', 'matches', 'match_events', 'news', 'gallery', 'messages', 'fan_predictions', 'newsletter_subscribers', 'posts', 'post_comments', 'post_likes', 'push_subscriptions', 'admin_audit', 'reports', 'user_warnings', 'mvp_votes', 'match_comments']) {
  if (!new RegExp(`create table if not exists public\\.${table}\\b`, 'i').test(sql)) fail.push(`SQL schema missing table declaration: ${table}`);
}
// Verify frontend data calls against schema.sql and all migrations / Edge Functions.
const sqlAll = [sql, ...fs.readdirSync(path.join(root, 'supabase/migrations'))
  .filter((f) => f.endsWith('.sql'))
  .map((f) => fs.readFileSync(path.join(root, 'supabase/migrations', f), 'utf8'))].join('\n');
const frontendCode = sourceFiles.filter((f) => /\.(?:js|mjs)$/.test(f) && f.includes(`${path.sep}js${path.sep}`))
  .map((f) => fs.readFileSync(f, 'utf8')).join('\n');
const referencedTables = new Set([...frontendCode.matchAll(/(?<!storage)\.from\(\s*['"]([a-z_]+)['"]\s*\)/g)].map((m) => m[1]));
for (const table of referencedTables) {
  if (!new RegExp(`create\\s+(?:table|(?:or\\s+replace\\s+)?view)\\s+(?:if\\s+not\\s+exists\\s+)?(?:public\\.)?${table}\\b`, 'i').test(sqlAll)) {
    fail.push(`Frontend uses table/view not declared in SQL: ${table}`);
  }
}
for (const [, rpc] of frontendCode.matchAll(/\.rpc\(\s*['"]([a-z_0-9]+)['"]/g)) {
  if (!new RegExp(`function\\s+(?:public\\.)?${rpc}\\s*\\(`, 'i').test(sqlAll)) fail.push(`Frontend calls RPC not defined in SQL: ${rpc}`);
}
for (const [, fn] of frontendCode.matchAll(/\.functions\.invoke\(\s*['"]([a-z-]+)['"]/g)) {
  if (!fs.existsSync(path.join(root, 'supabase/functions', fn, 'index.ts'))) fail.push(`Frontend invokes missing edge function: ${fn}`);
}

const sitemapPath = path.join(root, 'sitemap.xml');
const robotsPath = path.join(root, 'robots.txt');
if (!fs.existsSync(sitemapPath)) fail.push('Missing sitemap.xml.');
if (!fs.existsSync(robotsPath)) fail.push('Missing robots.txt.');
if (fs.existsSync(sitemapPath)) {
  const sitemap = fs.readFileSync(sitemapPath, 'utf8');
  if (!sitemap.includes('https://vojintesanovic0-dot.github.io/medjasi-futsal-liga-v2/')) fail.push('sitemap.xml does not contain the published Pages URL.');
}
if (fs.existsSync(robotsPath) && !fs.readFileSync(robotsPath, 'utf8').includes('sitemap.xml')) {
  fail.push('robots.txt must include the sitemap URL.');
}

if (fail.length) {
  console.error(fail.join('\n\n'));
  process.exit(1);
}
console.log(`Site validation passed. Checked ${sourceFiles.filter((f) => /\.(?:js|mjs|cjs)$/.test(f)).length} JavaScript files, imports, HTML assets, PWA icons, and required SQL tables.`);
