import { reactive } from 'vue';
import type { ExpressionId } from '../bot/expressions';
import type { StateId } from '../bot/states';
import type { EvaluationResult, MascotAction, MascotEvent } from './contracts';

export interface Scene {
  action: MascotAction; lastEvent: string; visible: boolean; exclamation: boolean;
  expression: ExpressionId; internal: StateId; backdrop: boolean; dashboard: boolean;
  dialogue: EvaluationResult | null; badge: string; x: number; y: number;
}
export const MASCOT_ACTIONS: MascotAction[] = ['IDLE', 'PEEK', 'EXCLAIM', 'SUSPICIOUS', 'DISAPPROVE', 'THINKING', 'HAPPY', 'GUARD', 'DISMISS', 'RETURN', 'OPEN_DASHBOARD', 'CLOSE_DASHBOARD'];
type Motion = 'settle' | 'peek' | 'hop' | 'shake' | 'lean' | 'exit';
const EASING: Record<Motion, string> = {
  settle: 'cubic-bezier(.16,1,.3,1)', peek: 'cubic-bezier(.25,.65,.35,1)',
  hop: 'cubic-bezier(.35,.05,.25,1)', shake: 'linear',
  lean: 'cubic-bezier(.4,0,.2,1)', exit: 'cubic-bezier(.55,.05,.8,.5)',
};

/** A single cancellable sequence owns screen motion. SVG animation has its own clock. */
export class MascotController {
  scene = reactive<Scene>({ action: 'IDLE', lastEvent: 'Ready', visible: false, exclamation: false,
    expression: 'blase', internal: 'idle', backdrop: false, dashboard: false,
    dialogue: null, badge: '', x: 0, y: 0 });
  private element: HTMLElement | null = null;
  private animation: Animation | null = null;
  private epoch = 0;
  private timers = new Map<ReturnType<typeof setTimeout>, () => void>();
  private disposed = false;

  constructor(
    private viewport = () => ({ width: window.innerWidth, height: window.innerHeight }),
    private reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    private cue: (action: MascotAction) => void = () => {},
  ) {
    const { width, height } = this.viewport();
    this.scene.x = width + 70; this.scene.y = Math.max(0, height - 220);
  }
  attach(element: HTMLElement) {
    this.element = element;
    element.style.transform = this.transform(this.scene.x, this.scene.y);
  }
  private transform(x: number, y: number, rotation = 0, sx = 1, sy = 1) {
    return `translate(${x}px, ${y}px) rotate(${rotation}deg) scale(${sx},${sy})`;
  }
  private stop() {
    this.epoch++;
    if (this.animation && this.element) {
      // Read before cancelling, so the next animation starts at the visible pose.
      const current = getComputedStyle(this.element).transform;
      this.element.style.transform = current;
      const matrix = current.match(/^matrix\(([^)]+)\)/)?.[1]?.split(',').map(Number);
      if (matrix?.length === 6) { this.scene.x = matrix[4]!; this.scene.y = matrix[5]!; }
      this.animation.cancel(); this.animation = null;
    }
    for (const [id, resolve] of this.timers) { clearTimeout(id); resolve(); }
    this.timers.clear();
    this.scene.exclamation = false; this.scene.badge = '';
    return this.epoch;
  }
  private pause(ms: number) {
    return new Promise<void>(resolve => {
      const id = setTimeout(() => { this.timers.delete(id); resolve(); }, this.reduced() ? Math.min(ms, 90) : ms);
      this.timers.set(id, resolve);
    });
  }
  private alive(token: number) { return token === this.epoch && !this.disposed; }
  private async move(x: number, y: number, rotation = 0, duration = 600, motion: Motion = 'settle') {
    const element = this.element;
    this.scene.x = x; this.scene.y = y;
    if (!element) return;
    const start = getComputedStyle(element).transform;
    const target = this.transform(x, y, rotation);
    let frames: Keyframe[];
    if (this.reduced()) frames = [{ transform: start }, { transform: target }];
    else if (motion === 'shake') frames = [
      { transform: start, offset: 0 },
      { transform: this.transform(x, y + 12, -9, 1.19, .77), offset: .21 },
      { transform: this.transform(x - 4, y - 32, 12, .86, 1.16), offset: .43 },
      { transform: this.transform(x + 5, y - 12, -12, 1.04, .96), offset: .61 },
      { transform: this.transform(x - 3, y + 5, 7, 1.08, .93), offset: .77 },
      { transform: this.transform(x + 1, y - 2, -3, .98, 1.02), offset: .9 },
      { transform: target, offset: 1 },
    ];
    else if (motion === 'hop') frames = [
      { transform: start, offset: 0 },
      { transform: this.transform(x + 25, y - 52, rotation - 14, .9, 1.13), offset: .52 },
      { transform: this.transform(x, y + 12, rotation + 8, 1.18, .78), offset: .77 },
      { transform: this.transform(x - 3, y - 9, rotation - 4, .95, 1.06), offset: .9 },
      { transform: target, offset: 1 },
    ];
    else if (motion === 'exit' || motion === 'lean') frames = [{ transform: start }, { transform: target }];
    else frames = [
      { transform: start, offset: 0 },
      { transform: this.transform(x - 10, y - 3, rotation - 6, 1.04, .96), offset: .68 },
      { transform: this.transform(x + 3, y + 2, rotation + 3, .98, 1.02), offset: .86 },
      { transform: target, offset: 1 },
    ];
    const animation = element.animate(frames, { duration: this.reduced() ? 120 : duration, easing: EASING[motion], fill: 'forwards' });
    this.animation = animation;
    try {
      await animation.finished;
      if (this.animation === animation) { element.style.transform = target; animation.cancel(); this.animation = null; }
    } catch { /* stop() preserved the in-flight pose */ }
  }
  private pose(expression: ExpressionId, internal: StateId = 'idle') {
    this.scene.expression = expression; this.scene.internal = internal;
  }
  private edge() { const v = this.viewport(); return { x: v.width - 180, y: Math.max(0, v.height - 220) }; }
  private async peek(token: number) {
    this.scene.visible = true; this.scene.action = 'PEEK'; this.pose('curieux'); this.cue('PEEK');
    const p = this.edge();
    // A sliver first, then a curious lean into the page. Never reset a visible actor.
    if (this.scene.x > this.viewport().width - 100) {
      await this.move(this.viewport().width - 96, p.y + 8, -23, 430, 'peek');
      if (!this.alive(token)) return;
      await this.pause(140); if (!this.alive(token)) return;
    }
    await this.move(p.x + 12, p.y, -19, 530, 'peek');
    if (this.alive(token)) await this.pause(170);
  }
  private async exclaim(token: number) {
    this.scene.action = 'EXCLAIM'; this.pose('surpris', 'wide');
    await this.move(this.scene.x, this.scene.y + 5, -13, 180, 'lean');
    if (!this.alive(token)) return;
    this.scene.exclamation = true; this.cue('EXCLAIM');
    await this.move(this.scene.x - 5, this.scene.y - 10, 5, 460, 'hop');
    if (!this.alive(token)) return;
    await this.pause(360);
    if (this.alive(token)) { this.scene.exclamation = false; this.pose('curieux'); }
  }
  private async suspicious(token: number) {
    const p = this.edge(); this.scene.action = 'SUSPICIOUS'; this.pose('mefiant');
    await this.move(p.x, p.y, -14, 350, 'lean');
    if (!this.alive(token)) return;
    await this.pause(330); if (!this.alive(token)) return;
    await this.move(p.x - 27, p.y - 5, -23, 420, 'lean');
    if (!this.alive(token)) return;
    this.pose('surpris', 'wide');
    await this.move(p.x + 10, p.y, 8, 210, 'lean');
    if (!this.alive(token)) return;
    this.pose('mefiant'); await this.move(p.x, p.y, -7, 460);
  }
  private async disapprove(token: number) {
    const p = this.edge(); this.scene.action = 'DISAPPROVE'; this.pose('surpris', 'wide');
    this.cue('DISAPPROVE');
    await this.pause(360); if (!this.alive(token)) return;
    await this.move(p.x, p.y, 0, 970, 'shake');
    if (!this.alive(token)) return;
    this.pose('confus'); await this.pause(260);
  }
  private async happy(token: number) {
    const p = this.edge(); this.scene.visible = true; this.scene.action = 'HAPPY';
    this.pose('excite'); this.cue('HAPPY');
    await this.move(p.x + 7, p.y + 6, -11, 170, 'lean');
    if (!this.alive(token)) return;
    this.pose('heureux', 'wink'); await this.move(p.x, p.y, 8, 680, 'hop');
    if (!this.alive(token)) return;
    await this.move(p.x, p.y, 0, 340);
    if (this.alive(token)) { this.pose('heureux'); this.scene.action = 'IDLE'; }
  }
  private async guard(token: number) {
    this.scene.visible = true; this.scene.action = 'GUARD'; this.pose('confus');
    await this.move(this.scene.x + 17, this.scene.y + 7, 18, 280, 'lean');
    if (!this.alive(token)) return;
    this.scene.backdrop = true; this.cue('GUARD');
    const v = this.viewport();
    await this.move(Math.max(0, v.width / 2 - 90), Math.max(0, v.height / 2 - 260), -3, 1150, 'hop');
    if (this.alive(token)) { this.pose('mefiant'); await this.pause(180); }
  }
  async dispatch(event: MascotEvent) {
    if (this.disposed) return;
    const token = this.stop(); this.scene.lastEvent = event.type;
    this.scene.action = event.type === 'PURCHASE_EVALUATED' ? 'PEEK' : event.type;
    this.scene.dashboard = false; this.scene.dialogue = null; this.scene.backdrop = false;
    if (event.type === 'PURCHASE_EVALUATED') {
      await this.peek(token); if (!this.alive(token)) return;
      const result = event.result;
      if (result.outcome === 'green') {
        this.scene.badge = 'Fits your plan'; await this.happy(token);
        if (!this.alive(token)) return;
        await this.pause(1100); if (this.alive(token)) await this.dispatch({ type: 'DISMISS' });
      } else {
        await this.exclaim(token); if (!this.alive(token)) return;
        if (result.outcome === 'red') {
          await this.disapprove(token); if (!this.alive(token)) return;
          await this.guard(token); if (!this.alive(token)) return;
        } else { await this.suspicious(token); if (!this.alive(token)) return; }
        this.scene.dialogue = result;
        // Guard/suspicion remains on the face; follow is restored by the base-face state.
      }
      return;
    }
    switch (event.type) {
      case 'PEEK': await this.peek(token); break;
      case 'EXCLAIM': await this.peek(token); if (this.alive(token)) await this.exclaim(token); break;
      case 'SUSPICIOUS': this.scene.visible = true; await this.suspicious(token); break;
      case 'DISAPPROVE': this.scene.visible = true; await this.disapprove(token); break;
      case 'HAPPY': await this.happy(token); break;
      case 'GUARD': await this.peek(token); if (this.alive(token)) await this.disapprove(token); if (this.alive(token)) await this.guard(token); break;
      case 'THINKING': {
        this.scene.visible = true; this.pose('curieux'); const p = this.edge();
        await this.move(p.x, p.y, -15, 400, 'lean'); if (!this.alive(token)) break;
        await this.pause(220); if (!this.alive(token)) break;
        this.pose('curieux', 'thinking'); // Unmodified upstream three-dot morph.
        await this.pause(1550); if (!this.alive(token)) break;
        this.pose('attentif'); await this.move(p.x, p.y, 0, 450);
        if (this.alive(token)) this.scene.action = 'IDLE'; break;
      }
      case 'DISMISS':
      case 'CLOSE_DASHBOARD': {
        this.scene.action = 'DISMISS'; this.pose('timide', 'wink');
        await this.pause(200); if (!this.alive(token)) break;
        await this.move(this.scene.x - 9, this.scene.y + 4, -14, 170, 'lean');
        if (!this.alive(token)) break;
        this.cue('DISMISS');
        await this.move(this.viewport().width + 200, this.viewport().height - 205, 24, 800, 'exit');
        if (this.alive(token)) { this.scene.visible = false; this.scene.action = 'IDLE'; this.pose('blase'); }
        break;
      }
      case 'OPEN_DASHBOARD': {
        this.scene.backdrop = true; this.scene.dashboard = true; this.scene.visible = true; this.pose('attentif', 'swirl');
        const v = this.viewport(), width = Math.min(v.width * .77, 1120);
        // The character lives on the backdrop, clear of the receipt and amount.
        const x = v.width <= 760 ? v.width - 112 : Math.max(-90, (v.width - width) / 2 - 155);
        const y = v.width <= 760 ? v.height * .17 : v.height * .58;
        await this.move(x, Math.max(0, y), -6, 900, 'hop');
        if (this.alive(token)) this.pose('attentif'); break;
      }
      case 'RETURN': {
        this.scene.visible = true; this.pose('heureux'); const p = this.edge();
        await this.move(p.x, p.y, 0, 850, 'hop');
        if (this.alive(token)) { this.scene.action = 'IDLE'; this.pose('blase'); } break;
      }
      case 'IDLE': {
        this.scene.visible = true; this.pose('blase'); const p = this.edge();
        await this.move(p.x, p.y, 0, 600); break;
      }
    }
  }
  expression(id: ExpressionId) { this.scene.lastEvent = `EXPRESSION:${id}`; this.pose(id); }
  resize() {
    if (this.scene.dashboard) void this.dispatch({ type: 'OPEN_DASHBOARD' });
    else if (this.scene.dialogue) {
      const result = this.scene.dialogue; void this.dispatch({ type: 'PURCHASE_EVALUATED', result });
    } else if (this.scene.visible) void this.dispatch({ type: 'RETURN' });
  }
  dispose() { this.disposed = true; this.stop(); this.element = null; }
}
