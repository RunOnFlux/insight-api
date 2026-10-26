'use strict';

var should = require('should');
var sinon = require('sinon');
var proxyquire = require('proxyquire');
var http = require('http');
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var express = require('express');
var bodyParser = require('body-parser');
var bitcore = require('@runonflux/bitcore-lib');

var blocks = require('./data/blocks.json');
var expected = require('./data/routes.json');

var POW_HASH = 'd7a01346a72e4145813c71eccba5cf26f6814d4294357362103c4df4f41ac90f';
var COINBASE_TXID = '748e976f86ce4e9fff928cc1465bf91209989efc8602f0777968c153cba1f260';
var POOL_ADDRESS = 't1RpbpUWos9fNbAFPXy9fAm1jVqYYBUi1ou';
var NODE_ADDRESS = 't1KPXa7J1vmugFm4X9XkjuL6iDFyLYjpQsj';
var HEIGHT = 1000118;

function MarketsServiceStub() {
  EventEmitter.call(this);
}
util.inherits(MarketsServiceStub, EventEmitter);
MarketsServiceStub.prototype.getInfo = function(next) {
  next(null, {price: 0.5, price_btc: 0.000005, market_cap_usd: 1, total_volume_24h: 2, delta_24h: 3});
};

var detailedCoinbase = {
  hex: '01000000010000000000000000000000000000000000000000000000000000000000000000ffffffff040340420fffffffff0240b0464f010000001976a914572f9a21ca67e770836a7fd815e70301bd7494d188acc03ac26f000000001976a91410a0e70cd91a45e0e6e409e227ab285bd61592b188ac00000000',
  hash: COINBASE_TXID,
  version: 1,
  blockHash: POW_HASH,
  height: 1000000,
  blockTimestamp: 1600000000,
  coinbase: true,
  inputSatoshis: 0,
  outputSatoshis: 7500000000,
  feeSatoshis: 0,
  inputs: [{script: '0340420f', sequence: 4294967295}],
  outputs: [
    {
      satoshis: 5625000000,
      script: '76a914572f9a21ca67e770836a7fd815e70301bd7494d188ac',
      scriptAsm: 'OP_DUP OP_HASH160 572f9a21ca67e770836a7fd815e70301bd7494d1 OP_EQUALVERIFY OP_CHECKSIG',
      address: POOL_ADDRESS
    },
    {
      satoshis: 1875000000,
      script: '76a91410a0e70cd91a45e0e6e409e227ab285bd61592b188ac',
      scriptAsm: 'OP_DUP OP_HASH160 10a0e70cd91a45e0e6e409e227ab285bd61592b1 OP_EQUALVERIFY OP_CHECKSIG',
      address: NODE_ADDRESS,
      spentTxId: 'aa'.repeat(32),
      spentIndex: 0,
      spentHeight: 1000005
    }
  ],
  locktime: 0
};

var fluxnodes = [
  {collateral: 'COutPoint(' + 'bb'.repeat(32) + ', 0)', txhash: 'bb'.repeat(32), outidx: '0', ip: '10.0.0.1:16125', tier: 'CUMULUS', payment_address: NODE_ADDRESS},
  {collateral: 'COutPoint(' + 'cc'.repeat(32) + ', 1)', txhash: 'cc'.repeat(32), outidx: '1', ip: '10.0.0.2', tier: 'STRATUS', payment_address: POOL_ADDRESS}
];

function testNode() {
  var bitcoind = new EventEmitter();
  bitcoind.height = HEIGHT;
  bitcoind.tiphash = POW_HASH;
  bitcoind.getInfo = sinon.stub().callsArgWith(0, null, {
    version: 9000000, protocolVersion: 170020, blocks: HEIGHT, timeOffset: 0, connections: 8,
    proxy: '', difficulty: 12345.6, testnet: false, relayFee: 0.000001, errors: '', network: 'livenet', reward: 75
  });
  bitcoind.getMiningInfo = sinon.stub().callsArgWith(0, null, {difficulty: 12345.6, networkhashps: 987654});
  bitcoind.getBestBlockHash = sinon.stub().callsArgWith(0, null, POW_HASH);
  bitcoind.isSynced = sinon.stub().callsArgWith(0, null, true);
  bitcoind.syncPercentage = sinon.stub().callsArgWith(0, null, 99.99);
  bitcoind.getPeerInfo = sinon.stub().callsArgWith(0, null, {result: []});
  bitcoind.getBlockHeader = function(hashOrHeight, callback) {
    if (hashOrHeight === POW_HASH || hashOrHeight === 1000000) {
      return callback(null, {hash: POW_HASH, height: 1000000, chainWork: '00ff', confirmations: 119, nextHash: 'ee'.repeat(32)});
    }
    callback({code: -5, message: 'Block not found'});
  };
  bitcoind.getBlockHashesByTimestamp = sinon.stub().callsArgWith(2, null, [POW_HASH]);
  bitcoind.client = {
    getBlock: function(hash, callback) {
      callback(null, {result: {hash: POW_HASH, height: 1000000, size: 317, time: 1600000000, difficulty: 10366777.85869671, tx: [COINBASE_TXID], confirmations: 119}});
    }
  };
  bitcoind.estimateFee = function(n, callback) {
    callback(null, n / 10000);
  };
  bitcoind.viewdeterministiczelnodelist = function(callback) {
    callback(null, {result: fluxnodes, error: null, id: 7});
  };
  bitcoind.doslist = sinon.stub().callsArgWith(0, null, {result: [], error: null, id: 8});
  bitcoind.startlist = sinon.stub().callsArgWith(0, null, {result: [], error: null, id: 9});

  return {
    log: {info: sinon.stub(), warn: sinon.stub(), error: sinon.stub()},
    network: bitcore.Networks.livenet,
    services: {bitcoind: bitcoind},
    getAddressSummary: function(address, options, callback) {
      callback(null, {
        balance: 5625000000, totalReceived: 5625000000, totalSpent: 0, unconfirmedBalance: 0,
        appearances: 1, unconfirmedAppearances: 0, txids: [COINBASE_TXID]
      });
    },
    getAddressUnspentOutputs: function(addresses, options, callback) {
      callback(null, [{
        address: POOL_ADDRESS, txid: COINBASE_TXID, outputIndex: 0, timestamp: 1600000000,
        satoshis: 5625000000, script: '76a914572f9a21ca67e770836a7fd815e70301bd7494d188ac', height: 1000000
      }, {
        address: POOL_ADDRESS, txid: 'ef'.repeat(32), outputIndex: 1, timestamp: 1500000000,
        satoshis: 1000000000000, script: '76a914572f9a21ca67e770836a7fd815e70301bd7494d188ac', height: 900000
      }]);
    },
    getAddressHistory: function(addresses, options, callback) {
      callback(null, {totalCount: 1, items: [{tx: detailedCoinbase}]});
    },
    getAddressBalance: sinon.stub().callsArgWith(2, null, {balance: 5625000000, immature: 0}),
    getAddressesMempoolBalance: sinon.stub().callsArgWith(2, null, {unconfirmedBalance: 0}),
    getDetailedTransaction: function(txid, callback) {
      if (txid === COINBASE_TXID) {
        return callback(null, detailedCoinbase);
      }
      callback({code: -5, message: 'No information available about transaction'});
    },
    getTransaction: function(txid, callback) {
      if (txid === COINBASE_TXID) {
        return callback(null, bitcore.Transaction().fromBuffer(Buffer.from(detailedCoinbase.hex, 'hex')));
      }
      callback({code: -5, message: 'No information available about transaction'});
    },
    getBlockOverview: function(hash, callback) {
      callback(null, {txids: [COINBASE_TXID]});
    },
    getBlock: function(hash, callback) {
      if (!blocks[hash]) {
        return callback({code: -5, message: 'Block not found'});
      }
      callback(null, bitcore.Block.fromBuffer(Buffer.from(blocks[hash], 'hex')));
    },
    getRawBlock: function(hash, callback) {
      if (!blocks[hash]) {
        return callback({code: -5, message: 'Block not found'});
      }
      callback(null, Buffer.from(blocks[hash], 'hex'));
    },
    sendTransaction: function(rawtx, options, callback) {
      if (typeof options === 'function') {
        callback = options;
      }
      if (rawtx === 'bad') {
        return callback({code: -22, message: 'TX decode failed'});
      }
      callback(null, 'dd'.repeat(32));
    }
  };
}

function start(done) {
  var currencyRequest = sinon.stub().callsArgWith(2, null, {statusCode: 200}, JSON.stringify({quotes: {USD: {price: 0.4321}}}));
  var InsightAPI = proxyquire('../lib/index', {
    '../services/MarketsService': MarketsServiceStub,
    './currency': proxyquire('../lib/currency', {'../helpers/HttpHelper': {get: currencyRequest}})
  });
  var node = testNode();
  var insight = new InsightAPI({node: node, name: 'insight-api', routePrefix: 'api'});
  insight.statisticService.statisticDayRepository = {
    getStats: sinon.stub().callsArgWith(2, null, [{
      date: new Date('2020-09-13'),
      difficulty: {sum: ['10', '20', '20']},
      netHash: {sum: '300', count: '3'},
      supply: {sum: '39747875000000000'},
      totalOutputVolume: {sum: '123456789'},
      numberOfTransactions: {count: '42'},
      totalBlocks: {count: '3'},
      totalTransactionFees: {sum: '9', count: '3'},
      activeAddresses: {addresses: ['a', 'b'], count: 2}
    }]),
    getDay: sinon.stub().callsArgWith(1, null, {
      date: new Date('2020-09-13'),
      totalBlocks: {count: '3'},
      poolData: {pool: [{minedby: POOL_ADDRESS, count: 2}, {minedby: NODE_ADDRESS, count: 1}]}
    })
  };
  insight.addressBalanceService.cacheIntervals = [{max: 0.001, min: 0, count: 0, sum: 0}];
  insight.addressBalanceService.richerThanCache = [{amount_usd: 1, count_addresses: 10}];
  insight.addressBalanceService.richestAddressesListCache = [{address: POOL_ADDRESS, balance: 56.25}];
  insight.addressBlocksMinedRepository.getMinedBlocksByAddresses = sinon.stub().callsArgWith(1, null, [{address: POOL_ADDRESS, count: 3}]);

  var app = express();
  app.use(bodyParser.json());
  var sub = express();
  app.use('/' + insight.getRoutePrefix(), sub);
  insight.setupRoutes(sub, express);
  var server = http.createServer(app);
  server.listen(0, '127.0.0.1', function() {
    done(server);
  });
}

function call(port, r, callback) {
  var body = null;
  var headers = {};
  if (r.json) {
    body = JSON.stringify(r.json);
    headers['Content-Type'] = 'application/json';
  } else if (r.form) {
    body = r.form;
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }
  if (body !== null) {
    headers['Content-Length'] = Buffer.byteLength(body);
  }
  var req = http.request({host: '127.0.0.1', port: port, method: r.method || 'GET', path: r.path, headers: headers}, function(res) {
    var chunks = [];
    res.on('data', function(c) {
      chunks.push(c);
    });
    res.on('end', function() {
      callback(null, {
        status: res.statusCode,
        type: res.headers['content-type'] || null,
        cors: res.headers['access-control-allow-origin'] || null,
        rateLimit: res.headers['x-ratelimit-limit'] || null,
        body: Buffer.concat(chunks).toString('utf8')
      });
    });
  });
  req.on('error', callback);
  if (body !== null) {
    req.write(body);
  }
  req.end();
}

var requests = [
  {path: '/api/sync'},
  {path: '/api/status'},
  {path: '/api/status?q=getDifficulty'},
  {path: '/api/status?q=getBestBlockHash'},
  {path: '/api/status?q=getLastBlockHash'},
  {path: '/api/status?q=getMiningInfo'},
  {path: '/api/status?q=getPeerInfo'},
  {path: '/api/status?q=getFluxNodes'},
  {path: '/api/status?q=getZelNodes'},
  {path: '/api/peer'},
  {path: '/api/version'},
  {path: '/api/circulation'},
  {path: '/api/addr/' + POOL_ADDRESS},
  {path: '/api/addr/' + POOL_ADDRESS + '?noTxList=1&from=0&to=5'},
  {path: '/api/addr/notanaddress'},
  {path: '/api/addr/' + POOL_ADDRESS + '/utxo'},
  {path: '/api/addr/' + POOL_ADDRESS + '/balance'},
  {path: '/api/addr/' + POOL_ADDRESS + '/totalReceived'},
  {path: '/api/addr/' + POOL_ADDRESS + '/totalSent'},
  {path: '/api/addr/' + POOL_ADDRESS + '/unconfirmedBalance'},
  {path: '/api/addrs/' + POOL_ADDRESS + ',' + NODE_ADDRESS + '/utxo'},
  {path: '/api/addrs/' + POOL_ADDRESS + ',' + NODE_ADDRESS + '/unspent'},
  {path: '/api/addrs/' + POOL_ADDRESS + '/txs?from=0&to=5'},
  {path: '/api/addrs/' + POOL_ADDRESS + ',' + NODE_ADDRESS + '/balance'},
  {path: '/api/addrs/utxo', method: 'POST', form: 'addrs=' + POOL_ADDRESS},
  {path: '/api/addrs/utxo', method: 'POST', json: {addrs: POOL_ADDRESS + ',' + NODE_ADDRESS}},
  {path: '/api/addrs/txs', method: 'POST', json: {addrs: POOL_ADDRESS, from: 0, to: 2}},
  {path: '/api/addrs/txs', method: 'POST', form: 'addrs=' + POOL_ADDRESS + '&noAsm=1'},
  {path: '/api/tx/' + COINBASE_TXID},
  {path: '/api/tx/' + 'ab'.repeat(32)},
  {path: '/api/rawtx/' + COINBASE_TXID},
  {path: '/api/rawtx/' + 'ab'.repeat(32)},
  {path: '/api/txs?address=' + POOL_ADDRESS},
  {path: '/api/txs?block=' + POW_HASH},
  {path: '/api/txs'},
  {path: '/api/tx/send', method: 'POST', json: {rawtx: '0100'}},
  {path: '/api/tx/send', method: 'POST', form: 'rawtx=0100&allowAbsurdFees=true'},
  {path: '/api/tx/send', method: 'POST', json: {rawtx: 'bad'}},
  {path: '/api/block/' + POW_HASH},
  {path: '/api/block/' + 'ab'.repeat(32)},
  {path: '/api/block/abcd'},
  {path: '/api/rawblock/' + POW_HASH},
  {path: '/api/block-index/1000000'},
  {path: '/api/blocks?blockDate=2020-09-13&limit=5'},
  {path: '/api/blocks?blockDate=13-09-2020'},
  {path: '/api/supply'},
  {path: '/api/total-supply'},
  {path: '/api/circulating-supply'},
  {path: '/api/statistics/total-supply'},
  {path: '/api/statistics/circulating-supply?format=object'},
  {path: '/api/statistics/main-chain-circulating-locked'},
  {path: '/api/statistics/supply?days=7'},
  {path: '/api/statistics/fees'},
  {path: '/api/statistics/network-hash'},
  {path: '/api/statistics/pools?date=2020-09-13'},
  {path: '/api/statistics/pools?date=2020-9-13x'},
  {path: '/api/statistics/pools-last-hour'},
  {path: '/api/statistics/transactions?days=all'},
  {path: '/api/statistics/outputs'},
  {path: '/api/statistics/difficulty'},
  {path: '/api/statistics/total'},
  {path: '/api/statistics/balance-intervals'},
  {path: '/api/statistics/richer-than'},
  {path: '/api/statistics/richest-addresses-list'},
  {path: '/api/statistics/active-addresses'},
  {path: '/api/messages/verify'},
  {path: '/api/messages/verify', method: 'POST', form: 'address=' + POOL_ADDRESS + '&signature=abc&message=hi'},
  {path: '/api/utils/estimatefee?nbBlocks=2,6'},
  {path: '/api/zelnode/listfluxnodes'},
  {path: '/api/fluxnode/listfluxnodes/10.0.0.1:16125'},
  {path: '/api/fluxnode/listfluxnodes/' + 'cc'.repeat(32) + '-1'},
  {path: '/api/fluxnode/listfluxnodes', method: 'POST', json: {filter: 'STRATUS,' + 'bb'.repeat(32) + '-0'}},
  {path: '/api/fluxnode/listfluxnodes?filter=CUMULUS'},
  {path: '/api/fluxnode/addrs/' + POOL_ADDRESS + '/utxo'},
  {path: '/api/fluxnode/doslist'},
  {path: '/api/fluxnode/startlist'},
  {path: '/api/currency'},
  {path: '/api/markets/info'},
  {path: '/api/nothing/here'},
  {path: '/api/sync', method: 'OPTIONS'}
];

// Each request's status, content type, CORS and rate limit headers and body must match
// test/data/routes.json. RECORD_ROUTES=1 rewrites that file from the responses instead.
describe('HTTP routes', function() {
  var server;
  var port;

  before(function(done) {
    start(function(s) {
      server = s;
      port = s.address().port;
      done();
    });
  });

  after(function(done) {
    server.close(done);
  });

  requests.forEach(function(r) {
    var name = (r.method || 'GET') + ' ' + r.path + (r.json ? ' json ' + JSON.stringify(r.json) : '') + (r.form ? ' form ' + r.form : '');
    it(name, function(done) {
      call(port, r, function(err, response) {
        should.not.exist(err);
        if (process.env.RECORD_ROUTES) {
          expected[name] = response;
          return done();
        }
        should.exist(expected[name]);
        should(response).eql(expected[name]);
        done();
      });
    });
  });

  after(function() {
    if (process.env.RECORD_ROUTES) {
      require('fs').writeFileSync(__dirname + '/data/routes.json', JSON.stringify(expected, null, 2) + '\n');
    }
  });
});
