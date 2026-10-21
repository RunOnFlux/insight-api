'use strict';

var BigNumber = require('bignumber.js');

/**
 * Proof of Node (PON) block subsidy schedule (mainnet), mirroring fluxd GetBlockSubsidy.
 *
 * The PON block subsidy starts at 14 FLUX and is reduced by 10% every
 * PON_REDUCTION_INTERVAL blocks (~1 year of 30 second blocks), at most
 * PON_MAX_REDUCTIONS times. fluxd applies each reduction with integer
 * arithmetic on satoshis: subsidy = floor(subsidy * 9 / 10).
 *
 *   height >= 2020000: 14 FLUX
 *   height >= 3071200: 12.6 FLUX
 *   height >= 4122400: 11.34 FLUX
 */
const PON_ACTIVATION_HEIGHT = 2020000;
const PON_INITIAL_SUBSIDY = 14 * 1e8; // satoshis
const PON_REDUCTION_INTERVAL = 1051200;
const PON_MAX_REDUCTIONS = 20;

/**
 * Number of 10% reductions in effect at a given height
 * @param {Number} height - Block height
 * @return {Number}
 */
function getPonReductions(height) {
    if (height < PON_ACTIVATION_HEIGHT) {
        return 0;
    }
    return Math.min(PON_MAX_REDUCTIONS, Math.floor((height - PON_ACTIVATION_HEIGHT) / PON_REDUCTION_INTERVAL));
}

/**
 * PON block subsidy in satoshis (0 before PON activation)
 * @param {Number} height - Block height
 * @return {Number}
 */
function getPonSubsidySats(height) {
    if (height < PON_ACTIVATION_HEIGHT) {
        return 0;
    }
    let subsidy = PON_INITIAL_SUBSIDY;
    const reductions = getPonReductions(height);
    for (let i = 0; i < reductions; i++) {
        subsidy = Math.floor(subsidy * 9 / 10);
    }
    return subsidy;
}

/**
 * FLUX emitted by PON blocks from PON_ACTIVATION_HEIGHT through height (inclusive).
 * Summed per subsidy period in satoshis with BigNumber, as the total can exceed 2^53 satoshis.
 * @param {Number} height - Block height
 * @return {BigNumber} - PON emission in FLUX
 */
function getPonEmission(height) {
    let emission = new BigNumber(0);
    let start = PON_ACTIVATION_HEIGHT;
    while (start <= height) {
        // Last height of the subsidy period starting at `start`; the period after the final reduction is open-ended
        let end = height;
        if (getPonReductions(start) < PON_MAX_REDUCTIONS) {
            end = Math.min(height, start + PON_REDUCTION_INTERVAL - 1);
        }
        emission = emission.plus(new BigNumber(end - start + 1).times(getPonSubsidySats(start)));
        start = end + 1;
    }
    return emission.dividedBy(1e8);
}

module.exports = {
    PON_ACTIVATION_HEIGHT: PON_ACTIVATION_HEIGHT,
    PON_INITIAL_SUBSIDY: PON_INITIAL_SUBSIDY,
    PON_REDUCTION_INTERVAL: PON_REDUCTION_INTERVAL,
    PON_MAX_REDUCTIONS: PON_MAX_REDUCTIONS,
    getPonReductions: getPonReductions,
    getPonSubsidySats: getPonSubsidySats,
    getPonEmission: getPonEmission
};
