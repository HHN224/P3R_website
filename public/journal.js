const form = document.querySelector('.search-form');
const list = document.querySelector('.post-list');
const rows = [...list.querySelectorAll('.post-row')];
const result = document.createElement('p');
result.className = 'filter-result';
result.hidden = true;
list.before(result);
const empty = document.createElement('div');
empty.className = 'empty-state';
empty.hidden = true;
empty.innerHTML = '<span>NO ENTRIES FOUND</span><h2>暂时没有找到这段记忆。</h2><p>换一个关键词，或看看其他文章。</p><a class="button" href="/journal">查看全部文章 ↗</a>';
list.append(empty);

function render() {
  const params = new URLSearchParams(location.search);
  const q = (params.get('q') || '').slice(0, 200);
  const category = params.get('category') || '';
  const tag = params.get('tag') || '';
  const series = params.get('series') || '';
  form.elements.q.value = q;
  let count = 0;
  for (const row of rows) {
    const matches = (!category || row.dataset.category === category)
      && (!tag || JSON.parse(row.dataset.tags).includes(tag))
      && (!series || row.dataset.series === series)
      && (!q || row.dataset.search.includes(q.toLowerCase()));
    row.hidden = !matches;
    if (matches) count++;
  }
  const filters = [q, tag, series, category].filter(Boolean);
  result.hidden = filters.length === 0;
  result.replaceChildren();
  if (filters.length) {
    result.append(document.createTextNode(`${filters.join(' / ')} · 找到 ${count} 篇 `));
    const clear = document.createElement('a');
    clear.href = '/journal';
    clear.textContent = '清除筛选 ×';
    result.append(clear);
  }
  empty.hidden = count !== 0;
  for (const link of document.querySelectorAll('.filters a')) {
    const linkCategory = new URL(link.href).searchParams.get('category');
    link.classList.toggle('active', linkCategory ? category === linkCategory : !category && !tag && !series);
  }
}
form.addEventListener('submit', event => {
  event.preventDefault();
  const params = new URLSearchParams(location.search);
  const q = form.elements.q.value.trim().slice(0, 200);
  if (q) params.set('q', q); else params.delete('q');
  history.pushState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}`);
  render();
});
addEventListener('popstate', render);
render();
