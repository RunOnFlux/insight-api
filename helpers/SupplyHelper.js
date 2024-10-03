var BigNumber = require('bignumber.js');

module.exports = {
    /**
     *
     * @param {Number} height
     * @return {BigNumber}
     */
    getCirculatingSupplyByHeight: function (height) {
        let subsidy = 150;
        var halvings = Math.floor((height - 2500) / 655350);
        var coins = ((657850 - 5000) * 150) + 375000 + 13020000;
        for (let i = 1; i <= halvings; i++) {
          subsidy = subsidy / 2;
          if (i >= 64) {
            coins += 0
          } else if (i === halvings) {
            // good for last one
            coins += (height - 657850 - ((i - 1) * 655350)) * subsidy;
          } else {
            coins += 655350 * subsidy
          }
        }
        if (height >= 836274) {
          coins += 7500000;
        }
        if (height >= 836994) {
          coins += 2500000;
        }
        if (height >= 837714) {
          coins += 22000000;
        }
        if (height >= 859314) {
          coins += 22000000;
        }
        if (height >= 880914) {
          coins += 22000000;
        }
        if (height >= 902514) {
          coins += 22000000;
        }
        if (height >= 924114) {
          coins += 22000000;
        }
        if (height >= 945714) {
          coins += 22000000;
        }
        if (height >= 967314) {
          coins += 22000000;
        }
        if (height >= 988914) {
          coins += 22000000;
        }
        if (height >= 1010514) {
          coins += 22000000;
        }
        if (height >= 1032114) {
          coins += 22000000;
        }
    
        var supply = new BigNumber(coins);
        return supply;
    },

    getTotalSupplyByHeight: function (height) {
        // var supply = new BigNumber(440000000);
        // if (height < 825000) {
        //     supply = new BigNumber(210000000);
        // }

        return getCirculatingSupplyByHeight(height);
    }

};
