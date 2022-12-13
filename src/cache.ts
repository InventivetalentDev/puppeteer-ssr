import { AsyncLoadingCache, AsyncMappingFunction } from "@inventivetalent/loading-cache";

import { Caches } from "@inventivetalent/loading-cache";
import { Time } from "@inventivetalent/time";

const cache: AsyncLoadingCache<string, string> = Caches.builder()
    .expireAfterWrite(Time.seconds(Number(process.env.MEMORY_CACHE_DURATION) || 60))
    .recordStats(false)
    .buildAsync();

async function getOr(url: string, mappingFunction: AsyncMappingFunction<string, string>) {
    return cache.get(url, mappingFunction)
}

async function get(url: string) {
    return cache.getIfPresent(url);
}

async function put(url: string, content: string) {
    return cache.put(url, content);
}

export { get, getOr, put };
