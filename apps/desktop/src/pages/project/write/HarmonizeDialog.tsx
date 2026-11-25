import * as React from 'react';
import { Button, Column, Input, Text, Textarea, ToggleGroup, ToggleGroupItem } from '@acaprino/sigrid/primitives';
import { Dialog, FormField, Note } from '@acaprino/sigrid/components';
import type { ChangeOperation, ProjectInfo, VersionStep } from '../../../types.ts';
import { text } from '../../../model.ts';
import { useRegistry } from '../../../state/registry.tsx';
import { message } from '../../../words.ts';
import { AI_RUN_NOTE, BUDGET_HINT, DEFAULT_BUDGET, STEP_HINT, VERSION_STEPS, agentRefusal, busyReason, changePayload, checkBudget, checkText, defaultStep, operationWords } from './jobs.ts';
import type { ChangeForm } from './jobs.ts';
import { useJobs } from './useJobs.tsx';

/** Harmonize again, and what every dialog of an AI change of a project shares (Add input, Move pin, Remove input, Instructions): the request in words, the version step,
 * the budget, the sentence that says who does the run and at what cost, the refusal of an agent the runtime does not run, and the start of the run (`project_job`) on the
 * file the page read (`info.digest`). The page judges nothing of the project: what it checks is what the runtime checks again (jobs.ts), and what the runtime refuses is
 * shown as it said it, with the dialog left open. Every dialog stays mounted while closed, so the focus goes back to what opened it, and starts again from its first
 * values each time it opens. */

/** What every dialog of a change takes: the project, the file the page read (its digest goes with the change) and whether it is open. */
export interface ChangeDialogProps { id: string; info: ProjectInfo; open: boolean; onOpenChange: (open: boolean) => void }

/** The project's name in the words of a dialog: its own, else its plugin's, else its id. */
export const projectName = (info: ProjectInfo, id: string): string => text(info.project?.name) || text(info.plugin?.name) || id;
/** A sentence after a name and a colon: its first letter in lower case ("My package: the AI reads…"). */
export const afterColon = (sentence: string): string => sentence.charAt(0).toLowerCase() + sentence.slice(1);
const REQUEST_HINT = 'Optional. In your words, for the AI. A binding record still wins: the AI stops rather than break one.';

/** The state of a dialog of a change, for its fields and its buttons. */
export interface RunForm {
  /** The id of the `<form>`: the button in the dialog's foot submits it. */
  formId: string;
  budget: string;
  step: VersionStep;
  request: string;
  errors: { budget?: string | undefined; request?: string | undefined };
  /** What the runtime said when it refused the run, as it said it; null before. */
  failure: string | null;
  /** The request that starts the run is on its way: the dialog cannot be closed and its button waits. */
  busy: boolean;
  /** Why no run can start from here, said before anything is sent: the agent of Settings (the runtime runs only Claude Code), or a run that goes (one at a time). */
  stop: string | null;
  setBudget(value: string): void;
  setStep(value: VersionStep): void;
  setRequest(value: string): void;
  /** The dialog's own `onOpenChange`: a close is refused while the request is on its way. */
  onOpenChange(open: boolean): void;
  /** Checks the common fields and starts the run with what the dialog adds (`own`), or only shows what is wrong when `own` is null (a field of the dialog's own is wrong, and it says so itself).
   * The run is asked on the file the page shows now (`info.digest`), unless the dialog names the digest it was made from: a form built from the file as it was when the dialog opened (the
   * instruction files) is sent with that digest, so the runtime refuses it, in the words of `CHANGED`, when the file changed since. */
  run(own: Partial<ChangeForm> | null, digest?: string): Promise<void>;
}

/** The common state of a dialog of the change `operation`. `reset` puts the dialog's own fields back to their first values: it is called in the render where the dialog opens. */
export function useRunForm({ id, info, open, onOpenChange }: ChangeDialogProps, operation: ChangeOperation, reset?: () => void): RunForm {
  const jobs = useJobs();
  const { snapshot } = useRegistry();
  const formId = React.useId();
  const [budget, setBudgetText] = React.useState(String(DEFAULT_BUDGET));
  const [step, setStep] = React.useState<VersionStep>(defaultStep(operation));
  const [request, setRequestText] = React.useState('');
  const [errors, setErrors] = React.useState<RunForm['errors']>({});
  const [failure, setFailure] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const pending = React.useRef(false);
  /** The run of this opening has started: the run that now goes is that one, not a reason to say no. */
  const sent = React.useRef(false);
  const [was, setWas] = React.useState(open);
  if (open !== was) {
    setWas(open);
    if (open) {
      setBudgetText(String(DEFAULT_BUDGET));
      setStep(defaultStep(operation));
      setRequestText('');
      setErrors({});
      setFailure(null);
      sent.current = false;
      reset?.();
    }
  }
  const refusal = agentRefusal(snapshot?.registry.settings);
  const stop = refusal ?? (busy || sent.current ? null : busyReason(jobs.running));

  const focusInvalid = () => requestAnimationFrame(() => document.getElementById(formId)?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  async function run(own: Partial<ChangeForm> | null, digest: string = info.digest): Promise<void> {
    if (pending.current) return;
    const bad = { budget: checkBudget(budget) ?? undefined, request: checkText(request, 'The request', true) ?? undefined };
    setErrors(bad);
    if (bad.budget || bad.request || own === null) { focusInvalid(); return; }
    if (stop) return;
    pending.current = true;
    setBusy(true);
    setFailure(null);
    try {
      await jobs.start('project_job', changePayload(id, digest, operation, { ...own, budget, step, request }));
      sent.current = true;
      onOpenChange(false);
    } catch (e) {
      setFailure(message(e));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return {
    formId, budget, step, request, errors, failure, busy, stop,
    setBudget: value => { setBudgetText(value); setErrors(e => ({ ...e, budget: undefined })); },
    setStep,
    setRequest: value => { setRequestText(value); setErrors(e => ({ ...e, request: undefined })); },
    onOpenChange: next => { if (next || !pending.current) onOpenChange(next); },
    run,
  };
}

/** A sentence a surface says in place, as an error: the runtime's refusal, or why no run can start. */
export function RefusalLine({ children }: { children: React.ReactNode }) {
  return <Note tone="error" title={<Text>{children}</Text>} />;
}

/** The fields every change has, after the dialog's own: the request in words, the version step, who runs it and at what cost, the budget, and what the runtime said. */
export function RunFields({ form }: { form: RunForm }) {
  return (
    <>
      <FormField label="Your request" help={REQUEST_HINT} error={form.errors.request}>
        <Textarea rows={3} value={form.request} onChange={e => form.setRequest(e.currentTarget.value)} />
      </FormField>
      <Column>
        <Text variant="strong">Version</Text>
        <ToggleGroup value={form.step} onValueChange={form.setStep} aria-label="Version">
          {VERSION_STEPS.map(s => <ToggleGroupItem key={s.value} value={s.value}>{s.label}</ToggleGroupItem>)}
        </ToggleGroup>
        <Text as="p" variant="note">{STEP_HINT}</Text>
      </Column>
      {form.stop ? <RefusalLine>{form.stop}</RefusalLine> : <Text as="p" variant="soft">{AI_RUN_NOTE}</Text>}
      <FormField label="Maximum budget (USD)" help={BUDGET_HINT} error={form.errors.budget}>
        <Input inputMode="decimal" autoComplete="off" value={form.budget} onChange={e => form.setBudget(e.currentTarget.value)} />
      </FormField>
      {form.failure ? <RefusalLine>{form.failure}</RefusalLine> : null}
    </>
  );
}

/** The foot of a dialog of a change: Cancel, and the button that starts the run (off, saying why, while a run cannot start). A destructive change has the filled red button,
 * and `cancelFirst` puts the focus on Cancel when the dialog opens. */
export function RunFooter({ form, submit, destructive = false, cancelFirst = false }: { form: RunForm; submit: string; destructive?: boolean; cancelFirst?: boolean }) {
  return (
    <>
      <Button variant="outline" disabled={form.busy} autoFocus={cancelFirst} onClick={() => form.onOpenChange(false)}>Cancel</Button>
      <Column title={form.stop ?? undefined}>
        <Button type="submit" form={form.formId} variant={destructive ? 'destructive' : 'default'} disabled={form.stop !== null} title={form.stop ?? undefined} loading={form.busy} loadingText="Starting…">{submit}</Button>
      </Column>
    </>
  );
}

/** The `<form>` of a dialog of a change: Enter in a field submits it, and `onSubmit` decides whether anything is sent. */
export function RunFormBody({ form, onSubmit, children }: { form: RunForm; onSubmit(): void; children?: React.ReactNode }) {
  return (
    <form id={form.formId} noValidate onSubmit={e => { e.preventDefault(); onSubmit(); }}>
      <Column gap="lg">{children}</Column>
    </form>
  );
}

/** Harmonize again: the AI reads the inputs and the decision records again and fixes what no longer holds. */
export function HarmonizeDialog(props: ChangeDialogProps) {
  const form = useRunForm(props, 'harmonize');
  const words = operationWords('harmonize');
  return (
    <Dialog
      open={props.open}
      onOpenChange={form.onOpenChange}
      title={words.title}
      description={`${projectName(props.info, props.id)}: ${afterColon(words.about)}`}
      footer={<RunFooter form={form} submit={words.submit} />}
    >
      <RunFormBody form={form} onSubmit={() => void form.run({})}>
        <RunFields form={form} />
      </RunFormBody>
    </Dialog>
  );
}
