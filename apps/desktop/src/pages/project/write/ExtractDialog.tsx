import * as React from 'react';
import { Button, Cell, Column, Input, Select, Text } from '@acaprino/sigrid/primitives';
import { Dialog, FormField } from '@acaprino/sigrid/components';
import type { ProjectExtract } from '../../../types.ts';
import { useNotify } from '@acaprino/imago';
import { useRegistry } from '../../../state/registry.tsx';
import { harnessNames } from '../../../model.ts';
import { message, unknownTo } from '../../../words.ts';
import { EXTRACT_ABOUT, EXTRACT_HARNESSES, checkFolder, extractPayload, extractedLine } from './jobs.ts';
import { RefusalLine, projectName } from './HarmonizeDialog.tsx';
import type { ChangeDialogProps } from './HarmonizeDialog.tsx';

const OPTIONS = EXTRACT_HARNESSES.map(value => ({ value, label: harnessNames[value] ?? value }));

/** Extract: the plugin the project's file carries for one harness is written into a folder (`extract_project`, ADR-0035). No AI runs and the file is only read, so nothing waits for it. The page checks
 * only that the folder is a full path; what the build has and what is already in the folder the command says, and its sentence is shown as it came, with the window open. */
export function ExtractDialog({ id, info, open, onOpenChange }: ChangeDialogProps) {
  const { request } = useRegistry();
  const notify = useNotify();
  const [harness, setHarness] = React.useState<string>(EXTRACT_HARNESSES[0]);
  const [folder, setFolder] = React.useState('');
  const [problem, setProblem] = React.useState<string | null>(null);
  const [failure, setFailure] = React.useState<string | null>(null);
  const [extracting, setExtracting] = React.useState(false);
  /** Whether the shell cannot open a folder dialog: then "Choose folder…" is gone and the path is typed. */
  const [noPicker, setNoPicker] = React.useState(false);
  /** The request is on its way: a second press sends nothing. */
  const pending = React.useRef(false);
  // A dialog that opens has not failed yet; the harness and the folder stay as the person left them.
  const [was, setWas] = React.useState(open);
  if (open !== was) {
    setWas(open);
    if (open) { setProblem(null); setFailure(null); }
  }
  const name = projectName(info, id);

  async function chooseFolder(): Promise<void> {
    try {
      const picked = await request<{ path: string | null } | null>('pick_folder');
      if (picked?.path) { setFolder(picked.path); setProblem(null); setFailure(null); }
    } catch (e) {
      if (unknownTo(e, 'pick_folder')) setNoPicker(true);
      else setFailure(message(e));
    }
  }

  async function extract(): Promise<void> {
    if (pending.current) return;
    const bad = checkFolder(folder);
    setProblem(bad);
    if (bad) return;
    pending.current = true;
    setExtracting(true);
    setFailure(null);
    try {
      const done = await request<ProjectExtract>('extract_project', extractPayload(id, harness, folder));
      onOpenChange(false);
      notify(extractedLine(done));
    } catch (e) { setFailure(message(e)); }
    finally {
      pending.current = false;
      setExtracting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={next => { if (!next && pending.current) return; onOpenChange(next); }}
      title={`Extract ${name}`}
      description={EXTRACT_ABOUT}
      footer={(
        <>
          <Button variant="outline" disabled={extracting} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button loading={extracting} loadingText="Extracting…" onClick={() => void extract()}>Extract</Button>
        </>
      )}
    >
      <Column gap="lg">
        <FormField label="Harness">
          <Select options={OPTIONS} value={harness} onValueChange={value => { setHarness(value); setFailure(null); }} />
        </FormField>
        <Column>
          <FormField label="Folder" error={problem ?? undefined}>
            <Input mono autoComplete="off" spellCheck={false} value={folder} onChange={e => { setFolder(e.currentTarget.value); setProblem(null); setFailure(null); }} />
          </FormField>
          {noPicker
            ? <Text as="p" variant="note">This version of Muro cannot open a folder dialog yet: type the path.</Text>
            : <Cell align="start"><Button variant="outline" size="sm" onClick={() => void chooseFolder()}>Choose folder…</Button></Cell>}
        </Column>
        {failure ? <RefusalLine>{failure}</RefusalLine> : null}
      </Column>
    </Dialog>
  );
}
