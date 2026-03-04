// ============================
// NEWS SITE — Script
// ============================

const FEEDS = {
    top: ['https://news.google.com/rss?hl=it&gl=IT&ceid=IT:it'],
    politics: [
        'https://news.google.com/rss/headlines/section/topic/POLITICS?hl=it&gl=IT&ceid=IT:it',
        'https://news.google.com/rss/headlines/section/topic/WORLD?hl=it&gl=IT&ceid=IT:it'
    ],
    business: ['https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=it&gl=IT&ceid=IT:it'],
    tech: ['https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=it&gl=IT&ceid=IT:it'],
    sports: ['https://news.google.com/rss/headlines/section/topic/SPORTS?hl=it&gl=IT&ceid=IT:it'],
    entertainment: ['https://news.google.com/rss/headlines/section/topic/ENTERTAINMENT?hl=it&gl=IT&ceid=IT:it']
};

const INITIAL_LOAD = 15;
const LOAD_MORE_COUNT = 10;

// State
let currentCategory = 'top';
let currentSearchQuery = ''; // Saved search query
let allFetchedItems = [];
let displayedCount = 0;
let refreshInterval = null;
let lastSuccessTime = null; // Last successful update time

// DOM
const newsContainer = document.getElementById('newsContainer');
const loadingSpinner = document.getElementById('loadingSpinner');
const lastUpdateEl = document.getElementById('lastUpdate');
const tabsBar = document.getElementById('tabsBar');
const loadMoreBtn = document.getElementById('loadMoreBtn');
const liveBadge = document.getElementById('liveBadge');
const searchIcon = document.getElementById('searchIcon');
const backIcon = document.getElementById('backIcon');
const overlay = document.getElementById('overlay');
const searchModal = document.getElementById('searchModal');
const searchInput = document.getElementById('searchInput');
const searchGoBtn = document.getElementById('searchGoBtn');
const cancelSearch = document.getElementById('cancelSearch');

// ============================
// RSS FETCHING & PARSING
// ============================

async function fetchRSS(url) {
    const proxyUrl = 'https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(url);

    const response = await fetch(proxyUrl);
    if (!response.ok) throw new Error('HTTP error ' + response.status);

    const data = await response.json();

    if (data.status !== 'ok') throw new Error('RSS2JSON error');

    return data.items.map(item => ({
        id: item.link || item.guid,
        title: cleanTitle(item.title),
        link: item.link,
        source: item.author || extractSource(item.title),
        pubDate: item.pubDate
    }));
}

function cleanTitle(title) {
    const dashIndex = title.lastIndexOf(' - ');
    if (dashIndex > 0 && dashIndex > title.length * 0.4) {
        return title.substring(0, dashIndex).trim();
    }
    return title;
}

function extractSource(title) {
    const dashIndex = title.lastIndexOf(' - ');
    if (dashIndex > 0) {
        return title.substring(dashIndex + 3).trim();
    }
    return 'Google News';
}

// ============================
// FEED LOADING
// ============================

async function loadFeed(category, isRefresh = false) {
    if (!isRefresh) {
        showLoading();
        loadMoreBtn.style.display = 'none';
    }

    // Show syncing state
    if (isRefresh) {
        showSyncing();
    }

    try {
        let urls;
        if (category === 'search') {
            const query = currentSearchQuery;
            if (!query) {
                hideLoading();
                showEmpty('Inserisci una parola chiave per cercare.');
                return;
            }
            urls = [`https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=it&gl=IT&ceid=IT:it`];
        } else {
            urls = FEEDS[category];
        }

        const allPromises = urls.map(url => fetchRSS(url));
        const allResults = await Promise.all(allPromises);

        let newItems = allResults.flat();
        const seen = new Set();
        newItems = newItems.filter(item => {
            if (seen.has(item.id)) return false;
            seen.add(item.id);
            return true;
        });

        newItems.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

        if (isRefresh) {
            const currentIds = new Set(allFetchedItems.map(i => i.id));
            const brandNew = newItems.filter(item => !currentIds.has(item.id));

            if (brandNew.length > 0) {
                brandNew.reverse().forEach(item => {
                    allFetchedItems.unshift(item);
                    displayedCount++;
                    prependNewsCard(item, true);
                });
            }
        } else {
            allFetchedItems = newItems;
            displayedCount = 0;
            renderInitialCards();
        }

        updateTimestamp();
        hideLoading();
    } catch (error) {
        console.error('Error loading feed:', error);
        revertTimestamp();
        hideLoading();
        if (!isRefresh) {
            if (error.message.includes('429')) {
                showError('Troppe richieste a Google News. Riprova tra qualche minuto.');
            } else {
                showError();
            }
        }
    }
}

// ============================
// RENDERING
// ============================

function renderInitialCards() {
    newsContainer.innerHTML = '';

    if (allFetchedItems.length === 0) {
        showEmpty('Nessuna notizia trovata.');
        loadMoreBtn.style.display = 'none';
        return;
    }

    const toShow = allFetchedItems.slice(0, INITIAL_LOAD);
    toShow.forEach(item => {
        newsContainer.appendChild(createNewsCard(item, false));
    });
    displayedCount = toShow.length;

    if (displayedCount < allFetchedItems.length) {
        loadMoreBtn.style.display = 'flex';
    } else {
        loadMoreBtn.style.display = 'none';
    }
}

function loadMore() {
    const nextBatch = allFetchedItems.slice(displayedCount, displayedCount + LOAD_MORE_COUNT);
    nextBatch.forEach(item => {
        const card = createNewsCard(item, false);
        card.style.animationDelay = '0s';
        newsContainer.appendChild(card);
    });
    displayedCount += nextBatch.length;

    if (displayedCount >= allFetchedItems.length) {
        loadMoreBtn.style.display = 'none';
    }
}

function createNewsCard(item, isNew) {
    const card = document.createElement('a');
    card.className = 'news-card' + (isNew ? ' new-item' : '');
    card.href = item.link;
    card.target = '_blank';
    card.rel = 'noopener noreferrer';

    card.innerHTML = `
        <div class="news-card-header">
            <span class="news-source">${escapeHTML(item.source)}</span>
            <span class="news-time">${formatTime(item.pubDate)}</span>
        </div>
        <div class="news-title">${escapeHTML(item.title)}</div>
        <div class="news-card-footer">
            <i class="fas fa-external-link-alt"></i>
            <span>Leggi l'articolo completo</span>
        </div>
    `;

    return card;
}

function prependNewsCard(item, isNew) {
    const card = createNewsCard(item, isNew);
    newsContainer.insertBefore(card, newsContainer.firstChild);
}

// ============================
// UI HELPERS
// ============================

function showLoading() {
    loadingSpinner.classList.remove('hidden');
}

function hideLoading() {
    loadingSpinner.classList.add('hidden');
}

function showError() {
    newsContainer.innerHTML = `
        <div class="error-state">
            <i class="fas fa-exclamation-triangle"></i>
            <p>Impossibile caricare le notizie. Riprova più tardi.</p>
        </div>
    `;
}

function showEmpty(message) {
    newsContainer.innerHTML = `
        <div class="empty-state">
            <i class="fas fa-search"></i>
            <p>${message}</p>
        </div>
    `;
}

function showSyncing() {
    lastUpdateEl.textContent = 'Sincronizzazione in corso...';
    lastUpdateEl.classList.add('syncing');
}

function updateTimestamp() {
    const now = new Date();
    lastSuccessTime = now;
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    lastUpdateEl.textContent = `Aggiornato alle ${hh}:${mm}`;
    lastUpdateEl.classList.remove('syncing');
}

function revertTimestamp() {
    if (lastSuccessTime) {
        const hh = String(lastSuccessTime.getHours()).padStart(2, '0');
        const mm = String(lastSuccessTime.getMinutes()).padStart(2, '0');
        lastUpdateEl.textContent = `Aggiornato alle ${hh}:${mm}`;
    } else {
        lastUpdateEl.textContent = 'Aggiornamento fallito';
    }
    lastUpdateEl.classList.remove('syncing');
}

function formatTime(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMin = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMin < 1) return 'Adesso';
    if (diffMin < 60) return `${diffMin} min fa`;
    if (diffHours < 24) return `${diffHours} ore fa`;

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${day}/${month}`;
}

function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ============================
// TABS LOGIC
// ============================

tabsBar.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;

    const category = btn.dataset.category;

    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    currentCategory = category;
    currentSearchQuery = '';
    allFetchedItems = [];
    displayedCount = 0;
    loadFeed(category);
    resetInterval();
});

// ============================
// SEARCH MODAL LOGIC
// ============================

function openSearchModal() {
    overlay.classList.add('visible');
    searchModal.classList.add('visible');
    setTimeout(() => searchInput.focus(), 200);
}

function closeSearchModal() {
    overlay.classList.remove('visible');
    searchModal.classList.remove('visible');
}

searchIcon.addEventListener('click', openSearchModal);
overlay.addEventListener('click', closeSearchModal);
cancelSearch.addEventListener('click', closeSearchModal);

searchGoBtn.addEventListener('click', () => {
    performSearch();
});

searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        performSearch();
    }
});

function performSearch() {
    const query = searchInput.value.trim();
    if (!query) return;

    // Save the query BEFORE closing modal
    currentSearchQuery = query;

    // Deactivate all category tabs
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));

    closeSearchModal();
    currentCategory = 'search';
    allFetchedItems = [];
    displayedCount = 0;
    loadFeed('search');
    resetInterval();
}

// ============================
// LIVE BADGE — INSTANT REFRESH
// ============================

liveBadge.addEventListener('click', () => {
    loadFeed(currentCategory, true);
});

// ============================
// LOAD MORE BUTTON
// ============================

loadMoreBtn.addEventListener('click', () => {
    loadMore();
});

// ============================
// BACK BUTTON
// ============================

backIcon.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    const topBtn = document.querySelector('.tab-btn[data-category="top"]');
    if (topBtn) topBtn.classList.add('active');

    currentCategory = 'top';
    currentSearchQuery = '';
    allFetchedItems = [];
    displayedCount = 0;
    loadFeed('top');
    resetInterval();
});

// ============================
// AUTO REFRESH
// ============================

function startInterval() {
    refreshInterval = setInterval(() => {
        loadFeed(currentCategory, true);
    }, 600000);
}

function resetInterval() {
    if (refreshInterval) clearInterval(refreshInterval);
    startInterval();
}

// ============================
// INIT
// ============================

function init() {
    loadFeed('top');
    startInterval();
}

init();
