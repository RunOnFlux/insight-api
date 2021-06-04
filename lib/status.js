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
  let subsidy = 150;
  const height = this.node.services.bitcoind.height
  var halvings = Math.floor((height - 2500) / 655350);
  var coins = ((657850 - 5000) * 150) + 375000 + 13020000 + 10000000; // slowstart, premine, dev fund + exchange fund
  coins = coins + 1000000 + 12313785.94991485; // dev + exchange fund on kda, snapshot for kda
  console.log(halvings);
  if (height > 893000) { // bsc goes live
    coins = coins + 1000000 + 12313785.94991485; // dev + exchange fund on kda, snapshot for bsc
  }
  if (height > 900000) { // eth goes live
    coins = coins + 1000000 + 12313785.94991485; // dev + exchange fund on kda, snapshot for eth
  }
  for (let i = 1; i <= halvings; i++) {
    subsidy = subsidy / 2;
    console.log(subsidy);
    if (i >= 64) {
      coins += 0
    } else if (i === halvings) {
      // good for last one
      coins += (height - 657850 - ((i - 1) * 655350)) * subsidy;
      if (height > 825000) { // kda chain mining
        coins += ((height - 825000) * subsidy / 10);
      }
      if (height > 883000) { // snapshot height for main chain for eth, bsc
        if (height > 825000) { // eth mining
          coins += ((height - 825000) * subsidy / 10);
        }
        if (height > 825000) { // bsc mining
          coins += ((height - 825000) * subsidy / 10);
        }
      }
    } else {
      coins += 655350 * subsidy
    }
  }
  res.jsonp({
    circulationsupply: coins,
    circsupplyint: Math.round(coins),
    circsupplydig: coins.toFixed(8)
  });
};

module.exports = StatusController;
