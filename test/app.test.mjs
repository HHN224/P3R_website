import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { createApp, normalizeBasePath } from '../src/app.mjs';
import { createStore } from '../src/store.mjs';
import { renderMarkdown, importedPost } from '../src/content.mjs';

test('文章导入、发布权限、持久化及公共输出', async t=>{
  const dir=mkdtempSync(path.join(tmpdir(),'after-school-test-'));
  const password='only-for-tests-long-password';
  const {app,store}=createApp({dataDir:dir,password,siteUrl:'http://localhost:3000',basePath:''});
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  let cookie='';
  const request=(url,method='GET',body,origin='http://localhost:3000',useCookie=true)=>fetch(base+url,{method,headers:{...(useCookie&&cookie?{Cookie:cookie}:{}),...(method!=='GET'?{Origin:origin,'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  try{
    await t.test('完整导入六篇，原日期正文不丢失',()=>{
      assert.equal(store.list().length,6);
      for(const filename of readdirSync('content')){const source=readFileSync(path.join('content',filename),'utf8');const p=importedPost(filename,source);assert.equal(store.get(p.slug).markdown,p.markdown);assert.equal(store.get(p.slug).date,p.date);}
    });
    await t.test('所有公开页面、搜索、订阅与真实 404',async()=>{
      for(const url of ['/','/journal','/archive','/projects','/about','/credits','/admin','/feed.xml','/sitemap.xml','/robots.txt',...store.list().map(p=>`/journal/${p.slug}`)]){const r=await request(url);assert.equal(r.status,200,url);}
      const found=await (await request('/journal?q=Bubblewrap')).text();assert.match(found,/agent-lite-day-4/);
      const absent=await (await request('/journal?q=definitely-no-results-123')).text();assert.match(absent,/NO ENTRIES FOUND/);
      assert.equal((await request('/journal/does-not-exist')).status,404);
      assert.equal((await request('/blog/journal')).status,404,'未设置 BASE_PATH 时不应在 /blog 下提供服务');
      const home=await (await request('/')).text();
      assert.match(home,/data-base=""/);
      for(const value of [...home.matchAll(/(?:href|src|action)="([^"]*)"/g)].map(m=>m[1])) assert.doesNotMatch(value,/^\/blog/);
      const range=await fetch(base+'/assets/p3r-background.mp4',{headers:{Range:'bytes=0-1023'}});assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,1024);
    });
    await t.test('写入与导出需要身份；跨站登录遭拒绝',async()=>{
      assert.equal((await request('/api/admin/posts','POST',{})).status,401);
      assert.equal((await request('/api/admin/uploads','POST',{})).status,401);
      assert.equal((await request('/api/admin/export')).status,401);
      assert.equal((await request('/api/login','POST',{password},'https://evil.invalid')).status,403);
      assert.equal((await request('/api/login','POST',{password:'wrong'})).status,401);
      const r=await request('/api/login','POST',{password});assert.equal(r.status,200);cookie=r.headers.get('set-cookie').split(';')[0];assert.match(r.headers.get('set-cookie'),/HttpOnly/);assert.match(r.headers.get('set-cookie'),/SameSite=Strict/);
    });
    let p={slug:'test-new-entry',title:'测试文章 <script>alert(1)</script>',markdown:'## 标题\n\n正文\n\n<script>alert(1)</script>\n\n[不安全链接](javascript:alert(1))',date:'2026-09-22',category:'测试',tags:['测试'],series:'',day:0,excerpt:'测试摘要',status:'draft'};
    await t.test('草稿不可公开访问；发布即进入列表与订阅',async()=>{
      const r=await request('/api/admin/posts','POST',p);assert.equal(r.status,201);p=await r.json();
      assert.equal((await request('/journal/test-new-entry')).status,404);
      assert.doesNotMatch(await(await request('/feed.xml')).text(),/test-new-entry/);
      assert.equal((await request('/api/admin/posts','POST',p)).status,409);
      const publish=await request('/api/admin/posts/test-new-entry','PUT',{...p,status:'published'});assert.equal(publish.status,200);p=await publish.json();
      const publicPage=await(await request('/journal/test-new-entry')).text();assert.match(publicPage,/&lt;script&gt;/);assert.doesNotMatch(publicPage,/<script>alert|href="javascript:/);
      assert.match(await(await request('/feed.xml')).text(),/test-new-entry/);
      assert.match(await(await request('/sitemap.xml')).text(),/test-new-entry/);
    });
    await t.test('防止并发覆盖、非法标识与跨站修改',async()=>{
      assert.equal((await request('/api/admin/posts/test-new-entry','PUT',{...p,revision:1})).status,409);
      assert.equal((await request('/api/admin/posts/test-new-entry','PUT',p,'https://evil.invalid')).status,403);
      assert.equal((await request('/api/admin/posts','POST',{...p,slug:'../../etc/passwd'})).status,400);
      assert.equal((await request('/api/admin/posts','POST',{...p,slug:'bad-date',date:'2026-02-31'})).status,400);
    });
    await t.test('图片验证、转换和持久保存',async()=>{
      const buf=await sharp({create:{width:20,height:20,channels:3,background:'#084acc'}}).png().toBuffer();
      const form=new FormData();form.append('file',new Blob([buf],{type:'image/png'}),'test.png');
      const r=await fetch(base+'/api/admin/uploads',{method:'POST',headers:{Cookie:cookie,Origin:'http://localhost:3000'},body:form});assert.equal(r.status,201);const {url}=await r.json();assert.match(url,/^\/uploads\/[a-f0-9]{32}\.webp$/);assert.equal((await fetch(base+url)).status,200);
      const bad=new FormData();bad.append('file',new Blob(['<svg onload="alert(1)"></svg>'],{type:'image/svg+xml'}),'bad.svg');
      assert.equal((await fetch(base+'/api/admin/uploads',{method:'POST',headers:{Cookie:cookie,Origin:'http://localhost:3000'},body:bad})).status,400);
    });
    await t.test('撤稿、导出及注销立即生效',async()=>{
      const r=await request('/api/admin/posts/test-new-entry','PUT',{...p,status:'draft'});assert.equal(r.status,200);
      assert.equal((await request('/journal/test-new-entry')).status,404);
      const exported=await(await request('/api/admin/export')).json();assert.equal(exported.posts.length,7);
      assert.equal((await request('/api/logout','POST')).status,200);assert.equal((await request('/api/admin/posts')).status,401);
    });
  }finally{await new Promise(resolve=>server.close(resolve));store.db.close();}
  const reopened=createStore(dir,path.resolve('content'));
  assert.equal(reopened.list(true).length,7);assert.equal(reopened.get('test-new-entry').status,'draft');assert.equal(reopened.list().length,6);reopened.db.close();
});
test('Markdown 代码、重复标题目录与不可信 HTML',()=>{
  const r=renderMarkdown('## 标题\n\n## 标题\n\n```python\nprint("hello")\n```\n\n<img src=x onerror=alert(1)>');
  assert.equal(new Set(r.toc.map(h=>h.id)).size,2);assert.match(r.html,/hljs-/);assert.doesNotMatch(r.html,/<img src=x/);
});
test('BASE_PATH 规范化规则',()=>{
  assert.equal(normalizeBasePath(undefined),'');
  assert.equal(normalizeBasePath(null),'');
  assert.equal(normalizeBasePath(''),'');
  assert.equal(normalizeBasePath('/'),'');
  assert.equal(normalizeBasePath('blog'),'/blog');
  assert.equal(normalizeBasePath('/blog'),'/blog');
  assert.equal(normalizeBasePath('/blog/'),'/blog');
  assert.equal(normalizeBasePath('  /blog  '),'/blog');
  assert.equal(normalizeBasePath('//blog//'),'/blog');
  assert.equal(normalizeBasePath('/a/b/'),'/a/b');
});
test('子路径部署：BASE_PATH=/blog 下页面、资源、订阅与后台流程', async t=>{
  const dir=mkdtempSync(path.join(tmpdir(),'after-school-base-test-'));
  const password='only-for-tests-long-password';
  const siteUrl='https://www.hhn224.site';
  const {app,store}=createApp({dataDir:dir,password,siteUrl,basePath:'/blog'});
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  let cookie='';
  const request=(url,method='GET',body,requestOrigin=siteUrl,useCookie=true)=>fetch(origin+url,{method,headers:{...(useCookie&&cookie?{Cookie:cookie}:{}),...(method!=='GET'?{Origin:requestOrigin,'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  try{
    await t.test('/blog 下页面与静态资源可用；外层剥过前缀时同样可用',async()=>{
      const urls=['/blog/','/blog/journal','/blog/archive','/blog/projects','/blog/about','/blog/credits','/blog/admin','/blog/feed.xml','/blog/sitemap.xml','/blog/robots.txt','/blog/style.css','/blog/app.js','/blog/admin.js','/blog/admin.css','/blog/favicon.svg','/blog/assets/barlow-bold.ttf','/blog/assets/barlow-black-italic.ttf','/blog/assets/p3r-poster.jpg','/blog/healthz','/healthz',...store.list().map(p=>`/blog/journal/${p.slug}`)];
      for(const url of urls){const r=await request(url);assert.equal(r.status,200,url);}
      const noSlash=await fetch(`${origin}/blog`,{redirect:'manual'});
      assert.equal(noSlash.status,301,'不带结尾斜杠的 /blog 应重定向到 /blog/');
      assert.equal(noSlash.headers.get('location'),'/blog/');
      assert.equal((await fetch(`${origin}/blog`)).status,200);
      const found=await (await request('/blog/journal?q=Bubblewrap')).text();assert.match(found,/agent-lite-day-4/);
      assert.equal((await request('/journal')).status,200,'反向代理已剥掉前缀时仍按根路径路由');
      assert.equal((await request('/blogger')).status,404,'前缀边界外的相似路径不应被改写');
      assert.equal((await request('/blog/journal/does-not-exist')).status,404);
      const range=await fetch(`${origin}/blog/assets/p3r-background.mp4`,{headers:{Range:'bytes=0-1023'}});assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,1024);
    });
    await t.test('页面内所有 href/src/action 均以 /blog 开头，canonical 带前缀',async()=>{
      const pages=['/blog/','/blog/journal','/blog/archive','/blog/projects','/blog/about','/blog/credits','/blog/admin',...store.list().map(p=>`/blog/journal/${p.slug}`)];
      for(const url of pages){
        const html=await (await request(url)).text();
        assert.match(html,/data-base="\/blog"/,url);
        for(const value of [...html.matchAll(/(?:href|src|action)="([^"]*)"/g)].map(m=>m[1])){
          if(value.startsWith('/')) assert.ok(value==='/blog'||value.startsWith('/blog/'),`${url} 出现未加前缀的根绝对路径 ${value}`);
        }
      }
      const article=await (await request('/blog/journal/agent-lite-day-1')).text();
      assert.match(article,/rel="canonical" href="https:\/\/www\.hhn224\.site\/blog\/journal\/agent-lite-day-1"/);
      assert.match(article,/property="og:url" content="https:\/\/www\.hhn224\.site\/blog\/journal\/agent-lite-day-1"/);
      const home=await (await request('/blog/')).text();
      assert.match(home,/src="\/blog\/assets\/p3r-background\.mp4"/);
      assert.match(home,/poster="\/blog\/assets\/p3r-poster\.jpg"/);
    });
    await t.test('RSS、sitemap、robots 使用 origin + /blog 且不重复前缀',async()=>{
      const feed=await (await request('/blog/feed.xml')).text();
      assert.match(feed,/<link>https:\/\/www\.hhn224\.site\/blog<\/link>/);
      assert.match(feed,/<item><title>.*<\/title><link>https:\/\/www\.hhn224\.site\/blog\/journal\/agent-lite-day-1<\/link>/);
      assert.doesNotMatch(feed,/blog\/blog/);
      const map=await (await request('/blog/sitemap.xml')).text();
      assert.match(map,/<loc>https:\/\/www\.hhn224\.site\/blog\/<\/loc>/);
      assert.match(map,/<loc>https:\/\/www\.hhn224\.site\/blog\/journal<\/loc>/);
      assert.doesNotMatch(map,/hhn224\.site\/journal/);
      const robots=await (await request('/blog/robots.txt')).text();
      assert.match(robots,/Disallow: \/blog\/admin/);
      assert.match(robots,/Disallow: \/blog\/api\//);
      assert.match(robots,/Sitemap: https:\/\/www\.hhn224\.site\/blog\/sitemap\.xml/);
    });
    await t.test('后台写入需要身份与同源 Origin；上传与发布结果带前缀',async()=>{
      assert.equal((await request('/blog/api/admin/posts')).status,401);
      assert.equal((await request('/blog/api/login','POST',{password},'https://evil.invalid')).status,403);
      assert.equal((await request('/blog/api/login','POST',{password:'wrong'})).status,401);
      const login=await request('/blog/api/login','POST',{password});assert.equal(login.status,200);
      const setCookie=login.headers.get('set-cookie');
      assert.match(setCookie,/Path=\/blog/);assert.match(setCookie,/HttpOnly/);
      cookie=setCookie.split(';')[0];
      assert.equal((await request('/blog/api/session')).status,200);
      const p={slug:'blog-base-entry',title:'子路径下的新文章',markdown:'## 标题\n\n正文',date:'2026-09-22',category:'测试',tags:['测试'],series:'',day:0,excerpt:'摘要',status:'published'};
      assert.equal((await request('/blog/api/admin/posts','POST',p)).status,201);
      const page=await request('/blog/journal/blog-base-entry');assert.equal(page.status,200);
      const buf=await sharp({create:{width:20,height:20,channels:3,background:'#084acc'}}).png().toBuffer();
      const form=new FormData();form.append('file',new Blob([buf],{type:'image/png'}),'test.png');
      const uploaded=await fetch(`${origin}/blog/api/admin/uploads`,{method:'POST',headers:{Cookie:cookie,Origin:siteUrl},body:form});
      assert.equal(uploaded.status,201);const {url}=await uploaded.json();
      assert.match(url,/^\/blog\/uploads\/[a-f0-9]{32}\.webp$/);
      assert.equal((await fetch(origin+url)).status,200);
      const logout=await request('/blog/api/logout','POST');assert.equal(logout.status,200);
      assert.match(logout.headers.get('set-cookie'),/Path=\/blog/);
      assert.equal((await request('/blog/api/admin/posts')).status,401);
    });
  }finally{await new Promise(resolve=>server.close(resolve));store.db.close();}
});
