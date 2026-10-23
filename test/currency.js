'use strict';

var should = require('should');
var sinon = require('sinon');
var proxyquire = require('proxyquire');
var CurrencyController = require('../lib/currency');

var TICKER = 'https://api.coinpaprika.com/v1/tickers/zel-zelcash?quotes=USD';

describe('Currency', function() {

  var tickerData = {
    id: 'zel-zelcash',
    symbol: 'FLUX',
    quotes: {
      USD: {
        price: 0.4321
      }
    }
  };

  function controllerWith(request) {
    var TestCurrencyController = proxyquire('../lib/currency', {
      request: request
    });
    var node = {
      log: {
        error: sinon.stub()
      }
    };
    return new TestCurrencyController({node: node, coinTicker: TICKER, coinShort: 'FLUX'});
  }

  it('will retrieve a fresh value', function(done) {
    var request = sinon.stub().callsArgWith(1, null, {statusCode: 200}, JSON.stringify(tickerData));
    var currency = controllerWith(request);
    currency.rate = 0.22;
    currency.timestamp = Date.now() - 61000 * CurrencyController.DEFAULT_CURRENCY_DELAY;
    var res = {
      jsonp: function(response) {
        response.should.eql({
          status: 200,
          data: {
            rate: 0.4321,
            short: 'FLUX'
          }
        });
        request.args[0][0].should.equal(TICKER);
        currency.rate.should.equal(0.4321);
        done();
      }
    };
    currency.index({}, res);
  });

  it('will retrieve a value when no rate is known yet', function(done) {
    var request = sinon.stub().callsArgWith(1, null, {statusCode: 200}, JSON.stringify(tickerData));
    var currency = controllerWith(request);
    var res = {
      jsonp: function(response) {
        response.data.rate.should.equal(0.4321);
        request.callCount.should.equal(1);
        done();
      }
    };
    currency.index({}, res);
  });

  it('will log an error from request and keep the last rate', function(done) {
    var request = sinon.stub().callsArgWith(1, new Error('test'));
    var currency = controllerWith(request);
    currency.rate = 0.3;
    currency.timestamp = Date.now() - 65000 * CurrencyController.DEFAULT_CURRENCY_DELAY;
    var res = {
      jsonp: function(response) {
        response.should.eql({
          status: 200,
          data: {
            rate: 0.3,
            short: 'FLUX'
          }
        });
        currency.node.log.error.callCount.should.equal(1);
        done();
      }
    };
    currency.index({}, res);
  });

  it('will keep the last rate on a status other than 200', function(done) {
    var request = sinon.stub().callsArgWith(1, null, {statusCode: 502}, 'Bad Gateway');
    var currency = controllerWith(request);
    currency.rate = 0.3;
    currency.timestamp = Date.now() - 65000 * CurrencyController.DEFAULT_CURRENCY_DELAY;
    var res = {
      jsonp: function(response) {
        response.data.rate.should.equal(0.3);
        currency.rate.should.equal(0.3);
        done();
      }
    };
    currency.index({}, res);
  });

  it('will reset the rate to 0 on a body without a USD price', function(done) {
    var request = sinon.stub().callsArgWith(1, null, {statusCode: 200}, 'not json');
    var currency = controllerWith(request);
    currency.rate = 0.3;
    currency.timestamp = Date.now() - 65000 * CurrencyController.DEFAULT_CURRENCY_DELAY;
    var consoleLog = sinon.stub(console, 'log');
    var res = {
      jsonp: function(response) {
        consoleLog.restore();
        response.data.rate.should.equal(0);
        currency.rate.should.equal(0);
        done();
      }
    };
    currency.index({}, res);
  });

  it('will retrieve a cached value', function(done) {
    var request = sinon.stub();
    var currency = controllerWith(request);
    currency.rate = 0.4321;
    currency.timestamp = Date.now();
    var res = {
      jsonp: function(response) {
        response.status.should.equal(200);
        response.data.rate.should.equal(0.4321);
        request.callCount.should.equal(0);
        done();
      }
    };
    currency.index({}, res);
  });

  it('will refresh after the configured delay in minutes', function() {
    var currency = new CurrencyController({node: {}, currencyRefresh: 3});
    currency.currencyDelay.should.equal(3 * 60000);
    new CurrencyController({node: {}}).currencyDelay.should.equal(CurrencyController.DEFAULT_CURRENCY_DELAY * 60000);
    should.exist(currency.timestamp);
  });

});
