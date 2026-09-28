import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { createApp } from '../src/app.mjs';
import { createStore } from '../src/store.mjs';
import { renderMarkdown, importedPost } from '../src/content.mjs';

test('文章导入、发布权限、持久化及公共输出', async t=>{
  const dir=mkdtempSync(path.join(tmpdir(),'after-school-test-'));
  const password='only-for-tests-long-password';
  const {app,store}=createApp({dataDir:dir,password,siteUrl:'http://localhost:3000'});
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
