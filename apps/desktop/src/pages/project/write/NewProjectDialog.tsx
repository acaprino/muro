import * as React from 'react';
import { Button, Dialog, FormField, Icon, Input, Textarea } from '@acaprino/sigrid';
import type { ProjectRepository, ProjectSummary } from '../../../types.ts';
import { useNotify } from '../../../state/notices.tsx';
import { useRegistry } from '../../../state/registry.tsx';
import { message, unknownTo } from '../../../words.ts';
import {
  AI_RUN_NOTE, BUDGET_HINT, DEFAULT_BUDGET, REPOSITORY_FIELDS, agentRefusal, busyReason, checkBudget, checkFolder, checkInputs, checkRepository, checkSlug, checkText,
  newProjectPayload, operationWords, slugOf,
} from './jobs.ts';
import type { Listed } from './jobs.ts';
import { useJobs } from './useJobs.tsx';

/** The dialog of a new project: what a person tells the AI to make one plugin of (ADR-0032). It checks what only needs what was typed, in the runtime's own words (`jobs.ts`), and sends
 * `create_project`; the runtime checks the rest before it pays for a run (that the folder is there, that no file of that name exists, that no run goes), and its sentence is shown as it comes.
 * What the project means, and what the inputs do, is the AI's: nothing here reads an address or a request to guess either. */

/** Whether the shell said it cannot open a folder dialog ("Unknown ... pick_folder"): then "Choose folder…" is gone, for every dialog, until the window is loaded again. */
let noFolderShell = false;

type Key = 'name' | 'slug' | 'author' | 'folder' | 'inputs' | 'request' | 'url' | 'branch' | 'tag_prefix' | 'budget';
type Problems = Partial<Record<Key, string>>;
/** The fields in the order the dialog shows them: the first with a problem is where the focus goes when the form is sent wrong. */
const ORDER: readonly Key[] = ['name', 'slug', 'author', 'folder', 'inputs', 'request', 'url', 'branch', 'tag_prefix', 'budget'];

interface Form {
  name: string;
  slug: string;
  /** The plugin id was typed: from then on it no longer follows the name. */
  slugged: boolean;
  author: string;
  folder: string;
  inputs: string;
  request: string;
  repository: ProjectRepository;
  repositoryOpen: boolean;
  budget: string;
}
const blank = (): Form => ({
  name: '', slug: '', slugged: false, author: '', folder: '', inputs: '', request: '',
  repository: Object.fromEntries(REPOSITORY_FIELDS.map(f => [f.key, f.initial])) as ProjectRepository, repositoryOpen: false, budget: String(DEFAULT_BUDGET),
});

/** What is wrong with the form, field by field, in the runtime's words. */
function problems(form: Form, taken: Listed): Problems {
  const found: Problems = {};
  const note = (key: Key, said: string | null): void => { if (said) found[key] = said; };
  note('name', checkText(form.name, 'The project name'));
  note('slug', checkSlug(form.slug, taken));
  note('author', checkText(form.author, 'The author'));
  note('folder', checkFolder(form.folder));
  note('inputs', checkInputs(form.inputs));
  note('request', checkText(form.request, 'The request', true));
  Object.assign(found, checkRepository(form.repository));
  note('budget', checkBudget(form.budget));
  return found;
}

/** A press on a button inside the form leaves the focus in the field it was in: the field is not left, so no sentence about it opens above the button between the press and the click and moves it
 * from under the pointer. The click and the keyboard work as they do. */
const keepFocus = (e: React.MouseEvent): void => e.preventDefault();

export interface NewProjectDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** The projects of the list: a plugin id one of them has is refused here, as the runtime refuses it. */
  listed: readonly ProjectSummary[];
  /** The button that opened the dialog, where focus goes when it closes. */
  restoreFocusTo?: React.RefObject<HTMLElement | null>;
}

export function NewProjectDialog({ open, onOpenChange, listed, restoreFocusTo }: NewProjectDialogProps) {
  const { request, snapshot } = useRegistry();
  const { running, start } = useJobs();
  const notify = useNotify();
  const ids = React.useId();
  const formId = `${ids}-form`;
  const fieldId = (key: Key): string => `${ids}-${key}`;
  const [form, setForm] = React.useState<Form>(blank);
  const [touched, setTouched] = React.useState<ReadonlySet<Key>>(() => new Set());
  const [submitted, setSubmitted] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [failure, setFailure] = React.useState<string | null>(null);
  const [picking, setPicking] = React.useState(false);
  const [noPicker, setNoPicker] = React.useState(noFolderShell);
  // A dialog that opens is a new form: what was typed in the last one is not kept.
  const [was, setWas] = React.useState(open);
  if (open !== was) {
    setWas(open);
    if (open) { setForm(blank()); setTouched(new Set()); setSubmitted(false); setFailure(null); }
  }

  const words = operationWords('create');
  const taken = React.useMemo<Listed>(() => ({ projects: listed.map(p => p.id), plugins: snapshot?.registry.plugins.map(p => p.id) ?? [] }), [listed, snapshot]);
  const found = problems(form, taken);
  /** A field says what is wrong once it was left, or when the form was sent. */
  const say = (key: Key): string | undefined => (submitted || touched.has(key) ? found[key] : undefined);
  const touch = (key: Key): void => setTouched(now => (now.has(key) ? now : new Set(now).add(key)));
  const refusal = agentRefusal(snapshot?.registry.settings);
  const busy = busyReason(running);
  const repositoryOpen = form.repositoryOpen || (submitted && !!(found.url || found.branch || found.tag_prefix));

  // Whatever is typed, the sentence the runtime refused the last request with is no longer about what is in the form.
  const text = (key: 'author' | 'folder' | 'inputs' | 'request' | 'budget') => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { const value = e.currentTarget.value; setFailure(null); setForm(f => ({ ...f, [key]: value })); },
    onBlur: () => touch(key),
  });
  /** The plugin id follows the name until it is typed: a suggestion to read, never a decision. */
  const changeName = (name: string): void => { setFailure(null); setForm(f => ({ ...f, name, slug: f.slugged ? f.slug : slugOf(name) })); };
  const changeSlug = (slug: string): void => { setFailure(null); setForm(f => ({ ...f, slug, slugged: true })); };
  const changeRepository = (key: keyof ProjectRepository, value: string): void => { setFailure(null); setForm(f => ({ ...f, repository: { ...f.repository, [key]: value } })); };

  /** The shell's folder dialog fills the folder; a closed dialog leaves it as it was; a shell that does not know it yet loses the button. */
  async function chooseFolder(): Promise<void> {
    setPicking(true);
    try {
      const picked = await request<{ path: string | null } | null>('pick_folder');
      const path = picked?.path;
      if (path) setForm(f => ({ ...f, folder: path }));
    } catch (e) {
      if (unknownTo(e, 'pick_folder')) { noFolderShell = true; setNoPicker(true); notify('This version of Muro cannot open a folder dialog yet: type the path.', 'error'); }
      else notify(message(e), 'error');
    } finally { setPicking(false); }
  }

  async function submit(): Promise<void> {
    if (sending || refusal || busy) return;
    setSubmitted(true);
    const first = ORDER.find(key => found[key]);
    if (first) { setTimeout(() => document.getElementById(fieldId(first))?.focus(), 0); return; }
    setFailure(null);
    setSending(true);
    try {
      await start('create_project', newProjectPayload({ name: form.name, slug: form.slug, author: form.author, folder: form.folder, inputs: form.inputs, request: form.request, repository: form.repository, budget: form.budget }));
      onOpenChange(false);
    } catch (e) { setFailure(message(e)); }
    finally { setSending(false); }
  }

  return (
    <Dialog
      drawer
      open={open}
      onOpenChange={next => { if (!next && sending) return; onOpenChange(next); }}
      title={words.title}
      description={words.about}
      restoreFocusTo={restoreFocusTo}
      footer={(
        <>
          <Button variant="outline" disabled={sending} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form={formId} loading={sending} loadingText="Starting…" disabled={refusal !== null || busy !== null}>{words.submit}</Button>
        </>
      )}
    >
      <form id={formId} noValidate className="flex flex-col gap-4" onSubmit={e => { e.preventDefault(); void submit(); }}>
        <FormField id={fieldId('name')} label="Name" error={say('name')}>
          <Input autoFocus autoComplete="off" placeholder="My plugin" value={form.name} onChange={e => changeName(e.currentTarget.value)} onBlur={() => touch('name')} />
        </FormField>
        <FormField id={fieldId('slug')} label="Plugin id" help="Lowercase letters and digits joined by dashes: how the harnesses name the plugin. It cannot change later." error={say('slug')}>
          <Input autoComplete="off" spellCheck={false} className="font-mono" placeholder="my-plugin" value={form.slug} onChange={e => changeSlug(e.currentTarget.value)} onBlur={() => touch('slug')} />
        </FormField>
        <FormField id={fieldId('author')} label="Author" error={say('author')}>
          <Input autoComplete="off" {...text('author')} />
        </FormField>
        <div className="flex flex-col gap-2">
          <FormField id={fieldId('folder')} label="Save in folder" help="The project is one file in this folder, named after the plugin id." error={say('folder')}>
            <Input autoComplete="off" spellCheck={false} className="font-mono" {...text('folder')} />
          </FormField>
          {noPicker ? null : <Button variant="outline" size="sm" className="self-start" loading={picking} loadingText="Choosing…" onMouseDown={keepFocus} onClick={() => void chooseFolder()}>Choose folder…</Button>}
        </div>
        <FormField
          id={fieldId('inputs')}
          label="Inputs"
          help="One per line: a repository address (https://…; a folder of it after #) or the full path of a folder on this computer. What the inputs do, the plugin does."
          error={say('inputs')}
        >
          <Textarea rows={4} spellCheck={false} className="font-mono" {...text('inputs')} />
        </FormField>
        <FormField id={fieldId('request')} label="Your request (optional)" help="In your words: what to take from the inputs, how to fit them together. The AI reads it with the inputs." error={say('request')}>
          <Textarea rows={3} {...text('request')} />
        </FormField>
        <div className="flex flex-col gap-4">
          <Button variant="ghost" size="sm" className="self-start" aria-expanded={repositoryOpen} onMouseDown={keepFocus} onClick={() => setForm(f => ({ ...f, repositoryOpen: !repositoryOpen }))}>
            <Icon name={repositoryOpen ? 'chevronDown' : 'chevron'} />Repository (optional)
          </Button>
          {repositoryOpen ? REPOSITORY_FIELDS.map(r => (
            <FormField key={r.key} id={fieldId(r.key)} label={r.label} help={r.hint} error={say(r.key)}>
              <Input autoComplete="off" spellCheck={false} placeholder={r.placeholder} value={form.repository[r.key]} onChange={e => changeRepository(r.key, e.currentTarget.value)} onBlur={() => touch(r.key)} />
            </FormField>
          )) : null}
        </div>
        <FormField id={fieldId('budget')} label="Maximum budget (USD)" help={BUDGET_HINT} error={say('budget')}>
          <Input autoComplete="off" inputMode="decimal" {...text('budget')} />
        </FormField>
        <p className="text-xs text-ink-mute">{words.does} {AI_RUN_NOTE}</p>
        {refusal ? <p role="alert" className="rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive">{refusal}</p> : null}
        {busy ? <p role="status" className="text-sm text-ink-mute">{busy}</p> : null}
        {failure ? <p role="alert" className="rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive">{failure}</p> : null}
      </form>
    </Dialog>
  );
}
