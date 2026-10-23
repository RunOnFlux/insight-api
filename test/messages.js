'use strict';

var should = require('should');
var sinon = require('sinon');
var MessagesController = require('../lib/messages');
var bitcore = require('bitcore-lib');

describe('Messages', function() {

  var privateKey = bitcore.PrivateKey.fromWIF('cN9spWsvaxA8taS7DFMxnk1yJD2gaF2PX1npuTpy3vuZFJdwavaw');
  var address = 'tmYjAZFpvdDXTaJrq2WikAntitBNJJo9VSo';
  var badAddress = 'tmYjAZFpvdDXTaJrq2WikAntitBNJJo9Vao';
  var signature = 'ILAX0fA8zFP6pdb3yKnXzp6dxPfjLJs2CyCTo12IwrdkTarHrEyNT9+sPZzMwdrzC8yhFoPCefOThRWKqILmwsU=';
  var message = 'cellar door';

  it('the fixture signature belongs to the fixture key', function() {
    privateKey.toAddress().toString().should.equal(address);
  });

  it('will verify a message (true)', function(done) {

    var controller = new MessagesController({log: {error: sinon.stub()}});

    var req = {
      body: {
        'address': address,
        'signature': signature,
        'message': message
      },
      query: {}
    };
    var res = {
      json: function(data) {
        data.result.should.equal(true);
        done();
      }
    };

    controller.verify(req, res);
  });

  it('will verify a message (false)', function(done) {

    var controller = new MessagesController({log: {error: sinon.stub()}});

    var req = {
      body: {
        'address': address,
        'signature': signature,
        'message': 'wrong message'
      },
      query: {}
    };
    var res = {
      json: function(data) {
        data.result.should.equal(false);
        done();
      }
    };

    controller.verify(req, res);
  });

  it('handle an error from message verification', function(done) {
    var controller = new MessagesController({log: {error: sinon.stub()}});
    var req = {
      body: {
        'address': badAddress,
        'signature': signature,
        'message': message
      },
      query: {}
    };
    var send = sinon.stub();
    var status = sinon.stub().returns({send: send});
    var res = {
      status: status,
    };
    controller.verify(req, res);
    status.args[0][0].should.equal(400);
    send.args[0][0].should.equal('Unexpected error: Checksum mismatch. Code:1');
    done();
  });

  it('handle error with missing parameters', function(done) {
    var controller = new MessagesController({log: {error: sinon.stub()}});
    var req = {
      body: {},
      query: {}
    };
    var send = sinon.stub();
    var status = sinon.stub().returns({send: send});
    var res = {
      status: status
    };
    controller.verify(req, res);
    status.args[0][0].should.equal(400);
    send.args[0][0].should.match(/^Missing parameters/);
    done();
  });

});
