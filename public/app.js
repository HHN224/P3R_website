const $ = s => document.querySelector(s);
const storage = { get(k){try{return localStorage.getItem(k);}catch{return null;}},set(k,v){try{localStorage.setItem(k,v);}catch{}} };
let toastTimer;
window.notify = message => { const el=$('#toast');if(!el)return;el.textContent=message;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),4000); };
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let motion=storage.get('as-motion')!=='off'&&!reduced.matches;
const video=$('video');
function syncMotion(){document.body.classList.toggle('motion-off',!motion);if(video){if(motion&&!document.hidden)video.play().catch(()=>{});else video.pause();}const b=$('#motion');if(b){b.textContent=motion?'Ⅱ 动态背景':'▷ 静止背景';b.setAttribute('aria-pressed',String(motion));}}
$('#motion')?.addEventListener('click',()=>{motion=!motion;storage.set('as-motion',motion?'on':'off');syncMotion();});
document.addEventListener('visibilitychange',syncMotion);reduced.addEventListener('change',()=>{if(reduced.matches){motion=false;syncMotion();}});syncMotion();
const sounds={};for(const key of ['navigate','confirm']){const src=document.body.dataset[`${key}Audio`];if(src){sounds[key]=new Audio(src);sounds[key].volume=.2;sounds[key].preload='none';}}
let soundOn=false;
const soundButton=$('#sound');
if(soundButton){if(!Object.keys(sounds).length){soundButton.textContent='♪ 静音';soundButton.title='尚未配置经确认的 P3R 原版音效';}soundButton.addEventListener('click',()=>{if(!Object.keys(sounds).length){notify('暂未配置 P3R 原版音效，保持安静。');return;}soundOn=!soundOn;soundButton.textContent=soundOn?'♪ 音效开启':'♪ 音效关闭';soundButton.setAttribute('aria-pressed',String(soundOn));});}
function play(key){const a=sounds[key];if(soundOn&&a){a.currentTime=0;a.play().catch(()=>{});}}
const menu=[...document.querySelectorAll('[data-menu]')];let selected=0;
function select(index){if(selected!==index)play('navigate');selected=index;menu.forEach((a,i)=>a.classList.toggle('active',i===index));$('#selected-number').textContent=String(index+1).padStart(2,'0');$('#menu-description').textContent=menu[index].dataset.description;$('.home-command>span').textContent=['Read the latest stories','Find a memory','Explore my creations','Meet the person behind the screen'][index];}
menu.forEach((a,i)=>{a.addEventListener('pointerenter',()=>select(i));a.addEventListener('focus',()=>select(i));a.addEventListener('click',()=>play('confirm'));});
if(menu.length)document.addEventListener('keydown',e=>{if(e.altKey||e.ctrlKey||e.metaKey||e.target.closest('input,textarea,select,button'))return;if(['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();select((selected+(e.key==='ArrowDown'?1:-1)+menu.length)%menu.length);menu[selected].focus({preventScroll:true});}if(e.key==='Enter'&&(e.target===document.body)){e.preventDefault();menu[selected].click();}});
const now=new Date();if($('#today'))$('#today').textContent=`${now.getMonth()+1}/${now.getDate()}`;if($('#weekday'))$('#weekday').textContent=now.toLocaleDateString('en',{weekday:'short'}).toUpperCase();
if(matchMedia('(max-width:700px)').matches && $('.toc')) $('.toc').open=false;
$('#copy-link')?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(location.href.split('#')[0]);notify('文章链接已复制。');}catch{notify('无法访问剪贴板，请复制浏览器地址栏中的链接。');}});
const progress=$('#reading-progress');if(progress){const update=()=>{const max=document.documentElement.scrollHeight-innerHeight;progress.style.transform=`scaleX(${max>0?Math.min(1,scrollY/max):1})`;};addEventListener('scroll',update,{passive:true});update();const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){document.querySelectorAll('.toc a').forEach(a=>a.classList.toggle('active',a.hash===`#${entry.target.id}`));}},{rootMargin:'-5% 0px -65% 0px'});document.querySelectorAll('.prose h2,.prose h3').forEach(h=>observer.observe(h));}
