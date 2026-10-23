'use strict';

var should = require('should');
var http = require('http');
var HttpHelper = require('../helpers/HttpHelper');

describe('HttpHelper', function() {
  var server;
  var base;
  var lastRequest;

  before(function(done) {
    server = http.createServer(function(req, res) {
      lastRequest = req;
      if (req.url === '/json') {
        res.writeHead(200, {'Content-Type': 'application/json'});
        return res.end('{"quotes":{"USD":{"price":1.5}}}');
      }
      if (req.url === '/text') {
        res.writeHead(200, {'Content-Type': 'text/plain'});
        return res.end('not json');
      }
      if (req.url === '/redirect') {
        res.writeHead(302, {Location: '/json'});
        return res.end();
      }
      res.writeHead(503);
      res.end('busy');
    });
    server.listen(0, '127.0.0.1', function() {
      base = 'http://127.0.0.1:' + server.address().port;
      done();
    });
  });

  after(function(done) {
    server.close(done);
  });

  it('will give the parsed body of a JSON request', function(done) {
    HttpHelper.get(base + '/json', {json: true}, function(err, response, body) {
      should.not.exist(err);
      response.statusCode.should.equal(200);
      body.should.eql({quotes: {USD: {price: 1.5}}});
      lastRequest.headers.accept.should.equal('application/json');
      done();
    });
  });

  it('will give the text of a body that is not JSON', function(done) {
    HttpHelper.get(base + '/text', {json: true}, function(err, response, body) {
      should.not.exist(err);
      body.should.equal('not json');
      done();
    });
  });

  it('will give the text without the json option', function(done) {
    HttpHelper.get(base + '/json', {}, function(err, response, body) {
      should.not.exist(err);
      body.should.equal('{"quotes":{"USD":{"price":1.5}}}');
      done();
    });
  });

  it('will follow a redirect', function(done) {
    HttpHelper.get(base + '/redirect', {json: true}, function(err, response, body) {
      should.not.exist(err);
      response.statusCode.should.equal(200);
      body.quotes.USD.price.should.equal(1.5);
      done();
    });
  });

  it('will give the status of an error response', function(done) {
    HttpHelper.get(base + '/busy', {}, function(err, response, body) {
      should.not.exist(err);
      response.statusCode.should.equal(503);
      body.should.equal('busy');
      done();
    });
  });

  it('will give a connection error', function(done) {
    HttpHelper.get('http://127.0.0.1:1/', {}, function(err, response) {
      should.exist(err);
      should.not.exist(response);
      done();
    });
  });
});
