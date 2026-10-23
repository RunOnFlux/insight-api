const callbackify = require('util').callbackify;
const LastBlock = require('../models/LastBlock');

function LastBlockRepository () {}

LastBlockRepository.prototype.updateOrAddLastBlock = callbackify(function (last_block_number, type) {
    return LastBlock.findOneAndUpdate({type: type}, {
        last_block_number: last_block_number,
        type: type
    }, {upsert: true}).exec();
});

LastBlockRepository.prototype.setLastBlockType = callbackify(async function (type, updateFrom) {

    let existingType = await LastBlock.findOne({type: type}).exec();

    if (!existingType) {
        existingType = await LastBlock.create({
            type: type,
            last_block_number: 0
        });
    }

    if (updateFrom > existingType.last_block_number) {
        await LastBlock.findOneAndUpdate({type: type}, {
            last_block_number: updateFrom,
            type: type
        }, {upsert: true}).exec();
    }

});

LastBlockRepository.prototype.getLastBlockByType = callbackify(function (type) {
    return LastBlock.findOne({type: type}).exec();
});

module.exports = LastBlockRepository;
