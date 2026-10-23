const callbackify = require('util').callbackify;
const AddressBalance = require('../models/AddressBalance');

function AddressBalanceRepository () {}

AddressBalanceRepository.prototype.createOrUpdateBalance = callbackify(function (data) {
    return AddressBalance.findOneAndUpdate({address: data.address}, data, {upsert: true, returnDocument: 'after'}).exec();
});

AddressBalanceRepository.prototype.removeBalanceByAddress = callbackify(function (address) {
    return AddressBalance.deleteMany({address: address}).exec();
});

AddressBalanceRepository.prototype.getMaxBalance = callbackify(function () {
    return AddressBalance.findOne().sort({'balance': -1}).exec();
});

AddressBalanceRepository.prototype.getMaxBalances = callbackify(function (options) {
    return AddressBalance.find().sort({'balance': -1}).limit(options.limit).exec();
});

AddressBalanceRepository.prototype.getCountAddressesGreaterThan = callbackify(function (min) {
    return AddressBalance.countDocuments({balance: {$gt: min}}).exec();
});

AddressBalanceRepository.prototype.getInfoByInterval = callbackify(function (min, max) {
    return AddressBalance.aggregate([
        { $match: { balance: {$gt: min, $lte: max} } },
        { $group: {
            _id: null,
            sum: { $sum: "$balance" },
            count: { $sum: 1 }
        }}
    ]).exec();
});

AddressBalanceRepository.prototype.getCountRicherThan = callbackify(function () {
    return AddressBalance.findOne().sort({'balance': -1}).exec();
});

module.exports = AddressBalanceRepository;
