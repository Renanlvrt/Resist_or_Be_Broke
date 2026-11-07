import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { BotEngine } from '../bot/engine';
import { SHAPE_BY_ID } from '../bot/skins';
import { EXPRESSION_BY_ID } from '../bot/expressions';
import BloubBot from '../components/BloubBot.vue';
import Dashboard from '../components/Dashboard.vue';
import Onboarding from '../components/Onboarding.vue';
import { viewportLookTarget } from '../ui/gaze';
vi.mock('wxt/browser', () => ({ browser: { storage: { local: { get: vi.fn(), set: vi.fn() } } } }));
import { MockFinanceProvider } from '../lib/finance';
afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ''; });

describe('actual upstream Bloub component', () => {
  it.each(['#ffffff', '#888888', '#5080a0', '#171717'])('has white backed mask eyes and no outline on %s', background => {
    const host = document.createElement('div'); host.style.background = background; document.body.append(host);
    const wrapper = mount(BloubBot, { attachTo: host, props: { frozenAt: 1 } });
    const body = wrapper.get('[data-body]');
    expect(wrapper.get('svg').attributes('data-mascot-shape')).toBe('hexagone');
    expect(body.attributes('fill')?.toLowerCase()).toBe('#f0b429');
    expect(body.attributes('stroke')).toBeUndefined();
    expect(body.attributes('stroke-width')).toBeUndefined();
    const backing = wrapper.get('[data-eye-backing]');
    expect(backing.attributes('fill')).toBe('#FFFFFF');
    expect(backing.attributes('d')).toBe(body.attributes('d'));
    expect(wrapper.get('mask path').attributes('d')).toBe(body.attributes('d'));
    expect(wrapper.findAll('[data-eye]')).toHaveLength(2);
    expect(wrapper.findAll('[data-eye]').every(eye => eye.attributes('fill') === '#000' && !eye.attributes('stroke'))).toBe(true);
    expect(wrapper.find('rect').exists()).toBe(false);
    wrapper.unmount();
  });
  it('expressions alter the original engine eye shapes and the internal clock stays alive', () => {
    const e = new BotEngine(100, 'idle', SHAPE_BY_ID.get('hexagone')!.radii, EXPRESSION_BY_ID.get('blase'));
    const before = e.sample(1); e.setExpression(EXPRESSION_BY_ID.get('surpris')!, 1);
    expect(e.sample(1.8).eyes).not.toEqual(before.eyes);
    expect(e.sample(3).bodyPath).not.toEqual(e.sample(4).bodyPath);
    expect(e.sample(4).bodyPath).not.toContain('NaN');
  });
  it('runs the actual upstream thinking morph and returns to the hexagon with eyes', () => {
    const e = new BotEngine(100, 'idle', SHAPE_BY_ID.get('hexagone')!.radii);
    const rest = e.sample(1); e.setState('thinking', 1);
    const thinking = e.sample(2);
    expect(thinking.dots.length).toBeGreaterThan(0); expect(thinking.eyes).toHaveLength(0);
    expect(thinking.bodyPath).not.toBe(rest.bodyPath);
    e.setState('idle', 3); expect(e.sample(4).eyes).toHaveLength(2);
    expect(e.sample(4).bodyPath).not.toContain('NaN');
  });
  it('tracks real pointer coordinates, releases during a reaction, resumes and returns on pointer leave', async () => {
    let frame: FrameRequestCallback = () => {};
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => { frame = cb; return 1; });
    const look = vi.spyOn(BotEngine.prototype, 'setLook');
    const wrapper = mount(BloubBot, { props: { follow: true, state: 'idle' } });
    vi.spyOn(wrapper.element, 'getBoundingClientRect').mockReturnValue(new DOMRect(400, 300, 180, 180));
    let ms = 0;
    async function tick(count = 90) { for (let i = 0; i < count; i++) { ms += 16; frame(ms); } await nextTick(); }
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 900, clientY: 100 })); await tick();
    const right = wrapper.get('[data-eye]').attributes('transform');
    expect(look.mock.calls.at(-1)?.[0]).toMatchObject({ spin: 0, wander: 0 });
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 50, clientY: 650 })); await tick();
    expect(wrapper.get('[data-eye]').attributes('transform')).not.toBe(right);
    await wrapper.setProps({ state: 'wide' }); await tick(35);
    expect(look.mock.calls.some(call => call[0] === null)).toBe(true);
    await wrapper.setProps({ state: 'idle' }); await tick();
    expect(look.mock.calls.at(-1)?.[0]?.mix).toBeGreaterThan(.9);
    document.dispatchEvent(new PointerEvent('pointerleave')); await tick();
    expect(look.mock.calls.at(-1)?.[0]?.mix).toBe(0);
    await wrapper.setProps({ follow: false, gaze: () => ({ yaw: -8, pitch: 26, mix: 1, spin: 0, wander: .1 }) }); await tick(30);
    expect(look.mock.calls.at(-1)?.[0]?.pitch).toBe(26);
    await wrapper.setProps({ follow: true, gaze: null });
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 900, clientY: 100 })); await tick();
    expect(look.mock.calls.at(-1)?.[0]?.mix).toBeGreaterThan(.9);
    expect(look.mock.calls.at(-1)?.[0]?.pitch).toBeLessThan(26);
    wrapper.unmount();
  });
  it('cancels RAF and detaches pointer listeners on unmount', () => {
    const raf = vi.spyOn(window, 'cancelAnimationFrame'), remove = vi.spyOn(window, 'removeEventListener');
    const w = mount(BloubBot); w.unmount();
    expect(raf).toHaveBeenCalled(); expect(remove).toHaveBeenCalledWith('pointermove', expect.any(Function));
  });
});

describe('upstream gaze projection adapted to a page', () => {
  const aim = { nx: 0, ny: 0, tour: 1, pointer: true };
  it('looks in all four correct directions, with bounded angles and no arrival spin', () => {
    expect(viewportLookTarget({ ...aim, nx: -1 }).yaw).toBeLessThan(0);
    expect(viewportLookTarget({ ...aim, nx: 1 }).yaw).toBeGreaterThan(0);
    expect(viewportLookTarget({ ...aim, ny: -1 }).pitch).toBeGreaterThan(viewportLookTarget(aim).pitch);
    expect(viewportLookTarget({ ...aim, ny: 1 }).pitch).toBeLessThan(viewportLookTarget(aim).pitch);
    expect(viewportLookTarget(aim).spin).toBe(0);
    expect(viewportLookTarget({ ...aim, pointer: false })).toMatchObject({ mix: 0, wander: 1 });
  });
});

describe('minimal monthly recap and existing check-in', () => {
  it('contains only the fixed savings, three goals, and exact straight receipt content', async () => {
    const w = mount(Dashboard);
    expect(w.get('[data-saved-amount]').text()).toBe('£131');
    expect(w.findAll('.recap-goals li').map(li => li.text())).toEqual(['Save for sports equipment', 'Spend less on takeaways', 'Build an emergency savings fund']);
    expect(w.findAll('.receipt-avoided dl > div').map(row => row.text())).toEqual(['Running shoes£65', 'Gym bag£28', 'Coffee maker£38']);
    expect(w.findAll('.receipt-bought dl > div').map(row => row.text())).toEqual(['Phone case£12', 'Snacks£8', 'Dinner£24']);
    const avoided = w.findAll('.receipt-avoided dd').map(node => Number(node.text().slice(1)));
    expect(avoided.reduce((sum, value) => sum + value, 0)).toBe(131);
    expect(w.get('.receipt-total').text()).toBe('SAVED£131');
    expect(w.find('svg,canvas,progress,[role="progressbar"],nav,.card').exists()).toBe(false);
    expect(w.findAll('button')).toHaveLength(1);
    await w.get('[aria-label="Close dashboard"]').trigger('click'); expect(w.emitted('close')).toHaveLength(1);
    w.unmount();
  });
  it('preserves all seven interview steps and editable confirmation', async () => {
    const w = mount(Onboarding, { props: { profile: new MockFinanceProvider().state.profile } });
    for (let i = 1; i <= 7; i++) { expect(w.text()).toContain(`QUESTION ${i} OF 7`); await w.get('.primary-button').trigger('click'); }
    expect(w.text()).toContain('LOOKS LIKE A PLAN'); await w.get('input').setValue('Sam');
    await w.get('.primary-button').trigger('click'); expect(w.emitted('save')?.[0]?.[0]).toMatchObject({ name: 'Sam' }); w.unmount();
  });
});
