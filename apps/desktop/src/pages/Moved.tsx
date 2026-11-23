import { Empty } from '@acaprino/sigrid';

/**
 * The page of a tab the new window does not have yet (plan R0: Projects comes with its Task 5, Sync with plan R1,
 * Activity and Settings with R2): one sentence where the page will be. The tray and the background worker go on
 * syncing the registry meanwhile.
 */
export function Moved({ page }: { page: string }) {
  return (
    <Empty
      className="h-full px-4 py-6"
      title={`${page} is moving to the new window`}
      description="Until it arrives, the tray and the background worker keep your registry in sync."
    />
  );
}
