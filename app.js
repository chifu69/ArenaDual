const canvas=document.getElementById('game');
const ctx=canvas.getContext('2d');
const timerEl=document.getElementById('timer');
const blueScoreEl=document.getElementById('scoreBlue');
const orangeScoreEl=document.getElementById('scoreOrange');
const modeLabel=document.getElementById('modeLabel');
const message=document.getElementById('message');
const startBtn=document.getElementById('startBtn');
const difficultyPanel=document.getElementById('difficultyPanel');
const levelEl=document.getElementById('levelValue');
const streakEl=document.getElementById('streakValue');
const weaponEl=document.getElementById('weaponValue');
const difficultyEl=document.getElementById('difficultyValue');

const soundBtn=document.getElementById('soundBtn');
let soundEnabled=localStorage.getItem('arenaSound')!=='off';
let audioCtx=null;
function audio(){if(!soundEnabled)return null; if(!audioCtx){const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return null;audioCtx=new AC();} if(audioCtx.state==='suspended')audioCtx.resume();return audioCtx;}
function tone(freq=440,dur=.08,type='sine',gain=.055,endFreq=null,delay=0){const ac=audio();if(!ac)return;const t=ac.currentTime+delay,o=ac.createOscillator(),g=ac.createGain();o.type=type;o.frequency.setValueAtTime(freq,t);if(endFreq)o.frequency.exponentialRampToValueAtTime(Math.max(20,endFreq),t+dur);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(gain,t+.008);g.gain.exponentialRampToValueAtTime(.0001,t+dur);o.connect(g);g.connect(ac.destination);o.start(t);o.stop(t+dur+.02);}
function noise(dur=.09,gain=.035,delay=0){const ac=audio();if(!ac)return;const len=Math.max(1,Math.floor(ac.sampleRate*dur)),buf=ac.createBuffer(1,len,ac.sampleRate),d=buf.getChannelData(0);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*(1-i/len);const src=ac.createBufferSource(),g=ac.createGain(),t=ac.currentTime+delay;src.buffer=buf;g.gain.setValueAtTime(gain,t);g.gain.exponentialRampToValueAtTime(.0001,t+dur);src.connect(g);g.connect(ac.destination);src.start(t);}
const sfx={fire(){tone(170,.075,'sawtooth',.035,75);noise(.055,.018)},enemyFire(){tone(120,.065,'square',.018,70)},dash(){tone(220,.13,'sawtooth',.045,620);noise(.1,.018)},hit(){noise(.11,.06);tone(90,.12,'square',.04,45)},kill(){tone(330,.07,'square',.05,520);tone(520,.08,'square',.045,760,.075)},death(){tone(210,.13,'sawtooth',.05,75);tone(110,.18,'square',.035,45,.1)},power(){tone(440,.07,'square',.045,660);tone(660,.07,'square',.045,880,.075);tone(880,.1,'square',.045,1180,.15)},start(){tone(300,.06,'square',.04,420);tone(460,.08,'square',.04,680,.07)},win(){[523,659,784,1047].forEach((f,i)=>tone(f,.13,'square',.045,f*1.03,i*.09))},lose(){[330,247,196].forEach((f,i)=>tone(f,.16,'sawtooth',.04,f*.8,i*.11))}};
function updateSoundButton(){if(soundBtn){soundBtn.textContent=soundEnabled?'🔊':'🔇';soundBtn.setAttribute('aria-pressed',soundEnabled?'true':'false');}}
if(soundBtn){soundBtn.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();soundEnabled=!soundEnabled;localStorage.setItem('arenaSound',soundEnabled?'on':'off');updateSoundButton();if(soundEnabled){audio();tone(520,.07,'square',.035,760);}});}
updateSoundButton();


const W=canvas.width,H=canvas.height;
const WIN_SCORE=20;
let running=false, suddenDeath=false, timeLeft=100, last=0, rafId=0;
let blueScore=0, orangeScore=0, pressed={};
let joystickX=0, joystickY=0;
let bullets=[];
let playerStreak=0;
let difficulty=localStorage.getItem('arenaDifficulty')||'medium';
let level=Math.max(1,parseInt(localStorage.getItem('arenaLevel')||'1',10)||1);

const difficultyProfiles={
  easy:{enemySpeed:245,fireRate:1.35,aimError:.14,strafe:.34,bulletSpeed:565,dodge:.68,label:'EASY'},
  medium:{enemySpeed:305,fireRate:1.95,aimError:.075,strafe:.48,bulletSpeed:635,dodge:.92,label:'MEDIUM'},
  hard:{enemySpeed:365,fireRate:2.65,aimError:.028,strafe:.62,bulletSpeed:710,dodge:1.18,label:'HARD'}
};

// Real level progression: every level materially improves Albert's AI.
// Difficulty sets the baseline; level adds speed, reaction, accuracy and prediction.
function levelTuning(){
  const step=Math.max(0,level-1);
  return {
    speedMult:1+Math.min(.90,step*.055),
    fireMult:1+Math.min(1.35,step*.080),
    bulletMult:1+Math.min(.38,step*.025),
    aimMult:Math.max(.30,1-Math.min(.70,step*.055)),
    strafeMult:1+Math.min(1.20,step*.070),
    lead:Math.min(.46,step*.025),
    aggression:Math.min(.34,step*.018),
    burstChance:Math.min(.62,Math.max(0,step-2)*.045),
    dodgeMult:1+Math.min(1.10,step*.065),
    dodgeLookAhead:Math.min(1.35,.58+step*.045)
  };
}

const player={x:W*.25,y:H*.5,r:31,speed:290,color:'#16a8ff',dashCd:0,fireCd:0,facing:0,hitFlash:0};
const enemy={x:W*.75,y:H*.5,r:31,speed:215,color:'#ff7a18',fireCd:0,aiPhase:0,facing:Math.PI,hitFlash:0,evasionCd:0};

function weaponCount(){
  if(playerStreak>=6)return 5;
  if(playerStreak>=4)return 4;
  if(playerStreak>=2)return 2;
  return 1;
}

function updateMetaHud(){
  levelEl.textContent=level;
  streakEl.textContent=playerStreak;
  const shots=weaponCount();
  weaponEl.textContent=shots===1?'SINGLE':shots===2?'DOUBLE':shots===4?'QUAD':'FIVE-FIRE';
  difficultyEl.textContent=difficultyProfiles[difficulty].label;
  document.querySelectorAll('.difficulty-btn').forEach(b=>b.classList.toggle('active',b.dataset.difficulty===difficulty));
}

function resetPositions(){
  player.x=W*.23;player.y=H*.50;
  enemy.x=W*.77;enemy.y=H*.50;
  player.facing=Math.atan2(enemy.y-player.y,enemy.x-player.x);
  enemy.facing=Math.atan2(player.y-enemy.y,player.x-enemy.x);
  bullets=[];
}
function resetRoundState(){player.dashCd=0;player.fireCd=0;enemy.fireCd=.22;enemy.evasionCd=0;player.hitFlash=0;enemy.hitFlash=0;}
function resetGame(){
  blueScore=0;orangeScore=0;timeLeft=100;suddenDeath=false;playerStreak=0;
  modeLabel.textContent='FIRST TO 20';
  resetPositions();resetRoundState();updateHud();updateMetaHud();
}
function updateHud(){
  timerEl.textContent=Math.max(0,Math.ceil(timeLeft));
  blueScoreEl.textContent=blueScore;orangeScoreEl.textContent=orangeScore;
  timerEl.style.color=timeLeft<=10?'#ffb347':'#eef6ff';
}
function showMessage(text,sub=''){
  message.innerHTML=`<div>${text}</div>${sub?`<small>${sub}</small>`:''}`;
  message.classList.remove('hidden');
}
function hideMessage(){message.classList.add('hidden');}
function endGame(text){
  running=false;
  if(rafId){cancelAnimationFrame(rafId);rafId=0;}
  const playerWon=blueScore>orangeScore;
  if(playerWon){level++;localStorage.setItem('arenaLevel',String(level));}
  updateMetaHud();
  showMessage(text,playerWon?`LEVEL ${level-1} CLEARED • LEVEL ${level} UNLOCKED`:`LEVEL ${level} • TRY AGAIN`);
  playerWon?sfx.win():sfx.lose();
  startBtn.textContent='PLAY AGAIN';
  startBtn.classList.add('ready');
}
function score(side){
  if(!running)return;
  if(side==='blue'){
    blueScore++;
    playerStreak++;
    sfx.kill();
    const shots=weaponCount();
    if(playerStreak===2){showToast('DOUBLE FIRE UNLOCKED 🔥🔥');sfx.power();}
    else if(playerStreak===4){showToast('QUAD FIRE UNLOCKED 🔥×4');sfx.power();}
    else if(playerStreak===6){showToast('FIVE-FIRE MAX 🔥×5');sfx.power();}
  }else{
    orangeScore++;
    playerStreak=0;
    sfx.death();
    showToast('STREAK RESET • SINGLE FIRE');
  }
  updateHud();updateMetaHud();
  if(blueScore>=WIN_SCORE||orangeScore>=WIN_SCORE){
    endGame((blueScore>orangeScore?'ERIC':'ALBERT')+' WINS');return;
  }
  resetPositions();resetRoundState();
}
function start(){
  if(running)return;
  resetGame();
  running=true;hideMessage();
  difficultyPanel.classList.add('compact');
  startBtn.textContent='RESTART';startBtn.classList.remove('ready');
  sfx.start();
  last=performance.now();
  if(rafId)cancelAnimationFrame(rafId);
  rafId=requestAnimationFrame(loop);
}

let toastTimer=0;
function showToast(text){
  const toast=document.getElementById('toast');
  toast.textContent=text;toast.classList.add('show');
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('show'),1100);
}

function spawnShot(shooter,target,isBlue,angleOffset=0,speedOverride=null){
  const dx=target.x-shooter.x,dy=target.y-shooter.y;
  const base=Math.atan2(dy,dx)+angleOffset;
  const speed=speedOverride||(isBlue?650:difficultyProfiles[difficulty].bulletSpeed);
  const muzzle=36;
  bullets.push({x:shooter.x+Math.cos(base)*muzzle,y:shooter.y+Math.sin(base)*muzzle,vx:Math.cos(base)*speed,vy:Math.sin(base)*speed,r:8,blue:isBlue,life:2,angle:base});
  // Visual facing is handled continuously in update() so movement never twists the dragon.
}
function firePlayer(){
  if(!running||player.fireCd>0)return;
  player.fireCd=.42;
  const n=weaponCount();
  const spreads={1:[0],2:[-.055,.055],4:[-.14,-.045,.045,.14],5:[-.18,-.09,0,.09,.18]};
  spreads[n].forEach(a=>spawnShot(player,enemy,true,a));
  sfx.fire();
}
function fireEnemy(){
  if(!running||enemy.fireCd>0)return;
  const p=difficultyProfiles[difficulty];
  const t=levelTuning();
  enemy.fireCd=Math.max(.11,1/(p.fireRate*t.fireMult));

  // Predict where the player is going instead of always aiming at the current position.
  const moveX=joystickX||((pressed.right?1:0)-(pressed.left?1:0));
  const moveY=joystickY||((pressed.down?1:0)-(pressed.up?1:0));
  const leadStrength=t.lead*(difficulty==='hard'?1.15:difficulty==='easy'?.78:1);
  const predicted={
    x:player.x+moveX*player.speed*leadStrength,
    y:player.y+moveY*player.speed*leadStrength
  };
  const err=(Math.random()*2-1)*Math.max(.008,p.aimError*t.aimMult);
  const shotSpeed=p.bulletSpeed*t.bulletMult;
  spawnShot(enemy,predicted,false,err,shotSpeed);

  // From level 5 onward Albert can occasionally fire a tight second flame.
  if(level>=5 && Math.random()<t.burstChance){
    const offset=(Math.random()<.5?-1:1)*(difficulty==='hard'?.035:.05);
    spawnShot(enemy,predicted,false,err+offset,shotSpeed*.98);
  }
  sfx.enemyFire();
}
function dash(){
  if(!running||player.dashCd>0)return;
  player.dashCd=2.6;
  sfx.dash();
  let dx=joystickX||((pressed.right?1:0)-(pressed.left?1:0)),dy=joystickY||((pressed.down?1:0)-(pressed.up?1:0));
  if(!dx&&!dy){dx=Math.cos(player.facing);dy=Math.sin(player.facing);}
  const len=Math.hypot(dx,dy)||1;player.x+=dx/len*145;player.y+=dy/len*145;clamp(player);
}
function clamp(p){p.x=Math.max(p.r+24,Math.min(W-p.r-24,p.x));p.y=Math.max(p.r+24,Math.min(H-p.r-24,p.y));}

function update(dt){
  if(!running)return;
  player.dashCd=Math.max(0,player.dashCd-dt);player.fireCd=Math.max(0,player.fireCd-dt);enemy.fireCd=Math.max(0,enemy.fireCd-dt);
  player.hitFlash=Math.max(0,player.hitFlash-dt);enemy.hitFlash=Math.max(0,enemy.hitFlash-dt);enemy.evasionCd=Math.max(0,enemy.evasionCd-dt);
  let dx=joystickX||((pressed.right?1:0)-(pressed.left?1:0)),dy=joystickY||((pressed.down?1:0)-(pressed.up?1:0));
  if(dx||dy){const len=Math.hypot(dx,dy);const strength=Math.min(1,len);player.x+=dx/len*player.speed*strength*dt;player.y+=dy/len*player.speed*strength*dt;clamp(player);}

  const p=difficultyProfiles[difficulty];
  const t=levelTuning();
  enemy.speed=p.enemySpeed*t.speedMult;
  enemy.aiPhase+=dt*(1+Math.min(.7,(level-1)*.025));
  const toPlayerX=player.x-enemy.x,toPlayerY=player.y-enemy.y,dist=Math.hypot(toPlayerX,toPlayerY)||1;
  // Higher levels close the distance more aggressively and strafe more strongly.
  const baseRange=difficulty==='hard'?330:difficulty==='medium'?380:430;
  const desiredRange=Math.max(210,baseRange-(level-1)*7);
  const forward=(dist>desiredRange?1+t.aggression:-.55-t.aggression*.35);
  const nx=toPlayerX/dist,ny=toPlayerY/dist;
  const weave=Math.sin(enemy.aiPhase*1.85)+Math.sin(enemy.aiPhase*.91)*.45;
  const sx=-ny*weave,sy=nx*weave;

  // Albert scans Eric fire and actively dodges shots that are on a collision course.
  let dodgeX=0,dodgeY=0,danger=0;
  for(const b of bullets){
    if(!b.blue)continue;
    const rx=enemy.x-b.x, ry=enemy.y-b.y;
    const vv=b.vx*b.vx+b.vy*b.vy||1;
    const time=(rx*b.vx+ry*b.vy)/vv;
    if(time<=0||time>t.dodgeLookAhead)continue;
    const closestX=b.x+b.vx*time, closestY=b.y+b.vy*time;
    const missX=enemy.x-closestX, missY=enemy.y-closestY;
    const miss=Math.hypot(missX,missY);
    const dangerRadius=enemy.r+52+(level-1)*1.8;
    if(miss<dangerRadius){
      const side=Math.sign((enemy.x-b.x)*b.vy-(enemy.y-b.y)*b.vx)||1;
      const blen=Math.hypot(b.vx,b.vy)||1;
      const perpX=-b.vy/blen*side, perpY=b.vx/blen*side;
      const urgency=(1-miss/dangerRadius)*(1-time/t.dodgeLookAhead);
      dodgeX+=perpX*urgency; dodgeY+=perpY*urgency; danger+=urgency;
    }
  }
  if(danger>0){
    const dlen=Math.hypot(dodgeX,dodgeY)||1;
    dodgeX=dodgeX/dlen*p.dodge*t.dodgeMult*2.85;
    dodgeY=dodgeY/dlen*p.dodge*t.dodgeMult*2.85;

    // Albert can make a short evasive burst when a shot is about to connect.
    // Higher levels recover this move faster, making him substantially harder to hit.
    if(enemy.evasionCd<=0 && danger>.12){
      const burst=48+Math.min(78,(level-1)*4);
      enemy.x+=dodgeX/dlen*burst;
      enemy.y+=dodgeY/dlen*burst;
      clamp(enemy);
      enemy.evasionCd=Math.max(.28,.72-Math.min(.38,(level-1)*.025));
    }
  }

  const moveBoost=danger>0?1.42:1.08;
  enemy.x+=(nx*forward+sx*p.strafe*t.strafeMult+dodgeX)*enemy.speed*moveBoost*dt;
  enemy.y+=(ny*forward+sy*p.strafe*t.strafeMult+dodgeY)*enemy.speed*moveBoost*dt;
  clamp(enemy);
  // Dragons always visually track each other instead of rotating with movement.
  // This keeps the body orientation stable and makes fire leave the mouth naturally.
  player.facing=Math.atan2(enemy.y-player.y,enemy.x-player.x);
  enemy.facing=Math.atan2(player.y-enemy.y,player.x-enemy.x);
  if(enemy.fireCd<=0)fireEnemy();

  bullets.forEach(b=>{b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;});
  for(const b of bullets){
    const target=b.blue?enemy:player;
    if(Math.hypot(b.x-target.x,b.y-target.y)<b.r+target.r*.72){
      b.life=0;target.hitFlash=.18;score(b.blue?'blue':'orange');break;
    }
  }
  bullets=bullets.filter(b=>b.life>0&&b.x>-30&&b.x<W+30&&b.y>-30&&b.y<H+30);
  if(!suddenDeath){
    timeLeft-=dt;
    if(timeLeft<=0){
      timeLeft=0;updateHud();
      if(blueScore===orangeScore){suddenDeath=true;modeLabel.textContent='SUDDEN DEATH';showMessage('SUDDEN DEATH','NEXT HIT WINS');setTimeout(()=>{if(running)hideMessage()},900);}
      else endGame((blueScore>orangeScore?'ERIC':'ALBERT')+' WINS');
    }
  }
  updateHud();
}

function drawGrid(){
  ctx.fillStyle='#07111f';ctx.fillRect(0,0,W,H);
  ctx.strokeStyle='rgba(46,93,140,.18)';ctx.lineWidth=1;
  for(let x=40;x<W;x+=60){ctx.beginPath();ctx.moveTo(x,25);ctx.lineTo(x,H-25);ctx.stroke();}
  for(let y=40;y<H;y+=60){ctx.beginPath();ctx.moveTo(25,y);ctx.lineTo(W-25,y);ctx.stroke();}
  ctx.strokeStyle='rgba(255,255,255,.15)';ctx.strokeRect(24,24,W-48,H-48);ctx.beginPath();ctx.moveTo(W/2,24);ctx.lineTo(W/2,H-24);ctx.stroke();
}
function drawWing(sign,isBlue){
  ctx.fillStyle=isBlue?'#087ccf':'#c64d0a';ctx.strokeStyle=isBlue?'#71d8ff':'#ffbd72';ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(-4,sign*8);ctx.lineTo(-27,sign*31);ctx.lineTo(-58,sign*22);ctx.lineTo(-39,sign*5);ctx.lineTo(-56,sign*2);ctx.lineTo(-25,sign*-5);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.strokeStyle='rgba(255,255,255,.28)';ctx.beginPath();ctx.moveTo(-16,sign*9);ctx.lineTo(-43,sign*20);ctx.moveTo(-18,sign*7);ctx.lineTo(-42,sign*4);ctx.stroke();
}
function drawDragon(p,isBlue){
  ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.facing);ctx.shadowBlur=22;ctx.shadowColor=p.color;
  if(p.hitFlash>0){ctx.shadowBlur=38;ctx.shadowColor='#fff';}
  // long serpentine tail with pointed tip
  ctx.strokeStyle=p.color;ctx.lineWidth=11;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-17,0);ctx.bezierCurveTo(-38,-2,-48,18,-65,8);ctx.stroke();
  ctx.fillStyle=p.color;ctx.beginPath();ctx.moveTo(-61,8);ctx.lineTo(-76,0);ctx.lineTo(-61,-6);ctx.closePath();ctx.fill();
  drawWing(-1,isBlue);drawWing(1,isBlue);
  // rear legs + claws
  ctx.strokeStyle=p.color;ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(-9,-10);ctx.lineTo(-18,-22);ctx.lineTo(-10,-29);ctx.moveTo(-9,10);ctx.lineTo(-18,22);ctx.lineTo(-10,29);ctx.stroke();
  ctx.strokeStyle='#eef8ff';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-10,-29);ctx.lineTo(-5,-33);ctx.moveTo(-10,29);ctx.lineTo(-5,33);ctx.stroke();
  // armored body + neck
  ctx.fillStyle=p.color;ctx.beginPath();ctx.ellipse(-3,0,28,16,0,0,Math.PI*2);ctx.fill();ctx.fillRect(13,-10,22,20);
  // dragon head and long snout
  ctx.beginPath();ctx.ellipse(32,0,18,14,0,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.moveTo(38,-9);ctx.lineTo(61,-6);ctx.lineTo(66,0);ctx.lineTo(61,6);ctx.lineTo(38,9);ctx.closePath();ctx.fill();
  // jaw
  ctx.fillStyle=isBlue?'#075e9d':'#9e3705';ctx.beginPath();ctx.moveTo(43,3);ctx.lineTo(63,2);ctx.lineTo(55,10);ctx.closePath();ctx.fill();
  // horns
  ctx.shadowBlur=0;ctx.fillStyle='#f2f7ff';ctx.beginPath();ctx.moveTo(26,-11);ctx.lineTo(15,-27);ctx.lineTo(35,-14);ctx.closePath();ctx.fill();ctx.beginPath();ctx.moveTo(26,11);ctx.lineTo(15,27);ctx.lineTo(35,14);ctx.closePath();ctx.fill();
  // crest spikes
  for(let x=-16;x<=12;x+=10){ctx.beginPath();ctx.moveTo(x,-13);ctx.lineTo(x+4,-22);ctx.lineTo(x+8,-13);ctx.fill();}
  // eye
  ctx.fillStyle='#fff7a6';ctx.beginPath();ctx.arc(40,-6,3.2,0,Math.PI*2);ctx.fill();ctx.fillStyle='#111';ctx.beginPath();ctx.arc(41,-6,1.2,0,Math.PI*2);ctx.fill();
  // nostril
  ctx.fillStyle='#10151d';ctx.beginPath();ctx.arc(58,-2,1.6,0,Math.PI*2);ctx.fill();
  ctx.restore();
}
function drawFireball(b){
  ctx.save();ctx.translate(b.x,b.y);ctx.rotate(Math.atan2(b.vy,b.vx));
  const c=b.blue?'#29c7ff':'#ff6817';ctx.shadowBlur=24;ctx.shadowColor=c;
  const grad=ctx.createLinearGradient(-28,0,10,0);grad.addColorStop(0,'rgba(255,90,0,0)');grad.addColorStop(.38,c);grad.addColorStop(1,'#fff4a8');
  ctx.fillStyle=grad;ctx.beginPath();ctx.moveTo(-30,0);ctx.quadraticCurveTo(-8,-14,11,0);ctx.quadraticCurveTo(-8,14,-30,0);ctx.fill();
  ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(7,0,4.5,0,Math.PI*2);ctx.fill();ctx.restore();
}
function draw(){drawGrid();drawDragon(player,true);drawDragon(enemy,false);for(const b of bullets)drawFireball(b);}
function loop(ts){
  if(!running){draw();rafId=0;return;}
  const dt=Math.min(.033,(ts-last)/1000||0);last=ts;update(dt);draw();
  if(running)rafId=requestAnimationFrame(loop);else rafId=0;
}

function startFromButton(e){
  if(e){e.preventDefault();e.stopPropagation();}
  if(running){running=false;if(rafId)cancelAnimationFrame(rafId);rafId=0;}
  resetJoystick();
  start();
}
// One touch/click path only. Prevents iOS long-press/text-selection from swallowing PLAY AGAIN.
startBtn.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();try{startBtn.setPointerCapture(e.pointerId)}catch(_){}});
startBtn.addEventListener('pointerup',startFromButton);
startBtn.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){startFromButton(e);}});

document.querySelectorAll('.difficulty-btn').forEach(btn=>btn.addEventListener('click',()=>{
  if(running)return;
  difficulty=btn.dataset.difficulty;localStorage.setItem('arenaDifficulty',difficulty);updateMetaHud();showToast(`${difficultyProfiles[difficulty].label} MODE`);
}));

const fireBtn=document.getElementById('fireBtn');
const dashBtn=document.getElementById('dashBtn');
function actionPointerDown(e,action){e.preventDefault();e.stopPropagation();try{e.currentTarget.setPointerCapture(e.pointerId);}catch(_){}action();}
fireBtn.addEventListener('pointerdown',e=>actionPointerDown(e,firePlayer));
dashBtn.addEventListener('pointerdown',e=>actionPointerDown(e,dash));

const movePad=document.getElementById('movePad');
const joystickKnob=document.getElementById('joystickKnob');
let joystickPointer=null;
function setJoystick(e){const r=movePad.getBoundingClientRect();const cx=r.left+r.width/2,cy=r.top+r.height/2;let dx=e.clientX-cx,dy=e.clientY-cy;const max=r.width*.32,dist=Math.hypot(dx,dy);if(dist>max){dx=dx/dist*max;dy=dy/dist*max;}joystickX=dx/max;joystickY=dy/max;joystickKnob.style.transform=`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px))`;}
function resetJoystick(){joystickPointer=null;joystickX=0;joystickY=0;joystickKnob.style.transform='translate(-50%,-50%)';}
movePad.addEventListener('pointerdown',e=>{e.preventDefault();joystickPointer=e.pointerId;try{movePad.setPointerCapture(e.pointerId)}catch(_){}setJoystick(e);});
movePad.addEventListener('pointermove',e=>{if(e.pointerId===joystickPointer){e.preventDefault();setJoystick(e);}});
['pointerup','pointercancel','lostpointercapture'].forEach(type=>movePad.addEventListener(type,e=>{if(e.pointerId===joystickPointer)resetJoystick();}));

window.addEventListener('keydown',e=>{if(['ArrowUp','w','W'].includes(e.key))pressed.up=true;if(['ArrowDown','s','S'].includes(e.key))pressed.down=true;if(['ArrowLeft','a','A'].includes(e.key))pressed.left=true;if(['ArrowRight','d','D'].includes(e.key))pressed.right=true;if(e.key===' ')firePlayer();if(e.key==='Shift')dash();});
window.addEventListener('keyup',e=>{if(['ArrowUp','w','W'].includes(e.key))pressed.up=false;if(['ArrowDown','s','S'].includes(e.key))pressed.down=false;if(['ArrowLeft','a','A'].includes(e.key))pressed.left=false;if(['ArrowRight','d','D'].includes(e.key))pressed.right=false;});

// Game UI should behave like a native control surface, not selectable webpage text.
['selectstart','contextmenu','dragstart'].forEach(type=>document.addEventListener(type,e=>e.preventDefault(),{passive:false}));
document.addEventListener('touchmove',e=>{if(e.target.closest && e.target.closest('#movePad,.actions,#startBtn'))e.preventDefault();},{passive:false});

if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));}
resetGame();draw();showMessage('ARENA DUEL','CHOOSE DIFFICULTY • FIRST TO 20');
