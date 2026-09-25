(() => {
  'use strict';
  const scene = document.querySelector('.scene');
  const frame = document.querySelector('.frame');
  const paw = document.querySelector('#paw');
  const play = document.querySelector('#play');
  const status = document.querySelector('#status');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const words = ['The', 'cat', 'is', 'lying', 'on', 'the', 'mat'];
  const target = i => ({ x: 58 + i * 128, y: 398 });
  const sources = [{x: 470, y: 283}, {x: 197, y: 283}, {x: 606, y: 283}, {x: 333, y: 283}, {x: 742, y: 283}];
  const cards = words.map((word, i) => {
    const el = document.createElement('div');
    el.className = 'card'; el.textContent = word;
    document.querySelector('#cards').append(el);
    const slot = document.createElement('div'); slot.className = 'slot';
    slot.style.left = `${target(i).x - 28}px`;
    document.querySelector('.slots').append(slot);
    return el;
  });
  const duration = 12000;
  let elapsed = 0, running = !reducedMotion.matches, last = null, request = null;
  const ease = t => t * t * (3 - 2 * t);
  const mix = (a,b,t) => a + (b-a)*t;
  const pos = (el,x,y,r=0,s=1) => { el.style.transform = `translate(${x}px,${y}px) rotate(${r}deg) scale(${s})`; };
  function draw() {
    cards.forEach((el,i) => {
      const p = i < 2 ? target(i) : sources[i-2];
      pos(el,p.x,p.y,i < 2 ? 0 : [-5,-4,3,-3,4][i-2]);
      el.style.zIndex = '1';
    });
    const timeline = Math.max(0, elapsed - 500);
    const step = Math.min(4, Math.floor(timeline / 2100));
    const t = Math.min(1, (timeline - step * 2100) / 2100);
    for(let i=0; i<step; i++){const p=target(i+2);pos(cards[i+2],p.x,p.y);}
    const source = sources[step], dest = target(step+2);
    let x,y,angle=0;
    if(t < .23){
      const p = ease(t/.23);
      x = mix(step ? target(step+1).x+80 : 920,source.x+57,p);
      y = mix(710,source.y+48,p);angle=mix(-12,-7,p);
    } else if(t < .78){
      const p=(t-.23)/.55, e=ease(p), lift=Math.sin(Math.PI*p)*72;
      const cx=mix(source.x,dest.x,e),cy=mix(source.y,dest.y,e)-lift;
      pos(cards[step+2],cx,cy,Math.sin(Math.PI*p)*-7,1+Math.sin(Math.PI*p)*.045);
      cards[step+2].style.zIndex='3';
      x=cx+57;y=cy+48;angle=-7+e*10;
    } else {
      const p=(t-.78)/.22;
      pos(cards[step+2],dest.x,dest.y-Math.sin(Math.min(1,p*3)*Math.PI)*4);
      x=mix(dest.x+57,dest.x+110,ease(p));y=mix(dest.y+48,710,ease(p));angle=3+p*10;
    }
    pos(paw,x-85,y-35,angle);paw.style.zIndex='4';
    const finished = elapsed >= 11000;
    if(finished){cards.forEach((el,i)=>{const p=target(i);pos(el,p.x,p.y)});paw.style.opacity='0';}else{paw.style.opacity='1';}
    document.querySelector('#celebration').style.opacity=finished?'1':'0';
    document.querySelector('#check').textContent=finished?'Perfect! ✓':'Check →';
    const progress=Math.min(1,timeline/10500);
    document.querySelector('#progress-fill').style.width=`${progress*100}%`;
    document.querySelectorAll('.progress b').forEach((b,i)=>{b.style.background=progress>=i/3?'#6acb47':'#e0eaf4'});
  }
  function updateControls(){
    play.textContent=running?'Ⅱ Пауза':elapsed>=duration?'▶ Повторить':'▶ Продолжить';
    status.textContent=elapsed>=duration?'Готово! The cat is lying on the mat.':running?'Лапка собирает предложение…':'Анимация на паузе.';
  }
  function tick(now){
    request=null;
    if(!running || document.hidden){last=null;return;}
    if(last!==null)elapsed=Math.min(duration,elapsed+(now-last)*Number(document.querySelector('#speed').value));
    last=now;draw();
    if(elapsed>=duration){running=false;updateControls();return;}
    request=requestAnimationFrame(tick);
  }
  function schedule(){if(request===null&&running&&!document.hidden)request=requestAnimationFrame(tick);}
  function restart(){elapsed=0;last=null;running=true;draw();updateControls();schedule();}
  play.addEventListener('click',()=>{if(elapsed>=duration){restart();return;}running=!running;last=null;updateControls();schedule();});
  document.querySelector('#replay').addEventListener('click',restart);
  document.addEventListener('visibilitychange',()=>{last=null;schedule();});
  reducedMotion.addEventListener('change',event=>{if(event.matches){running=false;last=null;updateControls();}});
  new ResizeObserver(()=>{scene.style.transform=`scale(${frame.clientWidth/1000})`;}).observe(frame);
  draw();updateControls();schedule();
})();
