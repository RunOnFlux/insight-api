'use strict';

var should = require('should');

var CacheHelper = require('../helpers/CacheHelper');
var StatisticService = require('../services/StatisticService');

describe('CacheHelper', function() {

  it('will remove an expired entry whose key is never read again', function(done) {
    var cache = CacheHelper.create(10);
    cache.set(1, {height: 1}, {ttl: 20});
    cache.set(2, {height: 2}, {ttl: 20});
    cache.size.should.equal(2);
    setTimeout(function() {
      cache.size.should.equal(0);
      done();
    }, 100);
  });

  it('will hold at most its limit', function() {
    var cache = CacheHelper.create(3);
    for (var i = 0; i < 10; i++) {
      cache.set(i, i);
    }
    cache.size.should.equal(3);
    should.not.exist(cache.get(0));
    cache.get(9).should.equal(9);
  });

});

describe('StatisticService caches', function() {

  it('will bound the day and hour caches by their windows', function() {
    StatisticService.DAY_CACHE_LIMIT.should.be.within(2880, 10000);
    StatisticService.HOUR_CACHE_LIMIT.should.be.within(120, 1000);
  });

});
