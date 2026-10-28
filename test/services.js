'use strict';

var should = require('should');
var sinon = require('sinon');
var bitcore = require('@runonflux/bitcore-lib');
var StatisticService = require('../services/StatisticService');
var AddressBalanceService = require('../services/AddressBalanceService');
var AddressBlocksMinedService = require('../services/AddressBlocksMinedService');
var TxController = require('../lib/transactions');
var StatisticsController = require('../lib/statistics');
var UtilsController = require('../lib/utils');

var POOL_ADDRESS = 't1RpbpUWos9fNbAFPXy9fAm1jVqYYBUi1ou';
var OTHER_ADDRESS = 't1KPXa7J1vmugFm4X9XkjuL6iDFyLYjpQsj';

function testLog() {
  return {
    info: sinon.stub(),
    warn: sinon.stub(),
    error: sinon.stub()
  };
}

function nowSeconds() {
  return Math.round(Date.now() / 1000);
}

describe('StatisticService', function() {

  function service(height) {
    var node = {
      log: testLog(),
      network: bitcore.Networks.livenet,
      services: {
        bitcoind: {
          height: height
        }
      }
    };
    return new StatisticService({
      node: node,
      txController: new TxController({node: node}),
      statisticDayRepository: {},
      lastBlockRepository: {}
    });
  }

  function blockData(height, time, minedBy) {
    return {
      blockJson: {
        height: height,
        time: time,
        difficulty: 1000 + (height % 2),
        tx: ['a', 'b', 'c']
      },
      subsidy: 14 * 1e8,
      fee: 1000,
      totalOutputs: 5 * 1e8,
      minedBy: minedBy,
      netHash: 200
    };
  }

  describe('#process24hBlock and #getTotal', function() {
    it('will total the blocks of the last 24 hours', function(done) {
      var s = service(2100003);
      var t = nowSeconds() - 600;
      s.process24hBlock(blockData(2100001, t, POOL_ADDRESS), function() {
        s.process24hBlock(blockData(2100002, t + 60, POOL_ADDRESS), function() {
          s.process24hBlock(blockData(2100003, t + 90, OTHER_ADDRESS), function() {
            s.lastCheckedBlock = 2100003;
            s.getTotal(function(err, total) {
              should.not.exist(err);
              total.should.eql({
                n_blocks_mined: 3,
                time_between_blocks: 45,
                mined_currency_amount: 3 * 14 * 1e8,
                transaction_fees: 3000,
                number_of_transactions: 9,
                outputs_volume: 15 * 1e8,
                difficulty: '1001',
                network_hash_ps: 200,
                blocks_by_pool: [
                  {
                    address: POOL_ADDRESS,
                    poolName: 'CoinBlockers',
                    url: 'https://zel.coinblockers.com/',
                    blocks_found: 2,
                    percent_total: '66.67'
                  },
                  {
                    address: OTHER_ADDRESS,
                    poolName: 'Unknown',
                    url: '',
                    blocks_found: 1,
                    percent_total: '33.33'
                  }
                ]
              });
              s.getPoolsLastHour(function(err, lastHour) {
                should.not.exist(err);
                lastHour.n_blocks_mined.should.equal(3);
                lastHour.blocks_by_pool.length.should.equal(2);
                lastHour.blocks_by_pool[0].blocks_found.should.equal(2);
                done();
              });
            });
          });
        });
      });
    });

    it('will not keep a block older than 24 hours', function(done) {
      var s = service(2100001);
      s.process24hBlock(blockData(2100001, nowSeconds() - 86400 - 60, POOL_ADDRESS), function() {
        should.not.exist(s.blocksByHeight.get(2100001));
        should.not.exist(s.minedByByHeight1h.get(2100001));
        s.lastCheckedBlock = 2100001;
        s.getTotal(function(err, total) {
          total.n_blocks_mined.should.equal(0);
          done();
        });
      });
    });

    it('will keep a block between 1 and 24 hours old only in the 24 hour caches', function(done) {
      var s = service(2100001);
      s.process24hBlock(blockData(2100001, nowSeconds() - 7200, POOL_ADDRESS), function() {
        should.exist(s.blocksByHeight.get(2100001));
        should.not.exist(s.blocksByHeight1h.get(2100001));
        done();
      });
    });

    it('will expire a block once it is older than 24 hours', function(done) {
      var s = service(2100001);
      var almostADayAgo = (Date.now() / 1000) - 86400 + 0.05;
      s.process24hBlock(blockData(2100001, almostADayAgo, POOL_ADDRESS), function() {
        should.exist(s.blocksByHeight.get(2100001));
        setTimeout(function() {
          should.not.exist(s.blocksByHeight.get(2100001));
          should.not.exist(s.subsidyByBlockHeight.get(2100001));
          done();
        }, 150);
      });
    });
  });

  describe('#processPrevBlocks', function() {
    it('will walk down from the tip until a block is older than 24 hours', function(done) {
      var s = service(500);
      var t = nowSeconds();
      var times = {500: t - 30, 499: t - 60, 498: t - 90, 497: t - 86400 - 30};
      s.node.getJsonBlock = sinon.spy(function(height, callback) {
        callback(null, {height: height, time: times[height]});
      });
      s._getBlockInfo = function(height, callback) {
        callback(null, blockData(height, times[height], POOL_ADDRESS));
      };
      s.processPrevBlocks(500, function(err) {
        should.not.exist(err);
        s.node.getJsonBlock.args.map(function(a) { return a[0]; }).should.eql([500, 499, 498, 497]);
        should.exist(s.blocksByHeight.get(498));
        should.not.exist(s.blocksByHeight.get(497));
        done();
      });
    });

    it('will pass on an error', function(done) {
      var s = service(500);
      s.node.getJsonBlock = sinon.stub().callsArgWith(1, new Error('rpc'));
      s.processPrevBlocks(500, function(err) {
        err.message.should.equal('rpc');
        done();
      });
    });
  });

  describe('#updateOrCreateDay', function() {
    it('will add a block to a new day', function(done) {
      var s = service(2100000);
      var saved;
      s.statisticDayRepository = {
        getDay: sinon.stub().callsArgWith(1, null, null),
        createOrUpdateDay: function(date, day, callback) {
          saved = {date: date, day: day};
          callback();
        }
      };
      var key = new bitcore.PrivateKey('2222222222222222222222222222222222222222222222222222222222222222');
      var tx = new bitcore.Transaction();
      tx.uncheckedAddInput(new bitcore.Transaction.Input({
        prevTxId: '11'.repeat(32),
        outputIndex: 0,
        script: bitcore.Script.buildPublicKeyHashIn(key.publicKey, bitcore.crypto.ECDSA.sign(Buffer.alloc(32, 7), key))
      }));
      tx.addOutput(new bitcore.Transaction.Output({
        satoshis: 1000,
        script: bitcore.Script.buildPublicKeyHashOut(bitcore.Address(POOL_ADDRESS))
      }));
      var data = blockData(2100000, 1760000000, POOL_ADDRESS);
      data.block = {transactions: [tx]};
      s.updateOrCreateDay('2025-10-09', data, function(err) {
        should.not.exist(err);
        saved.date.getTime().should.equal(new Date('2025-10-09').getTime());
        var day = saved.day;
        day.totalTransactionFees.sum.toString().should.equal('1000');
        day.totalTransactionFees.count.toString().should.equal('1');
        day.totalBlocks.count.toString().should.equal('1');
        day.numberOfTransactions.count.toString().should.equal('3');
        day.totalOutputVolume.sum.toString().should.equal('500000000');
        day.difficulty.sum.should.eql(['1000']);
        day.netHash.sum.toString().should.equal('200');
        day.netHash.count.toString().should.equal('1');
        day.poolData.pool.should.eql([{minedby: POOL_ADDRESS, count: 1}]);
        day.supply.sum.toString().should.equal('41809872650000000');
        day.activeAddresses.addresses.should.eql([key.toAddress(bitcore.Networks.livenet).toString(), POOL_ADDRESS]);
        day.activeAddresses.count.should.equal(2);
        done();
      });
    });

    it('will add a block to an existing day', function(done) {
      var s = service(2100000);
      var saved;
      s.statisticDayRepository = {
        getDay: sinon.stub().callsArgWith(1, null, {
          totalTransactionFees: {sum: '500', count: '2'},
          numberOfTransactions: {count: '7'},
          totalOutputVolume: {sum: '100'},
          totalBlocks: {count: '2'},
          difficulty: {sum: ['900', '950']},
          supply: {sum: '1'},
          poolData: {pool: [{minedby: POOL_ADDRESS, count: 2}]},
          netHash: {sum: '400', count: '2'},
          date: new Date('2025-10-09'),
          activeAddresses: {addresses: [POOL_ADDRESS], count: 1}
        }),
        createOrUpdateDay: function(date, day, callback) {
          saved = day;
          callback();
        }
      };
      var data = blockData(2100000, 1760000000, POOL_ADDRESS);
      data.block = {transactions: []};
      s.updateOrCreateDay('2025-10-09', data, function(err) {
        should.not.exist(err);
        saved.totalTransactionFees.sum.toString().should.equal('1500');
        saved.totalTransactionFees.count.toString().should.equal('3');
        saved.numberOfTransactions.count.toString().should.equal('10');
        saved.totalOutputVolume.sum.toString().should.equal('500000100');
        saved.totalBlocks.count.toString().should.equal('3');
        saved.difficulty.sum.should.eql(['900', '950', '1000']);
        saved.netHash.sum.toString().should.equal('600');
        saved.poolData.pool.should.eql([{minedby: POOL_ADDRESS, count: 3}]);
        saved.activeAddresses.count.should.equal(1);
        done();
      });
    });
  });

  describe('daily statistics', function() {
    var stats = [
      {
        date: new Date('2025-10-09'),
        difficulty: {sum: ['10', '20', '20', '30']},
        netHash: {sum: '300', count: '4'},
        supply: {sum: '45120138000000000'},
        totalOutputVolume: {sum: '123456789'},
        numberOfTransactions: {count: '42'},
        totalBlocks: {count: '4'},
        totalTransactionFees: {sum: '12', count: '4'},
        activeAddresses: {addresses: ['a', 'b'], count: 2}
      },
      {
        date: new Date('2025-10-08'),
        difficulty: {sum: ['5', '6', '7']},
        netHash: {sum: '0', count: '0'},
        supply: {sum: '0'},
        totalOutputVolume: {sum: '0'},
        numberOfTransactions: {count: '0'},
        totalBlocks: {count: '0'},
        totalTransactionFees: {sum: '0', count: '0'}
      }
    ];

    function statsService() {
      var s = service(2100000);
      s.statisticDayRepository = {
        getStats: sinon.stub().callsArgWith(2, null, stats)
      };
      return s;
    }

    it('#getDifficulty', function(done) {
      statsService().getDifficulty(30, function(err, result) {
        should.not.exist(err);
        result.should.eql([
          {date: '2025-10-09', sum: '20'},
          {date: '2025-10-08', sum: '7'}
        ]);
        done();
      });
    });

    it('#getNetHash', function(done) {
      statsService().getNetHash(30, function(err, result) {
        result.should.eql([
          {date: '2025-10-09', sum: 75},
          {date: '2025-10-08', sum: 0}
        ]);
        done();
      });
    });

    it('#getSupply', function(done) {
      statsService().getSupply(30, function(err, result) {
        result.should.eql([
          {date: '2025-10-09', sum: '451201380'},
          {date: '2025-10-08', sum: '0'}
        ]);
        done();
      });
    });

    it('#getOutputs', function(done) {
      statsService().getOutputs(30, function(err, result) {
        result.should.eql([
          {date: '2025-10-09', sum: '1.23456789'},
          {date: '2025-10-08', sum: 0}
        ]);
        done();
      });
    });

    it('#getTransactions', function(done) {
      statsService().getTransactions(30, function(err, result) {
        result.should.eql([
          {date: '2025-10-09', transaction_count: 42, block_count: 4},
          {date: '2025-10-08', transaction_count: 0, block_count: 0}
        ]);
        done();
      });
    });

    it('#getActiveAddresses', function(done) {
      statsService().getActiveAddresses(30, function(err, result) {
        result.should.eql([
          {date: '2025-10-09', count: 2},
          {date: '2025-10-08', count: 0}
        ]);
        done();
      });
    });

    it('#getFees', function(done) {
      statsService().getFees(30, function(err, result) {
        result.should.eql([
          {date: '2025-10-09', fee: '0.00000003'},
          {date: '2025-10-08', fee: '0.00000000'}
        ]);
        done();
      });
    });

    it('#getStats asks for the given number of days up to today', function(done) {
      var s = statsService();
      s.getStats(7, function() {
        var from = s.statisticDayRepository.getStats.args[0][0];
        var to = s.statisticDayRepository.getStats.args[0][1];
        (to.getTime() - from.getTime()).should.be.within(7 * 86400000 - 3600000, 7 * 86400000 + 3600000);
        done();
      });
    });

    it('#getPools', function(done) {
      var s = service(2100000);
      s.statisticDayRepository = {
        getDay: sinon.stub().callsArgWith(1, null, {
          date: new Date('2025-10-09'),
          totalBlocks: {count: '4'},
          poolData: {pool: [{minedby: OTHER_ADDRESS, count: 1}, {minedby: POOL_ADDRESS, count: 3}]}
        })
      };
      s.getPools('2025-10-09', function(err, result) {
        should.not.exist(err);
        result.should.eql({
          date: '2025-10-09',
          block_count: 4,
          Pools: [
            {address: POOL_ADDRESS, poolName: 'CoinBlockers', url: 'https://zel.coinblockers.com/', blocks_found: 3, percent_total: '75.00'},
            {address: OTHER_ADDRESS, poolName: 'Unknown', url: '', blocks_found: 1, percent_total: '25.00'}
          ]
        });
        done();
      });
    });
  });

  describe('supply', function() {
    it('will give the supply at a proof of node height', function() {
      var s = service(2100000);
      s.getCirculatingSupply().toString().should.equal('418098726.5');
      s.getCirculatingSupplyAllChains().toString().should.equal('395476562.4991484');
      s.getTotalSupply().toString().should.equal('560000000');
      s.getTotalSupplyAllChains().toString().should.equal('560000000');
    });

    it('will give the supply at a proof of work height', function() {
      var s = service(1500000);
      s.getTotalSupply().toString().should.equal('440000000');
      s.getCirculatingSupply().toString().should.equal('397478750');
    });
  });
});

describe('AddressBalanceService', function() {

  function service() {
    var node = {
      log: testLog(),
      services: {
        bitcoind: {}
      }
    };
    return new AddressBalanceService({
      node: node,
      marketsService: {
        getInfo: sinon.stub().callsArgWith(0, null, {price: 0.5})
      },
      lastBlockRepository: {},
      addressBalanceRepository: {}
    });
  }

  it('#updateCacheIntervals will count balances per power of ten', function(done) {
    var s = service();
    s.addressBalanceRepository.getMaxBalance = sinon.stub().callsArgWith(0, null, {balance: 123.45});
    s.addressBalanceRepository.getInfoByInterval = sinon.spy(function(min, max, callback) {
      if (max === 1000) {
        return callback(null, [{_id: null, sum: 123.45, count: 1}]);
      }
      callback(null, []);
    });
    s.updateCacheIntervals(function(err) {
      should.not.exist(err);
      s.getIntervals(function(err, intervals) {
        intervals.map(function(i) { return [i.min, i.max, i.count, i.sum]; }).should.eql([
          [0, 0.001, 0, 0],
          [0.001, 0.01, 0, 0],
          [0.01, 0.1, 0, 0],
          [0.1, 1, 0, 0],
          [1, 10, 0, 0],
          [10, 100, 0, 0],
          [100, 1000, 1, 123.45]
        ]);
        done();
      });
    });
  });

  it('#updateCacheIntervals will clear nothing without balances', function(done) {
    var s = service();
    s.cacheIntervals = [{min: 0}];
    s.addressBalanceRepository.getMaxBalance = sinon.stub().callsArgWith(0, null, null);
    s.addressBalanceRepository.getInfoByInterval = sinon.stub();
    s.updateCacheIntervals(function(err) {
      should.not.exist(err);
      s.cacheIntervals.should.eql([]);
      s.addressBalanceRepository.getInfoByInterval.callCount.should.equal(0);
      done();
    });
  });

  it('#updateRicherThanCache will count addresses above each USD amount', function(done) {
    var s = service();
    s.addressBalanceRepository.getCountAddressesGreaterThan = sinon.spy(function(min, callback) {
      callback(null, Math.round(1000000 / min));
    });
    s.updateRicherThanCache(function(err) {
      should.not.exist(err);
      s.addressBalanceRepository.getCountAddressesGreaterThan.args.map(function(a) { return a[0]; })
        .should.eql([2, 200, 2000, 20000, 200000, 2000000, 20000000]);
      s.getRicherThan(function(err, items) {
        items[0].should.eql({amount_usd: 1, count_addresses: 500000});
        items.length.should.equal(7);
        s.richerThanInProcess.should.equal(false);
        done();
      });
    });
  });

  it('#updateRicherThanCache will list nothing without a price', function(done) {
    var s = service();
    s.marketsService.getInfo = sinon.stub().callsArgWith(0, null, {price: 0});
    s.addressBalanceRepository.getCountAddressesGreaterThan = sinon.stub();
    s.updateRicherThanCache(function(err) {
      should.not.exist(err);
      s.richerThanCache.should.eql([]);
      s.addressBalanceRepository.getCountAddressesGreaterThan.callCount.should.equal(0);
      done();
    });
  });

  it('#updateRichestAddressesList will keep the top 1000 balances', function(done) {
    var s = service();
    var top = [{address: POOL_ADDRESS, balance: 10}];
    s.addressBalanceRepository.getMaxBalances = sinon.stub().callsArgWith(1, null, top);
    s.updateRichestAddressesList(function(err) {
      should.not.exist(err);
      s.addressBalanceRepository.getMaxBalances.args[0][0].should.eql({limit: 1000});
      s.getRichestAddressesList(function(err, list) {
        list.should.equal(top);
        done();
      });
    });
  });

  it('#processBlock will store positive balances and remove empty ones', function(done) {
    var s = service();
    s.node.getBlockOverview = sinon.stub().callsArgWith(1, null, {height: 77, txids: ['t1', 't2']});
    s.node.getJsonRawTransaction = function(txid, callback) {
      if (txid === 't1') {
        return callback(null, {
          vin: [{address: POOL_ADDRESS}, {}],
          vout: [{scriptPubKey: {addresses: [OTHER_ADDRESS]}}]
        });
      }
      callback(null, {vin: [{address: OTHER_ADDRESS}], vout: [{scriptPubKey: {}}]});
    };
    s.node.getAddressBalance = function(address, options, callback) {
      callback(null, {balance: address === POOL_ADDRESS ? 123456789 : 0});
    };
    s.addressBalanceRepository.createOrUpdateBalance = sinon.stub().callsArgWith(1, null, {});
    s.addressBalanceRepository.removeBalanceByAddress = sinon.stub().callsArgWith(1, null, {});
    s.lastBlockRepository.updateOrAddLastBlock = sinon.stub().callsArgWith(2, null);
    s.processBlock(77, function(err) {
      should.not.exist(err);
      s.addressBalanceRepository.createOrUpdateBalance.args[0][0].should.eql({address: POOL_ADDRESS, balance: 1.23456789});
      s.addressBalanceRepository.removeBalanceByAddress.args[0][0].should.equal(OTHER_ADDRESS);
      s.lastBlockRepository.updateOrAddLastBlock.args[0].slice(0, 2).should.eql([77, 'ADDRESS_BALANCE']);
      done();
    });
  });

  it('#start will resume from the last processed block', function(done) {
    var s = service();
    s.lastBlockRepository.setLastBlockType = sinon.stub().callsArgWith(2, null);
    s.lastBlockRepository.getLastBlockByType = sinon.stub().callsArgWith(1, null, {last_block_number: 10});
    s.node.getInfo = sinon.stub().callsArgWith(0, null, {blocks: 10});
    s.node.services.bitcoind.on = sinon.stub();
    s.marketsService.on = sinon.stub();
    s._updateCaches = sinon.stub().callsArgWith(0, null);
    s.start(function(err) {
      should.not.exist(err);
      s.lastBlockRepository.setLastBlockType.args[0].slice(0, 2).should.eql(['ADDRESS_BALANCE', 0]);
      s.lastCheckedBlock.should.equal(10);
      s.lastTipHeight.should.equal(10);
      s.node.services.bitcoind.on.args[0][0].should.equal('tip');
      s.marketsService.on.args[0][0].should.equal('updated');
      done();
    });
  });

  it('#start will pass on a repository error', function(done) {
    var s = service();
    s.lastBlockRepository.setLastBlockType = sinon.stub().callsArgWith(2, new Error('db'));
    s.start(function(err) {
      err.message.should.equal('db');
      done();
    });
  });
});

describe('AddressBlocksMinedService', function() {
  it('#processBlock will count a block for the address paid the reward', function(done) {
    var node = {
      log: testLog(),
      getDetailedTransaction: sinon.stub().callsArgWith(1, null, {
        outputs: [
          {satoshis: 5625000000, address: POOL_ADDRESS},
          {satoshis: 1875000000, address: OTHER_ADDRESS}
        ]
      }),
      services: {
        bitcoind: {
          getJsonBlock: sinon.stub().callsArgWith(1, null, {height: 1000000, tx: ['coinbase']})
        }
      }
    };
    var repository = {createOrUpdateAddress: sinon.stub().callsArgWith(1, null)};
    var lastBlockRepository = {updateOrAddLastBlock: sinon.stub().callsArgWith(2, null)};
    var s = new AddressBlocksMinedService({
      node: node,
      addressBlocksMinedRepository: repository,
      lastBlockRepository: lastBlockRepository
    });
    s.processBlock(1000000, function(err) {
      should.not.exist(err);
      node.getDetailedTransaction.args[0][0].should.equal('coinbase');
      repository.createOrUpdateAddress.args[0][0].should.eql({address: POOL_ADDRESS});
      lastBlockRepository.updateOrAddLastBlock.args[0].slice(0, 2).should.eql([1000000, 'BLOCKS_MINED']);
      done();
    });
  });
});

describe('StatisticsController', function() {
  it('#getRichestAddressesList will join the blocks mined per address', function(done) {
    var controller = new StatisticsController({
      node: {log: testLog()},
      addressBalanceService: {
        getRichestAddressesList: sinon.stub().callsArgWith(0, null, [
          {address: POOL_ADDRESS, balance: 1000},
          {address: OTHER_ADDRESS, balance: 10}
        ])
      },
      addressBlocksMinedRepository: {
        getMinedBlocksByAddresses: sinon.stub().callsArgWith(1, null, [{address: POOL_ADDRESS, count: 12}])
      }
    });
    controller.getRichestAddressesList({}, {
      jsonp: function(data) {
        data.should.eql([
          {address: POOL_ADDRESS, blocks_mined: 12, balance: 1000},
          {address: OTHER_ADDRESS, blocks_mined: 0, balance: 10}
        ]);
        done();
      }
    });
  });

  it('#getTimeSpan will bound the number of days', function() {
    var controller = new StatisticsController({node: {log: testLog()}});
    controller.getTimeSpan({query: {}}).should.equal(365);
    controller.getTimeSpan({query: {days: 'all'}}).should.equal(730);
    controller.getTimeSpan({query: {days: '7'}}).should.equal(7);
    controller.getTimeSpan({query: {days: '5000'}}).should.equal(730);
    controller.getTimeSpan({query: {days: '-1'}}).should.equal(365);
  });
});

describe('UtilsController', function() {
  it('#estimateFee will map each block count to its fee', function(done) {
    var controller = new UtilsController({
      log: testLog(),
      services: {
        bitcoind: {
          estimateFee: function(n, callback) {
            callback(null, n / 1000);
          }
        }
      }
    });
    controller.estimateFee({query: {nbBlocks: '2,6'}}, {
      jsonp: function(data) {
        data.should.eql({2: 0.002, 6: 0.006});
        done();
      }
    });
  });

  it('#estimateFee will default to 2 blocks', function(done) {
    var controller = new UtilsController({
      log: testLog(),
      services: {
        bitcoind: {
          estimateFee: sinon.stub().callsArgWith(1, null, 0.0001)
        }
      }
    });
    controller.estimateFee({query: {}}, {
      jsonp: function(data) {
        data.should.eql({2: 0.0001});
        done();
      }
    });
  });
});
