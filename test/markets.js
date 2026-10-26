'use strict';

var should = require('should');
var sinon = require('sinon');
var proxyquire = require('proxyquire');
var MarketsController = require('../lib/markets');

var tickerData = {
  quotes: {
    USD: {
      price: 0.4321,
      market_cap: 150000000,
      volume_24h: 2500000,
      percent_change_24h: -1.5
    },
    BTC: {
      price: 0.0000061
    }
  }
};

describe('Markets', function() {
  var clock;

  beforeEach(function() {
    clock = sinon.useFakeTimers();
  });

  afterEach(function() {
    clock.restore();
  });

  function serviceWith(get, proxy) {
    var MarketsService = proxyquire('../services/MarketsService', {
      '../helpers/HttpHelper': {get: get}
    });
    var node = {
      log: {
        error: sinon.stub()
      }
    };
    return {
      service: new MarketsService({node: node, proxy: proxy}),
      log: node.log
    };
  }

  it('will start with zeroed market info', function(done) {
    var t = serviceWith(sinon.stub());
    t.service.getInfo(function(err, info) {
      should.not.exist(err);
      info.should.eql({
        price: 0,
        price_btc: 0,
        market_cap_usd: 0,
        total_volume_24h: 0,
        delta_24h: 0
      });
      done();
    });
  });

  it('will send the ticker request through the configured proxy', function() {
    var get = sinon.stub();
    serviceWith(get, 'http://10.0.0.1:3128');
    get.args[0][1].should.eql({json: true, proxy: 'http://10.0.0.1:3128'});
  });

  it('will update market info from the ticker and emit updated', function(done) {
    var get = sinon.stub();
    var t = serviceWith(get);
    get.callCount.should.equal(1);
    get.args[0][0].should.equal('https://api.coinpaprika.com/v1/tickers/zel-zelcash?quotes=BTC,USD');
    get.args[0][1].should.eql({json: true, proxy: undefined});
    t.service.on('updated', function(info) {
      info.should.eql({
        price: 0.4321,
        price_btc: 0.0000061,
        market_cap_usd: 150000000,
        total_volume_24h: 2500000,
        delta_24h: -1.5
      });
      t.log.error.callCount.should.equal(0);
      done();
    });
    get.args[0][2](null, {statusCode: 200}, tickerData);
  });

  it('will refresh every 90 seconds', function() {
    var get = sinon.stub();
    serviceWith(get);
    get.callCount.should.equal(1);
    clock.tick(89999);
    get.callCount.should.equal(1);
    clock.tick(1);
    get.callCount.should.equal(2);
  });

  it('will log a request error and keep the last info', function() {
    var get = sinon.stub();
    var t = serviceWith(get);
    var updated = sinon.stub();
    t.service.on('updated', updated);
    get.args[0][2](new Error('offline'));
    t.log.error.callCount.should.equal(1);
    t.log.error.args[0][0].should.equal('Coinpaprika error');
    updated.callCount.should.equal(0);
    t.service.info.price.should.equal(0);
  });

  it('will log a status other than 200', function() {
    var get = sinon.stub();
    var t = serviceWith(get);
    get.args[0][2](null, {statusCode: 429}, {});
    t.log.error.callCount.should.equal(1);
    t.log.error.args[0][0].should.equal('Coinpaprika error status code');
    t.log.error.args[0][1].should.equal(429);
  });

  it('will log an empty body', function() {
    var get = sinon.stub();
    var t = serviceWith(get);
    get.args[0][2](null, {statusCode: 200}, '');
    t.log.error.callCount.should.equal(1);
    t.log.error.args[0][0].should.equal('Coinpaprika error body');
  });

  it('the controller answers the service info as JSON', function(done) {
    var info = {price: 1};
    var controller = new MarketsController({
      marketsService: {
        getInfo: function(next) {
          next(null, info);
        }
      }
    });
    controller.getInfo({}, {
      json: function(data) {
        data.should.equal(info);
        done();
      }
    });
  });
});
