'use strict';

var should = require('should');
var sinon = require('sinon');
var BlockController = require('../lib/blocks');
var TransactionService = require('../services/TransactionService');
var bitcore = require('@runonflux/bitcore-lib');

var blocks = require('./data/blocks.json');

var POW_HASH = 'd7a01346a72e4145813c71eccba5cf26f6814d4294357362103c4df4f41ac90f';
var PON_HASH = '7ebd495aa3403d635b5c3e52298b2e1b444c59db4de5cf2f939ef513d7245dc4';
var POOL_ADDRESS = 't1RpbpUWos9fNbAFPXy9fAm1jVqYYBUi1ou';
var NODE_ADDRESS = 't1KPXa7J1vmugFm4X9XkjuL6iDFyLYjpQsj';

var blockIndexes = {};
blockIndexes[POW_HASH] = {
  hash: POW_HASH,
  chainWork: '0000000000000000000000000000000000000000000000000000a1b2c3d4e5f6',
  prevHash: '1111111111111111111111111111111111111111111111111111111111111111',
  nextHash: '000000000001e866a8057cde0c650796cb8a59e0e6038dc31c69d7ca6649627d',
  confirmations: 119,
  height: 1000000
};
blockIndexes[PON_HASH] = {
  hash: PON_HASH,
  chainWork: '0000000000000000000000000000000000000000000000000000a1b2c3d4e5f7',
  prevHash: '4444444444444444444444444444444444444444444444444444444444444444',
  confirmations: 2,
  height: 2100000
};
blockIndexes[1000000] = blockIndexes[POW_HASH];

var coinbaseDetails = {
  '748e976f86ce4e9fff928cc1465bf91209989efc8602f0777968c153cba1f260': {
    outputs: [
      {satoshis: 5625000000, address: POOL_ADDRESS},
      {satoshis: 1875000000, address: NODE_ADDRESS}
    ]
  },
  'ff4db8b0dfa5b10ae1cf0c4ffebc24478570d2d59f36f561668d2d97946bb1a5': {
    outputs: [
      {satoshis: 1400000000, address: NODE_ADDRESS}
    ]
  }
};

// The JSON a client receives for a response body.
function wire(data) {
  return JSON.parse(JSON.stringify(data));
}

function blockNode(height) {
  var node = {
    log: {error: sinon.stub()},
    getBlock: function(hash, callback) {
      callback(null, bitcore.Block.fromBuffer(Buffer.from(blocks[hash], 'hex')));
    },
    getRawBlock: function(hash, callback) {
      callback(null, Buffer.from(blocks[hash], 'hex'));
    },
    getDetailedTransaction: function(txid, callback) {
      callback(null, coinbaseDetails[txid]);
    },
    services: {
      bitcoind: {
        getBlockHeader: function(hash, callback) {
          callback(null, blockIndexes[hash]);
        },
        height: height
      }
    }
  };
  sinon.spy(node, 'getBlock');
  return node;
}

function controllerFor(node) {
  return new BlockController({node: node, transactionService: new TransactionService({node: node})});
}

describe('Blocks', function() {
  describe('/block/:blockHash route', function() {
    var powInsight = {
      hash: POW_HASH,
      size: 317,
      height: 1000000,
      version: 4,
      merkleroot: '748e976f86ce4e9fff928cc1465bf91209989efc8602f0777968c153cba1f260',
      tx: ['748e976f86ce4e9fff928cc1465bf91209989efc8602f0777968c153cba1f260'],
      time: 1600000000,
      bits: '1c0cf267',
      difficulty: 10366777.85869671,
      chainwork: '0000000000000000000000000000000000000000000000000000a1b2c3d4e5f6',
      confirmations: 119,
      previousblockhash: '1111111111111111111111111111111111111111111111111111111111111111',
      nextblockhash: '000000000001e866a8057cde0c650796cb8a59e0e6038dc31c69d7ca6649627d',
      reward: 75,
      isMainChain: true,
      minedBy: POOL_ADDRESS,
      poolInfo: {
        poolName: 'CoinBlockers',
        url: 'https://zel.coinblockers.com/'
      },
      isPON: false,
      blockType: 'Proof of Work',
      nonce: '2222222222222222222222222222222222222222222222222222222222222222',
      solution: '33333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333'
    };

    it('proof of work block data should be correct', function(done) {
      var controller = controllerFor(blockNode(1000118));
      var req = {
        params: {
          blockHash: POW_HASH
        }
      };
      controller.block(req, {}, function() {
        should(wire(req.block)).eql(powInsight);
        done();
      });
    });

    it('proof of node block data should be correct', function(done) {
      var controller = controllerFor(blockNode(2100001));
      var req = {
        params: {
          blockHash: PON_HASH
        }
      };
      controller.block(req, {}, function() {
        should(wire(req.block)).eql({
          hash: PON_HASH,
          size: 300,
          height: 2100000,
          version: 100,
          merkleroot: 'ff4db8b0dfa5b10ae1cf0c4ffebc24478570d2d59f36f561668d2d97946bb1a5',
          tx: ['ff4db8b0dfa5b10ae1cf0c4ffebc24478570d2d59f36f561668d2d97946bb1a5'],
          time: 1760000000,
          bits: '1f07ffff',
          difficulty: 1,
          chainwork: '0000000000000000000000000000000000000000000000000000a1b2c3d4e5f7',
          confirmations: 2,
          previousblockhash: '4444444444444444444444444444444444444444444444444444444444444444',
          reward: 14,
          isMainChain: true,
          minedBy: NODE_ADDRESS,
          poolInfo: {},
          isPON: true,
          blockType: 'Proof of Node',
          nodesCollateral: {
            hash: '5555555555555555555555555555555555555555555555555555555555555555',
            index: 0
          },
          blockSignature: '66'.repeat(65)
        });
        done();
      });
    });

    it('will serve a block with 6 or more confirmations from the cache', function(done) {
      var node = blockNode(1000118);
      var controller = controllerFor(node);
      controller.getBlockByHash(POW_HASH, function(err, first) {
        should.not.exist(err);
        first.confirmations.should.equal(119);
        node.services.bitcoind.height = 1000200;
        controller.getBlockByHash(POW_HASH, function(err, second) {
          should.not.exist(err);
          node.getBlock.callCount.should.equal(1);
          second.confirmations.should.equal(201);
          second.hash.should.equal(POW_HASH);
          done();
        });
      });
    });

    it('will not cache a block with fewer than 6 confirmations', function(done) {
      var node = blockNode(2100001);
      var controller = controllerFor(node);
      controller.getBlockByHash(PON_HASH, function(err) {
        should.not.exist(err);
        controller.getBlockByHash(PON_HASH, function(err) {
          should.not.exist(err);
          node.getBlock.callCount.should.equal(2);
          done();
        });
      });
    });

    it('will answer 404 for an unknown block', function() {
      var node = blockNode(1000118);
      node.getBlock = sinon.stub().callsArgWith(1, {code: -5, message: 'Block not found'});
      var controller = controllerFor(node);
      var send = sinon.stub();
      var res = {status: sinon.stub().returns({send: send})};
      var next = sinon.stub();
      controller.block({params: {blockHash: POW_HASH}}, res, next);
      next.callCount.should.equal(0);
      res.status.args[0][0].should.equal(404);
      send.args[0][0].should.equal('Not found');
    });

    it('will answer 404 for a hash that is not 64 hex characters', function() {
      var controller = controllerFor(blockNode(1000118));
      var send = sinon.stub();
      var res = {status: sinon.stub().returns({send: send})};
      var next = sinon.stub();
      controller.checkBlockHash({params: {blockHash: 'abcd'}}, res, next);
      next.callCount.should.equal(0);
      res.status.args[0][0].should.equal(404);
    });
  });

  describe('/rawblock/:blockHash route', function() {
    it('should give the raw block hex', function(done) {
      var controller = controllerFor(blockNode(1000118));
      var req = {params: {blockHash: POW_HASH}};
      controller.rawBlock(req, {}, function() {
        req.rawBlock.should.eql({rawblock: blocks[POW_HASH]});
        done();
      });
    });
  });

  describe('/blocks route', function() {
    var hashes = [
      '0000000000000000000000000000000000000000000000000000000000000003',
      '0000000000000000000000000000000000000000000000000000000000000002',
      '0000000000000000000000000000000000000000000000000000000000000001',
      '0000000000000000000000000000000000000000000000000000000000000004'
    ];

    var rpcBlocks = {};
    hashes.forEach(function(hash, i) {
      rpcBlocks[hash] = {
        hash: hash,
        height: 1000000 + i,
        size: 1500 + i,
        time: 1600000000 + (60 * i),
        difficulty: 12345.5 + i,
        tx: ['748e976f86ce4e9fff928cc1465bf91209989efc8602f0777968c153cba1f260', 'aa'],
        confirmations: i === 1 ? -1 : 10
      };
    });

    function listNode() {
      var node = blockNode(1000100);
      node.services.bitcoind.getBlockHashesByTimestamp = sinon.stub().callsArgWith(2, null, hashes.slice());
      node.services.bitcoind.client = {
        getBlock: sinon.spy(function(hash, callback) {
          callback(null, {result: rpcBlocks[hash]});
        })
      };
      return node;
    }

    function summary(hash) {
      var b = rpcBlocks[hash];
      return {
        height: b.height,
        size: b.size,
        hash: b.hash,
        time: b.time,
        difficulty: b.difficulty,
        txlength: 2,
        poolInfo: {
          poolName: 'CoinBlockers',
          url: 'https://zel.coinblockers.com/'
        },
        isMainChain: true,
        minedBy: POOL_ADDRESS
      };
    }

    it('should list main chain blocks of the day, highest first', function(done) {
      var node = listNode();
      var controller = controllerFor(node);
      var req = {
        query: {
          limit: 2,
          blockDate: '2020-09-13'
        }
      };
      var res = {
        jsonp: function(data) {
          should(wire(data)).eql({
            blocks: [summary(hashes[3]), summary(hashes[2])],
            length: 2,
            pagination: {
              next: '2020-09-14',
              prev: '2020-09-12',
              currentTs: 1600041599,
              current: '2020-09-13',
              isToday: false,
              more: true,
              moreTs: rpcBlocks[hashes[2]].time
            }
          });
          node.services.bitcoind.getBlockHashesByTimestamp.args[0][0].should.equal(1600041600);
          node.services.bitcoind.getBlockHashesByTimestamp.args[0][1].should.equal(1599955200);
          done();
        }
      };
      controller.list(req, res);
    });

    it('should skip blocks off the main chain and report no more', function(done) {
      var controller = controllerFor(listNode());
      var req = {
        query: {
          limit: 10,
          blockDate: '2020-09-13'
        }
      };
      var res = {
        jsonp: function(data) {
          should(wire(data)).eql({
            blocks: [summary(hashes[3]), summary(hashes[2]), summary(hashes[0])],
            length: 3,
            pagination: {
              next: '2020-09-14',
              prev: '2020-09-12',
              currentTs: 1600041599,
              current: '2020-09-13',
              isToday: false,
              more: false
            }
          });
          done();
        }
      };
      controller.list(req, res);
    });

    it('will serve summaries of blocks with 6 or more confirmations from the cache', function(done) {
      var node = listNode();
      var controller = controllerFor(node);
      var req = {
        query: {
          limit: 10,
          blockDate: '2020-09-13'
        }
      };
      controller.list(req, {
        jsonp: function(first) {
          node.services.bitcoind.client.getBlock.callCount.should.equal(4);
          controller.list(req, {
            jsonp: function(second) {
              node.services.bitcoind.client.getBlock.callCount.should.equal(4);
              should(wire(second)).eql(wire(first));
              done();
            }
          });
        }
      });
    });

    it('will reject a date not in yyyy-mm-dd format', function() {
      var controller = controllerFor(listNode());
      var send = sinon.stub();
      var res = {status: sinon.stub().returns({send: send})};
      controller.list({query: {blockDate: '13-09-2020'}}, res);
      res.status.args[0][0].should.equal(503);
      send.args[0][0].should.equal('Please use yyyy-mm-dd format');
    });
  });

  describe('/block-index/:height route', function() {
    it('should have correct data', function(done) {
      var controller = controllerFor(blockNode(1000118));
      var req = {
        params: {
          height: '1000000'
        }
      };
      var res = {
        jsonp: function(data) {
          should(data).eql({
            blockHash: POW_HASH
          });
          done();
        }
      };
      controller.blockIndex(req, res);
    });
  });

  describe('#getBlockReward', function() {
    var controller = controllerFor(blockNode(0));
    var cases = [
      [0, 0],
      [2, 13020000 * 1e8],
      [2499, 7494000000],
      [4999, 14997000000],
      [100000, 150 * 1e8],
      [1000000, 75 * 1e8],
      [1400000, 37.5 * 1e8],
      [2019999, 37.5 * 1e8],
      [2020000, 14 * 1e8]
    ];

    cases.forEach(function(c) {
      it('should give a block reward of ' + c[1] + ' at height ' + c[0], function(done) {
        controller.getBlockRewardr(c[0]).should.equal(c[1]);
        controller.getBlockReward(c[0], function(err, reward) {
          should.not.exist(err);
          reward.should.equal(c[1]);
          done();
        });
      });
    });
  });
});
