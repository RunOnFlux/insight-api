'use strict';

var should = require('should');
var http = require('http');
var net = require('net');
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

  describe('through a proxy', function() {
    var proxy;
    var proxyUrl;
    var seen;

    before(function(done) {
      // an HTTP proxy: forwards a plain request for an absolute URL, tunnels a CONNECT
      proxy = http.createServer(function(req, res) {
        seen.push(req.url);
        var upstream = http.request(req.url, {method: req.method, headers: req.headers}, function(answer) {
          res.writeHead(answer.statusCode, answer.headers);
          answer.pipe(res);
        });
        req.pipe(upstream);
      });
      proxy.on('connect', function(req, socket, head) {
        seen.push(req.url);
        var parts = req.url.split(':');
        var upstream = net.connect(Number(parts[1]), parts[0], function() {
          socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
          upstream.write(head);
          upstream.pipe(socket);
          socket.pipe(upstream);
        });
        upstream.on('error', function() {
          socket.destroy();
        });
      });
      proxy.listen(0, '127.0.0.1', function() {
        proxyUrl = 'http://127.0.0.1:' + proxy.address().port;
        done();
      });
    });

    beforeEach(function() {
      seen = [];
    });

    after(function(done) {
      proxy.close(done);
    });

    it('will send the request through the proxy', function(done) {
      HttpHelper.get(base + '/json', {json: true, proxy: proxyUrl}, function(err, response, body) {
        should.not.exist(err);
        response.statusCode.should.equal(200);
        body.quotes.USD.price.should.equal(1.5);
        seen.should.eql([base + '/json']);
        done();
      });
    });

    it('will give a connection error when the proxy cannot be reached', function(done) {
      HttpHelper.get(base + '/json', {proxy: 'http://127.0.0.1:1'}, function(err, response) {
        should.exist(err);
        should.not.exist(response);
        done();
      });
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
