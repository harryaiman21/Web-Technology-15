import React from 'react';
import { AlertCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error?.message || 'Something went wrong while rendering this page.',
    };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[var(--surface)] px-4">
          <div className="w-full max-w-lg rounded-[6px] border border-[var(--border)] bg-[var(--surface-2)] p-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 text-[var(--accent-red)]" size={20} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold text-[var(--text-1)]">Page error</p>
                <p className="mt-2 text-sm text-[var(--text-2)]">
                  {this.state.message}
                </p>
                <Button className="mt-4" onClick={() => window.location.reload()}>
                  Reload Page
                </Button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
