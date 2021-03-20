'use strict';

var request = require('request');

function CurrencyController(options) {
  this.node = options.node;
  var refresh = options.currencyRefresh || CurrencyController.DEFAULT_CURRENCY_DELAY;
  this.currencyDelay = refresh * 60000;
  this.rate = 0;
  this.timestamp = Date.now();
  this.coinTicker = options.coinTicker;
  this.coinShort = options.coinShort;
}

CurrencyController.DEFAULT_CURRENCY_DELAY = 10;

CurrencyController.prototype.index = function (req, res) {
  var self = this;
  var currentTime = Date.now();
  if (self.rate === 0 || currentTime >= (self.timestamp + self.currencyDelay)) {
    self.timestamp = currentTime;
    request(self.coinTicker, function (err, response, body) {
      if (err) {
        self.node.log.error(err);
      }
      if (!err && response.statusCode == 200 && body) {
        try {
          var newBody = JSON.parse(body);
          var newRate = newBody.quotes.USD.price
        } catch(error) {
          console.log(error);
        }
        var rate = newRate || 0
        self.rate = rate;
        res.jsonp({
          status: 200,
          data: {
            rate: self.rate,
            short: self.coinShort,
            fetched: 1,
          }
        });
      } else {
        res.jsonp({
          status: 200,
          data: {
            rate: self.rate,
            short: self.coinShort,
          }
        });
      }
    });
  } else {
    res.jsonp({
      status: 200,
      data: {
        rate: self.rate,
        short: self.coinShort,
      }
    });
  }

};

module.exports = CurrencyController;
