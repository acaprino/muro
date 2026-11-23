import * as React from 'react';
import { Badge, Button, Dialog, FormField, Icon, Input } from '@acaprino/sigrid';
import type { ProjectUpdate, ProjectUpdates } from '../../../types.ts';
import { useRegistry } from '../../../state/registry.tsx';
import { message } from '../../../words.ts';
import { pinnedOf } from '../data.ts';
import { CHANGED, checkText, operationWords } from './jobs.ts';
import { RefusalLine, RunFields, RunFooter, RunFormBody, projectName, useRunForm } from './HarmonizeDialog.tsx';
import type { ChangeDialogProps } from './HarmonizeDialog.tsx';

/** One input of the project, changed by an AI run: its pin moved (`move_pin`), or the input removed (`remove_input`, `remove`). Moving a pin starts from what the person
 * asks: "Check for updates" reads how the pin stands against its upstream (`project_updates`, read-only, for the file the page shows), and a newer release it reports fills
 * the field; the person may type another release or commit, or leave it empty for the newest one. Removing asks first, with the focus on Cancel: what only this input
 * brought leaves the project. The Inputs panel offers no Move pin for a frozen commit and no Remove for the only input, as the runtime refuses it. */
export interface PinDialogProps extends ChangeDialogProps {
  /** The id of the input. */
  input: string;
  /** Remove the input, rather than move its pin. */
  remove: boolean;
}

/** How a pin stands against its upstream, in the words of the page. */
export function updateLine(u: ProjectUpdate): string {
  switch (u.status) {
    case 'behind': return u.upstream ? `${u.upstream} available` : 'A newer version is available';
    case 'current': return 'Up to date';
    case 'frozen': return 'Frozen';
    case 'drifted': return 'Pin moved upstream';
    default: return u.note || 'Not checked';
  }
}

type Check = { busy: boolean; update: ProjectUpdate | null; error: string | null };
const IDLE: Check = { busy: false, update: null, error: null };

export function PinDialog(props: PinDialogProps) {
  const { id, info, input, remove } = props;
  const { request } = useRegistry();
  const [to, setTo] = React.useState('');
  const [toError, setToError] = React.useState<string | undefined>(undefined);
  const [check, setCheck] = React.useState<Check>(IDLE);
  /** The person typed in the field: a check that answers later does not write over it. */
  const typed = React.useRef(false);
  /** The opening a check belongs to: the answer to a check of an earlier opening is dropped. */
  const round = React.useRef(0);
  const operation = remove ? 'remove_input' : 'move_pin';
  const form = useRunForm(props, operation, () => {
    setTo('');
    setToError(undefined);
    setCheck(IDLE);
    typed.current = false;
    round.current++;
  });
  const name = projectName(info, id);
  const held = Array.isArray(info.inputs) ? info.inputs.find(i => i.id === input) ?? null : null;

  async function checkUpdates(): Promise<void> {
    if (check.busy) return;
    const mine = round.current;
    setCheck({ busy: true, update: null, error: null });
    try {
      const got = await request<ProjectUpdates>('project_updates', { id });
      if (round.current !== mine) return;
      if (got?.digest !== info.digest) { setCheck({ busy: false, update: null, error: CHANGED }); return; }
      const update = Array.isArray(got.inputs) ? got.inputs.find(u => u.id === input) ?? null : null;
      setCheck({ busy: false, update, error: update ? null : `The check says nothing of ${input}.` });
      if (update?.status === 'behind' && update.upstream && !typed.current) { setTo(update.upstream); setToError(undefined); }
    } catch (e) {
      if (round.current === mine) setCheck({ busy: false, update: null, error: message(e) });
    }
  }
  function submit(): void {
    if (remove) { void form.run({ input }); return; }
    const bad = to.trim() ? checkText(to, 'The release to move to') : null;
    setToError(bad ?? undefined);
    void form.run(bad ? null : { input, to });
  }

  if (remove) return (
    <Dialog
      open={props.open}
      onOpenChange={form.onOpenChange}
      title={`Remove ${input}`}
      description={`What only ${input} brought leaves ${name}. The AI harmonizes what remains.`}
      footer={<RunFooter form={form} submit={operationWords('remove_input').submit} destructive cancelFirst />}
    >
      <RunFormBody form={form} onSubmit={submit}>
        <RunFields form={form} />
      </RunFormBody>
    </Dialog>
  );

  const pin = held ? pinnedOf(held) : null, words = operationWords('move_pin'), update = check.update;
  return (
    <Dialog
      open={props.open}
      onOpenChange={form.onOpenChange}
      title={`Move the pin of ${input}`}
      description={words.about}
      footer={<RunFooter form={form} submit={words.submit} />}
    >
      <RunFormBody form={form} onSubmit={submit}>
        {held ? (
          <dl className="flex flex-col gap-1 text-sm">
            <div className="flex min-w-0 gap-3"><dt className="w-20 shrink-0 text-ink-mute">Pinned to</dt><dd className="min-w-0 text-ink">{pin ? `${pin.title} · ${pin.line}` : ''}</dd></div>
            <div className="flex min-w-0 gap-3"><dt className="w-20 shrink-0 text-ink-mute">Source</dt><dd className="min-w-0 break-all font-mono text-xs text-ink">{held.url || 'Local source'}</dd></div>
          </dl>
        ) : null}
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" loading={check.busy} loadingText="Checking…" onClick={() => void checkUpdates()}><Icon name="refresh" />Check for updates</Button>
            <span role="status" className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-ink-mute">
              {update ? <Badge variant="secondary">{updateLine(update)}</Badge> : null}
              {update?.note && update.status !== 'unknown' && update.status !== 'error' ? <span className="min-w-0">{update.note}</span> : null}
            </span>
          </div>
          {check.error ? <RefusalLine>{check.error}</RefusalLine> : null}
        </div>
        <FormField label="Move to" help="A published release or a commit. Leave it empty for the newest release (the latest commit, for an input without releases)." error={toError}>
          <Input
            autoFocus
            value={to}
            placeholder="v2.0.0"
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
            onChange={e => { typed.current = true; setTo(e.currentTarget.value); setToError(undefined); }}
          />
        </FormField>
        <RunFields form={form} />
      </RunFormBody>
    </Dialog>
  );
}
