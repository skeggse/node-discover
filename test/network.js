var expect = require('expect.js');
var sinon = require('sinon');
var _ = require('underscore');

var crypto = require('crypto');
var EventEmitter = require('eventemitter2').EventEmitter2;
var util = require('util');

var Network = require('../lib/network');

var sampleObject = function() {
  return {
    alpha: 'beta',
    gamma: +63174,
    epsilon: ['z','e','t','a'],
    eta: {t:'h',et:'a'},
    iota: !'kappa'
  };
};

var sampleBuffer = function() {
  return new Buffer(JSON.stringify(sampleObject()), 'utf-8');
};

var randomString = function(length) {
  return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').substr(0, length);
};

describe('Network', function() {
  it('should return an instance of EventEmitter and Network', function() {
    var network = new Network();
    expect(network).to.be.an(EventEmitter);
    expect(network).to.be.a(Network);
    network = Network();
    expect(network).to.be.an(EventEmitter);
    expect(network).to.be.a(Network);
  });

  describe('networking', function() {
    var primary, secondary, badSpy;

    var defaults = {
      ignore: null,
      scope: null
    };

    this.timeout(0);

    beforeEach(function() {
      defaults.scope = [];
      badSpy = sinon.spy();
    });

    var create = function(options) {
      options = _.defaults(options || {}, defaults);
      primary = new Network(options);
      secondary = new Network(options);
    };

    var setupSpies = function() {
      secondary.on('error', badSpy);
      secondary.on('message', badSpy);
    };

    var basic = function(obj, done) {
      setupSpies();
      primary.send('hello', obj);
      secondary.on('hello', function(data, container) {
        expect(badSpy.called).not.to.be.ok();
        expect(data).to.eql(obj);
        expect(container.data).to.eql(obj);
        done();
      });
    };

    it('should transfer data without encryption', function(done) {
      create();
      basic({thinking: true}, done);
    });

    it('should transfer data with encryption', function(done) {
      create({
        key: crypto.randomBytes(32)
      });
      basic({thinking: true}, done);
    });

    it('should transfer large data bursts without encryption', function(done) {
      var obj = {};
      for (var i = 0; i < 5000; i++)
        obj[randomString(16)] = randomString(16);
      create();
      basic(obj, done);
    });

    it('should transfer large data bursts with encryption', function(done) {
      var obj = {};
      for (var i = 0; i < 5000; i++)
        obj[randomString(16)] = randomString(16);
      create({
        key: crypto.randomBytes(32)
      });
      basic(obj, done);
    });

    it('should emit listening', function(done) {
      var network = new Network();
      network.on('listening', done);
    });

    it('should handle the close method', function(done) {
      var network = new Network({
        ignore: null
      });
      network.on('close', function() {
        done();
      });
      network.on('listening', function() {
        network.close();
      });
    });
  });
});
