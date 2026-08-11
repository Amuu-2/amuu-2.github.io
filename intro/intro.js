/* ============================================================
   CRT 开场动画 · 逻辑层(从独立原型移植,源项目见 Desktop\intor\files)

   流程:待机循环 → 点击电脑 → 推镜 1.5s → 开机自检打字 → 屏幕里
        像素化地亮起本站 → 边放大边逐档变清晰 → 落地成正文

   ---- 改这个文件前先读这段 ----

   1) 与站点的耦合只有两处,别加第三处:
      · window.__introActive —— 播放期间为 true;站点脚本据此跳过
        首屏 dissolve、拦截整屏翻页的滚轮
      · 结束时调站点的 pixelDissolve()(仅跳过路径用,自然到达不用)

   2) 屏幕里的预览是 iframe 加载本站自己(?intro=skip 防递归),
      不是截图。所以站点怎么改版都不用管它 —— 这是选它而不是
      "截图+抖动"方案的唯一理由,别改成截图。

   3) 落地无缝靠一条数学关系,别单独改其中一边:
      iframe 按 contain 系数 k0 缩进 screenRectEnd,飞入的整体放大
      系数恒等于 1/k0 → 结束瞬间预览与真实视口 1:1 重合。
      改 screenRectEnd 要用 ?intro=debug 按 C 重新校准。

   4) 改本文件里会渲染的文案(bootLines 等)后必须重跑
      fonts/make-subset.py(硬约束 1),否则新字回退系统黑体。

   5) 改完 intro.js / intro.css 要把 index.html 里对应的 ?v= +1,
      否则浏览器一直跑缓存里的旧版(已经栽过一次)。

   URL 开关:?intro=force 重播 · ?intro=skip 跳过 ·
            ?intro=debug 重播+调试面板(C 校准 / T 调参 / D 抖动开关)
   ============================================================ */
(function () {
'use strict';

const intro = document.getElementById('intro');
if (!intro) return;

/* ---------- ① 配置 ---------- */
const CONFIG = {
  idleVideo : 'intro/video/idle.mp4',
  pushVideo : 'intro/video/push.mp4',

  /* 屏幕矩形(舞台百分比),与 Blender 相机参数数学对齐,勿手改;
     要校准用 ?intro=debug 按 C */
  screenRect    : { x:39.6, y:39.4, w:10.6, h:11.6 },
  screenRectEnd : { x:26.0, y:23.7, w:48.0, h:52.6 },
  hotspotRect   : { x:34.5, y:36.5, w:19.0, h:28.0 },

  pushMs     : 1500,          // 与 build_room.py 的 PUSH_FRAMES=36 对齐
  bootHoldMs : 500,
  revealMs   : 450,           // 打字结束后,像素化的网站首屏在 CRT 上亮起
  revealHoldMs : 350,         // 亮起后的停留,让人看清"屏幕里是网站"
  enterMs    : 1300,

  /* 屏幕内预览的像素化:亮起时用 startPx 的马赛克块,飞入时按 ladder 逐档
     变细(0=完全清晰)。想更糊就调大 startPx,想更慢就把 ladder 拉长。
     ladderPortion:整个梯子在飞入的前百分之多少走完 —— 留出的尾段是
     "清晰预览 ↔ 真实页面"的交叠,是落地不跳动的关键,别调到 1 */
  preview: { startPx:6, ladder:[5,4,3,2,1,0], ladderPortion:0.65 },

  dither: { on:true, pixel:4, levels:6, mono:0.15, exposure:1.10, gamma:1.12 },
  sound : { on:true, volume:0.35 },

  /* 机器型号/容量是复古机器的虚构设定,不是简历数据(硬约束 2 不适用);
     文案随时可改,改完重跑字体子集。全程控制在 ~4 秒:HR 的耐心是预算 */
  bootLines: [
    ['LIMU-OS BIOS  v2.7', 180],
    ['Memory test ...... 640K OK', 160],
    ['A: RPG_SAVE.DAT  FOUND', 140],
    ['', 90],
    ['READY.', 220],
    ['> RUN ZHANGLIMU.EXE', 320],
  ],

  /* 每次访问都播。用户定的:不想看的人点右下角"跳过"就行(它在待机开始
     0.8s 后浮现),不该由我们替访客决定。改成 true 则只对新访客播一次。
     注意:减动效偏好(prefers-reduced-motion)仍然直接跳过,那是无障碍要求 */
  onlyFirstVisit: false,
};

/* ---------- ② 基础 ---------- */
const $ = s => intro.querySelector(s);
const stage=$('.stage'), fx=document.getElementById('intro-fx'),
      screenEl=document.getElementById('intro-screen'),
      hotspot=document.getElementById('intro-hotspot'),
      vIdle=document.getElementById('intro-v-idle'),
      vPush=document.getElementById('intro-v-push'),
      skip=document.getElementById('intro-skip'),
      calib=document.getElementById('intro-calib'),
      tune=document.getElementById('intro-tune'),
      gA=$('.guide.a'), gB=$('.guide.b'), gC=$('.guide.c');

const params = new URLSearchParams(location.search);
const DEBUG  = params.get('intro') === 'debug';
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- 播不播?同步决定,站点脚本在本文件之后执行 ---------- */
const force = DEBUG || params.get('intro') === 'force';
const seen  = (() => { try { return localStorage.getItem('intro-seen') === '1'; }
                       catch (e) { return false; } })();
if (!force && (params.get('intro') === 'skip' || reduceMotion ||
               (CONFIG.onlyFirstVisit && seen))) {
  intro.remove();                                   // 不播:零成本移除,视频不会加载
  const sk = document.getElementById('intro-skip');
  if (sk) sk.remove();
  return;
}
window.__introActive = true;
document.documentElement.classList.add('intro-lock');
document.querySelectorAll('header.hud, main').forEach(el => { el.inert = true; });

const clamp01 = x => Math.min(1, Math.max(0, x));
const easeInOut = x => x<0.5 ? 2*x*x : 1-Math.pow(-2*x+2,2)/2;
const lerp = (a,b,t) => a+(b-a)*t;
const lerpRect = (a,b,t) => ({ x:lerp(a.x,b.x,t), y:lerp(a.y,b.y,t),
                               w:lerp(a.w,b.w,t), h:lerp(a.h,b.h,t) });
function place(el,r){ el.style.left=r.x+'%'; el.style.top=r.y+'%';
                      el.style.width=r.w+'%'; el.style.height=r.h+'%'; }

let progress = 0;
function currentScreenRect(){
  return lerpRect(CONFIG.screenRect, CONFIG.screenRectEnd, clamp01(progress));
}
function layout(){
  const r = currentScreenRect();
  place(screenEl, r);
  place(hotspot, CONFIG.hotspotRect);
  screenEl.style.fontSize = Math.max(4, stage.clientHeight*r.h/100/13) + 'px';
  layoutPreview();
  if(calibOn){ place(gA,CONFIG.screenRect); place(gB,CONFIG.screenRectEnd); place(gC,CONFIG.hotspotRect); }
}

/* ---- 屏幕内的网站预览(真 iframe,同源缩影,不是截图) ----
   缩放对齐的关键:iframe 尺寸 = 视口,按 contain 缩进 screenRectEnd;
   toEnter 的整体放大系数恰好是它的倒数 → 飞入结束时 iframe 和真实
   视口 1:1 像素对齐,揭开 overlay 的瞬间无缝 */
let previewEl=null, previewFrame=null, pxFlood=null, pxComp=null, pxMorph=null, pxFuncs=[];
const SVG_NS = 'http://www.w3.org/2000/svg';

/* SVG 马赛克滤镜:feFlood 在每个 B×B 格子里点一个小点 → feTile 铺满 →
   composite in 把源图像"透过点阵"采样 → dilate 把点撑成整块 = 真像素化。
   末尾 feComponentTransfer discrete 做 6 档色阶量化,呼应抖动的 levels:6 */
function buildPxFilter(){
  const svg = document.createElementNS(SVG_NS,'svg');
  svg.setAttribute('width','0'); svg.setAttribute('height','0');
  svg.style.position='absolute';
  const filter = document.createElementNS(SVG_NS,'filter');
  filter.setAttribute('id','intro-px');
  filter.setAttribute('x','0'); filter.setAttribute('y','0');
  filter.setAttribute('width','100%'); filter.setAttribute('height','100%');
  pxFlood = document.createElementNS(SVG_NS,'feFlood');
  pxFlood.setAttribute('width','2'); pxFlood.setAttribute('height','2');
  pxComp = document.createElementNS(SVG_NS,'feComposite');
  const tile = document.createElementNS(SVG_NS,'feTile');
  tile.setAttribute('result','grid');
  const mask = document.createElementNS(SVG_NS,'feComposite');
  mask.setAttribute('in','SourceGraphic'); mask.setAttribute('in2','grid');
  mask.setAttribute('operator','in');
  pxMorph = document.createElementNS(SVG_NS,'feMorphology');
  pxMorph.setAttribute('operator','dilate');
  const post = document.createElementNS(SVG_NS,'feComponentTransfer');
  pxFuncs = [];
  for(const ch of ['R','G','B']){
    const fn = document.createElementNS(SVG_NS,'feFunc'+ch);
    fn.setAttribute('type','discrete');
    fn.setAttribute('tableValues','0 0.2 0.4 0.6 0.8 1');
    post.appendChild(fn); pxFuncs.push(fn);
  }
  for(const n of [pxFlood,pxComp,tile,mask,pxMorph,post]) filter.appendChild(n);
  svg.appendChild(filter);
  intro.appendChild(svg);           // 随 intro 一起自拆
}
function setPx(B){                  // B = 马赛克块边长(px);0 = 摘掉滤镜 = 完全清晰
  if(!previewEl) return;
  if(!B){ previewEl.style.filter='none'; return; }
  const half = Math.max(1, Math.round(B/2));
  pxFlood.setAttribute('x', half-1); pxFlood.setAttribute('y', half-1);
  pxComp.setAttribute('width', B);  pxComp.setAttribute('height', B);
  pxMorph.setAttribute('radius', half);
  // 色阶量化只在粗块阶段用;细块阶段继续量化会像脏色带
  for(const fn of pxFuncs) fn.setAttribute('type', B>3 ? 'discrete' : 'identity');
  // 块越小画面越亮:逐档通电到 100%
  previewEl.style.filter =
    `url(#intro-px) brightness(${(1-B*0.035).toFixed(2)}) saturate(${(1-B*0.02).toFixed(2)})`;
}

function buildPreview(){
  if(previewEl) return;
  previewEl = document.createElement('div');
  previewEl.id = 'intro-preview';
  stage.appendChild(previewEl);
  /* 预览就是站点自己(?intro=skip 防止套娃递归)。用 iframe 而不是截图,
     所以站点怎么改版都不会过时,也不需要跟着站点结构维护 */
  previewFrame = document.createElement('iframe');
  previewFrame.src = location.pathname + '?intro=skip';
  previewFrame.setAttribute('aria-hidden','true');
  previewFrame.setAttribute('tabindex','-1');
  previewFrame.setAttribute('title','');
  previewEl.appendChild(previewFrame);
  buildPxFilter();
  setPx(CONFIG.preview.startPx);
  layoutPreview();
}

function layoutPreview(){
  if(!previewEl) return;
  const R = CONFIG.screenRectEnd;
  place(previewEl, R);
  if(!previewFrame) return;                             // b 模式只有画布,没有 iframe
  const rw = stage.clientWidth*R.w/100, rh = stage.clientHeight*R.h/100;
  const k0 = Math.min(rw/innerWidth, rh/innerHeight);   // contain:空边像 CRT 过扫描区
  previewFrame.style.width  = innerWidth+'px';
  previewFrame.style.height = innerHeight+'px';
  previewFrame.style.transform = `translate(-50%,-50%) scale(${k0.toFixed(5)})`;
}
addEventListener('resize', () => { layout(); resizeCanvas(); });

/* ---------- ③ 抖动后处理(WebGL Bayer,退化到 2D 直绘) ---------- */
const BAYER = [
   0,32, 8,40, 2,34,10,42, 48,16,56,24,50,18,58,26,
  12,44, 4,36,14,46, 6,38, 60,28,52,20,62,30,54,22,
   3,35,11,43, 1,33, 9,41, 51,19,59,27,49,17,57,25,
  15,47, 7,39,13,45, 5,37, 63,31,55,23,61,29,53,21 ];
const VS = `attribute vec2 p; varying vec2 uv;
void main(){ uv=vec2(p.x*0.5+0.5, 0.5-p.y*0.5); gl_Position=vec4(p,0.0,1.0); }`;
const FS = `precision mediump float;
varying vec2 uv;
uniform sampler2D tex, bayer;
uniform vec2 res; uniform float pixel, levels, mono, exposure, gamma;
uniform vec3 tint;
void main(){
  vec2 grid = max(res/pixel, vec2(1.0));
  vec2 cell = floor(uv*grid);
  vec3 c = texture2D(tex, (cell+0.5)/grid).rgb;
  c = pow(clamp(c*exposure,0.0,1.0), vec3(1.0/max(gamma,0.01)));
  float th = texture2D(bayer, cell/8.0).r;
  float L = max(levels-1.0,1.0);
  vec3 q = floor(c*L+th)/L;
  float lum = dot(q, vec3(0.299,0.587,0.114));
  gl_FragColor = vec4(mix(q, tint*lum, mono), 1.0);
}`;

let gl=null, uni={}, texSrc=null, ctx2d=null;
function initGL(){
  try{
    gl = fx.getContext('webgl',{antialias:false,alpha:false});
    if(!gl) return false;
    const sh=(ty,src)=>{ const s=gl.createShader(ty); gl.shaderSource(s,src); gl.compileShader(s);
      if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const prog=gl.createProgram();
    gl.attachShader(prog,sh(gl.VERTEX_SHADER,VS)); gl.attachShader(prog,sh(gl.FRAGMENT_SHADER,FS));
    gl.linkProgram(prog);
    if(!gl.getProgramParameter(prog,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    const buf=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,buf);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
    const loc=gl.getAttribLocation(prog,'p');
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
    for(const n of ['res','pixel','levels','mono','exposure','gamma','tint','tex','bayer'])
      uni[n]=gl.getUniformLocation(prog,n);
    texSrc=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,texSrc);
    for(const [a,b] of [[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE],
                        [gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR]])
      gl.texParameteri(gl.TEXTURE_2D,a,b);
    const bt=gl.createTexture(); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D,bt);
    const data=new Uint8Array(64*4);
    for(let i=0;i<64;i++){ const v=Math.round((BAYER[i]+0.5)/64*255);
      data[i*4]=v; data[i*4+1]=v; data[i*4+2]=v; data[i*4+3]=255; }
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,8,8,0,gl.RGBA,gl.UNSIGNED_BYTE,data);
    for(const [a,b] of [[gl.TEXTURE_WRAP_S,gl.REPEAT],[gl.TEXTURE_WRAP_T,gl.REPEAT],
                        [gl.TEXTURE_MIN_FILTER,gl.NEAREST],[gl.TEXTURE_MAG_FILTER,gl.NEAREST]])
      gl.texParameteri(gl.TEXTURE_2D,a,b);
    gl.uniform1i(uni.tex,0); gl.uniform1i(uni.bayer,1);
    /* tint 读 #intro 的 --phosphor,必须是 hex(见 intro.css 注释) */
    const hex=getComputedStyle(intro).getPropertyValue('--phosphor').trim();
    const m=/^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex)||[0,'7c','e3','8b'];
    gl.uniform3f(uni.tint, parseInt(m[1],16)/255, parseInt(m[2],16)/255, parseInt(m[3],16)/255);
    return true;
  }catch(e){ console.warn('[intro] WebGL 不可用，退回普通显示：',e.message); gl=null; return false; }
}
function ensure2d(){ if(!ctx2d) ctx2d=fx.getContext('2d'); return ctx2d; }
function resizeCanvas(){
  const dpr=Math.min(devicePixelRatio||1,2);
  const w=Math.max(1,Math.round(stage.clientWidth*dpr)), h=Math.max(1,Math.round(stage.clientHeight*dpr));
  if(fx.width!==w||fx.height!==h){ fx.width=w; fx.height=h; if(gl) gl.viewport(0,0,w,h); }
}
function present(source){
  resizeCanvas();
  const D=CONFIG.dither, off=!D.on;
  if(gl){
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,texSrc);
    try{ gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source); }catch(e){ return; }
    const dpr=Math.min(devicePixelRatio||1,2);
    gl.uniform2f(uni.res,fx.width,fx.height);
    gl.uniform1f(uni.pixel,    off?1  :Math.max(1,D.pixel*dpr));
    gl.uniform1f(uni.levels,   off?256:D.levels);
    gl.uniform1f(uni.mono,     off?0  :D.mono);
    gl.uniform1f(uni.exposure, off?1  :D.exposure);
    gl.uniform1f(uni.gamma,    off?1  :D.gamma);
    gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
  }else{
    const c=ensure2d(); if(!c) return;
    c.imageSmoothingEnabled=false; c.fillStyle='#000'; c.fillRect(0,0,fx.width,fx.height);
    const sw=source.videoWidth||source.width, sh=source.videoHeight||source.height;
    if(!sw||!sh) return;
    const k=Math.min(fx.width/sw,fx.height/sh);
    c.drawImage(source,(fx.width-sw*k)/2,(fx.height-sh*k)/2,sw*k,sh*k);
  }
}

/* ---------- ④ 声音(WebAudio 现场合成,无音频文件) ---------- */
let actx=null;
function bootSound(){
  if(!CONFIG.sound.on) return;
  try{
    actx = actx || new (window.AudioContext||window.webkitAudioContext)();
    const now=actx.currentTime, V=CONFIG.sound.volume;
    const master=actx.createGain(); master.gain.value=V; master.connect(actx.destination);
    const b=actx.createBuffer(1,1200,actx.sampleRate), d=b.getChannelData(0);
    for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,6);
    const click=actx.createBufferSource(); click.buffer=b;
    const cg=actx.createGain(); cg.gain.value=0.9;
    click.connect(cg).connect(master); click.start(now);
    const hum=actx.createOscillator(); hum.type='triangle'; hum.frequency.value=62;
    const hg=actx.createGain(); hg.gain.setValueAtTime(0.0001,now);
    hg.gain.exponentialRampToValueAtTime(0.20,now+1.6);
    hum.connect(hg).connect(master); hum.start(now); hum.stop(now+14);
    const whine=actx.createOscillator(); whine.type='sine'; whine.frequency.value=15600;
    const wg=actx.createGain(); wg.gain.setValueAtTime(0.0001,now+0.4);
    wg.gain.exponentialRampToValueAtTime(0.035,now+2.2);
    whine.connect(wg).connect(master); whine.start(now+0.4); whine.stop(now+14);
    const beep=actx.createOscillator(); beep.type='square'; beep.frequency.value=1046;
    const bg=actx.createGain(); bg.gain.setValueAtTime(0,now+1.9);
    bg.gain.linearRampToValueAtTime(0.28,now+1.92); bg.gain.setValueAtTime(0.28,now+2.06);
    bg.gain.linearRampToValueAtTime(0,now+2.10);
    beep.connect(bg).connect(master); beep.start(now+1.9); beep.stop(now+2.15);
  }catch(e){}
}
function keySound(){
  if(!CONFIG.sound.on||!actx) return;
  const now=actx.currentTime;
  const o=actx.createOscillator(); o.type='square'; o.frequency.value=1800+Math.random()*900;
  const g=actx.createGain(); g.gain.setValueAtTime(0.05*CONFIG.sound.volume,now);
  g.gain.exponentialRampToValueAtTime(0.0001,now+0.03);
  o.connect(g).connect(actx.destination); o.start(now); o.stop(now+0.04);
}

/* ---------- ⑤ 状态机:idle → push → boot → enter → done ---------- */
let state='loading', t0=performance.now(), pushStart=0, rafId=0;

function probe(video,src){
  return new Promise(res => {
    if(!src){ res(false); return; }
    let done=false;
    const ok=()=>{ if(!done){done=true;res(true);} }, no=()=>{ if(!done){done=true;res(false);} };
    video.addEventListener('loadeddata',ok,{once:true});
    video.addEventListener('error',no,{once:true});
    setTimeout(no,4000); video.src=src; video.load();
  });
}

function frame(now){
  rafId=requestAnimationFrame(frame);
  if(state==='push'){
    progress = vPush.duration ? clamp01(vPush.currentTime/vPush.duration) : 0;
  }else if(state==='boot'||state==='reveal'||state==='enter'||state==='done'){ progress=1; }
  else { progress=0; }
  layout();
  const v=(state==='idle')?vIdle:vPush;
  if(v.readyState>=2) present(v);
}

function toIdle(){
  state='idle';
  hotspot.classList.add('live'); skip.classList.add('live');
  vIdle.play().catch(()=>{});
}
function toPush(){
  if(state!=='idle') return;
  state='push'; pushStart=performance.now();
  hotspot.classList.remove('live'); hotspot.disabled=true;
  bootSound();
  vIdle.pause(); vPush.currentTime=0; vPush.play().catch(()=>{});
  vPush.addEventListener('ended',toBoot,{once:true});
  armPushWatchdog();
}
/* 兜底:'ended' 是主路径,但视频卡住/解码失败/被播放策略拦下时它永远不来,
   访客就会僵在一张静止的推镜画面上(只剩跳过按钮)。宁可硬推进到开机自检,
   也不能让人卡死。后台标签页视频本来就暂停,那段时间不计入超时。 */
function armPushWatchdog(){
  const TICK = 250;
  let waited = 0;
  const iv = setInterval(() => {
    if(state !== 'push'){ clearInterval(iv); return; }
    if(document.hidden) return;
    waited += TICK;
    if(waited > CONFIG.pushMs + 2500){        // 余量给慢设备解码
      clearInterval(iv);
      console.warn('[intro] 推镜视频未正常结束,兜底推进');
      toBoot();
    }
  }, TICK);
}
function toBoot(){
  if(state!=='push') return;
  state='boot'; progress=1; layout();
  screenEl.classList.add('live');
  buildPreview();          // 提前建好 iframe,打字的几秒正好用来加载
  typeLines(CONFIG.bootLines, () => setTimeout(toReveal, CONFIG.bootHoldMs));
}
/* 打字结束 → 自检文字熄灭,模糊的网站首屏在 CRT 上亮起 */
function toReveal(){
  if(state!=='boot') return;
  state='reveal';
  screenEl.classList.remove('live');            // 文字淡出(.25s transition)
  if(previewEl) previewEl.classList.add('live');
  setTimeout(toEnter, CONFIG.revealMs + CONFIG.revealHoldMs);
}
const esc = s => s.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
function typeLines(lines,done){
  let li=0,ci=0,out='';
  (function step(){
    if(state==='done'){ return; }                      // 中途被跳过就停
    if(li>=lines.length){ screenEl.textContent=out; done(); return; }
    const [text,pause]=lines[li];
    if(ci<text.length){
      out+=text[ci++]; if(ci%2===0) keySound();
      screenEl.innerHTML=esc(out)+'<span class="caret">_</span>';
      setTimeout(step, 16+Math.random()*22);   // 均值27ms:试过20ms,快得像贴文本,又回来了
    }else{
      out+='\n'; li++; ci=0;
      screenEl.innerHTML=esc(out)+'<span class="caret">_</span>';
      setTimeout(step, pause);
    }
  })();
}
function toEnter(){
  if(state==='done') return;
  state='enter';
  const R=CONFIG.screenRectEnd;                 // 从推近后的屏幕位置继续飞进去
  const sw=stage.clientWidth, sh=stage.clientHeight;
  const rect=stage.getBoundingClientRect();
  const scale=Math.max(innerWidth/(sw*R.w/100), innerHeight/(sh*R.h/100));
  intro.style.transformOrigin =
    `${rect.left + sw*(R.x+R.w/2)/100}px ${rect.top + sh*(R.y+R.h/2)/100}px`;
  intro.style.transition =
    `transform ${CONFIG.enterMs}ms cubic-bezier(.6,0,.9,.45), ` +
    `opacity ${CONFIG.enterMs*0.55}ms ease ${CONFIG.enterMs*0.45}ms`;
  requestAnimationFrame(() => {
    intro.style.transform=`scale(${scale.toFixed(3)})`; intro.style.opacity='0';
  });
  /* 放大的同时硬边跳档升分辨率。梯子在 ladderPortion 处就走完(完全清晰),
     剩下的尾段是"清晰预览 ↔ 真实页面"的交叠 → 落地不跳动 */
  const L = CONFIG.preview;
  const per = CONFIG.enterMs * L.ladderPortion / L.ladder.length;
  L.ladder.forEach((B, i) => setTimeout(() => {
    if(state==='enter') setPx(B);
  }, per * (i + 1)));
  setTimeout(()=>finish(true), CONFIG.enterMs+120);
}
/* 结束:拆掉 overlay,把页面交还给站点脚本。
   arrived=true(飞入自然到达):预览已和真实页面对齐,不再放溶解;
   arrived=false(跳过/Esc):放像素溶解补一个进场 */
function finish(arrived){
  if(state==='done') return;
  state='done'; cancelAnimationFrame(rafId);
  vIdle.pause(); vPush.pause();
  try{ localStorage.setItem('intro-seen','1'); }catch(e){}
  window.__introActive = false;
  document.documentElement.classList.remove('intro-lock');
  document.querySelectorAll('header.hud, main').forEach(el => { el.inert = false; });
  intro.remove(); skip.remove();
  if(calib) calib.remove(); if(tune) tune.remove();
  if(!arrived && !reduceMotion && typeof window.pixelDissolve === 'function')
    window.pixelDissolve(document.body, { fixed:true, dur:520 });
}
function skipAll(){
  if(state==='done') return;
  cancelAnimationFrame(rafId);
  intro.style.transition='opacity .35s ease'; intro.style.opacity='0';
  setTimeout(()=>finish(false),360);
}
hotspot.addEventListener('click',toPush);
skip.addEventListener('click',skipAll);
addEventListener('keydown',e=>{
  if(state==='done') return;
  if(e.key==='Escape') skipAll();
  if(e.key===' '&&state==='idle'){ e.preventDefault(); toPush(); }
});

/* ---------- ⑥ 调试工具:仅 ?intro=debug 时绑定 ---------- */
let calibOn=false;
if(DEBUG){
  const RECTS=[['screenRect','远景'],['screenRectEnd','推近后'],['hotspotRect','点击区']];
  let selIdx=0;
  const renderCalib=()=>{
    const f=n=>n.toFixed(1);
    const line=k=>`${k.padEnd(13)}: { x:${f(CONFIG[k].x)}, y:${f(CONFIG[k].y)}, `+
                  `w:${f(CONFIG[k].w)}, h:${f(CONFIG[k].h)} },`;
    calib.innerHTML =
      `<b>校准模式</b>　C 关闭 · Tab 切换 · ←↑→↓ 移动 · Shift+方向 缩放 · Alt 微调<br>`+
      `选中：<b>${RECTS[selIdx][1]}</b>　（绿=远景　蓝=推近后　红=点击区）`+
      `<pre>${RECTS.map(r=>line(r[0])).join('\n')}</pre>`+
      `<div class="hint">对齐后把上面三行抄回 intro.js 的 CONFIG。</div>`;
    [gA,gB,gC].forEach((g,i)=>g.classList.toggle('sel',i===selIdx));
    layout();
  };
  addEventListener('keydown',e=>{
    if(state==='done') return;
    if(e.key==='c'||e.key==='C'){
      calibOn=!calibOn;
      calib.classList.toggle('live',calibOn);
      [gA,gB,gC].forEach(g=>g.classList.toggle('live',calibOn));
      if(calibOn){ screenEl.classList.add('live'); renderCalib(); }
      return;
    }
    if(!calibOn) return;
    if(e.key==='Tab'){ e.preventDefault(); selIdx=(selIdx+1)%3; renderCalib(); return; }
    const map={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
    if(!map[e.key]) return;
    e.preventDefault();
    const step=e.altKey?0.1:0.5, r=CONFIG[RECTS[selIdx][0]], [dx,dy]=map[e.key];
    if(e.shiftKey){ r.w=Math.max(1,r.w+dx*step); r.h=Math.max(1,r.h+dy*step); }
    else { r.x+=dx*step; r.y+=dy*step; }
    renderCalib();
  });

  const KNOBS=[
    ['pixel','像素块 pixel',1,16,1,0],
    ['levels','色阶 levels',2,16,1,0],
    ['mono','单色 mono',0,1,0.05,2],
    ['exposure','曝光 exposure',0.4,3,0.05,2],
    ['gamma','gamma',0.6,3,0.05,2] ];
  let tuneOn=false;
  const fmt=k=>CONFIG.dither[k].toFixed(KNOBS.find(x=>x[0]===k)[5]);
  const renderTune=()=>{
    const d=CONFIG.dither;
    tune.innerHTML =
      `<div class="row"><span><b>调参面板</b>　T 关闭</span>
         <button data-act="off">${d.on?'开':'关'}</button></div>`+
      KNOBS.map(([k,label])=>`<div class="row"><span>${label}</span>
         <button data-dec="${k}">-</button><b>${fmt(k)}</b><button data-inc="${k}">+</button></div>`).join('')+
      `<pre>dither: { on: ${d.on}, pixel: ${d.pixel}, levels: ${d.levels},
  mono: ${d.mono.toFixed(2)}, exposure: ${d.exposure.toFixed(2)}, gamma: ${d.gamma.toFixed(2)} }</pre>`;
  };
  const nudge=(k,dir)=>{
    const [,,min,max,step,dec]=KNOBS.find(x=>x[0]===k);
    CONFIG.dither[k]=+Math.min(max,Math.max(min,CONFIG.dither[k]+dir*step)).toFixed(dec+2);
    renderTune();
  };
  tune.addEventListener('click',e=>{
    const t=e.target;
    if(t.dataset.inc) nudge(t.dataset.inc,1);
    else if(t.dataset.dec) nudge(t.dataset.dec,-1);
    else if(t.dataset.act==='off'){ CONFIG.dither.on=!CONFIG.dither.on; renderTune(); }
  });
  addEventListener('keydown',e=>{
    if(state==='done') return;
    if(e.key==='t'||e.key==='T'){ tuneOn=!tuneOn; tune.classList.toggle('live',tuneOn); if(tuneOn) renderTune(); }
    if(e.key==='d'||e.key==='D'){ CONFIG.dither.on=!CONFIG.dither.on; if(tuneOn) renderTune(); }
  });
}

/* ---------- ⑦ 启动 ---------- */
(async function start(){
  layout(); resizeCanvas(); initGL();
  const [okIdle,okPush]=await Promise.all([
    probe(vIdle,CONFIG.idleVideo), probe(vPush,CONFIG.pushVideo) ]);
  if(!(okIdle&&okPush)){
    console.warn('[intro] 视频加载失败，直接进入正文。');
    finish(); return;
  }
  layout();
  rafId=requestAnimationFrame(frame);
  toIdle();
})();

})();
