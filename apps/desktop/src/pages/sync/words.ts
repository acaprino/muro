// The words and the small rules of the Sync state that more than one file uses: the headline of the sync note, the chip of the status row, the
// lines of times, what an apply sends and what it says afterwards. Pure (no React, no toolkit), so Node tests them (tests/sync-state.test.ts); the
// state that uses them is useSync.tsx. What a plan means for a cell or a harness is model.ts's; these only say it in words.
import type { ApplyProgress, Operation, Plan, Snapshot } from '../../types.ts';
import { appliedNotice, applyPayload, currentPlan, nextCheck, stamp, syncHeadline } from '../../model.ts';
import type { SyncHeadline } from '../../model.ts';
import { plural } from '../../words.ts';

/** What the person chose for the removals of a plan: `confirm` uninstalls and clears them (the sheet's main button names them), `skip` leaves them out and applies the rest. */
export type Choice = 'confirm' | 'skip';

/** The operations an apply runs: those the plan holds (they are the ready ones; what is not ready is in `blockers`, never an operation), and with `skip` not the removals. */
export const executedOf = (plan: Plan, choice: Choice): Operation[] => plan.operations.filter(o => choice === 'confirm' || o.kind !== 'remove');

/** What an apply of a plan sends and what it will run. */
export interface ApplyRequest {
  /** The body of `apply` (model.ts `applyPayload`): the plan, `allow_blocked` with blockers, `confirm_removals` equal to their number or `skip_removals`. */
  payload: Record<string, unknown>;
  /** What the note says while it runs. */
  progress: ApplyProgress;
}
/** The request for a plan, or null when it would run nothing (no operation is ready, or only removals and they are left out): such a plan is never sent. */
export function applyRequest(plan: Plan, choice: Choice): ApplyRequest | null {
  const executed = executedOf(plan, choice);
  if (!executed.length) return null;
  return { payload: applyPayload(plan, choice), progress: { plan_id: plan.id, total: executed.length, names: [...new Set(executed.map(o => o.name))].join(', ') } };
}

/** What the notice says after an apply: the changes it applied, the removals it left out (`skipped_removals` of the answer) and the blockers it left out (`left_out`). */
export function appliedMessage(plan: Plan, answer: Pick<Snapshot, 'skipped_removals' | 'left_out'>): string {
  const skipped = answer.skipped_removals ?? 0, left = answer.left_out?.length ?? 0;
  return `${appliedNotice(plan.operations.length - skipped, skipped)}${left ? ` ${left} left out.` : ''}`;
}

/** Why the service planned an operation, in the words of the review sheet. Its three generic reasons are its own terms (desired distribution, artifact,
 * registry): they are said as the change they stand for. Any other reason (files missing, a marketplace that cannot be loaded) is already plain and stays. */
export function reasonOf(o: Operation): string {
  switch (o.reason) {
    case 'Missing desired distribution': return 'Not installed yet';
    case 'Not in desired registry for this target': return 'Not in your list for this harness';
    case 'Reconcile desired artifact':
      return o.kind === 'activate' ? 'Installed but switched off'
        : o.kind === 'reinstall' ? 'Installed again on request'
          : o.from_version && o.from_version !== o.to_version ? 'New version' : 'The build changed';
    default: return o.reason;
  }
}

/** What each operation kind is called in the list of what a check found. */
const CHANGE_WORDS: [string, string][] = [['install', 'install'], ['update', 'update'], ['reinstall', 'reinstall'], ['activate', 'activation'], ['remove', 'removal'], ['remove-marketplace', 'broken marketplace']];
/** One or two names as they are; more, the first and how many are left. */
export const nameList = (names: string[]): string => (names.length > 2 ? `${names[0]} and ${names.length - 1} more` : names.join(' and '));

export type NoteKind = 'applying' | 'checking' | SyncHeadline['kind'];
export type NoteTone = 'ok' | 'info' | 'warn';
/** The sync note: what the last check found, said once, and whether Check now is what to do next (`lead`: nothing else is offered, or what is offered cannot be trusted yet). */
export interface Note { kind: NoteKind; tone: NoteTone | null; title: string; text: string; lead: boolean }
const note = (kind: NoteKind, tone: NoteTone | null, title: string, text: string, lead = false): Note => ({ kind, tone, title, text, lead });

/** The note of the Sync page for what the window knows: the snapshot, the plan of this window (the page's own, which counts only for the snapshot's revision) and what it is doing now.
 * A harness that cannot be read and a source that could not be resolved are never in sync (model.ts `syncHeadline`): they take the place of "Everything is in sync". */
export function noteOf(snapshot: Snapshot, plan: Plan | null, doing: { checking: boolean; progress: ApplyProgress | null }): Note {
  if (doing.progress) return note('applying', 'info', `Applying ${plural(doing.progress.total, 'change')}…`, doing.progress.names);
  if (doing.checking) return note('checking', null, 'Checking sources and harnesses…', 'Reading what is installed and looking for new versions.');
  const h = syncHeadline(snapshot, plan);
  const unreadable = h.unreadable.length ? `${nameList(h.unreadable.map(u => u.target.name))} cannot be read` : '';
  switch (h.kind) {
    case 'no-harness':
      return note(h.kind, 'warn', 'No harness is managed', 'Muro needs at least one harness to install plugins into.');
    case 'not-checked':
      return note(h.kind, null, 'Not checked yet', 'Check now to compare your list with what is installed and to look for new versions. Nothing changes until you apply.', true);
    case 'changed':
      return note(h.kind, null, 'Your list changed since the last check', 'Check now to see what the change means for your harnesses. Nothing changes until you apply.', true);
    case 'changes': {
      const parts = CHANGE_WORDS.filter(([kind]) => h.byKind[kind]).map(([kind, word]) => plural(h.byKind[kind]!, word));
      const bits = [parts.join(', '), h.blockers ? `${plural(h.blockers, 'item')} not ready yet` : '', unreadable, h.errors ? `${plural(h.errors, 'source')} could not be checked` : ''].filter(Boolean);
      return note(h.kind, 'info', `${plural(h.operations, 'change')} ready to apply`, `${bits.length ? `${bits.join(' · ')}. ` : ''}Nothing changes until you apply.`);
    }
    case 'unreadable':
      return note(h.kind, 'warn', unreadable, h.unreadable.some(u => !u.count)
        ? 'Muro could not read what is installed there, so it cannot say whether it is in sync. Check the harness settings, then check again.'
        : 'The custom instructions of a plugin on it could not be read, so it cannot say whether it is in sync. Check the plugin, then check again.', true);
    case 'sources': {
      const one = h.errors === 1;
      return note(h.kind, 'warn', `${plural(h.errors, 'source')} could not be checked`,
        `Muro could not resolve ${one ? 'it' : 'them'}, so it cannot say ${one ? 'it is' : 'they are'} up to date.${h.blockers ? ` ${plural(h.blockers, 'item')} not ready yet.` : ''} Check again when ${one ? 'it answers' : 'they answer'}.`, true);
    }
    case 'blocked': {
      const b = currentPlan(snapshot, plan)?.blockers ?? [];
      return note(h.kind, 'warn', 'Some plugins are not ready', b.length
        ? `${b[0]}${b.length > 1 ? ` and ${b.length - 1} more` : ''}. Muro leaves them out until they are fixed.`
        : `${plural(h.blockers, 'item')} ${h.blockers === 1 ? 'is' : 'are'} not ready yet. Muro leaves them out until they are fixed.`, true);
    }
    case 'ok':
      return note(h.kind, 'ok', 'Everything is in sync', 'What is installed on your harnesses matches your list.');
  }
}

/** The chip of the status row: the state in a few words, `ok` only when in sync. */
export interface Chip { text: string; tone: 'ok' | 'warn' }
export function chipOf(h: SyncHeadline): Chip {
  const text = {
    'no-harness': 'No harness',
    'not-checked': 'Not checked yet',
    changed: 'List changed',
    changes: `${plural(h.operations, 'change')} waiting`,
    blocked: 'Needs attention',
    unreadable: 'A harness cannot be read',
    sources: 'Sources not checked',
    ok: 'In sync',
  }[h.kind];
  return { text, tone: h.kind === 'ok' ? 'ok' : 'warn' };
}

/** The status row's line: when the registry was last checked and when it is next (the record the service keeps, so a window opened after the worker checked says what the worker found). */
export function checkedLine(snapshot: Snapshot): string {
  const next = nextCheck(snapshot);
  return `Last check ${stamp(snapshot.sync.last_check)}${next ? ` · next check ${next}` : ''}`;
}
/** The note's line: the last check, the last sync, and the next check or that the automatic sync is off. */
export function timesLine(snapshot: Snapshot): string {
  const next = nextCheck(snapshot);
  return `Last check ${stamp(snapshot.sync.last_check)} · Last sync ${stamp(snapshot.sync.last_sync)} · ${next ? `Next check ${next}` : 'Automatic sync off'}`;
}
