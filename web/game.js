import {loadAssets,drawGame,createAudio} from './render.js';
const $=s=>document.querySelector(s),canvas=$('#field'),ctx=canvas.getContext('2d');
const keys=new Set(),audio=createAudio();
let engine,started=false,paused=false,last=0,accumulator=0,previousPhase=-1,soundEnabled=true;
const bindings={KeyA:1,KeyQ:1,KeyD:2,KeyW:4,KeyZ:4,Space:8,ArrowLeft:16,ArrowRight:32,ArrowUp:64,KeyP:128};
const bonusNames=['','Vitesse augmentée','Vitesse réduite','Super saut','Petit saut','Gel adverse','Gel','Grand but','Petit but','Bombes','Grand ballon','Ballon rebondissant','Petit ballon','Ballon sans rebond','Grande tête','Petite tête','Pied adverse cassé','Pied cassé','Intrus sur le terrain'];
const effectNames=['ring','green-ring','red-ring','explosion','dust','trail'];
for(const [id,selected]of [['skin-left',1],['skin-right',2]])for(let i=1;i<=26;i++){const option=new Option(`Tête ${i}`,i);option.selected=i===selected;$('#'+id).add(option);}
function input(){let mask=0;for(const k of keys)mask|=bindings[k]||0;return mask;}
function snapshot(){return{started,paused,phase:engine?.game_value(0),remainingTicks:engine?.game_value(1),score:[engine?.game_value(2),engine?.game_value(3)],countdown:engine?.game_value(4),tick:engine?.game_value(6)};}
function playSounds(mask){if(!soundEnabled)return;for(const[bit,name]of [[1,'kick'],[2,'jump'],[4,'die'],[8,'whistle'],[16,'pop'],[32,'coin'],[64,'explosion']])if(mask&bit)audio.play(name,{volume:.5});if(mask&4)audio.play('cheer',{volume:.3});}
function music(){if(soundEnabled&&started&&!paused&&engine.game_value(0)!==3)audio.play('music-match',{loop:true,volume:.14});else audio.stopAll();}
function reset(){
  if(!engine)return;audio.unlock();
  engine.game_start(crypto.getRandomValues(new Uint32Array(1))[0],+$('#mode').value,+$('#goals').value,+$('#bonuses').checked);
  engine.game_set_skin(0,+$('#skin-left').value);engine.game_set_skin(1,+$('#skin-right').value);
  started=true;paused=false;previousPhase=-1;keys.clear();accumulator=0;last=0;
  for(const id of ['welcome','finished','paused'])$('#'+id).hidden=true;
  $('#pause').disabled=false;$('#pause').textContent='Pause';$('#restart').disabled=false;
  $('#settings-legend').textContent='Réglages de la prochaine partie';canvas.focus();music();update();
}
function pause(value=true){if(!started||engine.game_value(0)===3)return;paused=value;keys.clear();accumulator=0;last=0;$('#paused').hidden=!value;$('#pause').textContent=value?'Reprendre':'Pause';music();if(value)$('#resume').focus();else canvas.focus();}
for(const id of ['start','again','restart'])$('#'+id).addEventListener('click',reset);
$('#pause').addEventListener('click',()=>pause(!paused));$('#resume').addEventListener('click',()=>pause(false));
for(const [side,id]of ['skin-left','skin-right'].entries())$('#'+id).addEventListener('change',()=>engine?.game_set_skin(side,+$('#'+id).value));
$('#sound').addEventListener('click',()=>{soundEnabled=!soundEnabled;$('#sound').textContent=soundEnabled?'Son activé':'Son coupé';$('#sound').setAttribute('aria-pressed',String(soundEnabled));audio.unlock();music();});
window.addEventListener('keydown',e=>{
  if(['SELECT','INPUT'].includes(e.target.tagName))return;
  if(e.code==='Escape'){if(started){e.preventDefault();pause(!paused);}return;}
  if(bindings[e.code]&&started&&!paused&&engine.game_value(0)!==3){e.preventDefault();keys.add(e.code);}
});
window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{keys.clear();pause();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){keys.clear();pause();}});
function renderState(){
  const state={started,paused,skins:[+$('#skin-left').value,+$('#skin-right').value]};if(!engine)return state;
  state.goalFrames=[8,9].map(f=>engine.game_value(f)===140?2:engine.game_value(f)===60?3:1);
  state.players=[0,1].map(s=>Object.fromEntries(['speed','jump','freeze','broken','bombed','scale'].map((name,f)=>[name,engine.game_player_value(s,f)])));
  state.powerups=Array.from({length:engine.game_pickup_count()},(_,i)=>({kind:engine.game_pickup_value(i,0),x:engine.game_pickup_value(i,1),y:engine.game_pickup_value(i,2),ttl:engine.game_pickup_value(i,3)}));
  state.bombs=Array.from({length:engine.game_bomb_count()},(_,i)=>({x:engine.game_bomb_value(i,0),y:engine.game_bomb_value(i,1)}));
  state.effects=Array.from({length:engine.game_effect_count()},(_,i)=>{
    const kind=engine.game_effect_value(i,0),age=engine.game_effect_value(i,3),w=engine.game_effect_value(i,4),h=engine.game_effect_value(i,5);
    return{kind:effectNames[kind],x:engine.game_effect_value(i,1),y:engine.game_effect_value(i,2),age,width:kind===4?10+age/2:w,height:kind===4?10+age/2:h,alpha:kind===4?Math.max(0,(1-age/10)*.6):kind===5?Math.max(0,1-age/7):1};
  });
  state.ballBounce=engine.game_value(13);state.ballFrame=state.ballBounce===0?3:state.ballBounce===2?2:1;
  return state;
}
function draw(){drawGame(ctx,engine,renderState());}
function update(){
  const state=snapshot();$('#score-left').textContent=state.score[0];$('#score-right').textContent=state.score[1];
  const mode=engine.game_value(12),seconds=Math.ceil(state.remainingTicks/30);
  $('.clock span').textContent=mode===0?'Temps restant':mode===1?'Objectif':'Premier but';
  $('#clock').textContent=mode===0?`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`:mode===1?'7 buts':'Gagnant';
  $('.clock').classList.toggle('urgent',mode===0&&seconds<=10);
  const notice=engine.game_value(11)>0?bonusNames[engine.game_value(10)]:'';
  $('#bonus-notice').textContent=notice;$('#bonus-notice').hidden=!notice;
  if(state.phase!==previousPhase){previousPhase=state.phase;
    $('#status').textContent=state.phase===0?'Préparez-vous…':state.phase===2?`But pour ${engine.game_value(5)===0?'Bleu':'Rouge'} !`:state.phase===3?'Match terminé':'Duel local · À vous de jouer';
    if(state.phase===3){const[a,b]=state.score;$('#result').textContent=a===b?'Match nul !':a>b?'Bleu remporte le match !':'Rouge remporte le match !';$('#final-score').textContent=`Bleu ${a} — ${b} Rouge`;$('#finished').hidden=false;$('#paused').hidden=true;$('#pause').disabled=true;keys.clear();audio.stopAll();$('#again').focus();}
  }
}
function animate(time){const elapsed=last?Math.min(time-last,250):0;last=time;
  if(engine&&started&&!paused&&engine.game_value(0)!==3){accumulator+=elapsed;while(accumulator>=1000/30){engine.game_tick(input());playSounds(engine.game_value(7));accumulator-=1000/30;}update();}
  draw();requestAnimationFrame(animate);
}
window.sportheads={snapshot,renderState,get engine(){return engine;},render(){update();draw();}};
try{
  const response=await fetch('./physics-core.wasm');if(!response.ok)throw new Error('Chargement du moteur impossible.');
  const[wasm]=await Promise.all([WebAssembly.instantiateStreaming(response),loadAssets()]);engine=wasm.instance.exports;engine.game_reset(1);
  $('#start').disabled=false;$('#start').textContent='Commencer';window.ready=true;
}catch(error){$('#start').textContent='Recharger la page';$('#start').disabled=false;$('#start').addEventListener('click',()=>location.reload());$('#status').textContent='Le jeu n’a pas pu se charger. Rechargez la page pour réessayer.';window.loadError=error.message;}
requestAnimationFrame(animate);
