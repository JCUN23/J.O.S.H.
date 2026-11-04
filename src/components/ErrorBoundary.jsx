import { Component } from 'react';

// Contains render crashes. Without this, one widget throwing (e.g. on unexpected
// API data) makes React unmount the entire app: a black wall panel.
//
// <ErrorBoundary name="Hue" theme="cyan">  -> card-sized fallback with Retry
// <ErrorBoundary fullscreen>               -> last resort; reloads itself after 30s
export default class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { error: null };
        this.reloadTimer = null;
    }

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, info) {
        console.error(`[ErrorBoundary${this.props.name ? `:${this.props.name}` : ''}]`, error, info?.componentStack);
        if (this.props.fullscreen) {
            // Unattended panel: try a clean reload rather than staying dead.
            this.reloadTimer = setTimeout(() => window.location.reload(), 30_000);
        }
    }

    componentWillUnmount() {
        clearTimeout(this.reloadTimer);
    }

    retry = () => this.setState({ error: null });

    render() {
        const { error } = this.state;
        if (!error) return this.props.children;

        const theme = this.props.theme || 'cyan';
        const message = String(error?.message || error).slice(0, 160);

        if (this.props.fullscreen) {
            return (
                <div className="min-h-screen bg-black text-cyan-300 font-mono flex items-center justify-center p-8">
                    <div className="max-w-xl border border-cyan-800 rounded-lg p-6">
                        <div className="text-lg mb-2">Sentinel hit an error and stopped drawing.</div>
                        <div className="text-sm text-red-400 mb-4 break-words">{message}</div>
                        <div className="text-xs text-cyan-700 mb-4">Reloading automatically in 30 seconds.</div>
                        <button onClick={() => window.location.reload()} className="px-4 py-2 border border-cyan-700 rounded">
                            Reload now
                        </button>
                    </div>
                </div>
            );
        }

        return (
            <div className={`bg-${theme}-950/30 border border-red-900 rounded-lg p-4 h-full`}>
                <div className={`text-sm font-semibold text-${theme}-400 mb-1`}>
                    {(this.props.name || 'Widget').toUpperCase()} stopped working
                </div>
                <div className="text-xs text-red-400 mb-3 break-words">{message}</div>
                <button onClick={this.retry} className={`text-xs px-3 py-1 rounded border border-${theme}-700 text-${theme}-400`}>
                    Retry
                </button>
            </div>
        );
    }
}
