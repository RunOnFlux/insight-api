'use strict';

var Common = require('./common');

function FluxNodeController(node) {
  this.node = node;
  this.common = new Common({ log: this.node.log });
}

// looks like i need to have it in separate call as was causing issues
FluxNodeController.prototype.listFluxNodes = function (req, res) {
  this.node.services.bitcoind.viewdeterministiczelnodelist(function (err, response) {
    if (err) {
      res.jsonp(err);
      return;
    }
    res.jsonp(response);
  });
};

FluxNodeController.prototype.listFluxNodesFilter = function (req, res) {
  var filter = req.body.filter || req.params.filter || req.query.filter;
  this.node.services.bitcoind.viewdeterministiczelnodelist(function (err, response) {
    if (err) {
      res.jsonp(err);
      return;
    }
    if (!filter) {
      res.jsonp(response);
    } else if (filter.includes(',')) {
      const fluxnodeList = response.result;
      // comma separated list of collateralHash-collateralIndex, collateralHash-collateralIndex or more filters
      const collateralsInInterest = filter.split(',');
      let goodfluxNodes = [];
      collateralsInInterest.forEach((interestedFilter) => {
        if (interestedFilter.includes('-')) {
          const txhash = interestedFilter.split('-')[0];
          const outidx = interestedFilter.split('-')[1];
          const goodfluxNodeList = fluxnodeList.filter((fluxnode) => (fluxnode.txhash === txhash && fluxnode.outidx === outidx))
          if (goodfluxNodeList.length > 0) {
            goodfluxNodes = goodfluxNodes.concat(goodfluxNodeList);
          }
        } else {
          if (interestedFilter.split(".")[3]) { // full ip address
            const goodfluxNodeList = fluxnodeList.find((fluxnode) => fluxnode.ip === interestedFilter)
            if (goodfluxNodeList) {
              goodfluxNodes.push(goodfluxNodeList);
            }
          } else {
            const goodfluxNodeList = fluxnodeList.filter((fluxnode) => JSON.stringify(fluxnode).includes(interestedFilter))
            if (goodfluxNodeList.length > 0) {
              goodfluxNodes = goodfluxNodes.concat(goodfluxNodeList);
            }
          }
        }
      })
      const fluxnodeListToRespond = [...new Set(goodfluxNodes)];
      res.jsonp({
        result: fluxnodeListToRespond,
        error: response.error,
        id: response.id
      })
    } else if (filter.includes('-')) {
      const fluxnodeList = response.result;
      // scneario for just one fluxnode
      let goodfluxNodes = [];
      const txhash = filter.split('-')[0];
      const outidx = filter.split('-')[1];
      const goodfluxNodeList = fluxnodeList.filter((fluxnode) => (fluxnode.txhash === txhash && fluxnode.outidx === outidx))
      if (goodfluxNodeList.length > 0) {
        goodfluxNodes = goodfluxNodes.concat(goodfluxNodeList);
      }
      const fluxnodeListToRespond = [...new Set(goodfluxNodes)];
      res.jsonp({
        result: fluxnodeListToRespond,
        error: response.error,
        id: response.id
      })
    } else {
      let filteredList = [];
      if (filter.split(".")[3]) { // full ip address
        const goodfluxNodeList = response.result.find((fluxnode) => fluxnode.ip === filter)
        if (goodfluxNodeList) {
          filteredList.push(goodfluxNodeList);
        }
      } else {
        filteredList = response.result.filter(function (fluxnode) {
          return JSON.stringify(fluxnode).includes(filter);
        })
      }
      res.jsonp({
        result: filteredList,
        error: response.error,
        id: response.id
      })
    }
  });
};

module.exports = FluxNodeController;
