import { Empty } from '@acaprino/sigrid';

/**
 * The page of a tab the new window does not have yet (plan R0: Projects comes with its Task 5, Sync with plan R1,
 * Activity and Settings with R2): one sentence where the page will be. Meanwhile the background worker goes on checking
 * the registry, and applies what changed only when automatic sync is on (docs/desktop.md, "The background worker").
 */
export function Moved({ page }: { page: string }) {
  return (
    <Empty
      className="h-full px-4 py-6"
      title={`${page} is moving to the new window`}
      description="Until it arrives, the background worker goes on checking your registry; with automatic sync on it also applies the changes, removals aside. In the tray, Sync now applies them at once, and Pause or Resume turns automatic sync off or on."
    />
  );
}
