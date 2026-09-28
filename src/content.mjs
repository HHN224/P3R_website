import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';

export const escapeHtml = (s = '') => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const md = new MarkdownIt({ html: false, linkify: true, typographer: false, highlight(code, lang) {
  return lang && hljs.getLanguage(lang) ? hljs.highlight(code, { language: lang, ignoreIllegals: true }).value : escapeHtml(code);
}});
export function renderMarkdown(markdown) {
  const tokens = md.parse(markdown, {});
  const toc = [];
  let n = 0;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type === 'heading_open') {
      const id = `section-${++n}`;
      tokens[i].attrSet('id', id);
      if (['h2', 'h3'].includes(tokens[i].tag)) toc.push({ id, title: tokens[i + 1].content.replace(/[`*]/g, ''), level: tokens[i].tag });
    }
    if (tokens[i].type === 'inline') for (const t of tokens[i].children || []) {
      if (t.type === 'image') { t.attrSet('loading', 'lazy'); t.attrSet('decoding', 'async'); }
    }
  }
  return { html: md.renderer.render(tokens, md.options, {}), toc };
}
export function plainText(s) { return s.replace(/```[\s\S]*?```/g, '').replace(/[#>*_`\[\]]/g, '').replace(/\s+/g, ' ').trim(); }
export function minutes(s) { return Math.max(1, Math.ceil(s.length / 650)); }
export function importedPost(filename, source) {
  const day = Number(filename.match(/Day(\d+)/)?.[1] || 0);
  const title = source.match(/^# (.+)/m)?.[1] || filename;
  const date = source.match(/日期：(\d{4}-\d{2}-\d{2})/)?.[1] || '2026-01-01';
  const markdown = source.replace(/^# .+\r?\n+/, '');
  const descriptions = [
    '', '把一个 150 行的教学脚本拆成可复用、可单步、可中止的 Agent Runtime。',
    '从 Windows 的 GBK 到容器里的 UTF-8，追踪一次让 Agent 耗尽轮数的编码问题。',
    '上下文窗口看似还有余量，计量却悄悄漏掉增长。一次关于锚点与增量的排查。',
    '重新理解 WSL 的安全边界，用 Bubblewrap 为工具建立真正的文件系统隔离。',
    '一次 Esc 取消打断了消息历史：让中止操作与完整的对话状态和平共处。',
    '把已知的环境约束告诉模型，让它少一点盲目试错，多一点有效行动。'
  ];
  return { slug: `agent-lite-day-${day}`, title, date, markdown, excerpt: descriptions[day] || plainText(markdown).slice(0, 140), category: [4,6].includes(day) ? '沙箱与工具' : [2,3,5].includes(day) ? '调试笔记' : 'Agent 工程', tags: ['Python','Agent', ...([4,6].includes(day) ? ['Sandbox'] : ['Runtime'])], series: '构建自己的 Agent', day, status: 'published' };
}
export function validatePost(input) {
  const strings = ['slug','title','date','markdown','excerpt','category','series','status'];
  const p = Object.fromEntries(strings.map(k => [k, typeof input[k] === 'string' ? input[k].trim() : '']));
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.slug) || p.slug.length > 100) throw new Error('网址标识需为 1–100 位小写字母、数字和连字符。');
  if (!p.title || p.title.length > 200 || !p.markdown || p.markdown.length > 500000) throw new Error('标题不能为空且最多 200 字；正文不能为空且最多 500,000 字。');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date) || !Number.isFinite(Date.parse(p.date)) || new Date(p.date).toISOString().slice(0,10) !== p.date) throw new Error('请选择有效日期。');
  if (!['draft','published'].includes(p.status)) throw new Error('状态应为 draft 或 published。');
  p.category ||= '随笔';
  p.excerpt ||= plainText(p.markdown).slice(0, 140);
  if (p.category.length > 40 || p.series.length > 80 || p.excerpt.length > 500) throw new Error('分类、系列或摘要过长。');
  p.tags = Array.isArray(input.tags) ? [...new Set(input.tags.map(String).map(s=>s.trim()).filter(Boolean))] : [];
  if (p.tags.length > 12 || p.tags.some(t => t.length > 30)) throw new Error('最多 12 个标签，每个不超过 30 字。');
  p.day = Number(input.day || 0);
  if (!Number.isInteger(p.day) || p.day < 0 || p.day > 9999) throw new Error('系列顺序需为 0–9999 的整数。');
  return p;
}
