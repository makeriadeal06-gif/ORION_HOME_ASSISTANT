import React, { Component, ErrorInfo, ReactNode } from 'react';
import { LucideAlertTriangle } from 'lucide-react';
import { logger } from '../../logger/Logger';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
}

/** [IMPORT_RESOLUTION] [DISTRIBUTED_RUNTIME] */
export default class DistributedRuntimeErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(_: Error): State {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error('DISTRIBUTED_UI_CRASH', `Render Failure: ${error.message}`, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-2 border border-red-500/20 bg-red-500/5 rounded text-[8px] font-mono text-red-500 flex items-center gap-2">
          <LucideAlertTriangle size={10} />
          <span>DISTRIBUTED_RUNTIME_UI_FAULT</span>
        </div>
      );
    }

    return this.props.children;
  }
}
