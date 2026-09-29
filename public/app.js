const $ = s => document.querySelector(s);
const storage = { get(k){try{return localStorage.getItem(k);}catch{return null;}},set(k,v){try{localStorage.setItem(k,v);}catch{}} };
let toastTimer;
window.notify = message => { const el=$('#toast');if(!el)return;el.textContent=message;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),4000); };
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let motion=storage.get('as-motion')!=='off'&&!reduced.matches;
const video=$('video');
let videoShouldPlay=null;
function syncVideoPlayback(){if(!video)return;const stage=$('#home-stage');const shouldPlay=motion&&!document.hidden&&(!stage||scrollY<stage.offsetHeight*.84);if(shouldPlay===videoShouldPlay)return;videoShouldPlay=shouldPlay;if(shouldPlay)video.play().catch(()=>{});else video.pause();}
function syncMotion(){document.body.classList.toggle('motion-off',!motion);syncVideoPlayback();const b=$('#motion');if(b){b.textContent=motion?'Ⅱ 动态背景':'▷ 静止背景';b.setAttribute('aria-pressed',String(motion));}}
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
if(menu.length)document.addEventListener('keydown',e=>{if(e.altKey||e.ctrlKey||e.metaKey||e.target.closest('input,textarea,select,button'))return;if(['ArrowUp','ArrowDown'].includes(e.key)&&e.target.closest('[data-menu]')){e.preventDefault();select((selected+(e.key==='ArrowDown'?1:-1)+menu.length)%menu.length);menu[selected].focus({preventScroll:true});}if(e.key==='Enter'&&(e.target===document.body)){e.preventDefault();menu[selected].click();}});
const homeStage=$('#home-stage');
if(homeStage){
  const journal=$('#home-journal');
  let sceneFrame=0;
  const paintScene=()=>{
    sceneFrame=0;
    const distance=Math.max(homeStage.offsetHeight*.9,innerHeight*.9,1);
    const p=Math.max(0,Math.min(1,scrollY/distance));
    const contentOpacity=Math.max(0,1-Math.max(0,p-.12)/.78);
    const journalOpacity=Math.min(1,.2+p*1.6);
    homeStage.style.setProperty('--scene-content-opacity',contentOpacity.toFixed(3));
    homeStage.style.setProperty('--scene-ui-x',`${Math.round(-p*20)}px`);
    homeStage.style.setProperty('--scene-ui-y',`${Math.round(-p*28)}px`);
    homeStage.style.setProperty('--scene-video-opacity',(1-p*.58).toFixed(3));
    homeStage.style.setProperty('--scene-video-x',`${Math.round(-p*90)}px`);
    homeStage.style.setProperty('--scene-video-y',`${Math.round(-p*40)}px`);
    homeStage.style.setProperty('--scene-video-scale',(1.04+p*.035).toFixed(3));
    homeStage.style.setProperty('--scene-shade-opacity',(1-p*.65).toFixed(3));
    homeStage.style.setProperty('--scene-wash-opacity',(p*.98).toFixed(3));
    journal.style.setProperty('--scene-journal-opacity',journalOpacity.toFixed(3));
    journal.style.setProperty('--scene-journal-y',`${Math.round((1-journalOpacity)*28)}px`);
    journal.style.setProperty('--scene-edge-opacity',Math.min(1,p*8).toFixed(3));
    syncVideoPlayback();
  };
  const queueScene=()=>{if(!sceneFrame)sceneFrame=requestAnimationFrame(paintScene);};
  document.body.classList.add('scene-enhanced');
  addEventListener('scroll',queueScene,{passive:true});
  addEventListener('resize',queueScene,{passive:true});
  queueScene();
}
const now=new Date();if($('#today'))$('#today').textContent=`${now.getMonth()+1}/${now.getDate()}`;if($('#weekday'))$('#weekday').textContent=now.toLocaleDateString('en',{weekday:'short'}).toUpperCase();
if(matchMedia('(max-width:700px)').matches && $('.toc')) $('.toc').open=false;
$('#copy-link')?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(location.href.split('#')[0]);notify('文章链接已复制。');}catch{notify('无法访问剪贴板，请复制浏览器地址栏中的链接。');}});
const progress=$('#reading-progress');if(progress){
  const ambient=$('.article-ambient');
  const headings=[...document.querySelectorAll('.prose h2,.prose h3')];
  const tocLinks=[...document.querySelectorAll('.toc a')];
  let target=0,shown=0,frame=0;
  const paint=()=>{
    frame=0;
    shown=!motion||reduced.matches?target:shown+(target-shown)*.24;
    if(Math.abs(target-shown)<.001)shown=target;
    progress.style.transform=`scaleX(${shown})`;
    if(ambient&&motion&&!reduced.matches)ambient.style.transform=`translate3d(0,${Math.round(shown*28)}px,0)`;
    let current=headings[0];
    for(const heading of headings){if(heading.getBoundingClientRect().top<=Math.min(160,innerHeight*.25))current=heading;else break;}
    if(current)for(const link of tocLinks)link.classList.toggle('active',link.hash===`#${current.id}`);
    if(shown!==target)frame=requestAnimationFrame(paint);
  };
  const update=()=>{const max=document.documentElement.scrollHeight-innerHeight;target=max>0?Math.max(0,Math.min(1,scrollY/max)):1;if(!frame)frame=requestAnimationFrame(paint);};
  addEventListener('scroll',update,{passive:true});
  addEventListener('resize',update,{passive:true});
  update();
}
