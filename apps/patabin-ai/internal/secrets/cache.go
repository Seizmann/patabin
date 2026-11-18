package secrets

import (
	"context"
	"sync"
	"time"
)

type FetchFunc func(ctx context.Context, providerID string) (string, error)

type Cache struct {
	fetch FetchFunc
	ttl   time.Duration
	mu    sync.Mutex
	items map[string]cacheItem
}

type cacheItem struct {
	key     string
	expires time.Time
}

func NewCache(fetch FetchFunc, ttl time.Duration) *Cache {
	return &Cache{fetch: fetch, ttl: ttl, items: map[string]cacheItem{}}
}

func (c *Cache) Get(ctx context.Context, providerID string) (string, error) {
	c.mu.Lock()
	item, ok := c.items[providerID]
	if ok && time.Now().Before(item.expires) {
		c.mu.Unlock()
		return item.key, nil
	}
	c.mu.Unlock()
	key, err := c.fetch(ctx, providerID)
	if err != nil {
		return "", err
	}
	c.mu.Lock()
	c.items[providerID] = cacheItem{key: key, expires: time.Now().Add(c.ttl)}
	c.mu.Unlock()
	return key, nil
}

func (c *Cache) Invalidate(providerID string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.items, providerID)
}
