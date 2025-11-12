var BigNumber = require('bignumber.js');

module.exports = {
    /**
     * Calculate circulating supply for main chain only (single chain, not parallel assets)
     * @param {Number} height - Block height
     * @return {BigNumber} - Circulating supply
     */
    getCirculatingSupplyByHeight: function (height) {
        const PON_HEIGHT = 2020000;
        const FIRST_HALVING = 657850;
        const HALVING_INTERVAL = 655350;

        // Time-locked fund releases (appears to be vesting schedule)
        const FUND_RELEASES = [
            { height: 836274, amount: 7500000 },
            { height: 836994, amount: 2500000 },
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

        // Traditional mining only goes up to PON_HEIGHT
        const miningHeight = Math.min(height, PON_HEIGHT - 1);

        // Calculate halvings (max 2)
        const halvings = Math.min(2, Math.floor((miningHeight - 2500) / HALVING_INTERVAL));

        // Initial supply: slow start + premine + dev fund
        let coins = ((FIRST_HALVING - 5000) * 150) + 375000 + 13020000;

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

        // Add time-locked fund releases
        FUND_RELEASES.forEach(release => {
            if (height >= release.height) {
                coins += release.amount;
            }
        });

        // Add PON rewards after PON_HEIGHT
        if (height >= PON_HEIGHT) {
            coins += (height - PON_HEIGHT + 1) * 14;
        }

        return new BigNumber(coins);
    },

    getTotalSupplyByHeight: function (height) {
        // Total supply equals circulating supply for this implementation
        return this.getCirculatingSupplyByHeight(height);
    }

};
