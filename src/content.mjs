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
    '', '最初只有 150 行的编程助手，能跑却难维护。我把报错、超时和运行过程理顺，让它不再只能一次性使用。',
    '一句“看看目录”，助手却连续试了十次。问题不是模型没听懂，而是 Windows 和 Linux 把同一段文字读成了不同的东西。',
    '模型给出的占用量只记录上一次对话。我漏算了后来新增的内容，导致该整理旧对话时程序还说“空间足够”。',
    '我原以为命令进了 WSL 就碰不到 Windows 文件，后来才发现 C 盘仍在眼前。我给每次命令划了更小的活动范围。',
    'Esc 让助手停下了，却留下两次没有结果的工具调用。下一句话因此被拒绝，我重新处理了取消后的对话记录。',
    '我把命令关进无网络的环境，却只把规则打印给自己看。助手不知道限制，于是反复尝试根本做不到的事。',
    '模型处理了十几秒，摘要却一个字也没有。我把目标长度当成了 API 硬上限，忘了给正文之前的推理留出额度。'
  ];
  return { slug: `agent-lite-day-${day}`, title, date, markdown, excerpt: descriptions[day] || plainText(markdown).slice(0, 140), category: [4,6].includes(day) ? '沙箱与工具' : [2,3,5,7].includes(day) ? '调试笔记' : 'Agent 工程', tags: ['Python','Agent', ...([4,6].includes(day) ? ['Sandbox'] : ['Runtime'])], series: '构建自己的 Agent', day, status: 'published' };
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
