const mongoose = require('mongoose');
const Common = require('../lib/common');
function Db(node, config) {
    this.config = config;
    this.node = node;
    this.common = new Common({log: this.node.log});
}

/**
 * Connects mongoose's default connection, which every model uses.
 * @param {Function} cb - called with an error when the first connection fails
 */
Db.prototype.connect = function (cb) {

    var self = this,
        configDB = this.config,
        userUrl = (configDB['user']) ? (configDB['user'] + ':' + configDB['password'] + '@') : '',
        url = 'mongodb://' + userUrl + configDB['host'] + ':' + configDB['port'] + '/' + configDB['database'];

    mongoose.connect(url).then(function () {

        self.common.log.info('[DB] Connected');

        return process.nextTick(cb);

    }, function (err) {

        self.common.log.error('[DB] ', err);

        return process.nextTick(cb, err);

    });

};

module.exports = Db;
