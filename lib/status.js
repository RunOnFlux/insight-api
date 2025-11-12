'use strict';

var Common = require('./common');

function StatusController(node) {
  this.node = node;
  this.common = new Common({ log: this.node.log });
}

StatusController.prototype.show = function (req, res) {
  var self = this;
  var option = req.query.q;

  switch (option) {
    case 'getDifficulty':
      this.getDifficulty(function (err, result) {
        if (err) {
          return self.common.handleErrors(err, res);
        }
        res.jsonp(result);
      });
      break;
    case 'getLastBlockHash':
      res.jsonp(this.getLastBlockHash());
      break;
    case 'getBestBlockHash':
      this.getBestBlockHash(function (err, result) {
        if (err) {
          return self.common.handleErrors(err, res);
        }
        res.jsonp(result);
      });
      break;
    case 'getMiningInfo':
      this.getMiningInfo(function (err, result) {
        if (err) {
          return self.common.handleErrors(err, res);
        }
        res.jsonp({
          miningInfo: result
        });
      });
      break
    case 'getPeerInfo':
      this.getPeerInfo(function (err, result) {
        if (err) {
          return self.common.handleErrors(err, res);
        }
        res.jsonp({
          peerInfo: result
        });
      });
      break;
    case 'getZelNodes':
      this.getZelNodes(function (err, result) {
        if (err) {
          return self.common.handleErrors(err, res);
        }
        res.jsonp({
          zelNodes: result
        });
      });
      break;
    case 'getFluxNodes':
      this.getFluxNodes(function (err, result) {
        if (err) {
          return self.common.handleErrors(err, res);
        }
        res.jsonp({
          fluxNodes: result
        });
      });
      break;
    case 'getInfo':
    default:
      this.getInfo(function (err, result) {
        if (err) {
          return self.common.handleErrors(err, res);
        }
        res.jsonp({
          info: result
        });
      });
  }
};

StatusController.prototype.getInfo = function (callback) {
  this.node.services.bitcoind.getInfo(function (err, result) {
    if (err) {
      return callback(err);
    }
    var info = {
      version: result.version,
      protocolversion: result.protocolVersion,
      walletversion: result.walletversion,
      blocks: result.blocks,
      timeoffset: result.timeOffset,
      connections: result.connections,
      proxy: result.proxy,
      difficulty: result.difficulty,
      testnet: result.testnet,
      relayfee: result.relayFee,
      errors: result.errors,
      network: result.network,
      reward: result.reward
    };
    callback(null, info);
  });
};

StatusController.prototype.getMiningInfo = function (callback) {
  this.node.services.bitcoind.getMiningInfo(function (err, result) {
    if (err) {
      return callback(err);
    }
    var miningInfo = {
      difficulty: result.difficulty,
      networkhashps: result.networkhashps
    };
    callback(null, miningInfo);
  });
};

StatusController.prototype.getPeerInfo = function (callback) {
  this.node.services.bitcoind.getPeerInfo(function (err, response) {
    if (err) {
      return callback(err);
    }
    var peers = [];
    var date_now = new Date();
    response.result.forEach(function (obj) {

      var date_past = new Date(obj.conntime * 1000);
      var seconds = Math.floor((date_now - (date_past)) / 1000);
      var minutes = Math.floor(seconds / 60);
      var hours = Math.floor(minutes / 60);
      var days = Math.floor(hours / 24);

      hours = hours - (days * 24);
      minutes = minutes - (days * 24 * 60) - (hours * 60);
      seconds = seconds - (days * 24 * 60 * 60) - (hours * 60 * 60) - (minutes * 60);

      //check ipv6
      var actualaddress = null
      if (obj.addr.charAt(0) === '[') {
        obj.addr = obj.addr.substr(1);
        actualaddress = obj.addr.split(']')[0]
      } else {
        actualaddress = obj.addr.split(':')[0]
      }

      peers.push({
        address: actualaddress,
        protocol: obj.version,
        version: obj.subver.replace('/', '').replace('/', ''),
        uptime: {
          Days: days,
          Hours: hours,
          Minutes: minutes,
          Seconds: seconds,
        },
        timestamp: obj.conntime
      });
    });
    peers.sort(function (a, b) {
      return a.timestamp - b.timestamp;
    });
    callback(null, peers);
  });
};

StatusController.prototype.getZelNodes = function (callback) {
  this.node.services.bitcoind.viewdeterministiczelnodelist(function (err, response) {
    if (err) {
      return callback(err);
    }
    var fluxnodes = response.result;
    callback(null, fluxnodes);
  });
};

StatusController.prototype.getFluxNodes = function (callback) {
  this.node.services.bitcoind.viewdeterministiczelnodelist(function (err, response) {
    if (err) {
      return callback(err);
    }
    var fluxnodes = response.result;
    callback(null, fluxnodes);
  });
};

StatusController.prototype.getLastBlockHash = function () {
  var hash = this.node.services.bitcoind.tiphash;
  return {
    syncTipHash: hash,
    lastblockhash: hash
  };
};

StatusController.prototype.getBestBlockHash = function (callback) {
  this.node.services.bitcoind.getBestBlockHash(function (err, hash) {
    if (err) {
      return callback(err);
    }
    callback(null, {
      bestblockhash: hash
    });
  });
};

StatusController.prototype.getDifficulty = function (callback) {
  this.node.services.bitcoind.getInfo(function (err, info) {
    if (err) {
      return callback(err);
    }
    callback(null, {
      difficulty: info.difficulty
    });
  });
};

StatusController.prototype.sync = function (req, res) {
  var self = this;
  var status = 'syncing';

  this.node.services.bitcoind.isSynced(function (err, synced) {
    if (err) {
      return self.common.handleErrors(err, res);
    }
    if (synced) {
      status = 'finished';
    }

    self.node.services.bitcoind.syncPercentage(function (err, percentage) {
      if (err) {
        return self.common.handleErrors(err, res);
      }
      var info = {
        status: status,
        blockChainHeight: self.node.services.bitcoind.height,
        syncPercentage: Math.round(percentage),
        height: self.node.services.bitcoind.height,
        error: null,
        type: 'bitcore node'
      };

      res.jsonp(info);

    });

  });

};

// Hard coded to make insight ui happy, but not applicable
StatusController.prototype.peer = function (req, res) {
  res.jsonp({
    connected: true,
    host: '127.0.0.1',
    port: null
  });
};

StatusController.prototype.version = function (req, res) {
  var pjson = require('../package.json');
  res.jsonp({
    version: pjson.version
  });
};

StatusController.prototype.circulationAllChains = function (req, res) {
  const PON_HEIGHT = 2020000;
  const ASSET_MINING_START = 825000;
  const FIRST_HALVING = 657850;
  const HALVING_INTERVAL = 655350;
  const EXCHANGE_FUND_HEIGHT = 835554;
  const EXCHANGE_FUND_AMOUNT = 10000000;
  const CHAIN_FUND_AMOUNT = 1000000; // dev + exchange fund allocated per chain launch
  const SNAPSHOT_AMOUNT = 12313785.94991485; // user snapshot per chain

  // Parallel asset chain launch heights
  const CHAINS = [
    { name: 'KDA', launchHeight: 825000 },
    { name: 'BSC', launchHeight: 883000 },
    { name: 'ETH', launchHeight: 883000 },
    { name: 'SOL', launchHeight: 969500 },
    { name: 'TRX', launchHeight: 969500 },
    { name: 'AVAX', launchHeight: 1170000 },
    { name: 'ERGO', launchHeight: 1210000 },
    { name: 'ALGO', launchHeight: 1330000 },
    { name: 'MATIC', launchHeight: 1414000 },
    { name: 'BASE', launchHeight: 1738000 }
  ];

  let subsidy = 150;
  const realHeight = this.node.services.bitcoind.height;

  // Traditional mining only goes up to PON_HEIGHT, then PON takes over
  const miningHeight = Math.min(realHeight, PON_HEIGHT - 1);

  // Calculate halvings (max 2) for traditional mining period
  const halvings = Math.min(2, Math.floor((miningHeight - 2500) / HALVING_INTERVAL));

  // Initial supply: slow start + premine + dev fund
  let coins = ((FIRST_HALVING - 5000) * 150) + 375000 + 13020000;

  // Add exchange fund allocation if height reached
  if (realHeight >= EXCHANGE_FUND_HEIGHT) {
    coins += EXCHANGE_FUND_AMOUNT;
  }

  // Add snapshot amounts and chain funds for launched chains
  CHAINS.forEach(chain => {
    if (realHeight > chain.launchHeight) {
      coins += CHAIN_FUND_AMOUNT + SNAPSHOT_AMOUNT;
    }
  });

  // Calculate traditional mining rewards through halvings (only up to PON_HEIGHT)
  for (let i = 1; i <= halvings; i++) {
    subsidy = subsidy / 2;

    if (i === halvings) {
      // Current/last halving period - calculate partial blocks up to PON_HEIGHT
      const nBlocksMain = miningHeight - FIRST_HALVING - ((i - 1) * HALVING_INTERVAL);
      coins += nBlocksMain * subsidy;

      // Add parallel asset mining rewards (1/10 of main chain subsidy)
      if (miningHeight > ASSET_MINING_START) {
        const activeChains = CHAINS.filter(chain => miningHeight > chain.launchHeight).length;
        coins += nBlocksMain * subsidy * activeChains / 10;
      }
    } else {
      // Completed halving periods - full interval
      coins += HALVING_INTERVAL * subsidy;

      // Add parallel asset mining for the completed period
      if (miningHeight > ASSET_MINING_START) {
        // Only count blocks after asset mining started
        const nBlocksAsset = HALVING_INTERVAL - (ASSET_MINING_START - FIRST_HALVING);
        const activeChains = CHAINS.filter(chain => miningHeight > chain.launchHeight).length;
        coins += nBlocksAsset * subsidy * activeChains / 10;
      }
    }
  }

  // Add PON (Proof of Node) rewards after PON_HEIGHT - this replaces traditional mining
  if (realHeight >= PON_HEIGHT) {
    const ponBlocks = realHeight - PON_HEIGHT + 1;
    coins += ponBlocks * 14 * 2; // 14 flux per block × 2 (parallel assets)
  }

  res.jsonp({
    circulationsupply: coins,
    circsupplyint: Math.round(coins),
    circsupplydig: coins.toFixed(8)
  });
};

module.exports = StatusController;
