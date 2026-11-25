import * as React from 'react';
import { Button, Column, Switch, Text } from '@acaprino/sigrid/primitives';
import { DescriptionList, Dialog } from '@acaprino/sigrid/components';
import type { ProjectRelease } from '../../../types.ts';
import { useNotify } from '@acaprino/imago';
import { useRegistry } from '../../../state/registry.tsx';
import { message } from '../../../words.ts';
import { releaseOf } from '../data.ts';
import { NO_RELEASE_REPOSITORY, RELEASE_ABOUT, RELEASE_INIT, RELEASE_INIT_HINT, RELEASE_NOTE, releasePayload, releasedLine } from './jobs.ts';
import { RefusalLine, projectName } from './HarmonizeDialog.tsx';
import type { ChangeDialogProps } from './HarmonizeDialog.tsx';
import { useBlocked } from './DetailsDialog.tsx';

/** Release: the project's file is put into the repository its `project.json` names, and that repository's workflow makes the release (`release_project`, ADR-0034). No AI runs. A push is not taken
 * back from here, so the dialog asks first, with the focus on Cancel, and says what the file itself says: the repository and the branch, the file, the version and its tag. The push is the person's
 * own Git's; the page asks for no credential. The request carries the digest of the file the page shows, so a file that changed since is refused by the runtime, in its words. What the runtime
 * refuses is shown as it said it and the dialog stays open; what it did is said in a notice, in the command's own sentence. The one switch adds the release workflow to a repository that has none. */
export function ReleaseDialog({ id, info, open, onOpenChange }: ChangeDialogProps) {
  const { request } = useRegistry();
  const notify = useNotify();
  const blocked = useBlocked(id);
  const hintId = React.useId();
  const [init, setInit] = React.useState(false);
  const [releasing, setReleasing] = React.useState(false);
  const [failure, setFailure] = React.useState<string | null>(null);
  /** The request is on its way: a second press sends nothing. */
  const pending = React.useRef(false);
  // A dialog that opens starts from its first values and has not failed yet.
  const [was, setWas] = React.useState(open);
  if (open !== was) {
    setWas(open);
    if (open) { setInit(false); setFailure(null); }
  }
  const name = projectName(info, id), facts = releaseOf(info);

  async function release(): Promise<void> {
    if (pending.current || !facts || blocked !== null) return;
    pending.current = true;
    setReleasing(true);
    setFailure(null);
    try {
      const done = await request<ProjectRelease>('release_project', releasePayload(id, info.digest, init));
      onOpenChange(false);
      notify(releasedLine(done));
    } catch (e) { setFailure(message(e)); }
    finally {
      pending.current = false;
      setReleasing(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={next => { if (!next && pending.current) return; onOpenChange(next); }}
      title={`Release ${name}?`}
      description={RELEASE_ABOUT}
      footer={(
        <>
          <Button variant="outline" autoFocus disabled={releasing} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button loading={releasing} loadingText="Releasing…" disabled={!facts || blocked !== null} onClick={() => void release()}>Release {name}</Button>
        </>
      )}
    >
      <Column gap="lg">
        {facts ? (
          <DescriptionList
            aria-label="What is released"
            items={[
              { name: 'Repository', value: facts.repository, code: true },
              { name: 'Branch', value: facts.branch },
              { name: 'File', value: facts.file, code: true },
              { name: 'Version', value: facts.version },
              { name: 'Tag', value: facts.tag, code: true },
            ]}
          />
        ) : <RefusalLine>{NO_RELEASE_REPOSITORY}</RefusalLine>}
        <Text as="p" variant="soft">{RELEASE_NOTE}</Text>
        <Column gap="xs">
          <Switch checked={init} disabled={releasing} aria-describedby={hintId} onCheckedChange={setInit}>{RELEASE_INIT}</Switch>
          <Text as="p" variant="note" id={hintId}>{RELEASE_INIT_HINT}</Text>
        </Column>
        {blocked ? <Text as="p" variant="note" role="status">{blocked}</Text> : null}
        {failure ? <RefusalLine>{failure}</RefusalLine> : null}
      </Column>
    </Dialog>
  );
}
