'use strict';

var should = require('should');
var sinon = require('sinon');
var proxyquire = require('proxyquire');
var EventEmitter = require('events').EventEmitter;
var util = require('util');

function MarketsServiceStub() {
  EventEmitter.call(this);
}
util.inherits(MarketsServiceStub, EventEmitter);

var InsightAPI = proxyquire('../lib/index', {
  '../services/MarketsService': MarketsServiceStub
});

function testNode() {
  return {
    log: {
      info: sinon.stub(),
      warn: sinon.stub(),
      error: sinon.stub()
    }
  };
}

describe('Index', function() {
  describe('@constructor', function() {
    it('will set rate limiter options', function() {
      var options = {};
      var node = testNode();
      var index = new InsightAPI({
        rateLimiterOptions: options,
        node: node
      });
      index.rateLimiterOptions.should.equal(options);
    });
    it('will set disable rate limiter option', function() {
      var node = testNode();
      var index = new InsightAPI({
        disableRateLimiter: true,
        node: node
      });
      index.disableRateLimiter.should.equal(true);
    });
  });
  describe('#_getRateLimiter', function() {
    it('will pass options to rate limiter', function() {
      var options = {
        whitelist: ['127.0.0.1']
      };
      var node = testNode();
      var index = new InsightAPI({
        rateLimiterOptions: options,
        node: node
      });
      var limiter = index._getRateLimiter();
      limiter.whitelist.should.eql(['127.0.0.1']);
    });
  });
  describe('#cache', function() {
    it('will set cache control header', function(done) {
      var node = testNode();
      var index = new InsightAPI({
        enableCache: true,
        node: node
      });
      var req = {};
      var res = {
        header: sinon.stub()
      };
      var middle = index.cache(10);
      middle(req, res, function() {
        res.header.callCount.should.equal(1);
        res.header.args[0][0].should.equal('Cache-Control');
        res.header.args[0][1].should.equal('public, max-age=10');
        done();
      });
    });
    it('will NOT set cache control header', function(done) {
      var node = testNode();
      var index = new InsightAPI({
        enableCache: false,
        node: node
      });
      var req = {};
      var res = {
        header: sinon.stub()
      };
      var middle = index.cache(10);
      middle(req, res, function() {
        res.header.callCount.should.equal(0);
        done();
      });
    });
  });
  describe('#cacheShort', function() {
    it('will set SHORT cache control header', function(done) {
      var node = testNode();
      var index = new InsightAPI({
        enableCache: true,
        cacheShortSeconds: 35,
        node: node
      });
      var req = {};
      var res = {
        header: sinon.stub()
      };
      var middle = index.cacheShort();
      middle(req, res, function() {
        res.header.callCount.should.equal(1);
        res.header.args[0][0].should.equal('Cache-Control');
        res.header.args[0][1].should.equal('public, max-age=35');
        done();
      });
    });
    it('will set SHORT DEFAULT cache control header', function(done) {
      var node = testNode();
      var index = new InsightAPI({
        enableCache: true,
        node: node
      });
      var req = {};
      var res = {
        header: sinon.stub()
      };
      var middle = index.cacheShort();
      middle(req, res, function() {
        res.header.callCount.should.equal(1);
        res.header.args[0][0].should.equal('Cache-Control');
        res.header.args[0][1].should.equal('public, max-age=30');
        done();
      });
    });
  });
  describe('#cacheLong', function() {
    it('will set LONG cache control header', function(done) {
      var node = testNode();
      var index = new InsightAPI({
        enableCache: true,
        cacheLongSeconds: 86400000,
        node: node
      });
      var req = {};
      var res = {
        header: sinon.stub()
      };
      var middle = index.cacheLong();
      middle(req, res, function() {
        res.header.callCount.should.equal(1);
        res.header.args[0][0].should.equal('Cache-Control');
        res.header.args[0][1].should.equal('public, max-age=86400000');
        done();
      });
    });
    it('will set LONG DEFAULT cache control header', function(done) {
      var node = testNode();
      var index = new InsightAPI({
        enableCache: true,
        node: node
      });
      var req = {};
      var res = {
        header: sinon.stub()
      };
      var middle = index.cacheLong();
      middle(req, res, function() {
        res.header.callCount.should.equal(1);
        res.header.args[0][0].should.equal('Cache-Control');
        res.header.args[0][1].should.equal('public, max-age=86400');
        done();
      });
    });
  });
  describe('without a db config', function() {
    it('will warn that dbConfig is empty', function() {
      var node = testNode();
      var index = new InsightAPI({
        node: node
      });
      should.not.exist(index.db);
      node.log.warn.callCount.should.equal(1);
      node.log.warn.args[0][0].should.equal('dbConfig is empty');
    });
  });
  describe('#setupRoutes', function() {
    it('will use rate limiter by default', function() {
      var node = testNode();
      var index = new InsightAPI({
        node: node
      });
      var middlewareFunc = sinon.stub();
      var middleware = sinon.stub().returns(middlewareFunc);
      var limiter = {
        middleware: middleware
      };
      index._getRateLimiter = sinon.stub().returns(limiter);
      var use = sinon.stub();
      var app = {
        use: use,
        get: sinon.stub(),
        param: sinon.stub(),
        post: sinon.stub()
      };
      index.setupRoutes(app);
      use.callCount.should.be.above(0);
      use.args[0][0].should.equal(middlewareFunc);
      middleware.callCount.should.equal(1);
    });
    it('will NOT use rate limiter if disabled', function() {
      var node = testNode();
      var index = new InsightAPI({
        node: node,
        disableRateLimiter: true
      });
      index._getRateLimiter = sinon.stub();
      var use = sinon.stub();
      var app = {
        use: use,
        get: sinon.stub(),
        param: sinon.stub(),
        post: sinon.stub()
      };
      index.setupRoutes(app);
      index._getRateLimiter.callCount.should.equal(0);
    });
  });
  describe('published events', function() {
    var bitcore = require('@runonflux/bitcore-lib');
    var rawTx = '01000000011760bc271a397bfb65b7506d430d96ebb1faff467ed957516238a9670e806a86010000006b483045022100f0056ae68a34cdb4194d424bd727c18f82653bca2a198e0d55ab6b4ee88bbdb902202a5745af4f72a5dbdca1e3d683af4667728a8b20e8001e0f8308a4d329ce3f96012102f3af6e66b61c9d99c74d9a9c3c1bec014a8c05d28bf339c8f5f395b5ce319e7dffffffff02c8af00000000000017a9148083b541ea15f1d18c5ca5e1fd47f9035cce24ed87206b1e00000000001976a91410a0e70cd91a45e0e6e409e227ab285bd61592b188ac00000000';

    function eventNode() {
      var node = testNode();
      node.network = bitcore.Networks.livenet;
      node.services = {bitcoind: {height: 1000}};
      return node;
    }

    it('will publish the inv and flux rooms', function() {
      var index = new InsightAPI({node: eventNode()});
      var events = index.getPublishEvents();
      events.map(function(e) { return [e.name, e.extraEvents]; }).should.eql([
        ['inv', ['tx', 'block', 'info', 'markets_info']],
        ['flux', ['flux/tx', 'flux/block']]
      ]);
      var emitter = new EventEmitter();
      events[0].subscribe(emitter);
      events[0].subscribe(emitter);
      index.subscriptions.inv.length.should.equal(1);
      events[0].unsubscribe.call(index, emitter);
      index.subscriptions.inv.length.should.equal(0);
    });

    it('will send a new transaction to both rooms', function() {
      var index = new InsightAPI({node: eventNode()});
      var inv = new EventEmitter();
      var flux = new EventEmitter();
      var invTx = sinon.stub();
      var fluxTx = sinon.stub();
      inv.on('tx', invTx);
      flux.on('flux/tx', fluxTx);
      index.subscribe(inv, 'inv');
      index.subscribe(flux, 'flux');
      index.transactionEventHandler(Buffer.from(rawTx, 'hex'));
      invTx.args[0][0].should.eql({
        txid: 'a15a7c257af596704390d345ff3ea2eed4cd02ce8bfb8afb700bff82257e49fb',
        valueOut: 0.02038504,
        vout: [
          {'t3WH9CfgEptRV5faq5Psg2d6Uz2UdaBTrvK': 45000},
          {'t1KPXa7J1vmugFm4X9XkjuL6iDFyLYjpQsj': 1993504}
        ],
        isRBF: false
      });
      fluxTx.args[0][0].vin.should.eql([{address: 't1KPXa7J1vmugFm4X9XkjuL6iDFyLYjpQsj'}]);
    });

    it('will send a new block with its transactions to the flux room', function(done) {
      var index = new InsightAPI({node: eventNode()});
      var block = {hash: 'ab', tx: ['t1', 't2']};
      index.blocksController.getBlockByHash = sinon.stub().callsArgWith(1, null, block);
      index.transactionService.getDetailedTransaction = function(txid, callback) {
        callback(null, {txid: txid});
      };
      index.txController.transformTransaction = function(tx, callback) {
        callback(null, {transformed: tx.txid});
      };
      var inv = new EventEmitter();
      var invBlock = sinon.stub();
      inv.on('block', invBlock);
      index.subscribe(inv, 'inv');
      var flux = new EventEmitter();
      flux.on('flux/block', function(data) {
        invBlock.args[0][0].should.equal('00ff');
        data.should.eql({
          block: block,
          transactions: [{transformed: 't1'}, {transformed: 't2'}]
        });
        done();
      });
      index.subscribe(flux, 'flux');
      index.blockEventHandler(Buffer.from('00ff', 'hex'));
    });
  });
});
