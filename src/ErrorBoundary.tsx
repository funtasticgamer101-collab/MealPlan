import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    this.setState({
      error,
      errorInfo
    });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', textAlign: 'center', color: '#f97316', fontFamily: 'sans-serif' }}>
          <h2>React crashed during render.</h2>
          <p>Please take a screenshot of this error and share it.</p>
          <div style={{ marginTop: '20px', padding: '10px', backgroundColor: '#fff3ed', borderRadius: '8px', textAlign: 'left', overflowX: 'auto' }}>
            <p style={{ fontWeight: 'bold', color: '#dc2626' }}>{this.state.error?.toString()}</p>
            <pre style={{ fontSize: '11px', color: '#666', marginTop: '10px' }}>
              {this.state.errorInfo?.componentStack}
            </pre>
          </div>
          <button 
            onClick={() => {
              localStorage.clear();
              window.location.reload();
            }}
            style={{ marginTop: '20px', padding: '10px 20px', backgroundColor: '#f97316', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
          >
            Clear Data & Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
