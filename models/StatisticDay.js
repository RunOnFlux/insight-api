const mongoose = require('mongoose');

const statisticDaySchema = new mongoose.Schema({
    totalTransactionFees: {
        sum: {
            type: String,
            required: true,
            default : '0'
        },
        count: {
            type: String,
            required: true,
            default : '0'
        }
    },
    numberOfTransactions: {
        count: {
            type: String,
            required: true,
            default : '0'
        }
    },
    totalOutputVolume: {
        sum: {
            type: String,
            required: true,
            default : '0'
        }
    },
    totalBlocks: {
        count: {
            type: String,
            required: true,
            default : '0'
        }
    },
    difficulty: {
        sum: {
            type: Array,
            required: true,
            default : []
        }
    },
    supply: {
        sum: {
            type: String,
            required: true,
            default : '0'
        }
    },
    poolData: {
        pool: {
            type: Array,
            required: true,
            default : []
        }
    },
    netHash: {
        sum: {
            type: String,
            required: true,
            default : '0'
        },
        count: {
            type: String,
            required: true,
            default : '0'
        }
    },
    date: {
        type: Date,
        required: true,
        index: true
    },
    activeAddresses: {
        addresses: {
            type: Array,
            required: true,
            default : []
        },
        count: {
            type: Number,
            required: true,
            default : 0
        }
    }
}, {
    timestamps: {
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    }
});

const StatisticDay = mongoose.model('StatisticDay', statisticDaySchema);

module.exports = StatisticDay;
