import type { Snapshot, Transport } from '../../types.ts';

const said = (e: unknown): string => String(e instanceof Error ? e.message : e);

/** A write of the registry (`save_plugin`, `save_target`, `remove_plugin`, `remove_target`, `settings`): it carries the revision the page read. When the service says the
 * registry moved behind the page's back ("Registry revision changed": the background worker, the tray, another window) the registry is read again and the same change is sent
 * once more on the revision it now holds; a second refusal reaches the caller. The answer is the snapshot after the write: hand it to `useSync().adopt`, which replans when the
 * revision moved. One place for the retry, so a dialog or the inspector never has its own copy. */
export async function registryWrite(request: Transport, revision: number, action: string, payload: Record<string, unknown>): Promise<Snapshot> {
  try { return await request<Snapshot>(action, { revision, ...payload }); }
  catch (e) {
    if (!/Registry revision changed/.test(said(e))) throw e;
    const fresh = await request<Snapshot>('snapshot');
    return request<Snapshot>(action, { revision: fresh.registry.revision, ...payload });
  }
}
