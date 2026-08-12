const canvas=document.getElementById('game');
const ctx=canvas.getContext('2d');
const timerEl=document.getElementById('timer');
const blueScoreEl=document.getElementById('scoreBlue');
const orangeScoreEl=document.getElementById('scoreOrange');
const modeLabel=document.getElementById('modeLabel');
const message=document.getElementById('message');
const startBtn=document.getElementById('startBtn');

const W=canvas.width,H=canvas.height;
let running=false, suddenDeath=false, timeLeft=100, last=0, accumulator=0;
let blueScore=0, orangeScore=0, pressed={};
let joystickX=0, joystickY=0;
let bullets=[];

const player={x:W*.25,y:H*.5,r:28,speed:290,color:'#16a8ff',dashCd:0,fireCd:0};
const enemy={x:W*.75,y:H*.5,r:28,speed:215,color:'#ff7a18',fireCd:0,aiPhase:0};

function resetPositions(){player.x=W*.25;player.y=H*.5;enemy.x=W*.75;enemy.y=H*.5;bullets=[];}
function resetGame(){blueScore=0;orangeScore=0;timeLeft=100;suddenDeath=false;modeLabel.textContent='FIRST TO 5';updateHud();resetPositions();}
function updateHud(){timerEl.textContent=Math.max(0,Math.ceil(timeLeft));blueScoreEl.textContent=blueScore;orangeScoreEl.textContent=orangeScore;timerEl.style.color=timeLeft<=10?'#ffb347':'#eef6ff';}
function showMessage(text){message.textContent=text;message.classList.remove('hidden');}
function hideMessage(){message.classList.add('hidden');}
function endGame(text){running=false;showMessage(text);startBtn.textContent='PLAY AGAIN';}
function score(side){if(side==='blue') blueScore++; else orangeScore++; updateHud(); if(blueScore>=5||orangeScore>=5){endGame((blueScore>orangeScore?'EAGLE':'SHADOW')+' WINS');return;} resetPositions();}
function start(){resetGame();running=true;hideMessage();startBtn.textContent='RESTART';last=performance.now();requestAnimationFrame(loop);}

function fire(shooter,target,isBlue){if(shooter.fireCd>0)return;shooter.fireCd=.45;const dx=target.x-shooter.x,dy=target.y-shooter.y,len=Math.hypot(dx,dy)||1;bullets.push({x:shooter.x,y:shooter.y,vx:dx/len*620,vy:dy/len*620,r:9,blue:isBlue,life:2});}
function dash(){if(player.dashCd>0)return;player.dashCd=2.6;let dx=joystickX||((pressed.right?1:0)-(pressed.left?1:0)),dy=joystickY||((pressed.down?1:0)-(pressed.up?1:0));if(!dx&&!dy){dx=enemy.x>player.x?1:-1;}const len=Math.hypot(dx,dy)||1;player.x+=dx/len*145;player.y+=dy/len*145;clamp(player);}
function clamp(p){p.x=Math.max(p.r+24,Math.min(W-p.r-24,p.x));p.y=Math.max(p.r+24,Math.min(H-p.r-24,p.y));}

function update(dt){if(!running)return;player.dashCd-=dt;player.fireCd-=dt;enemy.fireCd-=dt;
  let dx=joystickX||((pressed.right?1:0)-(pressed.left?1:0)),dy=joystickY||((pressed.down?1:0)-(pressed.up?1:0));if(dx||dy){const len=Math.hypot(dx,dy);const strength=Math.min(1,len);player.x+=dx/len*player.speed*strength*dt;player.y+=dy/len*player.speed*strength*dt;clamp(player);}
  enemy.aiPhase+=dt;const desiredY=H*.5+Math.sin(enemy.aiPhase*1.4)*H*.22;enemy.y+=Math.sign(desiredY-enemy.y)*enemy.speed*dt;const dist=player.x-enemy.x;enemy.x+=Math.sign(dist)*enemy.speed*.22*dt;clamp(enemy);if(Math.random()<dt*1.35)fire(enemy,player,false);
  bullets.forEach(b=>{b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;});
  for(const b of bullets){const target=b.blue?enemy:player;if(Math.hypot(b.x-target.x,b.y-target.y)<b.r+target.r){b.life=0;score(b.blue?'blue':'orange');break;}}
  bullets=bullets.filter(b=>b.life>0&&b.x>-20&&b.x<W+20&&b.y>-20&&b.y<H+20);
  if(!suddenDeath){timeLeft-=dt;if(timeLeft<=0){timeLeft=0;updateHud();if(blueScore===orangeScore){suddenDeath=true;modeLabel.textContent='SUDDEN DEATH';showMessage('SUDDEN DEATH');setTimeout(hideMessage,900);}else endGame((blueScore>orangeScore?'EAGLE':'SHADOW')+' WINS');}}
  updateHud();
}

function drawGrid(){ctx.fillStyle='#07111f';ctx.fillRect(0,0,W,H);ctx.strokeStyle='rgba(46,93,140,.18)';ctx.lineWidth=1;for(let x=40;x<W;x+=60){ctx.beginPath();ctx.moveTo(x,25);ctx.lineTo(x,H-25);ctx.stroke();}for(let y=40;y<H;y+=60){ctx.beginPath();ctx.moveTo(25,y);ctx.lineTo(W-25,y);ctx.stroke();}ctx.strokeStyle='rgba(255,255,255,.15)';ctx.strokeRect(24,24,W-48,H-48);ctx.beginPath();ctx.moveTo(W/2,24);ctx.lineTo(W/2,H-24);ctx.stroke();}
function drawDragon(p,isBlue){
  const target=isBlue?enemy:player; const a=Math.atan2(target.y-p.y,target.x-p.x);
  ctx.save();ctx.translate(p.x,p.y);ctx.rotate(a);ctx.shadowBlur=24;ctx.shadowColor=p.color;
  // wings
  ctx.fillStyle=isBlue?'#0878c9':'#c94b08';
  ctx.beginPath();ctx.moveTo(-8,-5);ctx.quadraticCurveTo(-30,-34,-39,-16);ctx.quadraticCurveTo(-25,-9,-16,4);ctx.closePath();ctx.fill();
  ctx.beginPath();ctx.moveTo(-8,5);ctx.quadraticCurveTo(-30,34,-39,16);ctx.quadraticCurveTo(-25,9,-16,-4);ctx.closePath();ctx.fill();
  // tail
  ctx.strokeStyle=p.color;ctx.lineWidth=9;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-16,0);ctx.quadraticCurveTo(-31,0,-39,10);ctx.stroke();
  // body/head
  ctx.fillStyle=p.color;ctx.beginPath();ctx.ellipse(0,0,23,14,0,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(19,0,12,0,Math.PI*2);ctx.fill();
  // horns
  ctx.shadowBlur=0;ctx.fillStyle='#eaf7ff';ctx.beginPath();ctx.moveTo(18,-9);ctx.lineTo(12,-18);ctx.lineTo(23,-10);ctx.fill();ctx.beginPath();ctx.moveTo(18,9);ctx.lineTo(12,18);ctx.lineTo(23,10);ctx.fill();
  // eye
  ctx.fillStyle='#fff7b0';ctx.beginPath();ctx.arc(23,-4,2.5,0,Math.PI*2);ctx.fill();
  ctx.restore();
}
function drawFireball(b){ctx.save();ctx.translate(b.x,b.y);const a=Math.atan2(b.vy,b.vx);ctx.rotate(a);const c=b.blue?'#62d8ff':'#ff6b19';ctx.shadowBlur=22;ctx.shadowColor=c;ctx.fillStyle=b.blue?'#b9f4ff':'#fff0a0';ctx.beginPath();ctx.arc(0,0,b.r,0,Math.PI*2);ctx.fill();ctx.fillStyle=c;ctx.beginPath();ctx.moveTo(-4,-7);ctx.lineTo(-25,0);ctx.lineTo(-4,7);ctx.closePath();ctx.fill();ctx.restore();}
function draw(){drawGrid();drawDragon(player,true);drawDragon(enemy,false);for(const b of bullets)drawFireball(b);}
function loop(ts){if(!running){draw();return;}const dt=Math.min(.033,(ts-last)/1000);last=ts;update(dt);draw();if(running)requestAnimationFrame(loop);}

startBtn.addEventListener('click',start);

// Multi-touch controls: movement and actions can be held/pressed at the same time.
const fireBtn=document.getElementById('fireBtn');
const dashBtn=document.getElementById('dashBtn');

function actionPointerDown(e,action){
  e.preventDefault();
  e.stopPropagation();
  try{e.currentTarget.setPointerCapture(e.pointerId);}catch(_){}
  action();
}
fireBtn.addEventListener('pointerdown',e=>actionPointerDown(e,()=>fire(player,enemy,true)));
dashBtn.addEventListener('pointerdown',e=>actionPointerDown(e,dash));

const movePad=document.getElementById('movePad');
const joystickKnob=document.getElementById('joystickKnob');
let joystickPointer=null;
function setJoystick(e){
  const r=movePad.getBoundingClientRect();
  const cx=r.left+r.width/2, cy=r.top+r.height/2;
  let dx=e.clientX-cx, dy=e.clientY-cy;
  const max=r.width*.32, dist=Math.hypot(dx,dy);
  if(dist>max){dx=dx/dist*max;dy=dy/dist*max;}
  joystickX=dx/max; joystickY=dy/max;
  joystickKnob.style.transform=`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px))`;
}
function resetJoystick(){joystickPointer=null;joystickX=0;joystickY=0;joystickKnob.style.transform='translate(-50%,-50%)';}
movePad.addEventListener('pointerdown',e=>{e.preventDefault();joystickPointer=e.pointerId;try{movePad.setPointerCapture(e.pointerId)}catch(_){}setJoystick(e);});
movePad.addEventListener('pointermove',e=>{if(e.pointerId===joystickPointer){e.preventDefault();setJoystick(e);}});
['pointerup','pointercancel','lostpointercapture'].forEach(type=>movePad.addEventListener(type,e=>{if(e.pointerId===joystickPointer)resetJoystick();}));

window.addEventListener('keydown',e=>{if(['ArrowUp','w','W'].includes(e.key))pressed.up=true;if(['ArrowDown','s','S'].includes(e.key))pressed.down=true;if(['ArrowLeft','a','A'].includes(e.key))pressed.left=true;if(['ArrowRight','d','D'].includes(e.key))pressed.right=true;if(e.key===' ')fire(player,enemy,true);if(e.key==='Shift')dash();});
window.addEventListener('keyup',e=>{if(['ArrowUp','w','W'].includes(e.key))pressed.up=false;if(['ArrowDown','s','S'].includes(e.key))pressed.down=false;if(['ArrowLeft','a','A'].includes(e.key))pressed.left=false;if(['ArrowRight','d','D'].includes(e.key))pressed.right=false;});

if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));}
resetGame();draw();showMessage('ARENA DUEL\n100 SECOND BATTLE');
