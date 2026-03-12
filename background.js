// MyndGuard Background Service Worker
// Collects browsing, YouTube, Google Search, Reddit, Streaming, Shopping, AI Tools,
// News, Social Media, Gaming & Messaging history

const ANALYSIS_ALARM = 'myndguard-analysis';
const HISTORY_HOURS  = 24;
const DEFAULT_SCAN_HOURS = 8;

// ─── Alarm Setup ──────────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async () => {
  const { scanFrequency } = await new Promise(r => chrome.storage.local.get(['scanFrequency'], r));
  const hours = scanFrequency || DEFAULT_SCAN_HOURS;
  chrome.alarms.create(ANALYSIS_ALARM, { periodInMinutes: 60 * hours });
  console.log(`[MyndGuard] Installed. Auto-analysis every ${hours} hours.`);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ANALYSIS_ALARM) runAnalysis();
});

// ─── Smart scan on startup ─────────────────────────────────────────────────
// If last scan was more than 8 hours ago, scan immediately when Chrome starts
chrome.runtime.onStartup.addListener(async () => {
  const { nextScanTime, scanFrequency } = await new Promise(r =>
    chrome.storage.local.get(['nextScanTime', 'scanFrequency'], r)
  );
  const hours = scanFrequency || DEFAULT_SCAN_HOURS;
  const now = Date.now();
  const lastScanWasOver8HoursAgo = !nextScanTime || now > nextScanTime;
  if (lastScanWasOver8HoursAgo) {
    console.log('[MyndGuard] Startup: last scan overdue — running scan now.');
    runAnalysis();
  } else {
    console.log('[MyndGuard] Startup: scan still fresh, skipping.');
  }
});

// ─── Message Handler ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'runAnalysis') {
    runAnalysis(message.apiKey)
      .then(result => sendResponse({ success: true, result }))
      .catch(err  => sendResponse({ success: false, error: err.message }));
    return true;
  }
  if (message.action === 'getLastAnalysis') {
    chrome.storage.local.get(['lastAnalysis'], data => sendResponse(data));
    return true;
  }
  if (message.action === 'updateScanFrequency') {
    const hours = message.hours || DEFAULT_SCAN_HOURS;
    chrome.alarms.clear(ANALYSIS_ALARM, () => {
      chrome.alarms.create(ANALYSIS_ALARM, { periodInMinutes: 60 * hours });
      chrome.storage.local.set({ scanFrequency: hours, nextScanTime: Date.now() + hours * 60 * 60 * 1000 });
      sendResponse({ success: true });
    });
    return true;
  }
  if (message.action === 'getNextScanTime') {
    chrome.storage.local.get(['nextScanTime', 'scanFrequency'], data => sendResponse(data));
    return true;
  }
});

// ─── History Fetcher ──────────────────────────────────────────────────────────
function fetchHistory(query, maxResults = 500) {
  const startTime = Date.now() - HISTORY_HOURS * 60 * 60 * 1000;
  return new Promise(resolve =>
    chrome.history.search({ text: query, startTime, maxResults }, items => resolve(items || []))
  );
}

// ─── Collect All Sources ──────────────────────────────────────────────────────
async function collectAllHistory() {
  const [
    general, ytItems, googleItems, redditItems, streamItems, shopItems,
    aiItems, newsItems, socialItems, gamingItems, messagingItems
  ] = await Promise.all([
    fetchHistory('', 600),
    fetchHistory('youtube', 300),
    fetchHistory('google.com/search', 200),
    fetchHistory('reddit.com', 200),
    fetchHistory('netflix', 100),
    fetchHistory('amazon', 150),
    fetchHistory('chatgpt', 100),
    fetchHistory('news', 150),
    fetchHistory('facebook.com', 150),
    fetchHistory('steam', 100),
    fetchHistory('chat.google.com', 100),
  ]);
  return { general, ytItems, googleItems, redditItems, streamItems, shopItems, aiItems, newsItems, socialItems, gamingItems, messagingItems };
}

// ─── Sanitize URL ─────────────────────────────────────────────────────────────
function sanitizeUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname + (u.pathname.length > 60 ? u.pathname.substring(0, 60) + '...' : u.pathname);
  } catch { return 'unknown'; }
}

// ─── General Categorizer ──────────────────────────────────────────────────────
function categorizeUrl(url, title) {
  const s = (url + ' ' + title).toLowerCase();
  if (/youtube\.com\/watch|youtu\.be/.test(url))                                              return 'youtube_watch';
  if (/youtube\.com/.test(url))                                                               return 'youtube_browse';
  if (/google\.com\/search|bing\.com\/search/.test(url))                                     return 'search';
  if (/reddit\.com/.test(url))                                                                return 'reddit';
  if (/twitter\.com|x\.com/.test(url))                                                       return 'twitter';
  if (/instagram\.com/.test(url))                                                             return 'instagram';
  if (/facebook\.com/.test(url))                                                              return 'facebook';
  if (/tiktok\.com/.test(url))                                                                return 'tiktok';
  if (/netflix\.com/.test(url))                                                               return 'netflix';
  if (/spotify\.com/.test(url))                                                               return 'spotify';
  if (/twitch\.tv/.test(url))                                                                 return 'twitch';
  if (/amazon\.com|ebay\.com|etsy\.com|walmart\.com/.test(url))                              return 'shopping';
  if (/chatgpt\.com|chat\.openai|claude\.ai|gemini\.google|copilot\.microsoft|perplexity/.test(url)) return 'ai_tools';
  if (/news|cnn|bbc|fox|reuters|apnews|nytimes|guardian/.test(s))                            return 'news';
  if (/steam\.com|steampowered|ign\.com|gamespot|epicgames|roblox\.com|minecraft/.test(s))   return 'gaming';
  if (/chat\.google\.com|web\.whatsapp\.com|telegram\.org|discord\.com/.test(url))           return 'messaging';
  if (/anxiety|depression|stress|mental.health|therapy|suicide|self.harm/.test(s))           return 'mental_health_search';
  if (/github|stackoverflow|developer|coding|programming/.test(s))                           return 'work_technical';
  if (/health|webmd|mayoclinic|healthline/.test(s))                                          return 'health_info';
  if (/bank|finance|credit|loan|invest/.test(s))                                             return 'finance';
  if (/coursera|udemy|khanacademy|\.edu/.test(s))                                            return 'education';
  return 'general';
}

// ─── YouTube Analyzer ─────────────────────────────────────────────────────────
function analyzeYouTube(ytItems) {
  const videos = ytItems.filter(i => i.url && (i.url.includes('youtube.com/watch') || i.url.includes('youtu.be/')));
  const contentCounts = {};
  const topTitles = [];
  videos.forEach(v => {
    const type = categorizeYouTubeContent(v.title || '');
    contentCounts[type] = (contentCounts[type] || 0) + 1;
    if (topTitles.length < 15) topTitles.push(v.title || 'Unknown');
  });
  return { totalVideos: videos.length, uniqueVideos: new Set(videos.map(v => v.url)).size, contentTypes: contentCounts, topTitles };
}

function categorizeYouTubeContent(title) {
  const t = title.toLowerCase();
  if (/sad|cry|depress|alone|lonely|pain|hurt|heartbreak|grief|anxiety|stress|hopeless/.test(t)) return 'emotional_distress';
  if (/motivat|inspir|success|mindful|meditation|wellness|self.care/.test(t))                    return 'positive_wellness';
  if (/news|politics|war|crisis|disaster|breaking|conflict/.test(t))                             return 'news_events';
  if (/comedy|funny|humor|meme|laugh|prank|hilarious/.test(t))                                  return 'comedy';
  if (/gaming|gameplay|fortnite|minecraft|roblox|valorant/.test(t))                             return 'gaming';
  if (/music|song|lyrics|album|concert|playlist|remix/.test(t))                                 return 'music';
  if (/learn|tutorial|how.to|education|documentary|science|history/.test(t))                    return 'educational';
  if (/horror|scary|creepy|disturbing|nightmare/.test(t))                                       return 'dark_horror';
  if (/workout|exercise|fitness|yoga|diet|nutrition/.test(t))                                   return 'health_fitness';
  if (/asmr|sleep|relax|calm|lofi|ambient|chill/.test(t))                                      return 'relaxation';
  if (/vlog|daily|routine|lifestyle|travel|food|cooking/.test(t))                              return 'lifestyle';
  if (/drama|fight|exposed|cancelled|controversy|rant/.test(t))                                return 'drama_controversy';
  return 'general_entertainment';
}

// ─── Google Search Analyzer ───────────────────────────────────────────────────
function analyzeGoogleSearches(googleItems) {
  const queries = [];
  const topicCounts = {};
  googleItems.forEach(item => {
    try {
      const q = new URL(item.url).searchParams.get('q');
      if (q) {
        queries.push(q);
        const topic = categorizeSearchQuery(q);
        topicCounts[topic] = (topicCounts[topic] || 0) + 1;
      }
    } catch {}
  });
  return { totalSearches: queries.length, topicBreakdown: topicCounts, recentQueries: queries.slice(0, 20) };
}

function categorizeSearchQuery(query) {
  const q = query.toLowerCase();
  if (/suicide|kill myself|end my life|self harm/.test(q))       return 'crisis_signals';
  if (/anxiety|depression|stress|mental health|therapy/.test(q)) return 'mental_health';
  if (/symptom|disease|pain|doctor|medication|sick/.test(q))     return 'health_concern';
  if (/how to|tutorial|learn|what is|explain/.test(q))           return 'learning';
  if (/news|latest|today|update|happening/.test(q))              return 'news_seeking';
  if (/buy|price|cheap|discount|deal|review/.test(q))            return 'shopping_intent';
  if (/relationship|breakup|divorce|dating|love|ex/.test(q))     return 'relationship';
  if (/job|career|resume|interview|salary|unemployed/.test(q))   return 'career_work';
  if (/finance|invest|stock|crypto|money|debt/.test(q))          return 'finance';
  return 'general';
}

// ─── Reddit Analyzer ─────────────────────────────────────────────────────────
function analyzeReddit(redditItems) {
  const subreddits = {};
  const concerningSubreddits = [];
  const mentalHealthSubs = /r\/(depression|anxiety|suicidewatch|selfharm|mentalhealth|lonely|bipolar|ptsd|bpd)/i;
  redditItems.forEach(item => {
    const match = (item.url || '').match(/reddit\.com\/r\/([^\/]+)/);
    if (match) {
      const sub = match[1].toLowerCase();
      subreddits[sub] = (subreddits[sub] || 0) + 1;
      if (mentalHealthSubs.test(item.url)) concerningSubreddits.push(sub);
    }
  });
  const topSubreddits = Object.entries(subreddits).sort(([,a],[,b]) => b-a).slice(0,10).map(([sub,count]) => ({ sub, count }));
  return { totalVisits: redditItems.length, uniqueSubreddits: Object.keys(subreddits).length, topSubreddits, concerningSubreddits: [...new Set(concerningSubreddits)] };
}

// ─── Streaming Analyzer ───────────────────────────────────────────────────────
function analyzeStreaming(streamItems) {
  const platforms = {};
  streamItems.forEach(item => {
    const url = item.url || '';
    if (url.includes('netflix'))      platforms['Netflix']      = (platforms['Netflix']      || 0) + 1;
    else if (url.includes('spotify')) platforms['Spotify']      = (platforms['Spotify']      || 0) + 1;
    else if (url.includes('twitch'))  platforms['Twitch']       = (platforms['Twitch']       || 0) + 1;
    else if (url.includes('hulu'))    platforms['Hulu']         = (platforms['Hulu']         || 0) + 1;
    else if (url.includes('disney'))  platforms['Disney+']      = (platforms['Disney+']      || 0) + 1;
    else if (url.includes('primevideo') || (url.includes('amazon') && url.includes('video'))) platforms['Prime Video'] = (platforms['Prime Video'] || 0) + 1;
  });
  return { platforms, totalVisits: streamItems.length };
}

// ─── Shopping Analyzer ────────────────────────────────────────────────────────
function analyzeShopping(shopItems) {
  const platforms = {};
  let productPageVisits = 0;
  shopItems.forEach(item => {
    const url = item.url || '';
    if (url.includes('amazon'))       platforms['Amazon']  = (platforms['Amazon']  || 0) + 1;
    else if (url.includes('ebay'))    platforms['eBay']    = (platforms['eBay']    || 0) + 1;
    else if (url.includes('etsy'))    platforms['Etsy']    = (platforms['Etsy']    || 0) + 1;
    else if (url.includes('walmart')) platforms['Walmart'] = (platforms['Walmart'] || 0) + 1;
    if (/\/dp\/|\/product\/|\/item\/|\/p\//.test(url)) productPageVisits++;
  });
  return { platforms, totalVisits: shopItems.length, productPageVisits };
}

// ─── AI Tools Analyzer ────────────────────────────────────────────────────────
function analyzeAITools(aiItems) {
  const tools = {};
  aiItems.forEach(item => {
    const url = item.url || '';
    if (url.includes('chatgpt') || url.includes('chat.openai')) tools['ChatGPT']    = (tools['ChatGPT']    || 0) + 1;
    else if (url.includes('claude.ai'))                          tools['Claude']     = (tools['Claude']     || 0) + 1;
    else if (url.includes('gemini.google'))                      tools['Gemini']     = (tools['Gemini']     || 0) + 1;
    else if (url.includes('copilot.microsoft'))                  tools['Copilot']    = (tools['Copilot']    || 0) + 1;
    else if (url.includes('perplexity'))                         tools['Perplexity'] = (tools['Perplexity'] || 0) + 1;
  });
  return { tools, totalVisits: aiItems.length };
}

// ─── News Analyzer ────────────────────────────────────────────────────────────
function analyzeNews(newsItems) {
  const sources = {};
  newsItems.forEach(item => {
    const match = (item.url || '').match(/(?:www\.)?([a-zA-Z0-9-]+)\.(com|co|org|net)/);
    if (match) sources[match[1]] = (sources[match[1]] || 0) + 1;
  });
  const topSources = Object.entries(sources).sort(([,a],[,b]) => b-a).slice(0,5).map(([source,count]) => ({ source, count }));
  return { totalVisits: newsItems.length, topSources };
}

// ─── Social Media Analyzer ────────────────────────────────────────────────────
function analyzeSocialMedia(socialItems) {
  const platforms = {};
  socialItems.forEach(item => {
    const url = item.url || '';
    if (url.includes('facebook.com'))      platforms['Facebook']   = (platforms['Facebook']   || 0) + 1;
    else if (url.includes('instagram.com')) platforms['Instagram'] = (platforms['Instagram']  || 0) + 1;
    else if (url.includes('twitter.com') || url.includes('x.com')) platforms['X/Twitter'] = (platforms['X/Twitter'] || 0) + 1;
    else if (url.includes('tiktok.com'))   platforms['TikTok']     = (platforms['TikTok']     || 0) + 1;
    else if (url.includes('linkedin.com')) platforms['LinkedIn']   = (platforms['LinkedIn']   || 0) + 1;
    else if (url.includes('pinterest.com')) platforms['Pinterest'] = (platforms['Pinterest']  || 0) + 1;
  });
  return { platforms, totalVisits: socialItems.length };
}

// ─── Gaming Analyzer ──────────────────────────────────────────────────────────
function analyzeGaming(gamingItems) {
  const platforms = {};
  gamingItems.forEach(item => {
    const url = item.url || '';
    if (url.includes('steampowered') || url.includes('store.steam')) platforms['Steam']     = (platforms['Steam']     || 0) + 1;
    else if (url.includes('twitch.tv'))                               platforms['Twitch']    = (platforms['Twitch']    || 0) + 1;
    else if (url.includes('epicgames.com'))                           platforms['Epic Games'] = (platforms['Epic Games'] || 0) + 1;
    else if (url.includes('roblox.com'))                              platforms['Roblox']    = (platforms['Roblox']    || 0) + 1;
    else if (url.includes('minecraft.net'))                           platforms['Minecraft'] = (platforms['Minecraft'] || 0) + 1;
    else if (url.includes('ign.com') || url.includes('gamespot.com')) platforms['Gaming News'] = (platforms['Gaming News'] || 0) + 1;
  });
  return { platforms, totalVisits: gamingItems.length };
}

// ─── Messaging Analyzer ───────────────────────────────────────────────────────
function analyzeMessaging(messagingItems) {
  const platforms = {};
  messagingItems.forEach(item => {
    const url = item.url || '';
    if (url.includes('chat.google.com'))        platforms['Google Chat']  = (platforms['Google Chat']  || 0) + 1;
    else if (url.includes('web.whatsapp.com'))  platforms['WhatsApp Web'] = (platforms['WhatsApp Web'] || 0) + 1;
    else if (url.includes('telegram.org') || url.includes('web.telegram.org')) platforms['Telegram'] = (platforms['Telegram'] || 0) + 1;
    else if (url.includes('discord.com'))       platforms['Discord']      = (platforms['Discord']      || 0) + 1;
    else if (url.includes('slack.com'))         platforms['Slack']        = (platforms['Slack']        || 0) + 1;
  });
  return { platforms, totalVisits: messagingItems.length };
}

// ─── Category + Time Summary ──────────────────────────────────────────────────
function buildCategorySummary(items) {
  const counts = {};
  const domains = {};
  items.forEach(item => {
    const cat = categorizeUrl(item.url || '', item.title || '');
    counts[cat] = (counts[cat] || 0) + 1;
    try {
      const domain = new URL(item.url).hostname;
      domains[domain] = (domains[domain] || 0) + (item.visitCount || 1);
    } catch {}
  });
  const topDomains = Object.entries(domains).sort(([,a],[,b]) => b-a).slice(0,10).map(([d,c]) => ({ domain: d, visits: c }));
  return { categories: counts, topDomains };
}

function buildTimePatterns(items) {
  const hourBuckets = Array(24).fill(0);
  const dayCounts = {};
  const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  items.forEach(item => {
    const d = new Date(item.lastVisitTime || Date.now());
    hourBuckets[d.getHours()]++;
    const day = dayNames[d.getDay()];
    dayCounts[day] = (dayCounts[day] || 0) + 1;
  });
  const peakHour = hourBuckets.indexOf(Math.max(...hourBuckets));
  const lateNight = [...hourBuckets.slice(23), ...hourBuckets.slice(0,5)].reduce((a,b) => a+b, 0);
  return { hourBuckets, dayCounts, peakHour, lateNightBrowsing: lateNight };
}

// ─── AI Prompt Builder ────────────────────────────────────────────────────────
function buildAnalysisPrompt(data) {
  const { categorySummary, timePatterns, totalSites, youtube, searches, reddit, streaming, shopping, aiTools, news, socialMedia, gaming, messaging } = data;

  return `You are a compassionate family wellness analyst. Analyze the following multi-source digital activity data and provide mental wellness insights. Be warm, non-judgmental, and constructive.

BROWSING OVERVIEW (last 24h):
- Total pages: ${totalSites}
- Categories: ${JSON.stringify(categorySummary.categories)}
- Top domains: ${JSON.stringify(categorySummary.topDomains)}
- Peak hour: ${timePatterns.peakHour}:00
- Late night visits: ${timePatterns.lateNightBrowsing}

YOUTUBE:
${youtube.totalVideos > 0 ? `- Videos: ${youtube.totalVideos} (${youtube.uniqueVideos} unique)\n- Content types: ${JSON.stringify(youtube.contentTypes)}\n- Titles: ${JSON.stringify(youtube.topTitles)}` : '- No activity'}

GOOGLE SEARCHES:
${searches.totalSearches > 0 ? `- Total: ${searches.totalSearches}\n- Topics: ${JSON.stringify(searches.topicBreakdown)}\n- Queries: ${JSON.stringify(searches.recentQueries)}` : '- No activity'}

REDDIT:
${reddit.totalVisits > 0 ? `- Visits: ${reddit.totalVisits} across ${reddit.uniqueSubreddits} subreddits\n- Top: ${JSON.stringify(reddit.topSubreddits)}\n- Concerning subs: ${reddit.concerningSubreddits.join(', ') || 'None'}` : '- No activity'}

STREAMING: ${streaming.totalVisits > 0 ? JSON.stringify(streaming.platforms) : 'No activity'}

SHOPPING: ${shopping.totalVisits > 0 ? `${shopping.totalVisits} visits, ${shopping.productPageVisits} product pages, platforms: ${JSON.stringify(shopping.platforms)}` : 'No activity'}

AI TOOLS: ${aiTools.totalVisits > 0 ? JSON.stringify(aiTools.tools) : 'No activity'}

NEWS: ${news.totalVisits > 0 ? `${news.totalVisits} visits, sources: ${JSON.stringify(news.topSources)}` : 'No activity'}

SOCIAL MEDIA: ${socialMedia.totalVisits > 0 ? JSON.stringify(socialMedia.platforms) : 'No activity'}

GAMING: ${gaming.totalVisits > 0 ? JSON.stringify(gaming.platforms) : 'No activity'}

MESSAGING APPS: ${messaging.totalVisits > 0 ? JSON.stringify(messaging.platforms) : 'No activity'}

Respond ONLY with this JSON format:
\`\`\`json
{
  "mood_score": <1-10>,
  "summary": "<2-3 warm sentences summarizing overall wellness picture>",
  "patterns": [{"label": "<n>", "description": "<observation>", "type": "<positive|neutral|concerning>"}],
  "signals": ["<cross-source wellness signal>"],
  "recommendations": [{"title": "<title>", "detail": "<compassionate suggestion>", "priority": "<high|medium|low>"}],
  "positive_highlights": ["<healthy pattern>"],
  "watch_areas": ["<area to monitor>"],
  "youtube_insights": "<YouTube content emotional theme>",
  "search_insights": "<what searches reveal>",
  "reddit_insights": "<Reddit usage insight>",
  "social_insights": "<social media usage pattern>",
  "messaging_insights": "<messaging app usage pattern>"
}
\`\`\``;
}

// ─── Main Analysis Runner ─────────────────────────────────────────────────────
async function runAnalysis(apiKeyOverride = null) {
  try {
    const stored = await new Promise(r => chrome.storage.local.get(['apiKey', 'scanFrequency'], r));
    const apiKey = apiKeyOverride || stored.apiKey;
    if (!apiKey) throw new Error('No API key configured.');

    const raw = await collectAllHistory();
    if (raw.general.length === 0) throw new Error('No browsing history found.');

    const categorySummary = buildCategorySummary(raw.general);
    const timePatterns    = buildTimePatterns(raw.general);
    const youtube         = analyzeYouTube(raw.ytItems);
    const searches        = analyzeGoogleSearches(raw.googleItems);
    const reddit          = analyzeReddit(raw.redditItems);
    const streaming       = analyzeStreaming(raw.streamItems);
    const shopping        = analyzeShopping(raw.shopItems);
    const aiTools         = analyzeAITools(raw.aiItems);
    const news            = analyzeNews(raw.newsItems);
    const socialMedia     = analyzeSocialMedia(raw.socialItems);
    const gaming          = analyzeGaming(raw.gamingItems);
    const messaging       = analyzeMessaging(raw.messagingItems);

    // Update next scan time
    const hours = stored.scanFrequency || DEFAULT_SCAN_HOURS;
    await new Promise(r => chrome.storage.local.set({ nextScanTime: Date.now() + hours * 60 * 60 * 1000 }, r));

    const prompt = buildAnalysisPrompt({ categorySummary, timePatterns, totalSites: raw.general.length, youtube, searches, reddit, streaming, shopping, aiTools, news, socialMedia, gaming, messaging });

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', max_tokens: 2000, temperature: 0.4, messages: [{ role: 'user', content: prompt }] })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || `API error: ${response.status}`);
    }

    const apiData   = await response.json();
    const rawText   = apiData.choices?.[0]?.message?.content || '';
    const jsonMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/) || rawText.match(/(\{[\s\S]*\})/);
    const analysis  = jsonMatch ? JSON.parse(jsonMatch[1]) : { summary: rawText, mood_score: 5, patterns: [], signals: [], recommendations: [], positive_highlights: [], watch_areas: [] };

    const result = {
      timestamp: new Date().toISOString(),
      analysis,
      categorySummary,
      timePatterns,
      youtubeData:    youtube,
      searchData:     searches,
      redditData:     reddit,
      streamingData:  streaming,
      shoppingData:   shopping,
      aiToolsData:    aiTools,
      newsData:       news,
      socialData:     socialMedia,
      gamingData:     gaming,
      messagingData:  messaging,
      totalSites:     raw.general.length
    };

    await new Promise(r => chrome.storage.local.set({ lastAnalysis: result }, r));

    const { analysisLog = [] } = await new Promise(r => chrome.storage.local.get(['analysisLog'], r));
    analysisLog.push(result);
    if (analysisLog.length > 30) analysisLog.shift();
    await new Promise(r => chrome.storage.local.set({ analysisLog }, r));

    if (analysis.mood_score <= 3) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'MyndGuard Check-in',
        message: 'Your activity patterns suggest you might need some support. Tap to see insights.',
        priority: 2
      });
    }

    return result;
  } catch (err) {
    console.error('[MyndGuard] Analysis failed:', err);
    throw err;
  }
}
