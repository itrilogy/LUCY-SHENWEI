import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('[ShenWei UI Exception]', error, errorInfo);
        if (this.props.onError) {
            this.props.onError(error, errorInfo);
        }
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null, errorInfo: null });
        if (this.props.onReset) {
            this.props.onReset();
        }
    };

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }
            return (
                <div className="flex-1 w-full h-full min-h-[360px] flex items-center justify-center p-6 bg-page text-fg">
                    <div className="max-w-md w-full luxi-card p-6 sm:p-8 bg-raised text-center border border-[var(--alert-red)]/30">
                        <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-[var(--alert-red)]/15 flex items-center justify-center text-[var(--alert-red)]">
                            <AlertTriangle className="w-6 h-6" />
                        </div>
                        <h3 className="text-lg font-semibold mb-2">组件渲染异常</h3>
                        <p className="text-sm text-secondary mb-4 leading-relaxed">
                            {this.props.title || '系统在加载此视图时发生未知错误，已隔离并记录，请重试或返回。'}
                        </p>
                        {this.state.error?.message && (
                            <div className="text-xs font-mono bg-sunken p-3 rounded text-[var(--text-danger)] mb-4 text-left overflow-x-auto border border-line">
                                {this.state.error.message}
                            </div>
                        )}
                        <div className="flex gap-2 justify-center">
                            <button
                                type="button"
                                onClick={this.handleReset}
                                className="btn btn-primary btn-sm"
                            >
                                <RefreshCw className="w-4 h-4 mr-1.5" /> 恢复重试
                            </button>
                            <button
                                type="button"
                                onClick={() => window.location.reload()}
                                className="btn btn-secondary btn-sm"
                            >
                                刷新页面
                            </button>
                        </div>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}
