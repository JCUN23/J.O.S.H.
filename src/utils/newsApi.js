// Use AllOrigins as a CORS proxy to fetch RSS feeds
const CORS_PROXY = 'https://api.allorigins.win/raw?url=';

// Simpler news sources that work well
const NEWS_SOURCES = {
    tech: [
        { name: 'TechCrunch', url: 'https://techcrunch.com/feed/' },
        { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml' },
        { name: 'Hacker News', url: 'https://hnrss.org/frontpage' }
    ],
    world: [
        { name: 'Reuters', url: 'https://www.reutersagency.com/feed/' },
        { name: 'BBC', url: 'http://feeds.bbci.co.uk/news/world/rss.xml' }
    ],
    sports: [
        { name: 'ESPN', url: 'https://www.espn.com/espn/rss/news' },
        { name: 'BBC Sport', url: 'http://feeds.bbci.co.uk/sport/rss.xml' }
    ],
    business: [
        { name: 'Yahoo Finance', url: 'https://finance.yahoo.com/news/rssindex' },  // Changed from FT
        { name: 'MarketWatch', url: 'http://feeds.marketwatch.com/marketwatch/topstories/' }
    ]
};

// Parse RSS XML manually
function parseRSS(xmlString, sourceName) {
    try {
        const parser = new DOMParser();
        const xml = parser.parseFromString(xmlString, 'text/xml');
        
        // Handle parsing errors
        // const parseError = xml.querySelector('parsererror');
        // if (parseError) {
        //     console.error('XML Parse Error:', parseError.textContent);
        //     return [];
        // }
        
        const items = xml.querySelectorAll('item');
        
        return Array.from(items).map(item => {
            const title = item.querySelector('title')?.textContent || 'No title';
            const link = item.querySelector('link')?.textContent || '#';
            const description = item.querySelector('description')?.textContent || '';
            const pubDate = item.querySelector('pubDate')?.textContent || new Date().toISOString();
            
            // Try to extract thumbnail from various possible fields
            let thumbnail = null;
            const mediaContent = item.querySelector('content, thumbnail');
            if (mediaContent) {
                thumbnail = mediaContent.getAttribute('url');
            }
            
            // Try to get image from enclosure
            if (!thumbnail) {
                const enclosure = item.querySelector('enclosure[type^="image"]');
                if (enclosure) {
                    thumbnail = enclosure.getAttribute('url');
                }
            }
            
            return {
                title: cleanText(title),
                description: cleanDescription(description),
                url: link,
                source: sourceName,
                pubDate: new Date(pubDate),
                thumbnail: thumbnail
            };
        });
    } catch (error) {
        console.error('Error parsing RSS:', error);
        return [];
    }
}

export async function fetchNews(category = 'tech', limit = 10) {
    try {
        const sources = NEWS_SOURCES[category] || NEWS_SOURCES.tech;
        const source = sources[0]; // Use first source
        
        console.log('Fetching news from:', source.name);
        
        const response = await fetch(CORS_PROXY + encodeURIComponent(source.url));
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const xmlString = await response.text();
        const articles = parseRSS(xmlString, source.name);
        
        console.log('Parsed articles:', articles.length);
        
        return articles.slice(0, limit).map(article => ({
            ...article,
            category: category
        }));
    // eslint-disable-next-line no-unused-vars
    } catch (error) {
        // console.error('Error fetching news:', error);
        // Return mock data as fallback
        return getMockNews(category, limit);
    }
}

export async function fetchAllCategories(limit = 5) {
    try {
        const categories = ['tech', 'world', 'sports', 'business'];
        
        const results = await Promise.allSettled(
            categories.map(cat => fetchNews(cat, limit))
        );
        
        // Combine successful results
        const allNews = results
            .filter(result => result.status === 'fulfilled')
            .flatMap(result => result.value)
            .sort((a, b) => b.pubDate - a.pubDate);
        
        console.log('Total articles fetched:', allNews.length);
        
        return allNews.length > 0 ? allNews : getMockNews('all', limit * 4);
    } catch (error) {
        console.error('Error fetching all news:', error);
        return getMockNews('all', limit * 4);
    }
}

// Helper to clean text
function cleanText(text) {
    if (!text) return '';
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value.trim();
}

// Helper to clean HTML from descriptions
function cleanDescription(html) {
    if (!html) return '';
    
    // Remove HTML tags
    let text = html.replace(/<[^>]*>/g, '');
    
    // Decode HTML entities
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    text = textarea.value;
    
    // Limit length
    return text.length > 150 
        ? text.substring(0, 150) + '...' 
        : text;
}

// Mock data as fallback
function getMockNews(category, limit) {
    const mockArticles = [
        {
            title: 'Major Tech Breakthrough Announced',
            description: 'Industry leaders unveil new technology that could change everything...',
            url: '#',
            source: 'TechCrunch',
            pubDate: new Date(Date.now() - 3600000),
            category: 'tech',
            thumbnail: null
        },
        {
            title: 'Global Markets React to Economic News',
            description: 'Financial analysts weigh in on the latest economic indicators...',
            url: '#',
            source: 'Financial Times',
            pubDate: new Date(Date.now() - 7200000),
            category: 'business',
            thumbnail: null
        },
        {
            title: 'Championship Game Ends in Thriller',
            description: 'Last-minute goal secures victory in dramatic finish...',
            url: '#',
            source: 'ESPN',
            pubDate: new Date(Date.now() - 10800000),
            category: 'sports',
            thumbnail: null
        },
        {
            title: 'International Summit Concludes',
            description: 'World leaders reach agreement on key global issues...',
            url: '#',
            source: 'Reuters',
            pubDate: new Date(Date.now() - 14400000),
            category: 'world',
            thumbnail: null
        }
    ];
    
    if (category === 'all') {
        return mockArticles.slice(0, limit);
    }
    
    return mockArticles
        .filter(article => article.category === category)
        .slice(0, limit);
}

export const NEWS_CATEGORIES = {
    all: 'All News',
    tech: 'Technology',
    world: 'World',
    sports: 'Sports',
    business: 'Business'
};