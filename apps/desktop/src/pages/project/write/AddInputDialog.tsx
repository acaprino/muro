import * as React from 'react';
import { Dialog, FormField, Input } from '@acaprino/sigrid';
import { checkSource, operationWords } from './jobs.ts';
import { RunFields, RunFooter, RunFormBody, afterColon, projectName, useRunForm } from './HarmonizeDialog.tsx';
import type { ChangeDialogProps } from './HarmonizeDialog.tsx';

/** Add input: where the input comes from (an https:// address, a folder of it after the hash sign, or the full path of a folder on this computer), the request in words, the
 * version step (a minor step unless the person says otherwise) and the budget. What the input is and what it becomes is the AI's to find: the page only checks that the address
 * is one the runtime takes, with the runtime's words; that a folder is there is the runtime's to say, after the dialog is submitted. */
export function AddInputDialog(props: ChangeDialogProps) {
  const [source, setSource] = React.useState('');
  const [error, setError] = React.useState<string | undefined>(undefined);
  const form = useRunForm(props, 'add_input', () => { setSource(''); setError(undefined); });
  const words = operationWords('add_input');
  function submit(): void {
    const bad = checkSource(source);
    setError(bad ?? undefined);
    void form.run(bad ? null : { source });
  }
  return (
    <Dialog
      open={props.open}
      onOpenChange={form.onOpenChange}
      title={words.title}
      description={`${projectName(props.info, props.id)}: ${afterColon(words.about)}`}
      footer={<RunFooter form={form} submit={words.submit} />}
    >
      <RunFormBody form={form} onSubmit={submit}>
        <FormField label="Input" help="A repository address (https://…, a folder of it after the hash sign) or the full path of a folder on this computer." error={error}>
          <Input
            value={source}
            placeholder="https://github.com/owner/repository"
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
            onChange={e => { setSource(e.currentTarget.value); setError(undefined); }}
          />
        </FormField>
        <RunFields form={form} />
      </RunFormBody>
    </Dialog>
  );
}
