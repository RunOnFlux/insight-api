const callbackify = require('util').callbackify;
const AddressBlocksMined = require('../models/AddressBlocksMined');

function AddressBlocksMinedRepository () {}

/**
 *
 * @param {Object} data
 * @param {String} data.address
 * @param {Function} next
 */
AddressBlocksMinedRepository.prototype.createOrUpdateAddress = callbackify(async function (data) {

    const row = await AddressBlocksMined.findOne({address: data.address}).exec();

    if (row) {
        await AddressBlocksMined.updateOne({address: data.address}, {$inc: {count: 1}}).exec();
    } else {
        await AddressBlocksMined.create({address: data.address, count: 1});
    }

});

/**
 *
 * @param {Array} addresses
 * @param {Function} next
 */
AddressBlocksMinedRepository.prototype.getMinedBlocksByAddresses = callbackify(function (addresses) {
    return AddressBlocksMined.find({address: {$in: addresses}}).exec();
});

module.exports = AddressBlocksMinedRepository;
