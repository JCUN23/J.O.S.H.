// News comes from the backend (/api/news), which fetches and caches the RSS feeds
// server-side. No CORS proxy, and no made-up fallback headlines: if every source
// is down, this throws and the widget says so.
import { BACKEND_URL } from '../config';

async function getNews(category, limit) {
    const res = await fetch(`${BACKEND_URL}/api/news?${new URLSearchParams({ category, limit })}`);
    const data = await res.json().catch(() => ({}));
    const down = (data.sources || []).filter((s) => !s.ok).map((s) => s.name);
    if (down.length) console.warn('[News] sources unavailable:', down.join(', '));
    if (!res.ok) throw new Error(data.error || `News unavailable (HTTP ${res.status})`);
    return (data.articles || []).map((a) => ({ ...a, pubDate: new Date(a.pubDate) }));
}

export const fetchNews = (category = 'tech', limit = 10) => getNews(category, limit);
export const fetchAllCategories = (limit = 5) => getNews('all', limit * 4);

export const NEWS_CATEGORIES = {
    all: 'All News',
    tech: 'Technology',
    world: 'World',
    sports: 'Sports',
    business: 'Business'
};
