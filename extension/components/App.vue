<script setup lang="ts">
import { computed, nextTick, onMounted, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { browser } from 'wxt/browser';
import { SoundEffects } from '../lib/sound';
import type { GazeScript } from '../ui/gaze';
import { installAmazonAdapter, type AmazonIntent } from '../lib/amazon';
import BloubBot from './BloubBot.vue';
import Dashboard from './Dashboard.vue';
import Onboarding from './Onboarding.vue';
import { MascotController, MASCOT_ACTIONS } from '../lib/controller';
import { MockFinanceProvider, money, scenarios, storage } from '../lib/finance';
import { EXPRESSIONS, type ExpressionId } from '../bot/expressions';
import type { Choice, FinanceProvider, MascotAction, Outcome, PurchaseDetails, UserProfile } from '../lib/contracts';
const finance:FinanceProvider=new MockFinanceProvider(storage);
const sound=new SoundEffects({
  async read(){return (await browser.storage.local.get('pocket-sound-muted'))['pocket-sound-muted'] as boolean|undefined;},
  async write(muted){await browser.storage.local.set({'pocket-sound-muted':muted});},
});
const controller=new MascotController(undefined,undefined,action=>sound.action(action));const scene=controller.scene;
const stage=ref<HTMLElement>();const shell=ref<HTMLElement>();const panel=ref(false);const onboarding=ref(false);const feedback=ref('');
const isLocal=['localhost','127.0.0.1'].includes(location.hostname);
const isAmazon=location.hostname==='www.amazon.co.uk';
const follow=ref(true);
const thinkingGaze:GazeScript=time=>({yaw:-8,pitch:26,mix:Math.min(1,time/.25),spin:0,wander:.1});
const pendingAmazon=shallowRef<AmazonIntent|null>(null);
let amazonAdapter:ReturnType<typeof installAmazonAdapter>|undefined;
let hovering=false,pointerInside=false;
function cancelAmazon(){pendingAmazon.value?.cancel();pendingAmazon.value=null;}
function resumeAmazon(){const intent=pendingAmazon.value;if(!intent)return false;intent.continue();pendingAmazon.value=null;toast(`Click Amazon’s ${intent.label} again within 30 seconds to proceed. Pocket never clicks it for you.`);return true;}

const amount=ref(60);const category=ref('clothing');const loading=ref(false);const fail=ref(false);const busy=ref(false);const demo=ref(false);const ready=ref(false);
let request=0,demoRun=0,hoverTimer:ReturnType<typeof setTimeout>|undefined,toastTimer:ReturnType<typeof setTimeout>|undefined;
const timers=new Map<ReturnType<typeof setTimeout>,()=>void>();
const sleep=(ms:number)=>new Promise<void>(resolve=>{const id=setTimeout(()=>{timers.delete(id);resolve();},ms);timers.set(id,resolve);});
const showBackdrop=computed(()=>scene.backdrop||onboarding.value);
const warningRule=computed(()=>scene.dialogue?.rule?.text ?? (scene.dialogue&&scene.dialogue.lowestAfter<100?'Keep enough for your upcoming expenses.':'Pause before spending £50 or more.'));
const warningExplanation=computed(()=>{
  const result=scene.dialogue;if(!result)return '';
  if(result.message.includes('mock response failed'))return 'The mock response failed. You can still choose what happens next.';
  if(result.rule?.category===result.item.category)return 'You set this rule at your monthly check-in. This purchase goes against it.';
  if(result.lowestAfter<100)return `This purchase would leave ${money(result.lowestAfter)} before your next income.`;
  return 'You asked for a moment to reflect before purchases of £50 or more.';
});
const labels:Record<string,string>={neutre:'Neutral',attentif:'Attentive',surpris:'Surprised',excite:'Excited',heureux:'Happy',hilare:'Laughing',colere:'Grumpy',triste:'Sad',effraye:'Startled',mefiant:'Suspicious',confus:'Confused',curieux:'Curious',fier:'Proud',timide:'Shy',blase:'Aloof',somnolent:'Sleepy'};
function toast(message:string){feedback.value=message;clearTimeout(toastTimer);toastTimer=setTimeout(()=>feedback.value='',6500);}
function cancelWork(){leaveCorner(false);request++;busy.value=false;demoRun++;demo.value=false;}
async function action(type:MascotAction){cancelWork();cancelAmazon();await controller.dispatch({type});}
function openDashboard(){leaveCorner(false);cancelWork();cancelAmazon();onboarding.value=false;void controller.dispatch({type:'OPEN_DASHBOARD'});}
function closeDashboard(){void action('CLOSE_DASHBOARD');}
function enterCorner(){
  if(hovering||scene.dashboard||onboarding.value||scene.dialogue||busy.value)return;
  hovering=true;void controller.dispatch({type:'PEEK'});
  hoverTimer=setTimeout(()=>{hovering=false;openDashboard();},1250);
}
function leaveCorner(exit=true){clearTimeout(hoverTimer);const wasHovering=hovering;hovering=false;pointerInside=false;if(exit&&wasHovering&&!scene.dashboard&&!scene.dialogue&&!busy.value)void controller.dispatch({type:'DISMISS'});}
function hotspotPointer(event:PointerEvent){
  if(event.pointerType==='touch')return;
  const inside=event.clientX>=window.innerWidth-80&&event.clientY>=window.innerHeight-80;
  if(inside&&!pointerInside){pointerInside=true;enterCorner();}
  else if(!inside&&pointerInside)leaveCorner();
}
function viewportLeave(event:PointerEvent){if(event.target===document||event.relatedTarget===null)leaveCorner();}
function gesture(event:Event){void sound.unlock(event.isTrusted);}
function onMessage(message:unknown){if(message&&typeof message==='object'&&'type' in message&&message.type==='POCKET_OPEN_LAB'){panel.value=true;return Promise.resolve({ok:true});}return false;}
function soundChange(changes:Record<string,{newValue?:unknown}>,area:string){if(area==='local'&&'pocket-sound-muted' in changes)sound.setMuted(changes['pocket-sound-muted']?.newValue===true,false);}
async function evaluate(item:PurchaseDetails,forced?:Outcome){
  const token=++request;busy.value=true;
  try {
    if(loading.value){await controller.dispatch({type:'THINKING'});await sleep(1000);if(token!==request)return;}
    if(fail.value)throw new Error('Simulated response failure');
    const result=await finance.evaluate(item);if(token!==request)return;
    if(forced)result.outcome=forced;
    await controller.dispatch({type:'PURCHASE_EVALUATED',result});
    if(result.outcome==='green'&&token===request){await finance.respond(result,'continue');if(!resumeAmazon())toast('Fits your plan. Mock checkout continued; no order was placed.');}
  } catch(e) {
    if(token!==request)return;
    // Failure is advisory: the same autonomous choices stay available.
    const result=await finance.evaluate(item).catch(()=>null);
    if(token!==request)return;
    if(result){result.outcome='amber';result.title='Your call, as always.';result.message='The mock response failed. You can still continue, save, or record a reminder.';await controller.dispatch({type:'PURCHASE_EVALUATED',result});}
    else toast(e instanceof Error?e.message:'Please check the mock purchase amount.');
  } finally{if(token===request)busy.value=false;}
}
async function scenario(outcome:Outcome){cancelWork();cancelAmazon();await evaluate({...scenarios[outcome]!});}
async function choice(value:Choice){
  const e=scene.dialogue;if(!e)return;cancelWork();const token=request;scene.dialogue=null;
  const savedBefore=finance.state.profile.goal.saved;
  try {await finance.respond(e,value);
    toast(value==='continue'?`Mock checkout continued for ${money(e.item.price)}. No order was placed.`:value==='save'?`${money(finance.state.profile.goal.saved-savedBefore)} added to your mock goal. No real transfer.`:'Mock reminder recorded for 24 hours from now. No notification is scheduled.');
  }catch{toast('Choice recorded for this session. Local storage could not be updated.');}
  if(token!==request)return;
  if(value==='continue')resumeAmazon();else cancelAmazon();
  await controller.dispatch({type:value==='save'?'HAPPY':'DISMISS'});
  if(token===request&&value==='save')await controller.dispatch({type:'RETURN'});
}
function startOnboarding(){cancelWork();cancelAmazon();onboarding.value=true;scene.dashboard=false;scene.dialogue=null;void controller.dispatch({type:'THINKING'});}
async function saveProfile(profile:UserProfile){const token=request;try{await finance.updateProfile(profile);if(token!==request)return;onboarding.value=false;toast('Your plan is saved on this device.');openDashboard();}catch{toast('Could not save locally. Please reload the extension.');}}
async function reset(){cancelWork();cancelAmazon();onboarding.value=false;if(!scene.dashboard)void controller.dispatch({type:'RETURN'});await finance.reset();toast('Demo profile restored.');}
async function fullDemo(){
  cancelWork();cancelAmazon();const token=++demoRun;demo.value=true;onboarding.value=false;
  try{
    await evaluate({...scenarios.green!});if(token!==demoRun)return;await sleep(400);
    await evaluate({...scenarios.amber!});if(token!==demoRun)return;await sleep(2300);if(token!==demoRun)return;
    if(scene.dialogue){await finance.respond(scene.dialogue,'save');scene.dialogue=null;toast('Demo: £60 redirected to your flight home.');}
    if(token!==demoRun)return;
    await controller.dispatch({type:'HAPPY'});if(token!==demoRun)return;
    await evaluate({...scenarios.red!});if(token!==demoRun)return;await sleep(2500);if(token!==demoRun)return;
    if(scene.dialogue){await finance.respond(scene.dialogue,'remind');scene.dialogue=null;}
    if(token!==demoRun)return;
    await controller.dispatch({type:'DISMISS'});if(token!==demoRun)return;
    await controller.dispatch({type:'OPEN_DASHBOARD'});toast('Demo complete. Three decisions recorded; reminder is a local mock record.');
  }finally{if(token===demoRun)demo.value=false;}
}
function onShop(e:Event){
  if(!isLocal||!ready.value)return;
  const value=(e as CustomEvent).detail;
  if(value?.type==='OPEN_DASHBOARD'){openDashboard();return;}
  if(value?.type==='OPEN_DEV_PANEL'){panel.value=true;return;}
  const item=value?.item;
  // Events cross the page boundary. Accept only bounded, inert purchase data.
  if(!item||typeof item.title!=='string'||item.title.length>120||!Number.isFinite(item.price)||item.price<=0||item.price>100000||!['stationery','clothing','electronics','alcohol','groceries'].includes(item.category))return;
  cancelWork();void evaluate({id:'shop-'+Date.now(),title:item.title,price:item.price,currency:'GBP',category:item.category});
}
let focusBefore:HTMLElement|null=null;
watch(()=>scene.dashboard||onboarding.value||Boolean(scene.dialogue),async(open)=>{
  if(open){shell.value?.dispatchEvent(new Event('pocket:raise',{bubbles:true,composed:true}));focusBefore=((shell.value?.getRootNode() as ShadowRoot)?.activeElement??document.activeElement) as HTMLElement;await nextTick();shell.value?.querySelector<HTMLElement>('[role="dialog"] button')?.focus();}
  else {await nextTick();if(focusBefore?.isConnected)focusBefore.focus();else shell.value?.querySelector<HTMLElement>('.corner-hotspot')?.focus();}
});
function keyboard(e:KeyboardEvent){
  if(e.altKey&&e.shiftKey&&e.code==='KeyP'){e.preventDefault();panel.value=!panel.value;return;}
  if(e.key==='Escape'){if(panel.value){panel.value=false;return;}if(onboarding.value){onboarding.value=false;void action('RETURN');}else if(scene.dashboard)closeDashboard();else if(scene.dialogue||scene.visible)void action('DISMISS');return;}
  if(e.key==='Tab'){
    const dialog=shell.value?.querySelector('[role="dialog"]');if(!dialog)return;
    const nodes=[...dialog.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input,select,textarea,[tabindex="0"]')].filter(el=>el.getClientRects().length);
    const first=nodes[0],last=nodes.at(-1),active=shell.value?.getRootNode() instanceof ShadowRoot?(shell.value.getRootNode() as ShadowRoot).activeElement:document.activeElement;
    if(e.shiftKey&&active===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&active===last){e.preventDefault();first?.focus();}
  }
}
function resize(){controller.resize();}
let questionIndex=0;
function questionReaction(){controller.expression((['curieux','attentif','heureux','confus'] as ExpressionId[])[questionIndex++%4]!);}
function selectExpression(id:ExpressionId){if(!scene.visible)void controller.dispatch({type:'IDLE'});controller.expression(id);}
onMounted(async()=>{
  if(stage.value)controller.attach(stage.value);
  window.addEventListener('pocket:shop',onShop);window.addEventListener('resize',resize);window.addEventListener('keydown',keyboard);
  window.addEventListener('pointermove',hotspotPointer,{passive:true});document.addEventListener('pointerleave',viewportLeave);window.addEventListener('blur',leaveCornerOnBlur);
  window.addEventListener('pointerdown',gesture,{capture:true,passive:true});window.addEventListener('keydown',gesture,true);
  browser.runtime.onMessage.addListener(onMessage);browser.storage.onChanged.addListener(soundChange);
  if(isAmazon)amazonAdapter=installAmazonAdapter({document,onPurchase(intent){cancelWork();cancelAmazon();pendingAmazon.value=intent;void evaluate(intent.item);},onUnavailable(){toast('Pocket could not read a price for this item. Amazon’s button is unchanged.');}});
  try{await Promise.all([finance.load(),sound.load()]);}catch{toast('Using session-only demo data: local storage unavailable.');}
  ready.value=true;
  if(isLocal){document.documentElement.dataset.pocketExtension='ready';window.dispatchEvent(new CustomEvent('pocket:ready'));}
});
function leaveCornerOnBlur(){leaveCorner();}
onBeforeUnmount(()=>{cancelWork();cancelAmazon();amazonAdapter?.dispose();sound.dispose();controller.dispose();clearTimeout(hoverTimer);clearTimeout(toastTimer);for(const [id,resolve]of timers){clearTimeout(id);resolve();}timers.clear();window.removeEventListener('pocket:shop',onShop);window.removeEventListener('resize',resize);window.removeEventListener('keydown',keyboard);if(isLocal)delete document.documentElement.dataset.pocketExtension;window.removeEventListener('pointermove',hotspotPointer);document.removeEventListener('pointerleave',viewportLeave);window.removeEventListener('blur',leaveCornerOnBlur);window.removeEventListener('pointerdown',gesture,true);window.removeEventListener('keydown',gesture,true);browser.runtime.onMessage.removeListener(onMessage);browser.storage.onChanged.removeListener(soundChange);});
</script>
<template>
  <div ref="shell" class="pocket-root">
    <Transition name="backdrop"><div v-if="showBackdrop" class="backdrop" aria-hidden="true" @wheel.prevent @touchmove.prevent></div></Transition>
    <Transition name="surface"><Dashboard v-if="scene.dashboard&&!onboarding" @close="closeDashboard" /></Transition>
    <Transition name="surface"><Onboarding v-if="onboarding" :profile="finance.state.profile" @save="saveProfile" @close="onboarding=false;action('RETURN')" @question="questionReaction" /></Transition>
    <Transition name="dialogue"><section v-if="scene.dialogue" class="intervention modal-surface" :class="scene.dialogue.outcome" :role="scene.dialogue.outcome==='red'?'dialog':'region'" :aria-modal="scene.dialogue.outcome==='red'?true:undefined" aria-labelledby="intervention-title" data-intervention>
      <button class="warning-close" aria-label="Close purchase reminder" @click="action('DISMISS')">×</button>
      <h1 id="intervention-title">Before you buy.</h1>
      <blockquote>“{{warningRule}}”</blockquote>
      <p class="warning-product">{{scene.dialogue.item.title}} <span>— {{money(scene.dialogue.item.price)}}</span></p>
      <p class="warning-explanation">{{warningExplanation}}</p>
      <div class="choice-buttons">
        <button class="primary-button" @click="choice('save')">Save it instead</button>
        <button class="continue-button" @click="choice('continue')">Continue to checkout</button>
      </div>
      <div class="warning-text-actions">
        <button class="text-button" @click="choice('remind')">Remind me in 24 hours</button>
        <details><summary>Why am I seeing this?</summary><p>{{warningRule}} Your projected balance would change from {{money(scene.dialogue.lowestBefore)}} to {{money(scene.dialogue.lowestAfter)}}. This is a mock evaluation using your saved preferences.</p></details>
      </div>
    </section></Transition>
    <div ref="stage" class="mascot-stage" :class="{inactive:!scene.visible}" :aria-hidden="!scene.visible" data-mascot-stage>
      <div class="mascot-idle" :class="{sway:scene.action==='IDLE'}"><button class="mascot-button" :tabindex="scene.visible?0:-1" aria-label="Open Pocket dashboard" @click="openDashboard"><BloubBot :state="scene.internal" :expression="scene.expression" :active="scene.visible" :follow="follow&&scene.visible&&scene.action!=='THINKING'" :gaze="scene.action==='THINKING'?thinkingGaze:null" /></button></div>
      <span v-if="scene.exclamation" class="exclamation" data-exclamation>!</span><span v-if="scene.badge" class="approval-badge">✓ {{scene.badge}}<small>Why? {{money(finance.state.profile.balance)}} balance · {{money(finance.forecast().lowest)}} projected low · no applicable promise.</small></span>
    </div>
    <button v-if="!scene.dashboard&&!onboarding" class="corner-hotspot" aria-label="Open Pocket monthly recap" @click="openDashboard"></button>
    <div class="notification-region" aria-live="polite"><Transition name="toast"><div v-if="feedback" class="toast-message">{{feedback}}</div></Transition><span v-if="busy" class="loading-note">Pocket is having a little think…</span></div>

    <section v-if="panel" class="dev-panel" aria-label="Developer testing panel"><header><div><span class="eyebrow">FRONTEND PLAYGROUND</span><h2>The Pocket lab</h2></div><button class="icon-button" aria-label="Close developer panel" @click="panel=false">✕</button></header><div class="dev-status"><span>State <b data-current-state>{{scene.action}}</b></span><span>Event <b>{{scene.lastEvent}}</b></span></div><p class="small-note">Developer mode · deterministic mock provider · no automated orders or real reminders.</p>
      <div class="dev-sound"><label><input type="checkbox" :checked="sound.state.muted" @change="sound.setMuted(($event.target as HTMLInputElement).checked)">Mute sounds</label><button class="quiet-button" @click="sound.play('happy');toast(sound.state.ready?'Quiet sound test played.':'Sound waits for a trusted click and Chrome audio permission.')">Test sound</button></div>
      <div class="check-row"><label><input v-model="follow" type="checkbox">Mouse-following eyes</label><button class="text-button" @click="action('IDLE');follow=true;toast('Move your pointer left, right, up and down. Leave the viewport to release gaze.')">Test eye tracking</button></div>
      <h3>Character choreography</h3><div class="action-grid"><button v-for="a in MASCOT_ACTIONS" :key="a" @click="action(a)">{{a.replaceAll('_',' ')}}</button></div>
      <label>Expression<select :value="scene.expression" @change="selectExpression(($event.target as HTMLSelectElement).value as ExpressionId)"><option v-for="e in EXPRESSIONS" :key="e.id" :value="e.id">{{labels[e.id]}}</option></select></label>
      <h3>Purchase scenarios</h3><div class="scenario-buttons"><button @click="scenario('green')"><i class="outcome-dot green"></i> £4 notebook</button><button @click="scenario('amber')"><i class="outcome-dot amber"></i> £60 trainers</button><button @click="scenario('red')"><i class="outcome-dot red"></i> Alcohol</button></div>
      <div class="field-pair"><label>Amount (£)<input v-model.number="amount" type="number" min="0.01" max="100000" step="0.01"></label><label>Category<select v-model="category"><option v-for="c in ['clothing','electronics','alcohol','stationery','groceries']" :key="c">{{c}}</option></select></label></div><button class="quiet-button full-width" @click="cancelWork();cancelAmazon();evaluate({id:'custom-'+Date.now(),title:'Your test purchase',price:amount,currency:'GBP',category})">Evaluate custom purchase →</button>
      <button class="quiet-button full-width" @click="cancelWork();cancelAmazon();evaluate({id:'amazon-simulation',title:'Amazon wireless headphones (simulation)',price:amount,currency:'GBP',category})">Simulate Amazon purchase →</button>
      <div class="check-row"><label><input v-model="loading" type="checkbox"> Simulate thinking</label><label><input v-model="fail" type="checkbox"> Failed AI response</label></div>
      <div class="action-grid utility-grid"><button @click="openDashboard">Open dashboard</button><button @click="closeDashboard">Close dashboard</button><button @click="startOnboarding">Start / restart check-in</button><button @click="reset">Reset mock data</button><button @click="action('RETURN')">Reset position</button><button @click="onboarding=false;action('RETURN')">Close check-in</button></div>
      <button class="primary-button full-width" @click="demo?action('RETURN'):fullDemo()">{{demo?'Stop demo':'▶ Play full demo'}}</button><p class="small-note">Demo saves £60 and records a reminder. Reset mock data for a fresh run. Any manual action safely interrupts it.</p>
    </section>
  </div>
</template>
