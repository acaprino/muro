import * as React from 'react';
import { Button, Card, Cluster, Heading, Icon, Input, Text, Textarea } from '@acaprino/sigrid/primitives';
import { Dialog, FormField } from '@acaprino/sigrid/components';
import type { InstructionFile } from '../../../types.ts';
import { checkInstructions, instructionDiff, operationWords } from './jobs.ts';
import { RefusalLine, RunFields, RunFooter, RunFormBody, afterColon, projectName, useRunForm } from './HarmonizeDialog.tsx';
import type { ChangeDialogProps } from './HarmonizeDialog.tsx';

/** Your instructions: the owner's own Markdown files of the project (`info.instructions`, under custom-instructions/), each with its name and its text, to change, add or
 * remove. Saving them is an AI run that harmonizes them with the inputs (`instructions`); only what changed is sent: a file written whole (new, renamed or edited), or a file
 * no longer there with no text (`instructionDiff`). The text is sent as it was typed: the AI decides how a file fits, and never changes it. */

type Row = { key: number; path: string; text: string };
const NOTHING = 'Nothing changed: edit, add or remove a file first.';

/** The files the project holds, as the runtime sent them: a row that is not a file with a name and a text is left out. */
const heldOf = (files: unknown): InstructionFile[] => Array.isArray(files)
  ? files.filter((f): f is InstructionFile => !!f && typeof f === 'object' && typeof (f as InstructionFile).path === 'string' && typeof (f as InstructionFile).text === 'string')
  : [];

export function InstructionsDialog(props: ChangeDialogProps) {
  const held = React.useMemo(() => heldOf(props.info.instructions), [props.info.instructions]);
  const ids = React.useId();
  const made = React.useRef(0);
  const rowsOf = (): Row[] => held.map(f => ({ key: ++made.current, path: f.path, text: f.text }));
  const [rows, setRows] = React.useState<Row[]>(rowsOf);
  /** The file the rows were made from: its files and its digest, as they were when the dialog opened. The project may be read again while the dialog is open (a run of another client ended); the
   * changes are still those of these rows, against these files, so they are sent with this digest and the runtime refuses them if the file is no longer this one. */
  const [opened, setOpened] = React.useState({ held, digest: props.info.digest });
  const [error, setError] = React.useState<string | undefined>(undefined);
  /** A row just added, whose name takes the focus; or -1, the button that adds one (after a row was removed). */
  const [focus, setFocus] = React.useState<number | null>(null);
  const add = React.useRef<HTMLButtonElement | null>(null);
  const form = useRunForm(props, 'instructions', () => { setRows(rowsOf()); setOpened({ held, digest: props.info.digest }); setError(undefined); setFocus(null); });
  const words = operationWords('instructions');

  React.useEffect(() => {
    if (focus === null) return;
    if (focus === -1) add.current?.focus();
    else document.getElementById(`${ids}-path-${focus}`)?.focus();
    setFocus(null);
  }, [focus, ids]);

  const change = (key: number, patch: Partial<Row>) => { setRows(now => now.map(r => (r.key === key ? { ...r, ...patch } : r))); setError(undefined); };
  function addRow(): void {
    const key = ++made.current;
    setRows(now => [...now, { key, path: '', text: '' }]);
    setError(undefined);
    setFocus(key);
  }
  function removeRow(key: number): void {
    setRows(now => now.filter(r => r.key !== key));
    setError(undefined);
    setFocus(-1);
  }
  function submit(): void {
    const edits = instructionDiff(opened.held, rows.map(r => ({ path: r.path, text: r.text })));
    const bad = edits.length ? checkInstructions(edits) : NOTHING;
    setError(bad ?? undefined);
    void form.run(bad ? null : { instructions: edits }, opened.digest);
  }

  return (
    <Dialog
      drawer
      open={props.open}
      onOpenChange={form.onOpenChange}
      title={words.title}
      description={`${projectName(props.info, props.id)}: ${afterColon(words.about)}`}
      footer={<RunFooter form={form} submit={words.submit} />}
    >
      <RunFormBody form={form} onSubmit={submit}>
        {rows.length ? rows.map((row, i) => {
          const named = row.path.trim();
          return (
            <Card key={row.key} variant="quiet" pad="md" role="group" aria-labelledby={`${ids}-head-${row.key}`}>
              <Heading size="small" id={`${ids}-head-${row.key}`}><Text pre>{named || 'New file'}</Text></Heading>
              <FormField label="File name" id={`${ids}-path-${row.key}`} help={i === 0 ? 'Markdown, such as house-style.md or team/tone.md.' : undefined}>
                <Input
                  autoFocus={i === 0}
                  value={row.path}
                  placeholder="house-style.md"
                  autoComplete="off"
                  spellCheck={false}
                  onChange={e => change(row.key, { path: e.currentTarget.value })}
                />
              </FormField>
              <FormField label="Text">
                <Textarea rows={6} value={row.text} onChange={e => change(row.key, { text: e.currentTarget.value })} />
              </FormField>
              <Cluster>
                <Button variant="outline" size="sm" aria-label={`Remove file ${named || '(new)'}`} onClick={() => removeRow(row.key)}><Icon name="delete" />Remove file</Button>
              </Cluster>
            </Card>
          );
        }) : <Text as="p" variant="muted">This project has no instruction file yet.</Text>}
        <Cluster>
          <Button ref={add} variant="outline" size="sm" autoFocus={!rows.length} onClick={addRow}><Icon name="plus" />Add file</Button>
        </Cluster>
        {error ? <RefusalLine>{error}</RefusalLine> : null}
        <RunFields form={form} />
      </RunFormBody>
    </Dialog>
  );
}
