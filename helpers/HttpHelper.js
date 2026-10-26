var undici = require('undici');

// one ProxyAgent per proxy URL, so connections to the proxy are reused
var proxyAgents = {};

function proxyAgent(proxy) {
    if (!proxyAgents[proxy]) {
        proxyAgents[proxy] = new undici.ProxyAgent(proxy);
    }
    return proxyAgents[proxy];
}

module.exports = {
    /**
     * GETs a URL with fetch.
     * @param {String} url
     * @param {Object} options
     * @param {Boolean} options.json - ask for JSON, and give the parsed body when it parses
     * @param {String} options.proxy - an HTTP proxy URL (e.g. http://10.0.0.1:3128) to send the
     * request through; without it the request goes direct
     * @param {Function} callback - called with (err, {statusCode}, body); body is the text unless
     * `options.json` is set and it parses. The callback runs outside the fetch promise chain.
     */
    get: function (url, options, callback) {

        var init = {headers: options.json ? {accept: 'application/json'} : {}};
        if (options.proxy) {
            init.dispatcher = proxyAgent(options.proxy);
        }

        undici.fetch(url, init).then(function (response) {
            return response.text().then(function (text) {

                var body = text;

                if (options.json) {
                    try {
                        body = JSON.parse(text);
                    } catch (e) {
                        body = text;
                    }
                }

                process.nextTick(callback, null, {statusCode: response.status}, body);

            });
        }).catch(function (err) {
            process.nextTick(callback, err);
        });

    }
};
