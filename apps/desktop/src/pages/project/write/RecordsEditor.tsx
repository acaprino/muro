import * as React from 'react';
import { Button, Checkbox, Input, Textarea } from '@acaprino/sigrid/primitives';
import { Dialog, FormField } from '@acaprino/sigrid/components';
import type { ProjectInfo, ProjectRecord } from '../../../types.ts';
import { useNotify } from '../../../state/notices.tsx';
import { checkRecords, newRecordId } from './jobs.ts';
import { NotSaved, useEdit } from './DetailsDialog.tsx';

/** The decision records of a project, edited by hand: one added, one changed, one deleted. The factory takes the whole list (`records` of `edit_project`), so every change sends the list the page
 * shows with that one change made in it, on the digest of the same reading (`info`), never on a digest of one reading and the records of another. A record Muro wrote is Muro's until its words are
 * changed here; from then on it is the owner's (the rule of the earlier page). The window closes when the page holds the file as the edit left it (`useEdit`). */

/** What the person asked of the records: a new one, the change of one, or its deletion. */
export type RecordTarget = { kind: 'add' } | { kind: 'edit'; id: string } | { kind: 'delete'; id: string };

interface Props {
  /** The id of the project. */
  id: string;
  /** The project as the page read it. */
  info: ProjectInfo;
  /** Its records as the page shows them. */
  records: readonly ProjectRecord[];
  target: RecordTarget | null;
  onClose(): void;
  /** Where focus goes when the window of a deletion closes: the Delete button of the record goes with the record. */
  focusAfterDelete?: React.RefObject<HTMLElement | null> | undefined;
}

export function RecordsEditor(props: Props) {
  const kind = props.target?.kind;
  return (
    <>
      <RecordDialog {...props} open={kind === 'add' || kind === 'edit'} />
      <DeleteDialog {...props} open={kind === 'delete'} />
    </>
  );
}

// ---------- add and edit ----------
interface Form { date: string; subjects: string; text: string; binding: boolean }
/** Today, as a person counts it (this computer's date), as the date field takes it. */
function today(): string {
  const now = new Date(), two = (n: number): string => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
}
function formOf(target: RecordTarget | null, records: readonly ProjectRecord[]): Form {
  const held = recordOf(target, records);
  return held ? { date: held.date, subjects: held.subjects.join(', '), text: held.text, binding: held.binding } : { date: today(), subjects: '', text: '', binding: false };
}
/** The records with the one change made: a new one of the owner's at the end, or the one edited in place. A message when the record is no longer there. */
function nextRecords(records: readonly ProjectRecord[], target: RecordTarget, form: Form): ProjectRecord[] | string {
  const date = form.date.trim(), text = form.text.trim();
  const subjects = form.subjects.split(',').map(s => s.trim()).filter(Boolean);
  if (target.kind === 'add') return [...records, { id: newRecordId(date, records), date, subjects, text, author: 'you', binding: form.binding }];
  const old = records.find(r => r.id === target.id);
  if (!old) return 'This record is no longer in the project: close this window and open the records again.';
  return records.map((r): ProjectRecord => (r === old ? { ...old, date, subjects, text, binding: form.binding, author: old.text === text ? old.author : 'you' } : r));
}

/** A window's state: the record it was opened on (the title and the sentence under it do not change while the page reads the file again after a save), the form as typed, whether a save was tried
 * (the errors show from then on) and what the page itself found wrong with the list it was about to send. */
interface Session { open: boolean; adding: boolean; record: ProjectRecord | undefined; form: Form; tried: boolean; wrong: string | null }
const recordOf = (target: RecordTarget | null, records: readonly ProjectRecord[]): ProjectRecord | undefined => (target?.kind === 'edit' ? records.find(r => r.id === target.id) : undefined);
const opened = (target: RecordTarget | null, records: readonly ProjectRecord[], open: boolean): Session => ({
  open, adding: target?.kind !== 'edit', record: recordOf(target, records), form: formOf(target, records), tried: false, wrong: null,
});

function RecordDialog({ id, info, records, target, open, onClose }: Props & { open: boolean }) {
  const edit = useEdit(id, info);
  const notify = useNotify();
  const ids = React.useId();
  const [kept, setKept] = React.useState<Session>(() => opened(target, records, open));
  // The form starts from the record each time the window opens; the page reading the file again while it is open does not change what the person typed.
  let session = kept;
  if (open !== kept.open) {
    session = open ? opened(target, records, true) : { ...kept, open: false };
    setKept(session);
  }
  const forget = edit.reset;
  React.useEffect(() => { if (open) forget(); }, [open, forget]);

  const { form, tried, wrong, adding, record } = session;
  const change = (next: Partial<Form>): void => setKept(now => ({ ...now, form: { ...now.form, ...next }, wrong: null }));
  const saving = edit.sending || edit.settling;
  const missing = { date: !form.date.trim(), text: !form.text.trim() };
  const said = wrong ?? edit.error;

  function submit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setKept(now => ({ ...now, tried: true, wrong: null }));
    if (saving || edit.blocked !== null || missing.date || missing.text || !target) return;
    const next = nextRecords(records, target, form);
    if (typeof next === 'string') { setKept(now => ({ ...now, wrong: next })); return; }
    const bad = checkRecords(next);
    if (bad) { setKept(now => ({ ...now, wrong: bad })); return; }
    edit.save({ records: next }, () => { notify(adding ? 'Record added.' : 'Record saved.'); onClose(); });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={next => { if (!next && !edit.sending) onClose(); }}
      title={adding ? 'Add a record' : `Edit the record of ${record?.date ?? 'the project'}`}
      description={`Why the project is the way it is. A binding record is a rule the next harmonization has to follow.${record?.author === 'muro' ? ' Muro wrote this record: if you change its words it becomes yours.' : ''}`}
      footer={(
        <>
          <Button variant="outline" disabled={edit.sending} onClick={onClose}>Cancel</Button>
          <Button type="submit" form={`${ids}-form`} loading={saving} loadingText="Saving…" disabled={edit.blocked !== null}>Save</Button>
        </>
      )}
    >
      <form id={`${ids}-form`} noValidate onSubmit={submit} className="flex flex-col gap-4">
        <FormField label="Date" required error={tried && missing.date ? 'Choose the date of the decision.' : null}>
          <Input type="date" name="date" value={form.date} onChange={e => change({ date: e.currentTarget.value })} />
        </FormField>
        <FormField label="About" help="The capabilities or inputs this decision is about, separated by commas.">
          <Input name="subjects" autoComplete="off" spellCheck={false} className="font-mono" placeholder="capability-id, input-id" value={form.subjects} onChange={e => change({ subjects: e.currentTarget.value })} />
        </FormField>
        <FormField label="Decision" required help="What was decided, and why." error={tried && missing.text ? 'Write the decision and its reason.' : null}>
          <Textarea name="text" rows={6} value={form.text} onChange={e => change({ text: e.currentTarget.value })} />
        </FormField>
        <div className="flex items-start gap-3">
          <Checkbox id={`${ids}-binding`} aria-describedby={`${ids}-binding-help`} checked={form.binding} onCheckedChange={next => change({ binding: next === true })} />
          <div className="flex flex-col gap-0.5">
            <label htmlFor={`${ids}-binding`} className="text-sm font-medium text-ink">Binding</label>
            <span id={`${ids}-binding-help`} className="text-xs text-ink-mute">The next harmonization follows it, and stops rather than break it.</span>
          </div>
        </div>
        {edit.blocked ? <p role="status" className="text-xs text-ink-mute">{edit.blocked}</p> : null}
        {said ? <NotSaved text={said} /> : null}
      </form>
    </Dialog>
  );
}

// ---------- delete ----------
/** The first words of a record's text, for the sentence that names it. */
const excerpt = (text: string): string => { const flat = text.replace(/\s+/g, ' ').trim(); return flat.length > 80 ? `${flat.slice(0, 80)}…` : flat; };

function DeleteDialog({ id, info, records, target, open, onClose, focusAfterDelete }: Props & { open: boolean }) {
  const edit = useEdit(id, info);
  const notify = useNotify();
  // The record is the one the window opened on: while the page reads the file again after the deletion the record is no longer in the list, and the window must not say so.
  const [kept, setKept] = React.useState<{ open: boolean; record: ProjectRecord | undefined }>(() => ({ open, record: target?.kind === 'delete' ? records.find(r => r.id === target.id) : undefined }));
  let session = kept;
  if (open !== kept.open) {
    session = { open, record: open && target?.kind === 'delete' ? records.find(r => r.id === target.id) : kept.record };
    setKept(session);
  }
  const forget = edit.reset;
  React.useEffect(() => { if (open) forget(); }, [open, forget]);
  /** The record was deleted in this opening: the window closes onto `focusAfterDelete`. */
  const gone = React.useRef(false);
  if (open && !kept.open) gone.current = false;
  const record = session.record;
  const subjects = record?.subjects.join(', ') ?? '';
  const saving = edit.sending || edit.settling;
  function remove(): void {
    if (!record || saving || edit.blocked !== null) return;
    edit.save({ records: records.filter(r => r.id !== record.id) }, () => { notify('Record deleted.'); gone.current = true; onClose(); });
  }
  return (
    <Dialog
      open={open}
      onOpenChange={next => { if (!next && !edit.sending) onClose(); }}
      onCloseAutoFocus={event => { if (gone.current) { event.preventDefault(); focusAfterDelete?.current?.focus(); } }}
      title={record ? `Delete the record of ${record.date}?` : 'Delete this record?'}
      description={record ? `The record${subjects ? ` about ${subjects}` : ''} (“${excerpt(record.text)}”) leaves the project file. This cannot be undone: Muro keeps no copy. The other records stay as they are.` : 'This record is no longer in the project.'}
      footer={(
        <>
          <Button variant="outline" disabled={edit.sending} onClick={onClose}>Cancel</Button>
          <Button variant="destructive" loading={saving} loadingText="Deleting…" disabled={!record || edit.blocked !== null} onClick={remove}>Delete record</Button>
        </>
      )}
    >
      {edit.blocked ? <p role="status" className="text-xs text-ink-mute">{edit.blocked}</p> : null}
      {edit.error ? <NotSaved text={edit.error} /> : null}
    </Dialog>
  );
}
