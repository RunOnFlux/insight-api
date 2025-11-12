'use strict';

var async = require('async');
var bitcore = require('bitcore-lib');
var BigNumber = require('bignumber.js');
var LRU = require('lru-cache');
var Common = require('../lib/common');
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var STATISTIC_TYPE = 'STATISTIC';
var SupplyHelper = require('../helpers/SupplyHelper');
var BN = bitcore.crypto.BN;
var pools = require('../pools.json');
var _ = require('lodash');
/**
 *
 * @param {Object} options
 * @constructor
 */
function StatisticService(options) {
    var self = this;
    this.node = options.node;
    this.statisticDayRepository = options.statisticDayRepository;

    this.addressBalanceService = options.addressBalanceService;
    this.lastBlockRepository = options.lastBlockRepository;
    this.txController = options.txController;

    /**
     * 24h Cache
     */
    this.subsidyByBlockHeight = LRU(999999);
    this.blocksByHeight = LRU(999999);
    this.feeByHeight = LRU(999999);
    this.outputsByHeight = LRU(999999);
    this.difficultyByHeight = LRU(999999);
    this.minedByByHeight = LRU(999999);
    this.netHashByHeight = LRU(999999);

    /**
     * 1h Cache
     */
    this.minedByByHeight1h = LRU(999999);
    this.blocksByHeight1h = LRU(999999);



    /**
     * Statistic Cache By Days
     */
    this.statisticByDays = LRU(999999999);
    this.knownBlocks = LRU(999999999);

    this.lastCheckedBlock = 0;

    /**
     *
     * @type {Common}
     */
    this.common = new Common({ log: this.node.log });

    this.lastTipHeight = 0;
    this.lastTipInProcess = false;
    this.lastTipTimeout = false;

    this.poolStrings = {};
    pools.forEach(function (pool) {
        pool.searchStrings.forEach(function (s) {
            self.poolStrings[s] = {
                poolName: pool.poolName,
                url: pool.url
            };
        });
    });

}

util.inherits(StatisticService, EventEmitter);

/**
 *
 * @param {Function} callback
 * @return {*}
 */
StatisticService.prototype.start = function (callback) {

    var self = this,
        height = self.node.services.bitcoind.height;

    return async.waterfall([function (callback) {
        return self.lastBlockRepository.setLastBlockType(STATISTIC_TYPE, 0, function (err) {

            if (err) {

                self.common.log.error('[STATISTICS Service] setLastBlockType Error', err);

                return callback(err)
            }

            self.common.log.info('[STATISTICS Service] LastBlockType set');

            return callback();

        });
    }, function (callback) {
        return self.lastBlockRepository.getLastBlockByType(STATISTIC_TYPE, function (err, existingType) {

            if (err) {

                self.common.log.error('[STATISTICS Service] getLastBlockByType Error', err);

                return callback(err)
            }

            self.lastCheckedBlock = existingType.last_block_number;

            self.common.log.info('[STATISTICS Service] getLastBlockByType set', self.lastCheckedBlock);

            return callback();

        });
    }, function (callback) {

        self.common.log.info('[STATISTICS Service] start upd prev blocks');

        return self.processPrevBlocks(height, function (err) {

            if (err) {
                return callback(err);
            }

            self.common.log.info('[STATISTICS Service] updated prev blocks');

            return callback(err);

        });

    }], function (err) {

        if (err) {
            return callback(err);
        }

        self.node.services.bitcoind.on('tip', self._rapidProtectedUpdateTip.bind(self));
        self._rapidProtectedUpdateTip(height);

        return callback(err);
    });

};

/**
 *
 * @param {Object} data
 * @param {Function} next
 * @return {*}
 */
StatisticService.prototype.process24hBlock = function (data, next) {

    var self = this,
        block = data.blockJson,
        subsidy = data.subsidy,
        fee = data.fee,
        totalOutputs = data.totalOutputs,
        difficulty = data.blockJson.difficulty,
        minedBy = data.minedBy,
        netHash = data.netHash,
        currentDate = new Date(),
        currentDateHour = new Date();

    currentDate.setDate(currentDate.getDate() - 1);
    currentDateHour.setHours(currentDateHour.getHours() - 1);

    var minTimestamp = currentDate.getTime() / 1000,
        maxAge = (block.time - minTimestamp) * 1000;

    if (maxAge > 0) {
        self.blocksByHeight.set(block.height, block, maxAge);
        self.subsidyByBlockHeight.set(block.height, subsidy, maxAge);
        self.feeByHeight.set(block.height, fee, maxAge);
        self.outputsByHeight.set(block.height, totalOutputs, maxAge);
        self.difficultyByHeight.set(block.height, difficulty, maxAge);
        self.minedByByHeight.set(block.height, minedBy, maxAge);
        self.netHashByHeight.set(block.height, netHash, maxAge);
    }
    var minTimestampHour = currentDateHour.getTime() / 1000,
        maxAgeHour = (block.time - minTimestampHour) * 1000;
    if (maxAgeHour > 0) {
        self.blocksByHeight1h.set(block.height, block, maxAgeHour);
        self.minedByByHeight1h.set(block.height, minedBy, maxAgeHour);
    }
    return next();

};

/**
 *
 * @param {Number} height
 * @param {Function} next
 * @return {*}
 */
StatisticService.prototype.processPrevBlocks = function (height, next) {

    var self = this,
        dataFlow = {
            blockJson: null
        };

    return async.doDuring(
        function (callback) {

            return self.node.getJsonBlock(height, function (err, blockJson) {

                if (err) {
                    return callback(err);
                }

                dataFlow.blockJson = blockJson;

                return callback();
            });

        },
        function (callback) {

            var block = dataFlow.blockJson,
                currentDate = new Date();

            currentDate.setDate(currentDate.getDate() - 1);

            var minTimestamp = currentDate.getTime() / 1000,
                maxAge = (block.time - minTimestamp) * 1000;

            height--;

            if (maxAge > 0) {
                return async.waterfall([function (callback) {
                    return self._getBlockInfo(block.height, function (err, data) {
                        return callback(err, data);
                    });
                }, function (data, callback) {
                    return self.process24hBlock(data, function (err) {
                        return callback(err);
                    });
                }], function (err) {
                    return callback(err, true);
                });

            } else {
                return callback(null, false);
            }

        },
        function (err) {
            return next(err);
        }
    );

};

/**
 *
 * @param {Number} height
 * @param {Function} next
 * @return {*}
 * @private
 */
StatisticService.prototype._getLastBlocks = function (height, next) {

    var self = this,
        blocks = [];

    for (var i = self.lastCheckedBlock + 1; i <= height; i++) {
        blocks.push(i);
    }

    return async.eachSeries(blocks, function (blockHeight, callback) {

        return self.processBlock(blockHeight, function (err) {
            return callback(err);
        });

    }, function (err) {
        return next(err);
    });

};

/**
 *
 * @param {Number} blockHeight
 * @param {Function} next
 * @return {*}
 * @private
 */
StatisticService.prototype._getBlockInfo = function (blockHeight, next) {

    var self = this,
        dataFlow = {
            subsidy: null,
            block: null,
            blockJson: null,
            fee: 0,
            totalOutputs: 0,
            minedBy: null,
            netHash: null,
            transaction: null
        };

    return async.waterfall([function (callback) {
        return self.node.getJsonBlock(blockHeight, function (err, blockJson) {
            if ((err && err.code === -5) || (err && err.code === -8)) {
                return callback(err);
            } else if (err) {
                return callback(err);
            }

            dataFlow.blockJson = blockJson;

            return callback();
        });
    }, function (callback) {

        /**
                 * Block
         */
        return self.node.getBlock(blockHeight, function (err, block) {

            if ((err && err.code === -5) || (err && err.code === -8)) {
                return callback(err);
            } else if (err) {
                return callback(err);
            }

            dataFlow.block = block;

            return callback();

        });
    }, function (callback) {

        /**
         * Subsidy
         */
        return self.getBlockReward(blockHeight, function (err, result) {
            dataFlow.subsidy = result;
            return callback();
        });

    }, function (callback) {

        /**
               * Fee
         */

        // Check if block has transactions and the first transaction exists
        if (!dataFlow.block.transactions || !dataFlow.block.transactions[0]) {
            dataFlow.fee = 0;
            return callback();
        }

        var transaction0 = dataFlow.block.transactions[0],
            currentVoutsAmount = 0;

        // Check if transaction has outputs
        if (!transaction0.outputs) {
            dataFlow.fee = 0;
            return callback();
        }

        transaction0.outputs.forEach(function (output) {
            currentVoutsAmount += output.satoshis;
        });

        if ((currentVoutsAmount - dataFlow.subsidy) > 0) {
            dataFlow.fee = currentVoutsAmount - dataFlow.subsidy;
        }

        return callback();

    }, function (callback) {

        /**
         * Total outputs
         */

        var trxsExcept = [];

        trxsExcept.push(0);

        dataFlow.block.transactions.forEach(function (transaction, idx) {
            if (trxsExcept.indexOf(idx) === -1) {
                transaction.outputs.forEach(function (output) {
                    dataFlow.totalOutputs += output.satoshis;
                });
            }
        });

        return callback();

    }, function (callback) {

        /**
   * networkhashps
         */

        return self.node.getNetworkHash(blockHeight, function (err, hashps) {

            if ((err && err.code === -5) || (err && err.code === -8)) {
                return callback(err);
            } else if (err) {
                return callback(err);
            }

            dataFlow.netHash = hashps;

            return callback();

        });

    }, function (callback) {

        if (blockHeight === 0) {
            return callback();
        }

        var txHash;


        txHash = dataFlow.block.transactions[0].hash;


        return self.getDetailedTransaction(txHash, function (err, trx) {

            if (err) {
                return callback(err);
            }

            dataFlow.transaction = trx;

            return callback();

        });
    }, function (callback) {

        /**
         * minedBy
         */


        var reward = self.getBlockRewardr(blockHeight);
        dataFlow.transaction.outputs.forEach(function (output) {
            if (output.satoshis > (reward * 0.4)) {
                dataFlow.minedBy = output.address;
            }
        });

        return callback();

    }], function (err) {

        if (err) {
            return next(err);
        }

        return next(err, dataFlow);

    });

};

/**
 *
 * @param {Number} blockHeight
 * @param {Function} next
 * @return {*}
 */
StatisticService.prototype.processBlock = function (blockHeight, next) {

    var self = this;

    return self._getBlockInfo(blockHeight, function (err, data) {

        if (err) {
            return next(err);
        }

        if (self.knownBlocks.get(blockHeight)) {
            return callback();
        }

        self.knownBlocks.set(blockHeight, true);

        self.lastCheckedBlock = blockHeight;

        if (blockHeight % 1000 === 0) {
            self.common.log.info('[STATISTICS Service] processing block ', self.lastCheckedBlock);
        }

        var block = data.blockJson,
            date = new Date(block.time * 1000),
            formattedDate = self.formatTimestamp(date);

        return async.waterfall([function (callback) {
            return self.lastBlockRepository.updateOrAddLastBlock(block.height, STATISTIC_TYPE, function (err) {
                return callback(err);
            });
        }, function (callback) {
            return self.updateOrCreateDay(formattedDate, data, function (err) {
                return callback(err);
            });
        }, function (callback) {
            return self.process24hBlock(data, function (err) {
                return callback(err);
            });
        }], function (err) {
            return next(err);
        });

    });

};

/**
 *
 * @param {String} date e.g. 01-01-2018
 * @param {Object} data
 * @param next
 * @return {*}
 */
StatisticService.prototype.updateOrCreateDay = function (date, data, next) {

    var self = this,
        block = data.blockJson,
        subsidy = data.subsidy,
        fee = data.fee,
        totalOutputs = data.totalOutputs,
        mined = data.minedBy,
        netHash = data.netHash,
        dataFlow = {
            day: null,
            formattedDay: null
        };

    return async.waterfall([function (callback) {
        return self.statisticDayRepository.getDay(new Date(date), function (err, day) {

            if (err) {
                return callback(err);
            }

            if (!day) {

                dataFlow.day = {
                    totalTransactionFees: {
                        sum: '0',
                        count: '0'
                    },
                    numberOfTransactions: {
                        count: '0'
                    },
                    totalOutputVolume: {
                        sum: '0'
                    },
                    totalBlocks: {
                        count: '0'
                    },
                    difficulty: {
                        sum: []
                    },
                    supply: {
                        sum: '0'
                    },
                    poolData: {
                        pool: []
                    },
                    netHash: {
                        sum: '0',
                        count: '0'
                    },
                    date: date,
                    activeAddresses: {
                        addresses: [],
                        count: 0
                    }
                };

            } else {
                dataFlow.day = day;
            }

            return callback();

        });

    }, function (callback) {

        var dayBN = self._toDayBN(dataFlow.day);

        dayBN.totalTransactionFees.sum = dayBN.totalTransactionFees.sum.plus(fee.toString());
        dayBN.totalTransactionFees.count = dayBN.totalTransactionFees.count.plus(1);

        dayBN.totalBlocks.count = dayBN.totalBlocks.count.plus(1);

        dayBN.numberOfTransactions.count = dayBN.numberOfTransactions.count.plus(block.tx.length);

        dayBN.totalOutputVolume.sum = dayBN.totalOutputVolume.sum.plus(totalOutputs.toString());


        dayBN.difficulty.sum.push(block.difficulty.toString());

        dayBN.netHash.sum = dayBN.netHash.sum.plus(netHash.toString());
        dayBN.netHash.count = dayBN.netHash.count.plus(1);


        var objIndex = dayBN.poolData.pool.findIndex((obj => obj.minedby == mined));

        if (objIndex == -1) {
            dayBN.poolData.pool.push({ minedby: mined, count: 1 });

        } else {
            dayBN.poolData.pool[objIndex].count += 1;

        }


        dayBN.supply.sum = SupplyHelper.getCirculatingSupplyByHeight(block.height).mul(1e8);

        data.block.transactions.forEach(function (txNotTransformed) {
            var tx = self.txController.transformFluxChainTransaction(txNotTransformed);
            if (tx.vin) {
                tx.vin.forEach(function (vin) {
                    if (vin && vin.address) {
                        dayBN.activeAddresses.addresses.push(vin.address);
                    }
                });
            }
            if (tx.vout) {
                tx.vout.forEach(function (vout) {
                    if (vout && vout.address) {
                        dayBN.activeAddresses.addresses.push(vout.address);
                    }
                })
            }
        });

        // remove duplicates
        dayBN.activeAddresses.addresses = [...new Set(dayBN.activeAddresses.addresses)];
        dayBN.activeAddresses.count = dayBN.activeAddresses.addresses.length;

        return self.statisticDayRepository.createOrUpdateDay(new Date(date), dayBN, function (err) {
            return callback(err);
        });

    }], function (err) {
        return next(err);
    });

};

/**
 *
 * @param {Object} day
 * @return {{totalTransactionFees: {sum, count}, numberOfTransactions: {count}, totalOutputVolume: {sum}, totalBlocks: {count}, difficulty: {sum, count}, stake: {sum}, supply: {sum}, date}}
 * @private
 */
StatisticService.prototype._toDayBN = function (day) {
    return {
        totalTransactionFees: {
            sum: new BigNumber(day.totalTransactionFees.sum),
            count: new BigNumber(day.totalTransactionFees.count)
        },
        numberOfTransactions: {
            count: new BigNumber(day.numberOfTransactions.count)
        },
        totalOutputVolume: {
            sum: new BigNumber(day.totalOutputVolume.sum)
        },
        totalBlocks: {
            count: new BigNumber(day.totalBlocks.count)
        },
        difficulty: {
            sum: day.difficulty.sum
        },
        supply: {
            sum: new BigNumber(day.supply.sum)
        },
        poolData: {
            pool: day.poolData.pool
        },
        netHash: {
            sum: new BigNumber(day.netHash.sum),
            count: new BigNumber(day.netHash.count)
        },
        date: day.date,
        activeAddresses: {
            addresses: day.activeAddresses.addresses,
            count: day.activeAddresses.count
        }
    };
};

/**
 * helper to convert timestamps to yyyy-mm-dd format
 * @param {Date} date
 * @returns {string} yyyy-mm-dd format
 */
StatisticService.prototype.formatTimestamp = function (date) {
    var yyyy = date.getUTCFullYear().toString();
    var mm = (date.getUTCMonth() + 1).toString(); // getMonth() is zero-based
    var dd = date.getUTCDate().toString();

    return yyyy + '-' + (mm[1] ? mm : '0' + mm[0]) + '-' + (dd[1] ? dd : '0' + dd[0]); //padding
};

/**
 *
 * @param {number} height
 * @returns {boolean}
 * @private
 */
StatisticService.prototype._rapidProtectedUpdateTip = function (height) {

    var self = this;

    if (height > this.lastTipHeight) {
        this.lastTipHeight = height;
    }

    if (this.lastTipInProcess || height < this.lastCheckedBlock) {
        return false;
    }

    this.lastTipInProcess = true;

    self.common.log.info('[STATISTICS Service] start upd from ', self.lastCheckedBlock + 1, ' to ', height);

    return this._getLastBlocks(height, function (err) {

        self.lastTipInProcess = false;

        if (err) {
            return false;
        }

        self.emit('updated', { height: height });

        self.common.log.info('[STATISTICS Service] updated to ', height);

        if (self.lastTipHeight !== height) {
            self._rapidProtectedUpdateTip(self.lastTipHeight);
        }

    });

};

/**
 *
 * @param {Number} days
 * @param {Function} next
 * @return {*}
 */
StatisticService.prototype.getStats = function (days, next) {

    var self = this,
        currentDate = new Date(),
        formattedDate = this.formatTimestamp(currentDate),
        from = new Date(formattedDate);

    from.setDate(from.getDate() - days);

    return self.statisticDayRepository.getStats(from, new Date(formattedDate), function (err, stats) {
        return next(err, stats);
    });

};

StatisticService.prototype.getStatsByDate = function (date, next) {

    var self = this;

    return self.statisticDayRepository.getDay(date, function (err, stats) {
        return next(err, stats);
    });

};
/**
 *
 * @param {Number} days
 * @param {Function} next
 */
StatisticService.prototype.getDifficulty = function (days, next) {

    var self = this;

    return self.getStats(days, function (err, stats) {

        if (err) {
            return next(err);
        }

        var results = [];
        var diffMode = [];
        var sumDiff = 0;


        stats.forEach(function (day) {

            diffMode = self.mode(day.difficulty.sum);

            if (diffMode.length - 1 > 1) {
                sumDiff = diffMode[diffMode.length - 1].toString();
            } else {
                sumDiff = diffMode[0].toString();
            }

            results.push({
                date: self.formatTimestamp(day.date),
                sum: sumDiff
            });

        });

        return next(err, results);

    });

};

StatisticService.prototype.getNetHash = function (days, next) {

    var self = this;

    return self.getStats(days, function (err, stats) {

        if (err) {
            return next(err);
        }

        var results = [];

        stats.forEach(function (day) {

            results.push({
                date: self.formatTimestamp(day.date),
                sum: day.netHash.sum > 0 && day.netHash.count > 0 ? new BigNumber(day.netHash.sum).dividedBy(day.netHash.count).toNumber() : 0
            });

        });

        return next(err, results);

    });

};

StatisticService.prototype.getPools = function (date, next) {

    var self = this;

    return self.getStatsByDate(date, function (err, stats) {

        if (err) {
            return next(err);
        }
        var results = null;
        if (stats) {
            var totalBlocks = parseInt(stats.totalBlocks.count);
            var poolsarr = JSON.parse(JSON.stringify(stats.poolData.pool));
            poolsarr.forEach(function (obj) {
                var name;
                name = self.getPoolInfo(obj.minedby);
                if (_.isEmpty(name)) {
                    obj.address = obj.minedby;
                    obj.poolName = "Unknown",
                        obj.url = "";
                } else {
                    obj.address = obj.minedby;
                    obj.poolName = name.poolName;
                    obj.url = name.url;
                }
                delete obj.minedby;
                var blocksWon = parseInt(obj.count);
                var tempnum = blocksWon / totalBlocks * 100;
                obj.blocks_found = obj.count;
                obj.percent_total = tempnum.toFixed(2);
                delete obj.count;

            });
            poolsarr.sort(function (a, b) {
                return b.percent_total - a.percent_total;
            });
            results = {
                date: self.formatTimestamp(stats.date),
                block_count: totalBlocks,
                Pools: poolsarr
            };
        }


        return next(err, results);

    });

};
/**
 *
 * @param {Number} days
 * @param {Function} next
 */
StatisticService.prototype.getSupply = function (days, next) {

    var self = this;

    return self.getStats(days, function (err, stats) {

        if (err) {
            return next(err);
        }

        var results = [];

        stats.forEach(function (day) {

            var sumBN = new BigNumber(day.supply.sum);

            results.push({
                date: self.formatTimestamp(day.date),
                sum: sumBN.gt(0) ? sumBN.dividedBy(1e8).toString(10) : '0'
            });

        });

        return next(err, results);

    });

};

/**
 *
 * @param {Number} days
 * @param {Function} next
 */
StatisticService.prototype.getOutputs = function (days, next) {

    var self = this;

    return self.getStats(days, function (err, stats) {

        if (err) {
            return next(err);
        }

        var results = [];

        stats.forEach(function (day) {

            var outputBN = new BigNumber(day.totalOutputVolume.sum);

            results.push({
                date: self.formatTimestamp(day.date),
                sum: day.totalOutputVolume && day.totalOutputVolume.sum > 0 ? outputBN.dividedBy(1e8).toFixed(8) : 0
            });

        });

        return next(err, results);

    });

};

/**
 *
 * @param {Number} days
 * @param {Function} next
 */
StatisticService.prototype.getTransactions = function (days, next) {

    var self = this;

    return self.getStats(days, function (err, stats) {

        if (err) {
            return next(err);
        }

        var results = [];

        stats.forEach(function (day) {

            results.push({
                date: self.formatTimestamp(day.date),
                transaction_count: parseInt(day.numberOfTransactions.count),
                block_count: parseInt(day.totalBlocks.count)
            });

        });

        return next(err, results);

    });

};

/**
 *
 * @param {Number} days
 * @param {Function} next
 */
StatisticService.prototype.getActiveAddresses = function (days, next) {

    var self = this;

    return self.getStats(days, function (err, stats) {

        if (err) {
            return next(err);
        }

        var results = [];

        stats.forEach(function (day) {

            results.push({
                date: self.formatTimestamp(day.date),
                // addresses: day.activeAddresses ? day.activeAddresses.addresses : [],
                count: day.activeAddresses ? day.activeAddresses.count : 0
            });

        });

        return next(err, results);

    });

};

/**
 *
 * @param {Number} days
 * @param {Function} next
 */
StatisticService.prototype.getFees = function (days, next) {

    var self = this;

    return self.getStats(days, function (err, stats) {

        if (err) {
            return next(err);
        }

        var results = [];

        stats.forEach(function (day) {

            var avg = day.totalTransactionFees.sum > 0 && day.totalTransactionFees.count > 0 ? new BigNumber(day.totalTransactionFees.sum).dividedBy(day.totalTransactionFees.count).toNumber() : 0;

            results.push({
                date: self.formatTimestamp(day.date),
                fee: (avg / 1e8).toFixed(8)
            });

        });

        return next(err, results);

    });

};

/**
 *
 * @param {Function} nextCb
 * @return {*}
 */
StatisticService.prototype.getTotal = function (nextCb) {

    var self = this,
        initHeight = self.lastCheckedBlock,
        height = initHeight,
        next = true,
        sumBetweenTime = 0,
        countBetweenTime = 0,
        numTransactions = 0,
        minedBlocks = 0,
        minedCurrencyAmount = 0,
        allFee = 0,
        sumDifficulty = [],
        totalOutputsAmount = 0,
        dayPoolData = [],
        sumNetHash = 0,
        countNetHash = 0;

    while (next && height > 0) {

        var currentElement = self.blocksByHeight.get(height),
            subsidy = self.subsidyByBlockHeight.get(height),
            outputAmount = self.outputsByHeight.get(height),
            difficulty = self.difficultyByHeight.get(height),
            mined = self.minedByByHeight.get(height),
            netHash = self.netHashByHeight.get(height);
        if (currentElement) {

            var nextElement = self.blocksByHeight.get(height + 1),
                fee = self.feeByHeight.get(height);

            if (nextElement) {
                sumBetweenTime += (nextElement.time - currentElement.time);
                countBetweenTime++;
            }

            numTransactions += currentElement.tx.length;
            minedBlocks++;


            if (difficulty) {
                difficulty = JSON.parse(JSON.stringify(difficulty));
                sumDifficulty.push(difficulty.toString());
            }

            if (subsidy) {
                minedCurrencyAmount += subsidy;
            }

            if (fee) {
                allFee += fee;
            }

            if (netHash) {
                sumNetHash += netHash;
                countNetHash++;
            }

            if (outputAmount) {
                totalOutputsAmount += outputAmount;
            }


            if (mined) {
                var objIndex = dayPoolData.findIndex((obj => obj.minedby == mined));

                if (objIndex == -1) {
                    dayPoolData.push({ minedby: mined, count: 1 });

                } else {
                    dayPoolData[objIndex].count += 1;

                }

            }

        } else {
            next = false;
        }

        height--;

    }

    var totDiff = 0;
    var totDiffMode = [];
    totDiffMode = self.mode(sumDifficulty);

    if (totDiffMode.length - 1 > 1) {
        totDiff = totDiffMode[totDiffMode.length - 1].toString();
    } else {
        totDiff = totDiffMode[0];
    }
    var poolsArr = JSON.parse(JSON.stringify(dayPoolData));
    poolsArr.forEach(function (obj) {
        var name;
        name = self.getPoolInfo(obj.minedby);
        if (_.isEmpty(name)) {
            obj.address = obj.minedby;
            obj.poolName = "Unknown",
                obj.url = "";
        } else {
            obj.address = obj.minedby;
            obj.poolName = name.poolName;
            obj.url = name.url;
        }
        delete obj.minedby;
        var blocksWon = parseInt(obj.count);
        var tempNum = blocksWon / minedBlocks * 100;
        obj.blocks_found = obj.count;
        obj.percent_total = tempNum.toFixed(2);
        delete obj.count;

    });
    poolsArr.sort(function (a, b) {
        return b.percent_total - a.percent_total;
    });
    var result = {
        n_blocks_mined: minedBlocks,
        time_between_blocks: sumBetweenTime && countBetweenTime ? sumBetweenTime / countBetweenTime : 0,
        mined_currency_amount: minedCurrencyAmount,
        transaction_fees: allFee,
        number_of_transactions: numTransactions,
        outputs_volume: totalOutputsAmount,
        difficulty: totDiff,
        network_hash_ps: sumNetHash && countNetHash ? sumNetHash / countNetHash : 0,
        blocks_by_pool: poolsArr
    };

    return nextCb(null, result);

};

StatisticService.prototype.getPoolsLastHour = function (nextCb) {

    var self = this,
        initHeight = self.lastCheckedBlock,
        height = initHeight,
        next = true,
        minedBlocks = 0,
        dayPoolData = [];

    while (next && height > 0) {

        var currentElement = self.blocksByHeight1h.get(height),
            mined = self.minedByByHeight1h.get(height);
        if (currentElement) {

            minedBlocks++;

            if (mined) {
                var objIndex = dayPoolData.findIndex((obj => obj.minedby == mined));

                if (objIndex == -1) {
                    dayPoolData.push({ minedby: mined, count: 1 });

                } else {
                    dayPoolData[objIndex].count += 1;

                }

            }

        } else {
            next = false;
        }

        height--;

    }

    var poolsArr = JSON.parse(JSON.stringify(dayPoolData));
    poolsArr.forEach(function (obj) {
        var name;
        name = self.getPoolInfo(obj.minedby);
        if (_.isEmpty(name)) {
            obj.address = obj.minedby;
            obj.poolName = "Unknown",
                obj.url = "";
        } else {
            obj.address = obj.minedby;
            obj.poolName = name.poolName;
            obj.url = name.url;
        }
        delete obj.minedby;
        var blocksWon = parseInt(obj.count);
        var tempNum = blocksWon / minedBlocks * 100;
        obj.blocks_found = obj.count;
        obj.percent_total = tempNum.toFixed(2);
        delete obj.count;

    });
    poolsArr.sort(function (a, b) {
        return b.percent_total - a.percent_total;
    });
    var result = {
        n_blocks_mined: minedBlocks,
        blocks_by_pool: poolsArr
    };

    return nextCb(null, result);

};
StatisticService.prototype.getBlockReward = function (height, callback) {
    // Subsidy is cut in half every 657850 blocks which will occur approximately every 2.5 years.
    var halvings;
    if (height >= 2020000) {
        var subsidy = new BN(14 * 1e8);
    } else {
        if (height <= 5000) {
            halvings = 0
        } else {
            halvings = Math.floor((height - (2500)) / 655350);
        }
        // Force block reward to zero when right shift is undefined.
        if (halvings >= 64) {
            return 0;
        }
        if (halvings >= 2) {
            halvings = 2
        }

        // Mining slow start
        // The subsidy is ramped up linearly, skipping the middle payout of
        // MAX_SUBSIDY/2 to keep the monetary curve consistent with no slow start.
        if (height == 0) {
            var subsidy = new BN(0)
        } else if (height == 1) {
            var subsidy = new BN(0)
        } else if (height == 2) {
            var subsidy = new BN(13020000 * 1e8)
        } else if (height < 2500) {
            var subsidy = new BN(150 * 1e8 * (height - 1) / 5000)
        } else if (height < 5000) {
            var subsidy = new BN(150 * 1e8 * height / 5000)
        } else {
            var subsidy = new BN(150 * 1e8)
        }

        subsidy = subsidy.shrn(halvings);
    }
    var sub;
    sub = parseInt(subsidy.toString(10));
    callback(null, sub);
};

StatisticService.prototype.getBlockRewardr = function (height) {
    if (height >= 2020000) {
        var subsidy = new BN(14 * 1e8);
    } else {
        // Subsidy is cut in half every 657850 blocks which will occur approximately every 2.5 years.
        var halvings;
        if (height <= 5000) {
            halvings = 0
        } else {
            halvings = Math.floor((height - (2500)) / 655350);
        }
        // Force block reward to zero when right shift is undefined.
        if (halvings >= 64) {
            return 0;
        }
        if (halvings >= 2) {
            halvings = 2
        }

        // Mining slow start
        // The subsidy is ramped up linearly, skipping the middle payout of
        // MAX_SUBSIDY/2 to keep the monetary curve consistent with no slow start.
        if (height == 0) {
            var subsidy = new BN(0)
        } else if (height == 1) {
            var subsidy = new BN(0)
        } else if (height == 2) {
            var subsidy = new BN(13020000 * 1e8)
        } else if (height < 2500) {
            var subsidy = new BN(150 * 1e8 * (height - 1) / 5000)
        } else if (height < 5000) {
            var subsidy = new BN(150 * 1e8 * height / 5000)
        } else {
            var subsidy = new BN(150 * 1e8)
        }
        subsidy = subsidy.shrn(halvings);
    }

    return parseInt(subsidy.toString(10));
};

StatisticService.prototype.getPoolInfo = function (paddress) {
    for (var k in this.poolStrings) {
        if (paddress != null) {
            if (paddress.toString().match(k)) {
                this.poolStrings[k].address = paddress;
                return this.poolStrings[k];
            }
        }
    }
    return {};
};

/**
 *
 * @return {BigNumber} supply - BigNumber representation of total supply
 */
/**
 * Calculate circulating supply for main chain only (single chain, not parallel assets)
 * @return {BigNumber} supply - BigNumber representation of circulating supply
 */
StatisticService.prototype.getCirculatingSupply = function () {
    const PON_HEIGHT = 2020000;
    const FIRST_HALVING = 657850;
    const HALVING_INTERVAL = 655350;
    const EXCHANGE_FUND_HEIGHT = 835554;
    const EXCHANGE_FUND_AMOUNT = 10000000;

    // Time-locked fund releases (10 releases of 22M each)
    const FUND_RELEASES = [
        { height: 837714, amount: 22000000 },
        { height: 859314, amount: 22000000 },
        { height: 880914, amount: 22000000 },
        { height: 902514, amount: 22000000 },
        { height: 924114, amount: 22000000 },
        { height: 945714, amount: 22000000 },
        { height: 967314, amount: 22000000 },
        { height: 988914, amount: 22000000 },
        { height: 1010514, amount: 22000000 },
        { height: 1032114, amount: 22000000 }
    ];

    let subsidy = 150;
    const height = this.node.services.bitcoind.height;

    // Traditional mining only goes up to PON_HEIGHT
    const miningHeight = Math.min(height, PON_HEIGHT - 1);

    // Calculate halvings (max 2)
    const halvings = Math.min(2, Math.floor((miningHeight - 2500) / HALVING_INTERVAL));

    // Initial supply: slow start + premine + dev fund
    let coins = ((FIRST_HALVING - 5000) * 150) + 375000 + 13020000;

    // Add exchange fund allocation if height reached
    if (height >= EXCHANGE_FUND_HEIGHT) {
        coins += EXCHANGE_FUND_AMOUNT;
    }

    // Add time-locked fund releases
    FUND_RELEASES.forEach(release => {
        if (height >= release.height) {
            coins += release.amount;
        }
    });

    // Calculate traditional mining rewards through halvings
    for (let i = 1; i <= halvings; i++) {
        subsidy = subsidy / 2;

        if (i === halvings) {
            // Current/last halving period - partial blocks
            coins += (miningHeight - FIRST_HALVING - ((i - 1) * HALVING_INTERVAL)) * subsidy;
        } else {
            // Completed halving period - full interval
            coins += HALVING_INTERVAL * subsidy;
        }
    }

    // Add PON (Proof of Node) rewards after PON_HEIGHT
    if (height >= PON_HEIGHT) {
        coins += (height - PON_HEIGHT + 1) * 14;
    }

    return new BigNumber(coins);
};
StatisticService.prototype.getCirculatingSupplyAllChains = function () {
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
        { name: 'KDA', launchHeight: 825000 },    // KDA is always active when asset mining starts
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

    return new BigNumber(coins.toString());
};
StatisticService.prototype.getTotalSupply = function () {
    const height = this.node.services.bitcoind.height

    var supply = new BigNumber(560000000);
    if (height < 2020000) {
        return new BigNumber(440000000);
    }
    if (height < 825000) {
        supply = new BigNumber(210000000);
    }

    return supply;
};
StatisticService.prototype.getTotalSupplyAllChains = function () {
    const height = this.node.services.bitcoind.height
    var supply = new BigNumber(560000000);
    if (height < 2020000) {
        return new BigNumber(440000000);
    }
    if (height < 825000) {
        supply = new BigNumber(210000000);
    }

    return supply;
};
StatisticService.prototype.mode = function (array) {
    if (!array.length) return [];
    var modeMap = {},
        maxCount = 0,
        modes = [];

    array.forEach(function (val) {
        if (!modeMap[val]) modeMap[val] = 1;
        else modeMap[val]++;

        if (modeMap[val] > maxCount) {
            modes = [val];
            maxCount = modeMap[val];
        }
        else if (modeMap[val] === maxCount) {
            modes.push(val);
            maxCount = modeMap[val];
        }
    });
    return modes;
};
StatisticService.prototype.getDetailedTransaction = function (txid, callback) {

    var self = this;
    var tx = null;
    return async.waterfall([function (callback) {

        return self.node.getDetailedTransaction(txid, function (err, transaction) {
            return callback(err, transaction);
        });

    }], function (err, transaction) {
        return callback(err, transaction);
    });

};

module.exports = StatisticService;
