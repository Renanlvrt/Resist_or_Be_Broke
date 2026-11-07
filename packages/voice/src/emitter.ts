export class Emitter<M extends Record<string, (...a: any[]) => void>> {
  private h: { [K in keyof M]?: Set<M[K]> } = {};
  on<K extends keyof M>(ev: K, fn: M[K]): () => void {
    (this.h[ev] ??= new Set()).add(fn);
    return () => this.off(ev, fn);
  }
  off<K extends keyof M>(ev: K, fn: M[K]) { this.h[ev]?.delete(fn); }
  protected emit<K extends keyof M>(ev: K, ...args: Parameters<M[K]>) {
    this.h[ev]?.forEach((fn) => { try { fn(...args); } catch (e) { console.error(e); } });
  }
}
