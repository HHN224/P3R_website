import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ejs from 'ejs';
import { escapeHtml, minutes, renderMarkdown, validatePost } from '../src/content.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist');
const manifest = JSON.parse(readFileSync(path.join(root, 'content/posts.json'), 'utf8'));
const seen = new Set();
const all = manifest.posts.map(({ file, ...metadata }) => {
  if (!file || path.basename(file) !== file || !file.endsWith('.md')) throw new Error(`无效的文章文件名：${file}`);
  const markdown = readFileSync(path.join(root, 'content', file), 'utf8').replace(/^# .+\r?\n+/, '');
  const post = validatePost({ ...metadata, markdown });
  if (seen.has(post.slug)) throw new Error(`重复的网址标识：${post.slug}`);
  seen.add(post.slug);
  return { ...post, minutes: minutes(markdown) };
});
const posts = all.filter(p => p.status === 'published').sort((a, b) => b.date.localeCompare(a.date) || b.day - a.day);
const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
const configuredUrl = process.env.SITE_URL || (vercelHost ? `https://${vercelHost}` : 'http://localhost:3000');
const siteUrl = new URL(configuredUrl).origin;
const site = {
  url: siteUrl,
  owner: process.env.SITE_OWNER || 'OMEN',
  name: 'AFTER SCHOOL',
  description: '记录代码、问题，以及把想法做出来的过程。',
  navigateAudio: audioPath('SFX_NAVIGATE'),
  confirmAudio: audioPath('SFX_CONFIRM')
};
function audioPath(name) {
  const value = process.env[name] || '';
  return /^\/audio\/[\w.-]+\.(ogg|wav|mp3)$/.test(value) && existsSync(path.join(root, 'public', value)) ? value : '';
}
const withBase = p => p;
const postUrl = p => `/journal/${p.slug}`;
function write(relative, content) {
  const target = path.join(out, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
}
function render(page, relative, data = {}) {
  const filename = path.join(root, 'views', `${page}.ejs`);
  const html = ejs.render(readFileSync(filename, 'utf8'), {
    title: '深蓝时刻', description: site.description, canonical: '', section: '',
    site, base: '', withBase, postUrl, escapeHtml, ...data
  }, { filename });
  write(relative, html);
}

rmSync(out, { recursive: true, force: true });
cpSync(path.join(root, 'public'), out, { recursive: true });
rmSync(path.join(out, 'admin.js'), { force: true });
render('home', 'index.html', { canonical: '/', latest: posts[0], count: posts.length });
render('journal', 'journal/index.html', {
  title: '文章手记', canonical: '/journal', section: 'journal', posts, all: posts,
  categories: [...new Set(posts.map(p => p.category))], q: '', category: '', tag: '', series: '', staticJournal: true
});
for (const post of posts) {
  const peers = posts.filter(p => p.series && p.series === post.series).sort((a, b) => a.day - b.day);
  render('article', `journal/${post.slug}.html`, {
    title: post.title, description: post.excerpt, canonical: postUrl(post), section: 'journal',
    post, ...renderMarkdown(post.markdown), peers
  });
}
render('archive', 'archive.html', { title: '时间归档', canonical: '/archive', section: 'archive', posts });
for (const [route, title, kind, section] of [
  ['projects', '作品与实验', 'projects', 'projects'],
  ['about', '关于这里', 'about', 'about'],
  ['credits', '素材与参考', 'credits', '']
]) render('page', `${route}.html`, { title, canonical: `/${route}`, kind, section });
render('admin-static', 'admin.html', { title: '写作空间', canonical: '/admin' });
render('page', '404.html', { title: '这一页还没有被记录', kind: '404' });

const absolute = route => `${siteUrl}${route}`;
const items = posts.slice(0, 30).map(p => `<item><title>${escapeHtml(p.title)}</title><link>${absolute(postUrl(p))}</link><guid>${absolute(postUrl(p))}</guid><pubDate>${new Date(`${p.date}T00:00:00Z`).toUTCString()}</pubDate><description>${escapeHtml(p.excerpt)}</description></item>`).join('');
write('feed.xml', `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>AFTER SCHOOL · ${escapeHtml(site.owner)}</title><link>${siteUrl}</link><description>${escapeHtml(site.description)}</description>${items}</channel></rss>`);
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['/', '/journal', '/archive', '/projects', '/about', ...posts.map(postUrl)].map(route => `<url><loc>${escapeHtml(absolute(route))}</loc></url>`).join('')}</urlset>`);
write('robots.txt', `User-agent: *\nAllow: /\nDisallow: /admin\nSitemap: ${absolute('/sitemap.xml')}\n`);
console.log(`已生成 ${posts.length} 篇文章和站点页面 → ${out}`);
