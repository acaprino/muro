import * as React from 'react';
import { Button, Cell, Column, Input, Select, Text } from '@acaprino/sigrid/primitives';
import { Dialog, FormField } from '@acaprino/sigrid/components';
import type { ProjectExtract } from '../../../types.ts';
import { useNotify } from '@acaprino/imago';
import { useRegistry } from '../../../state/registry.tsx';
import { harnessNames } from '../../../model.ts';
import { message, unknownTo } from '../../../words.ts';
import { EXTRACT_ABOUT, EXTRACT_HARNESSES, checkFolder, extractPayload, extractedLine } from './jobs.ts';
import { RefusalLine } from './HarmonizeDialog.tsx';

interface ExtractDialogProps {
  id: string;
  name: string;
  action: 'extract_project' | 'extract_plugin';
  harnesses?: readonly string[];
  digest?: string;
  unavailableReason?: string;
  open: boolean;
  onOpenChange(open: boolean): void;
  onExported?(): void;
}

/** Projects and Sync export one installable harness folder with the same controls. A resolved Sync plugin knows exactly which harnesses its file carries. */
export function ExtractDialog({ id, name, action, harnesses = EXTRACT_HARNESSES, digest, unavailableReason, open, onOpenChange, onExported }: ExtractDialogProps) {
  const { request } = useRegistry();
  const notify = useNotify();
  const options = harnesses.map(value => ({ value, label: harnessNames[value] ?? value }));
  const [chosen, setHarness] = React.useState<string>('');
  const harness = harnesses.includes(chosen) ? chosen : harnesses[0];
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
    if (pending.current || !harness || unavailableReason) return;
    const bad = checkFolder(folder);
    setProblem(bad);
    if (bad) return;
    pending.current = true;
    setExtracting(true);
    setFailure(null);
    try {
      const payload = extractPayload(id, harness, folder);
      const done = await request<ProjectExtract>(action, digest ? { ...payload, digest } : payload);
      if (onExported) onExported();
      else onOpenChange(false);
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
      title={`Export ${name}`}
      description={EXTRACT_ABOUT}
      footer={(
        <>
          <Button variant="outline" disabled={extracting} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!harness || !!unavailableReason} loading={extracting} loadingText="Exporting…" onClick={() => void extract()}>Export</Button>
        </>
      )}
    >
      <Column gap="lg">
        <FormField label="Harness">
          <Select options={options} value={harness ?? ''} onValueChange={value => { setHarness(value); setFailure(null); }} />
        </FormField>
        <Column>
          <FormField label="Folder" error={problem ?? undefined}>
            <Input mono autoComplete="off" spellCheck={false} value={folder} onChange={e => { setFolder(e.currentTarget.value); setProblem(null); setFailure(null); }} />
          </FormField>
          {noPicker
            ? <Text as="p" variant="note">This version of Muro cannot open a folder dialog yet: type the path.</Text>
            : <Cell align="start"><Button variant="outline" size="sm" onClick={() => void chooseFolder()}>Choose folder…</Button></Cell>}
        </Column>
        {unavailableReason || failure ? <RefusalLine>{unavailableReason || failure}</RefusalLine> : null}
      </Column>
    </Dialog>
  );
}
