import React, { Suspense, Component, ErrorInfo, ReactNode } from 'react';
import { LucideAlertTriangle, LucideLoader2 } from 'lucide-react';
import { OrionCard } from '../../../../client/components/OrionUI';
import { cn } from '../../../../client/lib/utils';

interface ErrorBoundaryProps {
  children: ReactNode;
  moduleName: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ModuleErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[MODULE_LOADER] Critical failure in ${this.props.moduleName}:`, error, errorInfo);
    
    // Production Recovery: Detect ChunkLoadError and suggest hard refresh
    if (error.name === 'ChunkLoadError' || error.message.includes('Loading chunk')) {
      console.warn('[MODULE_LOADER] Asset load failure detected. Forcing cache invalidate on reboot.');
    }
  }

  render() {
    if (this.state.hasError) {
      const isChunkError = this.state.error?.name === 'ChunkLoadError' || this.state.error?.message.includes('Loading chunk');

      return (
        <div className="flex flex-col items-center justify-center p-12 min-h-[400px] text-center">
          <OrionCard variant="premium" className="border-red-500/20 bg-red-500/5 max-w-md p-8">
            <LucideAlertTriangle className="text-red-500 mx-auto mb-6" size={48} />
            <h3 className="text-xl font-display font-bold text-white uppercase tracking-tight mb-2">
              {isChunkError ? 'Asset_Load_Failure' : `Module_Crash: ${this.props.moduleName}`}
            </h3>
            <p className="text-neutral-500 font-mono text-xs uppercase tracking-widest leading-relaxed mb-6">
              {isChunkError 
                ? 'The system failed to retrieve required assets from the server. This may be due to a recent update or network instability.'
                : 'The module encountered a critical execution error and was isolated to protect system integrity.'}
            </p>
            <button 
              onClick={() => {
                if (isChunkError) {
                  // Hard refresh to clear possible stale chunk references
                  window.location.href = window.location.href;
                } else {
                  window.location.reload();
                }
              }}
              className="px-6 py-2 bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] font-mono uppercase tracking-[0.2em] hover:bg-red-500/20 transition-all"
            >
              {isChunkError ? 'Force_Sync' : 'System_Reboot'}
            </button>
          </OrionCard>
        </div>
      );
    }

    return this.props.children;
  }
}

export const ModuleLoader: React.FC<{ 
  component: React.LazyExoticComponent<any>, 
  name: string 
}> = ({ component: Component, name }) => {
  return (
    <ModuleErrorBoundary moduleName={name}>
      <Suspense fallback={
        <div className="flex flex-col items-center justify-center p-20 min-h-[400px]">
          <div className="relative">
            <LucideLoader2 className="text-primary animate-spin" size={32} />
            <div className="absolute inset-0 bg-primary/20 blur-xl animate-pulse rounded-full" />
          </div>
          <p className="mt-6 text-[10px] font-mono text-neutral-500 uppercase tracking-[0.4em] animate-pulse">
            Allocating_Neural_Resources...
          </p>
        </div>
      }>
        <Component />
      </Suspense>
    </ModuleErrorBoundary>
  );
};
