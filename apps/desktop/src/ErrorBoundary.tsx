// What the window shows when the page of a tab fails while it is drawn (a project file from elsewhere holding a value in a shape the page does not expect, say):
// the page's own place says what failed, with Try again, and the frame around it (the title bar and its three buttons, the status row, the footer) stays, so the
// window can still be moved, minimized and closed. Without it React takes the whole window away, frame included. React draws such a place only from a class.
import * as React from 'react';
import { Button } from '@acaprino/sigrid/primitives';
import { Empty } from '@acaprino/sigrid/components';
import { message } from './words.ts';

export interface ErrorBoundaryProps {
  children?: React.ReactNode;
}
interface ErrorBoundaryState {
  failed: boolean;
  error: unknown;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false, error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { failed: true, error };
  }

  render(): React.ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <Empty
        role="alert"
        className="h-full px-4 py-6"
        title="This page could not be shown"
        description={message(this.state.error)}
        action={<Button onClick={() => this.setState({ failed: false, error: null })}>Try again</Button>}
      />
    );
  }
}
