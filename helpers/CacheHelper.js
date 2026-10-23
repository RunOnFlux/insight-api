var LRUCache = require('lru-cache').LRUCache;

module.exports = {
    /**
     * An LRU cache that holds at most `limit` entries. Storage grows with the entries held,
     * so a large limit costs nothing up front. `set(key, value, {ttl: ms})` expires one entry.
     * @param {Number} limit
     * @return {LRUCache}
     */
    create: function (limit) {
        return new LRUCache({
            maxSize: limit,
            sizeCalculation: function () {
                return 1;
            }
        });
    }
};
