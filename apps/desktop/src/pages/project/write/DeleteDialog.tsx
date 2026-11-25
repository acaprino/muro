import * as React from 'react';
import { Button, Column, Text } from '@acaprino/sigrid/primitives';
import { Dialog } from '@acaprino/sigrid/components';
import type { ProjectSummary, Snapshot, Transport } from '../../../types.ts';
import { useNotify } from '@acaprino/imago';
import { useRegistry } from '../../../state/registry.tsx';
import { message } from '../../../words.ts';
import { deletePayload } from './jobs.ts';
import { RefusalLine } from './HarmonizeDialog.tsx';

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

/** Delete project: it leaves the list and its file is deleted (`delete_project`). This cannot be taken back, so it asks first, names the file and says what stays.
 * Focus starts on Cancel. */
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
      title={`Delete ${name}?`}
      description="The project leaves your list and its file is deleted. This cannot be undone. Its plugin stays installed where it is, as it is."
      footer={(
        <>
          <Button variant="outline" disabled={deleting} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" loading={deleting} loadingText="Deleting…" onClick={() => void remove()}>Delete {name}</Button>
        </>
      )}
    >
      <Column gap="xs">
        <Text variant="note">The file that is deleted</Text>
        <Text mono>{project.path}</Text>
      </Column>
      {failure ? <RefusalLine>{failure}</RefusalLine> : null}
    </Dialog>
  );
}
