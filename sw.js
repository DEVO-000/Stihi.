// sw.js - Service Worker для кэширования и офлайн-доступа

const CACHE_NAME = 'poems-cache-v2';
const OFFLINE_URL = 'offline.html';

// Файлы для кэширования
const urlsToCache = [
    '/',
    '/index.html',
    '/offline.html',
    'https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap'
];

// Установка Service Worker
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW] Кэширование файлов...');
                return cache.addAll(urlsToCache);
            })
            .then(() => self.skipWaiting())
    );
});

// Активация Service Worker
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[SW] Удаление старого кэша:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
        .then(() => self.clients.claim())
    );
});

// Перехват запросов
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Возвращаем кэшированный ответ или загружаем с сети
                if (response) {
                    return response;
                }
                
                return fetch(event.request)
                    .then(fetchResponse => {
                        // Кэшируем новые ресурсы
                        if (event.request.url.startsWith(self.location.origin)) {
                            const responseClone = fetchResponse.clone();
                            caches.open(CACHE_NAME)
                                .then(cache => {
                                    cache.put(event.request, responseClone);
                                });
                        }
                        return fetchResponse;
                    })
                    .catch(() => {
                        // Если офлайн и нет кэша - показываем страницу офлайн
                        if (event.request.mode === 'navigate') {
                            return caches.match(OFFLINE_URL);
                        }
                        return new Response('Network error', {
                            status: 408,
                            headers: { 'Content-Type': 'text/plain' }
                        });
                    });
            })
    );
});

// Фоновая синхронизация
self.addEventListener('sync', event => {
    if (event.tag === 'sync-poems') {
        event.waitUntil(syncPoems());
    }
});

async function syncPoems() {
    try {
        console.log('[SW] Фоновая синхронизация выполнена');
        return true;
    } catch (error) {
        console.error('[SW] Ошибка синхронизации:', error);
        return false;
    }
}

// Получение сообщений от клиента
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SAVE_LEARNED') {
        const data = event.data.payload;
        console.log('[SW] Получены данные о выученном стихе:', data.id);
        saveToIndexedDB(data);
    }
});

// Сохранение в IndexedDB для офлайн-доступа
function saveToIndexedDB(data) {
    const request = indexedDB.open('PoemsDB', 1);
    
    request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('learned')) {
            db.createObjectStore('learned', { keyPath: 'id' });
            console.log('[SW] Создана база данных PoemsDB');
        }
    };
    
    request.onsuccess = (event) => {
        const db = event.target.result;
        const transaction = db.transaction(['learned'], 'readwrite');
        const store = transaction.objectStore('learned');
        store.put(data);
        console.log('[SW] Данные сохранены в IndexedDB:', data.id);
    };
    
    request.onerror = (event) => {
        console.error('[SW] Ошибка IndexedDB:', event.target.error);
    };
}
