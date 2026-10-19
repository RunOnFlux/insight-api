'use strict';

var should = require('should');
var PonHelper = require('../helpers/PonHelper');
var SupplyHelper = require('../helpers/SupplyHelper');
var StatisticService = require('../services/StatisticService');
var AddressBlocksMinedService = require('../services/AddressBlocksMinedService');
var BlockController = require('../lib/blocks');
var StatusController = require('../lib/status');

// first heights with 1, 2 and the maximum (20) reductions
var FIRST_REDUCTION = 3071200;
var SECOND_REDUCTION = 4122400;
var MAX_REDUCTION = PonHelper.PON_ACTIVATION_HEIGHT + PonHelper.PON_MAX_REDUCTIONS * PonHelper.PON_REDUCTION_INTERVAL;

function nodeAtHeight(height) {
  return { services: { bitcoind: { height: height } } };
}

describe('PonHelper', function() {

  it('constants match fluxd mainnet', function() {
    PonHelper.PON_ACTIVATION_HEIGHT.should.equal(2020000);
    PonHelper.PON_INITIAL_SUBSIDY.should.equal(1400000000);
    PonHelper.PON_REDUCTION_INTERVAL.should.equal(1051200);
    PonHelper.PON_MAX_REDUCTIONS.should.equal(20);
    MAX_REDUCTION.should.equal(23044000);
  });

  describe('getPonReductions', function() {
    it('counts completed reduction intervals, capped at the maximum', function() {
      PonHelper.getPonReductions(2019999).should.equal(0);
      PonHelper.getPonReductions(2020000).should.equal(0);
      PonHelper.getPonReductions(FIRST_REDUCTION - 1).should.equal(0);
      PonHelper.getPonReductions(FIRST_REDUCTION).should.equal(1);
      PonHelper.getPonReductions(SECOND_REDUCTION - 1).should.equal(1);
      PonHelper.getPonReductions(SECOND_REDUCTION).should.equal(2);
      PonHelper.getPonReductions(MAX_REDUCTION - 1).should.equal(19);
      PonHelper.getPonReductions(MAX_REDUCTION).should.equal(20);
      PonHelper.getPonReductions(MAX_REDUCTION + 5 * PonHelper.PON_REDUCTION_INTERVAL).should.equal(20);
    });
  });

  describe('getPonSubsidySats', function() {
    it('is 0 before PON activation', function() {
      PonHelper.getPonSubsidySats(0).should.equal(0);
      PonHelper.getPonSubsidySats(2019999).should.equal(0);
    });

    it('is 14 FLUX until the first reduction', function() {
      PonHelper.getPonSubsidySats(2020000).should.equal(1400000000);
      PonHelper.getPonSubsidySats(3050836).should.equal(1400000000);
      PonHelper.getPonSubsidySats(FIRST_REDUCTION - 1).should.equal(1400000000);
    });

    it('is 12.6 FLUX after the first reduction', function() {
      PonHelper.getPonSubsidySats(FIRST_REDUCTION).should.equal(1260000000);
      PonHelper.getPonSubsidySats(SECOND_REDUCTION - 1).should.equal(1260000000);
    });

    it('is 11.34 FLUX after the second reduction', function() {
      PonHelper.getPonSubsidySats(SECOND_REDUCTION).should.equal(1134000000);
    });

    it('uses integer satoshi arithmetic and stops reducing after 20 reductions', function() {
      PonHelper.getPonSubsidySats(MAX_REDUCTION - 1).should.equal(189119237);
      PonHelper.getPonSubsidySats(MAX_REDUCTION).should.equal(170207313);
      PonHelper.getPonSubsidySats(MAX_REDUCTION + 1).should.equal(170207313);
      PonHelper.getPonSubsidySats(MAX_REDUCTION + PonHelper.PON_REDUCTION_INTERVAL).should.equal(170207313);
      PonHelper.getPonSubsidySats(100000000).should.equal(170207313);
    });
  });

  describe('getPonEmission', function() {
    it('is 0 before PON activation', function() {
      PonHelper.getPonEmission(0).toString(10).should.equal('0');
      PonHelper.getPonEmission(2019999).toString(10).should.equal('0');
    });

    it('counts the activation block', function() {
      PonHelper.getPonEmission(2020000).toString(10).should.equal('14');
    });

    it('equals 14 FLUX per block before the first reduction', function() {
      PonHelper.getPonEmission(3050836).toString(10).should.equal(String((3050836 - 2020000 + 1) * 14));
      PonHelper.getPonEmission(FIRST_REDUCTION - 1).toString(10).should.equal('14716800');
    });

    it('applies the reduced subsidy across reduction boundaries', function() {
      PonHelper.getPonEmission(FIRST_REDUCTION).toString(10).should.equal('14716812.6');
      PonHelper.getPonEmission(SECOND_REDUCTION - 1).toString(10).should.equal('27961920');
      PonHelper.getPonEmission(SECOND_REDUCTION).toString(10).should.equal('27961931.34');
      PonHelper.getPonEmission(MAX_REDUCTION - 1).toString(10).should.equal('129275806.616208');
      PonHelper.getPonEmission(MAX_REDUCTION).toString(10).should.equal('129275808.31828113');
      PonHelper.getPonEmission(MAX_REDUCTION + 1).toString(10).should.equal('129275810.02035426');
    });

    it('grows by exactly the block subsidy at every boundary', function() {
      var heights = [2020001, FIRST_REDUCTION - 1, FIRST_REDUCTION, FIRST_REDUCTION + 1,
        SECOND_REDUCTION - 1, SECOND_REDUCTION, MAX_REDUCTION - 1, MAX_REDUCTION, MAX_REDUCTION + 1,
        MAX_REDUCTION + PonHelper.PON_REDUCTION_INTERVAL, MAX_REDUCTION + 2 * PonHelper.PON_REDUCTION_INTERVAL + 7];
      for (var i = 1; i <= PonHelper.PON_MAX_REDUCTIONS; i++) {
        heights.push(PonHelper.PON_ACTIVATION_HEIGHT + i * PonHelper.PON_REDUCTION_INTERVAL);
      }
      heights.forEach(function(height) {
        var diffSats = PonHelper.getPonEmission(height).minus(PonHelper.getPonEmission(height - 1)).times(1e8);
        diffSats.toString(10).should.equal(String(PonHelper.getPonSubsidySats(height)));
      });
    });
  });

  describe('block reward', function() {
    var cases = [
      [2019999, 3750000000],
      [2020000, 1400000000],
      [FIRST_REDUCTION - 1, 1400000000],
      [FIRST_REDUCTION, 1260000000],
      [SECOND_REDUCTION - 1, 1260000000],
      [SECOND_REDUCTION, 1134000000],
      [MAX_REDUCTION, 170207313],
      [MAX_REDUCTION + 1, 170207313]
    ];

    it('StatisticService getBlockReward and getBlockRewardr', function() {
      cases.forEach(function(c) {
        StatisticService.prototype.getBlockReward(c[0], function(err, reward) {
          should.not.exist(err);
          reward.should.equal(c[1]);
        });
        StatisticService.prototype.getBlockRewardr(c[0]).should.equal(c[1]);
      });
    });

    it('BlockController getBlockReward and getBlockRewardr', function() {
      cases.forEach(function(c) {
        BlockController.prototype.getBlockReward(c[0], function(err, reward) {
          should.not.exist(err);
          reward.should.equal(c[1]);
        });
        BlockController.prototype.getBlockRewardr(c[0]).should.equal(c[1]);
      });
    });

    it('AddressBlocksMinedService getBlockReward', function() {
      cases.forEach(function(c) {
        AddressBlocksMinedService.prototype.getBlockReward(c[0]).should.equal(c[1]);
      });
    });
  });

  describe('daily statistics block info', function() {
    function getBlockInfo(height, done) {
      // PON coinbase: stratus, nimbus, cumulus and the dev fund output, which also receives all tx fees
      var subsidy = PonHelper.getPonSubsidySats(height);
      var stratus = Math.floor(subsidy * 9 / 14);
      var nimbus = Math.floor(subsidy / 4);
      var cumulus = Math.floor(subsidy / 14);
      var fees = 12345;
      var outputs = [
        { satoshis: stratus, address: 'stratus' },
        { satoshis: nimbus, address: 'nimbus' },
        { satoshis: cumulus, address: 'cumulus' },
        { satoshis: subsidy - stratus - nimbus - cumulus + fees, address: 'devfund' }
      ];
      var node = {
        getJsonBlock: function(h, cb) { cb(null, {}); },
        getBlock: function(h, cb) { cb(null, { transactions: [{ hash: 'coinbase', outputs: outputs }] }); },
        getNetworkHash: function(h, cb) { cb(null, 1); },
        getDetailedTransaction: function(txid, cb) { cb(null, { outputs: outputs }); }
      };
      var service = new StatisticService({ node: node });
      service._getBlockInfo(height, done);
    }

    [FIRST_REDUCTION - 1, FIRST_REDUCTION, SECOND_REDUCTION].forEach(function(height) {
      it('derives fee and minedBy from the reduced subsidy at ' + height, function(done) {
        getBlockInfo(height, function(err, data) {
          should.not.exist(err);
          data.subsidy.should.equal(PonHelper.getPonSubsidySats(height));
          data.fee.should.equal(12345);
          data.minedBy.should.equal('stratus');
          done();
        });
      });
    });
  });

  describe('supply', function() {
    it('main chain circulating supply is unchanged before the first reduction', function() {
      SupplyHelper.getCirculatingSupplyByHeight(2020000).toString(10).should.equal('416978726.5');
      SupplyHelper.getCirculatingSupplyByHeight(FIRST_REDUCTION - 1).toString(10).should.equal('431695512.5');
      StatisticService.prototype.getCirculatingSupply.call({ node: nodeAtHeight(FIRST_REDUCTION - 1) })
        .toString().should.equal('431695512.5');
    });

    it('main chain circulating supply grows by the reduced subsidy', function() {
      SupplyHelper.getCirculatingSupplyByHeight(FIRST_REDUCTION).toString(10).should.equal('431695525.1');
      SupplyHelper.getCirculatingSupplyByHeight(SECOND_REDUCTION).toString(10).should.equal('444940643.84');
      StatisticService.prototype.getCirculatingSupply.call({ node: nodeAtHeight(FIRST_REDUCTION) })
        .toString().should.equal('431695525.1');
    });

    it('all chains circulating supply is unchanged before the first reduction', function() {
      // live /api/supply value at height 3050836
      StatisticService.prototype.getCirculatingSupplyAllChains.call({ node: nodeAtHeight(3050836) })
        .toString().should.equal('422099970.4991484');
    });

    it('all chains circulating supply grows by twice the reduced subsidy', function() {
      function allChains(height) {
        return StatisticService.prototype.getCirculatingSupplyAllChains.call({ node: nodeAtHeight(height) }).toNumber();
      }
      (allChains(FIRST_REDUCTION - 1) - allChains(FIRST_REDUCTION - 2)).should.be.approximately(28, 1e-6);
      (allChains(FIRST_REDUCTION) - allChains(FIRST_REDUCTION - 1)).should.be.approximately(25.2, 1e-6);
      (allChains(SECOND_REDUCTION) - allChains(SECOND_REDUCTION - 1)).should.be.approximately(22.68, 1e-6);
      // one day (2880 blocks) after the first reduction
      (allChains(FIRST_REDUCTION + 2879) - allChains(FIRST_REDUCTION - 1)).should.be.approximately(2880 * 25.2, 1e-6);
    });

    it('/circulation matches all chains circulating supply', function(done) {
      var height = FIRST_REDUCTION + 2879;
      var status = new StatusController(nodeAtHeight(height));
      status.circulationAllChains({}, {
        jsonp: function(data) {
          var expected = StatisticService.prototype.getCirculatingSupplyAllChains.call({ node: nodeAtHeight(height) });
          data.circulationsupply.should.equal(expected.toNumber());
          data.circsupplyint.should.equal(Math.round(expected.toNumber()));
          done();
        }
      });
    });
  });
});
