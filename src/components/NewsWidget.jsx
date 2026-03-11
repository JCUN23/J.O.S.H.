import { useEffect, useState, useRef } from 'react';
import { Newspaper, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { fetchNews, fetchAllCategories, NEWS_CATEGORIES } from '../utils/newsApi';

const NewsWidget = ({ theme, setNewsIsOnline }) => {
    const [news, setNews] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [isRefreshing, setIsRefreshing] = useState(false);
    const scrollRef = useRef(null);

    const loadNews = async (category) => {
        try {
            setLoading(true);
            const articles = category === 'all'
                ? await fetchAllCategories(5)
                : await fetchNews(category, 10);
            setNews(articles);
            setLoading(false);
            setNewsIsOnline(true);
        } catch (error) {
            console.error('Error loading news:', error);
            setLoading(false);
            setNewsIsOnline(false);
        }
    };

    useEffect(() => {
        // schedule load on next tick to avoid calling setState synchronously inside the effect
        const startTimeout = setTimeout(() => loadNews(selectedCategory), 0);

        // Refresh every 10 minutes
        const interval = setInterval(() => loadNews(selectedCategory), 10 * 60 * 1000);
        return () => {
            clearTimeout(startTimeout);
            clearInterval(interval);
        };
    }, [selectedCategory]);

    // Auto-scroll effect
    useEffect(() => {
        const scrollContainer = scrollRef.current;
        if (!scrollContainer || loading || news.length === 0) return;

        let scrollDirection = 1;
        let isPaused = false;

        const scroll = () => {
            if (isPaused) return;

            const { scrollTop, scrollHeight, clientHeight } = scrollContainer;

            if (scrollTop + clientHeight >= scrollHeight - 1) {
                scrollDirection = -1;
            } else if (scrollTop <= 0) {
                scrollDirection = 1;
            }

            scrollContainer.scrollTop += scrollDirection * 0.3;
        };

        const scrollInterval = setInterval(scroll, 30);

        const handleMouseEnter = () => { isPaused = true; };
        const handleMouseLeave = () => { isPaused = false; };

        scrollContainer.addEventListener('mouseenter', handleMouseEnter);
        scrollContainer.addEventListener('mouseleave', handleMouseLeave);

        return () => {
            clearInterval(scrollInterval);
            scrollContainer.removeEventListener('mouseenter', handleMouseEnter);
            scrollContainer.removeEventListener('mouseleave', handleMouseLeave);
        };
    }, [loading, news]);

    const handleRefresh = async () => {
        setIsRefreshing(true);
        await loadNews(selectedCategory);
        setIsRefreshing(false);
    };

    const getCategoryColor = (category) => {
        const colors = {
            tech: 'text-blue-400',
            world: 'text-purple-400',
            sports: 'text-green-400',
            business: 'text-yellow-400'
        };
        return colors[category] || 'text-cyan-400';
    };

    const formatTimeAgo = (date) => {
        const now = new Date();
        const diff = now - date;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        return `${days}d ago`;
    };

    const primaryColor = theme;
    const primaryColorClass = `text-${theme}-400`;
    const borderClass = `border-${theme}-800`;
    const bgClass = `bg-${theme}-950/30`;

    return (
        <div className={`${bgClass} border ${borderClass} rounded-lg p-3 h-full flex flex-col max-h-80 overflow-hidden`}>
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Newspaper className={primaryColorClass} size={20} />
                    <h3 className={`text-lg font-semibold text-${theme}-400`}>NEWS</h3>
                </div>
                <button
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    className={`text-${theme}-500 hover:text-${theme}-400 transition-colors`}
                    title="Refresh news"
                >
                    <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
                </button>
            </div>

            {/* Category Filter */}
            <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
                {Object.entries(NEWS_CATEGORIES).map(([key, label]) => (
                    <button
                        key={key}
                        onClick={() => setSelectedCategory(key)}
                        className={`px-3 py-1 rounded text-xs font-semibold transition-all whitespace-nowrap ${selectedCategory === key
                                ? `text-${theme}-700`
                                : `bg-black/50 border ${borderClass} text-${theme}-500 hover:border-${theme}-600 hover:text-${theme}-400`
                            }`}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-40">
                    <Loader2 className={`animate-spin ${primaryColorClass}`} size={32} />
                </div>
            ) : news.length === 0 ? (
                <div className={`text-center text-${theme}-600'} py-8`}>
                    No news available. Try refreshing.
                </div>
            ) : (
                <div
                    ref={scrollRef}
                    className="space-y-3 flex-1 overflow-y-auto pr-2 scroll-smooth max-h-60"
                    style={{ scrollbarWidth: 'thin' }}
                >
                    {news.map((article, idx) => (
                        <a
                            key={idx}
                            href={article.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`block bg-black/50 border ${borderClass} rounded p-3 hover:border-${primaryColor}-600 transition-all group`}
                        >
                            <div className="flex items-start gap-3">
                                {article.thumbnail && (
                                    <img
                                        src={article.thumbnail}
                                        alt=""
                                        className={`w-20 h-20 object-cover rounded border border-${primaryColor}-700 flex-shrink-0`}
                                        onError={(e) => e.target.style.display = 'none'}
                                    />
                                )}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between gap-2 mb-1">
                                        <h4 className={`font-semibold text-${theme}-300 group-hover:text-${theme}-200 text-sm line-clamp-2 transition-colors`}>
                                            {article.title}
                                        </h4>
                                        <ExternalLink size={14} className={`text-${theme}-600 flex-shrink-0 mt-1`} />
                                    </div>
                                    {article.description && (
                                        <p className={`text-xs text-${theme}-600 line-clamp-2 mb-2`}>
                                            {article.description}
                                        </p>
                                    )}
                                    <div className="flex items-center justify-between text-xs">
                                        <span className={`font-semibold ${getCategoryColor(article.category)}`}>
                                            {article.source}
                                        </span>
                                        <span className={`text-${theme}-700`}>
                                            {formatTimeAgo(article.pubDate)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </a>
                    ))}
                </div>
            )}
        </div>
    );
};

export default NewsWidget;