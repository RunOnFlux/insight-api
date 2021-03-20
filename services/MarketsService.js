var util = require('util');
var EventEmitter = require('events').EventEmitter;
var request = require('request');
var _ = require('lodash');
var Common = require('../lib/common');

function MarketsService(options) {

    this.common = new Common({ log: options.node.log });

    this.info = {
        price: 0,
        price_btc: 0,
        market_cap_usd: 0,
        total_volume_24h: 0,
        delta_24h: 0
    };

    this._updateInfo();

    var self = this;

    setInterval(function () {
        self._updateInfo();
    }, 90000);

}

util.inherits(MarketsService, EventEmitter);

MarketsService.prototype._updateInfo = function () {
    var self = this;
    return request.get({
        url: 'https://api.coinpaprika.com/v1/tickers/zel-zelcash?quotes=BTC,USD',
        json: true
    }, function (err, response, body) {

        if (err) {
            return self.common.log.error('Coingecko error', err);
        }

        if (response.statusCode != 200) {
            return self.common.log.error('Coingecko error status code', response.statusCode);
        }

        if (body) {
            var needToTrigger = false;

            self.info.price = body.quotes.USD.price || 0;
            self.info.price_btc = body.quotes.BTC.price || 0;
            self.info.market_cap_usd = body.quotes.USD.market_cap || 0;
            self.info.total_volume_24h = body.quotes.USD.volume_24h || 0;
            self.info.delta_24h = body.quotes.USD.percent_change_24h || 0;
            needToTrigger = true;

            if (needToTrigger) {
                self.emit('updated', self.info);
            }

            return self.info;
        }

        return self.common.log.error('Coingecko error body', body);

    });

};

MarketsService.prototype.getInfo = function (next) {
    return next(null, this.info);
};

module.exports = MarketsService;
