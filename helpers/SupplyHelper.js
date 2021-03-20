var BigNumber = require('bignumber.js');

module.exports = {
    /**
     *
     * @param {Number} height
     * @return {BigNumber}
     */
    getTotalSupplyByHeight: function (height) {
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
    
        var supply = new BigNumber(coins);
        return supply;
    }

};
