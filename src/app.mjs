import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import sharp from 'sharp';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from './store.mjs';
import { renderMarkdown, escapeHtml, validatePost } from './content.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = s => createHash('sha256').update(s).digest('hex');
const equal = (a,b) => timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b)));
// 子路径部署：BASE_PATH 规范化为「以 / 开头、结尾无 /」；'' 与 '/' 一律归一为空串（根路径部署）。
export const normalizeBasePath = value => {
  const raw = String(value ?? '').trim();
  if (!raw || raw === '/') return '';
  return `/${raw.replace(/^\/+/, '').replace(/\/+$/, '')}`;
};
export function createApp(options = {}) {
  const siteUrl = new URL(options.siteUrl || process.env.SITE_URL || 'http://localhost:3000').origin;
  const base = normalizeBasePath(options.basePath ?? process.env.BASE_PATH);
  const withBase = p => `${base}${String(p).startsWith('/') ? p : `/${p}`}`;
  const password = options.password || process.env.ADMIN_PASSWORD || '';
  if (password.length < 16) throw new Error('请先运行 npm run setup，或设置至少 16 位的 ADMIN_PASSWORD。');
  const dataDir = path.resolve(options.dataDir || process.env.DATA_DIR || path.join(root, 'data'));
  const store = createStore(dataDir, options.contentDir === false ? undefined : path.join(root,'content'));
  const app = express();
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
  app.set('view engine','ejs'); app.set('views',path.join(root,'views'));
  app.use(helmet({ contentSecurityPolicy:{ directives:{ 'default-src':["'self'"], 'script-src':["'self'"], 'style-src':["'self'"], 'img-src':["'self'",'https:','data:'], 'media-src':["'self'"], 'upgrade-insecure-requests':null }}, strictTransportSecurity:siteUrl.startsWith('https:') ? undefined : false }));
  app.use(express.json({limit:'1mb'}));
  // 外层反向代理可能保留也可能剥掉 BASE_PATH；这里幂等地剥掉前缀，内部路由仍按根路径匹配。
  if (base) app.use((req,_res,next) => {
    const url = req.url;
    if (url === base || url.startsWith(`${base}/`)) req.url = url.slice(base.length) || '/';
    else if (url.startsWith(`${base}?`)) req.url = `/${url.slice(base.length)}`;
    next();
  });
  app.use('/assets',express.static(path.join(root,'public/assets'), {maxAge:'7d'}));
  app.use(express.static(path.join(root,'public'),{maxAge:0}));
  const uploads = path.join(dataDir,'uploads'); mkdirSync(uploads,{recursive:true});
  app.use('/uploads',express.static(uploads,{maxAge:'1y',immutable:true}));
  const audioPath = name => {
    const p = process.env[name] || '';
    return /^\/audio\/[\w.-]+\.(ogg|wav|mp3)$/.test(p) && existsSync(path.join(root,'public',p)) ? withBase(p) : '';
  };
  app.locals.base = base;
  app.locals.withBase = withBase;
  app.locals.site = { url:siteUrl, owner:process.env.SITE_OWNER || 'HHN224', name:'AFTER SCHOOL', description:'记录代码、问题，以及把想法做出来的过程。', navigateAudio:audioPath('SFX_NAVIGATE'), confirmAudio:audioPath('SFX_CONFIRM') };
  app.locals.escapeHtml = escapeHtml;
  app.locals.postUrl = p => withBase(`/journal/${p.slug}`);
  const render = (res, page, data={}) => res.render(page,{ title:'深蓝时刻', description:app.locals.site.description, canonical:'', section:'', ...data });
  const tokenFor = req => { try { return decodeURIComponent((req.headers.cookie || '').split(';').map(s=>s.trim()).find(s=>s.startsWith('as_session='))?.slice(11) || ''); } catch { return ''; } };
  const authenticated = req => {
    const token = tokenFor(req);
    return token && !!store.db.prepare('SELECT hash FROM sessions WHERE hash=? AND expires>?').get(hash(token),Date.now());
  };
  const auth = (req,res,next) => authenticated(req) ? next() : res.status(401).json({error:'请先登录。'});
  const origin = (req,res,next) => req.get('origin') === siteUrl ? next() : res.status(403).json({error:'请求来源无效。'});
  app.use('/api', (_req,res,next) => { res.set('Cache-Control','no-store'); next(); });
  app.use('/api',rateLimit({windowMs:60*1000,limit:120,standardHeaders:'draft-8',legacyHeaders:false}));
  app.get('/healthz',(_req,res)=>{store.db.prepare('SELECT 1').get();res.json({status:'ok'});});
  app.get('/',(_req,res)=>{const posts=store.list();render(res,'home',{canonical:'/',latest:posts[0],count:posts.length,posts});});
  app.get('/journal',(req,res)=>{
    const all=store.list();
    const q=String(req.query.q || '').slice(0,200), category=String(req.query.category||''),tag=String(req.query.tag||''),series=String(req.query.series||'');
    const posts=all.filter(p=>(!category||p.category===category)&&(!tag||p.tags.includes(tag))&&(!series||p.series===series)&&(!q||`${p.title} ${p.markdown} ${p.tags.join(' ')}`.toLowerCase().includes(q.toLowerCase())));
    render(res,'journal',{title:'文章手记',canonical:'/journal',section:'journal',posts,all,categories:[...new Set(all.map(p=>p.category))],q,category,tag,series});
  });
  app.get('/journal/:slug',(req,res,next)=>{
    const post=store.get(req.params.slug); if(!post||post.status!=='published') return next();
    const peers=store.list().filter(p=>p.series && p.series===post.series).sort((a,b)=>a.day-b.day);
    render(res,'article',{title:post.title,description:post.excerpt,canonical:`/journal/${post.slug}`,section:'journal',post,...renderMarkdown(post.markdown),peers});
  });
  app.get('/archive',(_req,res)=>render(res,'archive',{title:'时间轴',canonical:'/archive',section:'archive',posts:store.list()}));
  app.get('/projects',(_req,res)=>render(res,'page',{title:'作品与实验',canonical:'/projects',section:'projects',kind:'projects'}));
  app.get('/about',(_req,res)=>render(res,'page',{title:'关于这里',canonical:'/about',section:'about',kind:'about'}));
  app.get('/credits',(_req,res)=>render(res,'page',{title:'素材与参考',canonical:'/credits',kind:'credits'}));
  app.get('/admin',(req,res)=>{res.set('Cache-Control','no-store').set('X-Robots-Tag','noindex');render(res,'admin',{title:'写作空间',loggedIn:authenticated(req)});});
  app.get('/api/session',(req,res)=>res.json({authenticated:!!authenticated(req)}));
  app.post('/api/login',origin,rateLimit({windowMs:15*60*1000,limit:10,skipSuccessfulRequests:true,standardHeaders:'draft-8',legacyHeaders:false}), (req,res)=>{
    if(typeof req.body.password!=='string'||!equal(req.body.password,password)) return res.status(401).json({error:'密码不正确。'});
    store.db.prepare('DELETE FROM sessions WHERE expires<=?').run(Date.now());
    const token=randomBytes(32).toString('hex');
    store.db.prepare('INSERT INTO sessions VALUES (?,?)').run(hash(token),Date.now()+12*60*60*1000);
    res.cookie('as_session',token,{httpOnly:true,secure:siteUrl.startsWith('https:'),sameSite:'strict',maxAge:12*60*60*1000,path:base||'/'}).json({ok:true});
  });
  app.post('/api/logout',origin,auth,(req,res)=>{store.db.prepare('DELETE FROM sessions WHERE hash=?').run(hash(tokenFor(req)));res.clearCookie('as_session',{path:base||'/'}).json({ok:true});});
  app.get('/api/admin/posts',auth,(_req,res)=>res.json(store.list(true)));
  app.get('/api/admin/export',auth,(_req,res)=>res.attachment('after-school-posts.json').json({version:1,posts:store.list(true)}));
  app.post('/api/admin/preview',origin,auth,(req,res)=>{
    if(typeof req.body.markdown!=='string'||req.body.markdown.length>500000) return res.status(400).json({error:'正文无效或过长。'});
    res.json(renderMarkdown(req.body.markdown));
  });
  app.post('/api/admin/posts',origin,auth,(req,res)=>{
    let p;try{p=validatePost(req.body);}catch(e){return res.status(400).json({error:e.message});}
    if(store.get(p.slug)) return res.status(409).json({error:'网址标识已存在，请使用另一个。'});
    res.status(201).json(store.insert(p));
  });
  app.put('/api/admin/posts/:slug',origin,auth,(req,res)=>{
    let p;try{p=validatePost(req.body);}catch(e){return res.status(400).json({error:e.message});}
    if(!store.get(req.params.slug)) return res.status(404).json({error:'文章不存在。'});
    if(p.slug!==req.params.slug) return res.status(400).json({error:'已创建文章的网址标识不可更改，以保留原有链接。'});
    if(!Number.isInteger(req.body.revision)||!store.update(p.slug,p,req.body.revision)) return res.status(409).json({error:'这篇文章已在其他窗口修改，请重新打开后再保存。'});
    res.json(store.get(p.slug));
  });
  const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:8*1024*1024,files:1}});
  app.post('/api/admin/uploads',origin,auth,upload.single('file'),async(req,res)=>{
    if(!req.file) return res.status(400).json({error:'请选择图片文件。'});
    try{
      const img=sharp(req.file.buffer,{limitInputPixels:40000000});
      const meta=await img.metadata();
      if(!['jpeg','png','webp','gif','avif'].includes(meta.format)) return res.status(400).json({error:'支持 JPG、PNG、WebP、GIF 和 AVIF 图片。'});
      const filename=`${randomBytes(16).toString('hex')}.webp`;
      await img.rotate().resize({width:2400,height:2400,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toFile(path.join(uploads,filename));
      res.status(201).json({url:withBase(`/uploads/${filename}`)});
    }catch{return res.status(400).json({error:'图片无法读取，或尺寸超过限制。'});}
  });
  app.get('/feed.xml',(_req,res)=>{
    const items=store.list().slice(0,30).map(p=>`<item><title>${escapeHtml(p.title)}</title><link>${siteUrl}${withBase(`/journal/${p.slug}`)}</link><guid>${siteUrl}${withBase(`/journal/${p.slug}`)}</guid><pubDate>${new Date(`${p.date}T00:00:00Z`).toUTCString()}</pubDate><description>${escapeHtml(p.excerpt)}</description></item>`).join('');
    res.type('application/rss+xml').send(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>AFTER SCHOOL · ${escapeHtml(app.locals.site.owner)}</title><link>${siteUrl}${base}</link><description>${escapeHtml(app.locals.site.description)}</description>${items}</channel></rss>`);
  });
  app.get('/sitemap.xml',(_req,res)=>res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['/','/journal','/archive','/projects','/about',...store.list().map(p=>`/journal/${p.slug}`)].map(p=>`<url><loc>${escapeHtml(siteUrl+withBase(p))}</loc></url>`).join('')}</urlset>`));
  app.get('/robots.txt',(_req,res)=>res.type('text').send(`User-agent: *\nAllow: ${withBase('/')}\nDisallow: ${withBase('/admin')}\nDisallow: ${withBase('/api/')}\nSitemap: ${siteUrl}${withBase('/sitemap.xml')}\n`));
  app.use('/api',(_req,res)=>res.status(404).json({error:'接口不存在。'}));
  app.use((_req,res)=>render(res.status(404),'page',{title:'这一页还没有被记录',kind:'404'}));
  app.use((err,req,res,_next)=>{
    const status=err instanceof multer.MulterError || err.status===413 ? 413 : err.status===400 ? 400 : 500;
    if(status===500) console.error(err);
    const error=status===413?'上传内容过大：图片上限 8 MB，文章上限 500,000 字。':status===400?'请求格式不正确。':'暂时无法完成请求，请稍后重试。';
    if(req.path.startsWith('/api'))res.status(status).json({error});else render(res.status(status),'page',{title:error,kind:'error'});
  });
  return {app,store};
}
