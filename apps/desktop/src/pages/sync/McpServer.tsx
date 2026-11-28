// Muro's own MCP server in a harness, in the harness inspector: `muro mcp`, every tool of the factory, registered by the runtime with the harness's own command
// (`mcp_status`, `install_mcp`, `remove_mcp`), so each session of the harness can drive the factory. Claude Code and Codex only: for another harness the runtime
// answers `supported: false` and nothing is shown. The state is read when the inspector shows a harness, for the folder and the executable the registry holds:
// while the form has changes the button waits for Save. Removing is done at once and undone from its notice, which installs the server again.
import * as React from 'react';
import { Badge, Button, Cluster, Column, Icon, Text } from '@acaprino/sigrid/primitives';
import { SettingRow } from '@acaprino/sigrid/components';
import { useNotify } from '@acaprino/imago';
import type { McpStatus, Target } from '../../types.ts';
import { useRegistry } from '../../state/registry.tsx';
import { message } from '../../words.ts';
import { RefusalLine } from '../project/write/HarmonizeDialog.tsx';

type Step = 'install' | 'update' | 'remove';
const BUTTON: Record<Step, { label: string; busy: string; icon: 'download' | 'refresh' | 'delete' }> = {
  install: { label: 'Install', busy: 'Installing…', icon: 'download' },
  update: { label: 'Update', busy: 'Updating…', icon: 'refresh' },
  remove: { label: 'Remove', busy: 'Removing…', icon: 'delete' },
};

/** What the button does now: install a server that is not there, point one that starts another copy of Muro at this one, or remove this one. */
export const stepOf = (status: McpStatus): Step => (!status.registered ? 'install' : status.current ? 'remove' : 'update');

export function McpServer({ target, dirty }: { target: Target; dirty: boolean }) {
  const { request } = useRegistry();
  const notify = useNotify();
  const [status, setStatus] = React.useState<McpStatus | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let live = true;
    setStatus(null);
    setError(null);
    request<McpStatus>('mcp_status', { target_id: target.id }).then(
      next => { if (live) setStatus(next); },
      e => { if (live) setError(message(e)); });
    return () => { live = false; };
  }, [request, target.id, target.harness, target.root, target.executable]);

  async function run(step: Step): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      setStatus(await request<McpStatus>(step === 'remove' ? 'remove_mcp' : 'install_mcp', { target_id: target.id }));
      if (step === 'remove') notify(`Muro's MCP server was removed from ${target.name}.`, { undo: { onClick: () => void run('install') } });
      else notify(step === 'install' ? `Muro's MCP server is installed in ${target.name}. New sessions have it.` : `Muro's MCP server in ${target.name} now starts this Muro.`);
    } catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }

  if (!status?.supported && !error) return null;
  const step = status ? stepOf(status) : null;
  const state = !status ? null
    : !status.registered ? <Badge variant="secondary">Not installed</Badge>
    : status.current ? <Badge tone="success">Installed</Badge>
    : <Badge tone="warning">Another Muro</Badge>;
  const sentence = !status ? '' : !status.registered ? 'Every session of this harness can then use Muro: validate, build, intake and the rest.'
    : status.current ? 'New sessions of this harness can use Muro.'
    : 'It starts another copy of Muro. Update points it at this one.';
  return (
    <Column gap="xs">
      <SettingRow
        label="Muro MCP server"
        description={status ? (
          <Cluster gap="sm">{state}<Text variant="note">{dirty ? 'Save first: Muro uses the saved folder and executable.' : sentence}</Text></Cluster>
        ) : undefined}
        control={step ? (
          <Button type="button" variant="outline" size="sm" aria-label={`${BUTTON[step].label} Muro's MCP server`} loading={busy} loadingText={BUTTON[step].busy}
            disabled={dirty} onClick={() => void run(step)}><Icon name={BUTTON[step].icon} />{BUTTON[step].label}</Button>
        ) : undefined}
      />
      {error ? <RefusalLine>{error}</RefusalLine> : null}
    </Column>
  );
}
