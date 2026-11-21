import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { mountZoom } from '@acaprino/imago/shell';

// Exercise the shared shell with Muro's persisted preference and default steps.
// The native host is controllable so replies can arrive out of order.
function fixture(saved: string | null = null) {
  const listeners = new Map<string, Set<EventListener>>();
  const values = new Map<string, string>(saved === null ? [] : [['muro.zoom', saved]]);
  const document = {
    addEventListener(type: string, listener: EventListener, options?: AddEventListenerOptions) {
      const key = type + ':' + !!options?.capture;
      const entries = listeners.get(key) ?? new Set<EventListener>();
      entries.add(listener); listeners.set(key, entries);
    },
    removeEventListener(type: string, listener: EventListener, options?: EventListenerOptions) {
      listeners.get(type + ':' + !!options?.capture)?.delete(listener);
    },
  } as unknown as Document;
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
  function emit(type: string, properties: Record<string, unknown>) {
    let prevented = false;
    const event = { ctrlKey: true, altKey: false, metaKey: false, shiftKey: false, repeat: false,
      preventDefault() { prevented = true; }, stopPropagation() {}, ...properties } as unknown as Event;
    for (const capture of [true, false]) {
      for (const listener of listeners.get(type + ':' + capture) ?? []) listener(event);
    }
    return prevented;
  }
  return { document, storage, values, emit, listeners };
}

test('Muro restores native zoom at 100%, keeps its preference and removes keyboard/wheel listeners', async () => {
  const f = fixture();
  const applied: number[] = [];
  const stop = mountZoom(f.document, { storage: f.storage, storageKey: 'muro.zoom', apply: level => { applied.push(level); } });
  try {
    await setImmediate();
    assert.deepEqual(applied, [1]);
    assert.equal(f.emit('keydown', { key: '+', code: 'Equal' }), true);
    await setImmediate();
    assert.equal(f.values.get('muro.zoom'), '1.1');
    assert.equal(f.values.has('imago.zoom'), false);
    assert.equal(f.emit('wheel', { deltaY: -100, deltaMode: 0 }), true);
    await setImmediate();
    assert.equal(f.values.get('muro.zoom'), '1.2');
    f.emit('keydown', { key: '0', code: 'Digit0' });
    await setImmediate();
    assert.equal(f.values.get('muro.zoom'), '1');
  } finally { stop(); }
  const count = applied.length;
  assert.equal(f.emit('keydown', { key: '+', code: 'Equal' }), false);
  assert.equal(f.emit('wheel', { deltaY: -100, deltaMode: 0 }), false);
  await setImmediate();
  assert.equal(applied.length, count);
  assert.ok([...f.listeners.values()].every(entries => entries.size === 0));
});

test('Muro keeps the newest accepted zoom across late successes and overlapping native refusals', async () => {
  const f = fixture('1.3');
  const applied: number[] = [];
  const replies: Array<{ resolve(): void; reject(error: Error): void }> = [];
  const stop = mountZoom(f.document, {
    storage: f.storage, storageKey: 'muro.zoom',
    apply(level) {
      applied.push(level);
      if (applied.length === 1) return;
      return new Promise<void>((resolve, reject) => replies.push({ resolve, reject }));
    },
  });
  try {
    await setImmediate();
    assert.deepEqual(applied, [1.3]);
    f.emit('keydown', { key: '+', code: 'Equal' });
    f.emit('keydown', { key: '+', code: 'Equal' });
    assert.deepEqual(applied, [1.3, 1.4, 1.5]);
    replies[1].resolve(); await setImmediate();
    replies[0].resolve(); await setImmediate();
    assert.equal(f.values.get('muro.zoom'), '1.5');
    f.emit('keydown', { key: '+', code: 'Equal' });
    assert.equal(applied.at(-1), 1.6);
    f.emit('keydown', { key: '+', code: 'Equal' });
    assert.equal(applied.at(-1), 1.7);
    replies[2].reject(new Error('first native request refused')); await setImmediate();
    replies[3].reject(new Error('second native request refused')); await setImmediate();
    assert.equal(f.values.get('muro.zoom'), '1.5');
    f.emit('keydown', { key: '-', code: 'Minus' });
    assert.equal(applied.at(-1), 1.4, 'the next shortcut starts from the accepted level');
    replies[4].resolve(); await setImmediate();
    assert.equal(f.values.get('muro.zoom'), '1.4');
  } finally { stop(); }
});
