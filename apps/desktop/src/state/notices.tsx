import * as React from 'react';
import { Toasts } from '@acaprino/sigrid';
import type { ToastItem } from '@acaprino/sigrid';

/** The notices of a page: the short results of what the person did ("Notes added to your list."), and the errors, which stay until they are closed. Drawn by Sigrid's `Toasts`. */
export type Notify = (text: string, kind?: 'error') => void;
const NoticesContext = React.createContext<Notify | null>(null);
let made = 0;

export function NoticesProvider({ children }: { children?: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const notify = React.useCallback<Notify>((text, kind) => setItems(now => [...now, { id: `notice-${++made}`, text, ...(kind ? { kind } : {}) }]), []);
  const dismiss = React.useCallback((id: string) => setItems(now => now.filter(item => item.id !== id)), []);
  return (
    <NoticesContext.Provider value={notify}>
      {children}
      <Toasts items={items} durationMs={6000} onDismiss={dismiss} />
    </NoticesContext.Provider>
  );
}

/** How a component says a result. Outside a provider nothing is said, and nothing fails. */
export function useNotify(): Notify {
  return React.useContext(NoticesContext) ?? (() => undefined);
}
