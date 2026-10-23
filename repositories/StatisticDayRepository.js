const callbackify = require('util').callbackify;
const StatisticDay = require('../models/StatisticDay');

function StatisticDayRepository () {}

StatisticDayRepository.prototype.getDay = callbackify(function (date) {
    return StatisticDay.findOne({date: date}).exec();
});

StatisticDayRepository.prototype.createOrUpdateDay = callbackify(function (date, data) {
    return StatisticDay.findOneAndUpdate({date: date}, data, {upsert: true, returnDocument: 'after'}).exec();
});

/**
 *
 * @param {Date} from
 * @param {Date} to
 * @param next
 */
StatisticDayRepository.prototype.getStats = callbackify(function (from, to) {
    return StatisticDay.find({date: {$gt: from, $lte: to}}, {}, {sort: {date: -1}}).exec();
});


module.exports = StatisticDayRepository;
