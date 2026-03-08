import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';
import { Button } from './ui/Button';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: any | null;
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
    
    // Try to parse if it's our custom Firestore error
    let parsedInfo = null;
    try {
      parsedInfo = JSON.parse(error.message);
    } catch (e) {
      // Not a JSON error
    }

    this.setState({
      error,
      errorInfo: parsedInfo
    });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  private handleGoHome = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      const isPermissionError = this.state.errorInfo?.error?.includes('permission-denied') || 
                               this.state.error?.message?.includes('permission-denied');

      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>
            
            <h1 className="text-2xl font-bold text-slate-900 mb-2">
              {isPermissionError ? 'Access Denied' : 'Something went wrong'}
            </h1>
            
            <p className="text-slate-600 mb-8">
              {isPermissionError 
                ? "You don't have permission to perform this action. Please make sure you are logged in with the correct account."
                : "An unexpected error occurred. Our team has been notified and we're working to fix it."}
            </p>

            {this.state.errorInfo && (
              <div className="bg-slate-50 rounded-lg p-4 mb-8 text-left overflow-hidden">
                <p className="text-xs font-mono text-slate-500 break-all">
                  Error Code: {this.state.errorInfo.operationType?.toUpperCase()}_{this.state.errorInfo.path || 'unknown'}
                </p>
              </div>
            )}

            <div className="flex flex-col gap-3">
              <Button onClick={this.handleReset} className="w-full flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4" />
                Try Again
              </Button>
              <Button variant="secondary" onClick={this.handleGoHome} className="w-full flex items-center justify-center gap-2">
                <Home className="w-4 h-4" />
                Go to Home
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
