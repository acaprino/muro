import * as React from 'react';
import { Button, Cluster, Column, Input, Text, Textarea } from '@acaprino/sigrid/primitives';
import { Dialog, FormField, Note } from '@acaprino/sigrid/components';
import type { ProjectInfo, ProjectRepository } from '../../../types.ts';
import { text } from '../../../model.ts';
import { useNotify } from '@acaprino/imago';
import { useRegistry } from '../../../state/registry.tsx';
import { message } from '../../../words.ts';
import { REPOSITORY_FIELDS, busyReason, checkRepository, checkText, editPayload, repositoryOf, runningOn } from './jobs.ts';
import type { EditPatch, RepositoryErrors } from './jobs.ts';
import { useJobs } from './useJobs.tsx';

/** The details of a project, edited by hand: its name, its author, the repository it is published from and its changelog. No AI judges any of it, so it is an edit (`edit_project`), saved offline by
 * the factory on the file the page shows (ADR-0032): the request carries the digest of that file, the runtime refuses it when the file changed since, and the dialog says so as the runtime said it.
 * Only what the person changed is sent. This file also holds what the other edits by hand (the records, `RecordsEditor.tsx`) share: `useEdit`, `useBlocked` and `NotSaved`. */

/** Why the page offers no edit of this project: an AI run is changing it, and the runtime refuses an edit meanwhile. Null when nothing is. */
export const useBlocked = (id: string): string | null => busyReason(runningOn(useJobs().jobs, id));

/** What the runtime refused, or the page could not send, shown as it was said: a box in the window that failed, with a word that says it besides the colour. */
export function NotSaved({ text: said }: { text: string }) {
  return <Note tone="error" title="Not saved">{said}</Note>;
}

/** An edit by hand of the project `id`, on the file `info` shows. */
export interface EditApi {
  /** Why no edit is offered now (an AI run is changing the project), or null. */
  blocked: string | null;
  /** The request is on its way: the window does not close meanwhile. */
  sending: boolean;
  /** The runtime saved the edit and this page has not read the file again: the window closes when it has. */
  settling: boolean;
  /** The runtime's refusal, as it said it, or null. */
  error: string | null;
  /** Forgets the refusal and any wait: a window opens again. */
  reset(): void;
  /** Sends `edit_project` with the digest of the file `info` shows, and then reads the projects again (`refresh`). `done` runs once the page holds the file as the edit left it, so the next edit is made on
   * the digest and on the content the page shows together, never on the answer's digest with the old content. */
  save(patch: EditPatch, done: () => void): void;
}

export function useEdit(id: string, info: ProjectInfo): EditApi {
  const { request } = useRegistry();
  const { refresh } = useJobs();
  const blocked = useBlocked(id);
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  /** The digest the answered edit was made on, until the page holds another file. */
  const [after, setAfter] = React.useState<string | null>(null);
  const latest = React.useRef({ request, id, digest: info.digest, refresh });
  latest.current = { request, id, digest: info.digest, refresh };
  const then = React.useRef<(() => void) | null>(null);
  const live = React.useRef(true);
  React.useEffect(() => {
    live.current = true;
    return () => { live.current = false; };
  }, []);

  // The page shows another file than the one the edit was made on: it has read the project again.
  React.useEffect(() => {
    if (after === null || info.digest === after) return;
    const next = then.current;
    then.current = null;
    setAfter(null);
    next?.();
  }, [after, info.digest]);

  const reset = React.useCallback((): void => { then.current = null; setAfter(null); setError(null); }, []);

  const save = React.useCallback((patch: EditPatch, done: () => void): void => {
    const now = latest.current, sent = now.digest;
    setSending(true);
    setError(null);
    void (async () => {
      try { await now.request('edit_project', editPayload(now.id, sent, patch)); }
      catch (e) {
        if (live.current) { setSending(false); setError(message(e)); }
        return;
      }
      if (!live.current) return;
      then.current = done;
      setSending(false);
      setAfter(sent);
      now.refresh();
    })();
  }, []);

  return { blocked, sending, settling: after !== null, error, reset, save };
}

// ---------- the form ----------
interface Form { name: string; author: string; repository: ProjectRepository; changelog: string }
/** The repository fields of a project that has none: empty, the branch as the dialog starts it. */
const NO_REPOSITORY = Object.fromEntries(REPOSITORY_FIELDS.map(field => [field.key, field.initial])) as ProjectRepository;

/** The form as the file says it now. */
function formOf(info: ProjectInfo): Form {
  const repo = info.project?.repository;
  return {
    name: text(info.project?.name), author: text(info.project?.author), changelog: text(info.changelog),
    repository: repo ? { url: text(repo.url), branch: text(repo.branch), tag_prefix: text(repo.tag_prefix) } : NO_REPOSITORY,
  };
}
const sameRepository = (a: ProjectRepository, b: ProjectRepository): boolean => JSON.stringify(repositoryOf(a)) === JSON.stringify(repositoryOf(b));
/** What the person changed, as the edit carries it: only the keys that differ from the form the window opened on. An empty repository address is the repository taken away (`null`). */
function patchOf(base: Form, form: Form): EditPatch {
  const patch: EditPatch = {};
  if (form.name.trim() !== base.name.trim()) patch.name = form.name;
  if (form.author.trim() !== base.author.trim()) patch.author = form.author;
  if (!sameRepository(form.repository, base.repository)) patch.repository = form.repository;
  if (form.changelog !== base.changelog) patch.changelog = form.changelog;
  return patch;
}
interface Problems { name: string | null; author: string | null; repository: RepositoryErrors }
/** What is wrong with what is about to be sent, in the runtime's words (it makes the same checks again); a field left as the file has it is not checked. */
function problemsOf(patch: EditPatch, form: Form): Problems {
  return {
    name: patch.name === undefined ? null : checkText(form.name, 'The project name'),
    author: patch.author === undefined ? null : checkText(form.author, 'The author'),
    repository: patch.repository === undefined ? {} : checkRepository(form.repository),
  };
}
const wrong = (problems: Problems): boolean => !!(problems.name || problems.author || Object.keys(problems.repository).length);

/** A window's state: the form it opened on, the form as typed, and whether a save was tried (the errors show from then on). */
interface Session { open: boolean; base: Form; form: Form; tried: boolean }
const opened = (info: ProjectInfo, open: boolean): Session => ({ open, base: formOf(info), form: formOf(info), tried: false });

export interface DetailsDialogProps {
  /** The id of the project (the key of its entry in the list). */
  id: string;
  /** The project as the page read it: the file the edit is made on is the one `info.digest` names. */
  info: ProjectInfo;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DetailsDialog({ id, info, open, onOpenChange }: DetailsDialogProps) {
  const edit = useEdit(id, info);
  const notify = useNotify();
  const formId = React.useId();
  const firstUrl = React.useRef<HTMLInputElement>(null);
  const [held, setHeld] = React.useState<Session>(() => opened(info, open));
  // The form starts from the file each time the window opens, and is not made again when the file is read again while it is open: what the person typed is theirs.
  let session = held;
  if (open !== held.open) {
    session = open ? opened(info, true) : { ...held, open: false };
    setHeld(session);
  }
  const forget = edit.reset;
  React.useEffect(() => { if (open) forget(); }, [open, forget]);

  const { base, form, tried } = session;
  const change = (next: Partial<Form>): void => setHeld(now => ({ ...now, form: { ...now.form, ...next } }));
  const patch = patchOf(base, form), problems = problemsOf(patch, form);
  const dirty = Object.keys(patch).length > 0, saving = edit.sending || edit.settling;

  function submit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setHeld(now => ({ ...now, tried: true }));
    if (saving || edit.blocked !== null || !dirty || wrong(problems)) return;
    edit.save(patch, () => { notify('Details saved.'); onOpenChange(false); });
  }
  const fault = (said: string | null | undefined): string | null => (tried ? said ?? null : null);

  return (
    <Dialog
      drawer
      open={open}
      onOpenChange={next => { if (!next && edit.sending) return; onOpenChange(next); }}
      title="Edit details"
      description="What the project file says about itself, and its changelog. No AI run is made, and the plugin id cannot change."
      footer={(
        <>
          <Button variant="outline" disabled={edit.sending} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form={formId} loading={saving} loadingText="Saving…" disabled={!dirty || edit.blocked !== null}>Save</Button>
        </>
      )}
    >
      <form id={formId} noValidate onSubmit={submit}><Column gap="lg">
        <FormField label="Name" required error={fault(problems.name)}>
          <Input name="name" autoComplete="off" autoFocus value={form.name} onChange={e => change({ name: e.currentTarget.value })} />
        </FormField>
        <FormField label="Author" required error={fault(problems.author)}>
          <Input name="author" autoComplete="off" value={form.author} onChange={e => change({ author: e.currentTarget.value })} />
        </FormField>
        <Column role="group" aria-label="Repository" gap="lg">
          {REPOSITORY_FIELDS.map(field => (
            <FormField key={field.key} label={field.label} help={field.hint} error={fault(problems.repository[field.key])}>
              <Input
                ref={field.key === 'url' ? firstUrl : undefined}
                name={`repository-${field.key}`}
                autoComplete="off"
                spellCheck={false}
                placeholder={field.placeholder}
                value={form.repository[field.key]}
                onChange={e => change({ repository: { ...form.repository, [field.key]: e.currentTarget.value } })}
              />
            </FormField>
          ))}
          {form.repository.url.trim() ? (
            <Cluster>
              <Button variant="outline" size="sm" onClick={() => { change({ repository: NO_REPOSITORY }); firstUrl.current?.focus(); }}>Take the repository away</Button>
            </Cluster>
          ) : null}
        </Column>
        <FormField label="Changelog" help="CHANGELOG.md of the project: one entry per version. Muro writes one at each harmonization; you can edit it.">
          <Textarea name="changelog" rows={10} spellCheck={false} value={form.changelog} onChange={e => change({ changelog: e.currentTarget.value })} />
        </FormField>
        {edit.blocked ? <Text as="p" variant="note" role="status">{edit.blocked}</Text> : !dirty ? <Text as="p" variant="note">Nothing has changed yet.</Text> : null}
        {edit.error ? <NotSaved text={edit.error} /> : null}
      </Column></form>
    </Dialog>
  );
}
