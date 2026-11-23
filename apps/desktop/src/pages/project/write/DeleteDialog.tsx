import * as React from 'react';
import { Button, Dialog } from '@acaprino/sigrid';
import type { ProjectSummary, Snapshot, Transport } from '../../../types.ts';
import { useNotify } from '../../../state/notices.tsx';
import { useRegistry } from '../../../state/registry.tsx';
import { message } from '../../../words.ts';
import { SHIPPED_ID, deletePayload } from './jobs.ts';

/** The words of a listed project: the name its file gives it, else its plugin's, else its id. */
export const nameOf = (p: ProjectSummary): string => p.project?.name || p.plugin?.name || p.id;

/** A save that carries the registry revision the window last read (the runtime refuses a stale one, as every save of the registry does). A refusal because the registry moved behind the page's back
 * ("Registry revision changed") reads it again and sends the request once more with the new revision; any other refusal is the caller's. The one copy of this rule: removing a project from the list
 * and deleting one both go through it. */
export async function atRevision(request: Transport, held: Snapshot | null, adopt: (snapshot: Snapshot) => void, send: (revision: number) => Promise<Snapshot>): Promise<Snapshot> {
  const revision = held?.registry.revision ?? (await request<Snapshot>('snapshot')).registry.revision;
  try { return await send(revision); }
  catch (e) {
    if (!/Registry revision changed/.test(message(e))) throw e;
    const read = await request<Snapshot>('snapshot');
    adopt(read);
    return send(read.registry.revision);
  }
}

export interface DeleteDialogProps {
  project: ProjectSummary;
  open: boolean;
  onOpenChange(open: boolean): void;
  /** Called after the runtime deleted the project: the page that holds the list reads it again. */
  onDeleted?: () => unknown;
  /** Where focus goes when the window closes after a deletion: the button that opened it is gone with the project's row. A Cancel gives focus back to that button as usual. */
  focusAfter?: React.RefObject<HTMLElement | null> | undefined;
}

/** Delete project: it leaves the list and its file is deleted (`delete_project`). This cannot be taken back, so it asks first, names the file and says what stays. The project Muro ships
 * cannot be deleted: the dialog says so and offers nothing to confirm (the runtime refuses it as well, whatever the page shows). Focus starts on Cancel. */
export function DeleteDialog({ project, open, onOpenChange, onDeleted, focusAfter }: DeleteDialogProps) {
  const { request, snapshot, adopt } = useRegistry();
  const notify = useNotify();
  const latest = React.useRef(snapshot);
  latest.current = snapshot;
  const [deleting, setDeleting] = React.useState(false);
  const [failure, setFailure] = React.useState<string | null>(null);
  // A dialog that opens has not failed yet.
  const [was, setWas] = React.useState(open);
  /** The project was deleted in this opening: the window closes onto `focusAfter`, not onto the button of a row that is gone. */
  const gone = React.useRef(false);
  if (open !== was) {
    setWas(open);
    if (open) { setFailure(null); gone.current = false; }
  }
  const name = nameOf(project);
  const shipped = project.included === true || project.id === SHIPPED_ID;

  async function remove(): Promise<void> {
    setDeleting(true);
    setFailure(null);
    try {
      const saved = await atRevision(request, latest.current, adopt, revision => request<Snapshot>('delete_project', deletePayload(project.id, revision)));
      adopt(saved);
      gone.current = true;
      onOpenChange(false);
      await onDeleted?.();
      notify(`${name} deleted.`);
    } catch (e) { setFailure(message(e)); }
    finally { setDeleting(false); }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={next => { if (!next && deleting) return; onOpenChange(next); }}
      onCloseAutoFocus={event => { if (gone.current) { event.preventDefault(); focusAfter?.current?.focus(); } }}
      title={shipped ? `${name} cannot be deleted` : `Delete ${name}?`}
      description={shipped ? 'The default project stays in the list' : 'The project leaves your list and its file is deleted. This cannot be undone. Its plugin stays installed where it is, as it is.'}
      footer={shipped ? (
        <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
      ) : (
        <>
          <Button variant="outline" disabled={deleting} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" loading={deleting} loadingText="Deleting…" onClick={() => void remove()}>Delete {name}</Button>
        </>
      )}
    >
      {shipped ? null : (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-ink-mute">The file that is deleted</span>
          <code className="font-mono text-sm break-all text-ink">{project.path}</code>
        </div>
      )}
      {failure ? <p role="alert" className="rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive">{failure}</p> : null}
    </Dialog>
  );
}
