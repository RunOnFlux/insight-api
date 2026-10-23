module.exports = {
    /**
     * GETs a URL with fetch.
     * @param {String} url
     * @param {Object} options
     * @param {Boolean} options.json - ask for JSON, and give the parsed body when it parses
     * @param {Function} callback - called with (err, {statusCode}, body); body is the text unless
     * `options.json` is set and it parses. The callback runs outside the fetch promise chain.
     */
    get: function (url, options, callback) {

        var headers = options.json ? {accept: 'application/json'} : {};

        fetch(url, {headers: headers}).then(function (response) {
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
