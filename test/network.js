var expect = require('expect.js');
var sinon = require('sinon');
var rewire = require('rewire');
var hat = require('hat');

var crypto = require('crypto');
var EventEmitter = require('eventemitter2').EventEmitter2;
var util = require('util');

var MockSocket = function() {
  if (!(this instanceof MockSocket))
    return new MockSocket();

  EventEmitter.call(this);

  this.bind = sinon.spy();
  this.send = sinon.spy();
  this.addMembership = sinon.spy();
  this.setMulticastTTL = sinon.spy();
  this.setBroadcast = sinon.spy();
};

util.inherits(MockSocket, EventEmitter);

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

describe('Network', function() {
  var Network, host;

  beforeEach(function() {
    Network = rewire('../lib/network');
    Network.__set__('dgram', {createSocket: function() {
      return new MockSocket();
    }});
    Network.__set__('os', {hostname: function() {return host;}});
  });

  it('should return an instance of EventEmitter and Network', function() {
    var network = new Network();
    expect(network).to.be.an(EventEmitter);
    expect(network).to.be.a(Network);
    network = Network();
    expect(network).to.be.an(EventEmitter);
    expect(network).to.be.a(Network);
  });

  var encode = function(network, data) {
    var encoded = sinon.spy();
    network.encode(data, encoded);
    expect(encoded.calledOnce).to.be.ok();
    expect(encoded.args[0][0]).not.to.be.an(Error);
    expect(encoded.args[0][1]).to.be.a(Buffer);
    return encoded.args[0][1];
  };

  var decode = function(network, data) {
    var decoded = sinon.spy();
    network.decode(data, decoded);
    expect(decoded.calledOnce).to.be.ok();
    expect(decoded.args[0][0]).not.to.be.an(Error);
    expect(decoded.args[0][1]).to.be.an('object');
    return decoded.args[0][1];
  };

  describe('#encode', function() {
    it('should encode without a key', function() {
      var plaintext = sampleObject();
      var network = new Network();
      var encoded = encode(network, plaintext);
      expect(encoded).to.eql(sampleBuffer());
    });

    it('should encrypt with a key', function() {
      var plaintext = sampleObject();
      var network = new Network({
        key: crypto.randomBytes(32)
      });
      var encoded = encode(network, plaintext);
      var buf = sampleBuffer();
      expect(encoded).not.to.eql(buf);
      var cipher = crypto.createCipher('aes256', network.key);
      var parts = [cipher.update(buf), cipher.final()];
      buf = Buffer.concat(parts, parts[0].length + parts[1].length);
      expect(encoded).to.eql(buf);
    });
  });

  describe('#decode', function() {
    it('should fail with invalid data', function(done) {
      var network = new Network();
      var ciphertext = crypto.randomBytes(32);
      network.decode(ciphertext, function(err, plain) {
        expect(err).to.be.an(Error);
        done();
      });
    });

    it('should decode without a key', function() {
      var network = new Network();
      var ciphertext = sampleBuffer();
      var decoded = decode(network, ciphertext);
      expect(decoded).to.eql(sampleObject());
    });

    it('should decode with a key', function() {
      var network = new Network({
        key: crypto.randomBytes(32)
      });
      var ciphertext = sampleBuffer();
      var cipher = crypto.createCipher('aes256', network.key);
      var parts = [cipher.update(ciphertext), cipher.final()];
      ciphertext = Buffer.concat(parts, parts[0].length + parts[1].length);
      var decoded = decode(network, ciphertext);
      expect(decoded).to.eql(sampleObject());
    });
  });

  describe('#send', function() {
    it('should make the appropriate call to network.encode', function() {
      var network = new Network();
      var spy = sinon.spy(network, 'encode');
      var obj = sampleObject();
      network.send('quantum', obj);
      expect(spy.calledOnce).to.be.ok();
      var a = spy.args[0][0];
      expect(a).to.be.an('object');
      expect(a.data).to.equal(obj);
      expect(spy.args[0][1]).to.be.a('function');
    });

    it('should pass encode errors to the network', function() {
      var network = new Network();
      var spy = sinon.spy();
      network.on('error', spy);
      var err = new Error('something went wrong');
      network.encode = function(d, fn) {
        fn(err);
      };
      network.send('quantum', sampleObject());
      expect(spy.calledOnce).to.be.ok();
      expect(spy.calledWithExactly(err)).to.be.ok();
    });

    it('should make the appropriate call to socket.send', function() {
      var network = new Network();
      network.send('quantum', sampleObject());
      expect(network.socket.send.calledOnce).to.be.ok();
      var arr = network.socket.send.args[0];
      expect(arr[0]).to.be.a(Buffer);
      expect(arr[1]).to.be.a('number');
      expect(arr[2]).to.be.a('number');
      expect(arr[2] - arr[1]).not.to.be.above(arr[0].length);
      expect(arr[3]).to.be.a('number');
      expect(arr[3]).to.equal(network.port);
      expect(arr[4]).to.equal(network.destination);
    });
  });

  describe('#parse', function() {
    // rinfo just for reference checking
    var sender, network, sendSpy, rinfo = {};

    beforeEach(function() {
      sender = hat();
      network = new Network();
    });

    var send = function(event, obj, itself) {
      if (Buffer.isBuffer(event))
        network.socket.send(event);
      else if (itself)
        network.send(event, obj);
      else {
        var other = network.instanceUuid;
        network.instanceUuid = sender;
        network.send(event, obj);
        network.instanceUuid = other;
      }
      process.nextTick(function() {
        expect(network.socket.send.calledOnce).to.be.ok();
        var data = network.socket.send.args[0][0];
        expect(data).to.be.a(Buffer);
        network.socket.emit('message', data, rinfo);
      });
    };

    it('should make the appropriate call to network.decode', function(done) {
      var decodeSpy = sinon.spy(network, 'decode');
      send('test', sampleObject());
      process.nextTick(function() {
        expect(decodeSpy.calledOnce).to.be.ok();
        expect(decodeSpy.args[0][0]).to.be.a(Buffer);
        expect(decodeSpy.args[0][1]).to.be.a('function');
        done();
      });
    });

    it('should pass decode errors to the network', function(done) {
      var errorSpy = sinon.spy();
      network.on('error', errorSpy);
      network.socket.emit('message', crypto.randomBytes(32), rinfo);
      process.nextTick(function() {
        expect(errorSpy.calledOnce).to.be.ok();
        expect(errorSpy.args[0][0]).to.be.an(Error);
        done();
      });
    });

    it('should ignore messages from itself', function(done) {
      var spy = sinon.spy();
      network.on('error', spy);
      network.on('message', spy);
      network.on('quantum', spy);
      send('quantum', sampleObject(), true);
      process.nextTick(function() {
        expect(spy.called).not.to.be.ok();
        done();
      });
    });

    it('should emit standard messages', function(done) {
      var badSpy = sinon.spy(), goodSpy = sinon.spy();
      network.on('error', badSpy);
      network.on('message', badSpy);
      network.on('quantum', goodSpy);
      var obj = sampleObject();
      send('quantum', obj);
      process.nextTick(function() {
        expect(badSpy.called).not.to.be.ok();
        expect(goodSpy.calledOnce).to.be.ok();
        expect(goodSpy.args[0][0]).to.eql(obj);
        expect(goodSpy.args[0][1].data).to.eql(obj);
        expect(goodSpy.args[0][2]).to.equal(rinfo);
        done();
      });
    });

    it('should emit \'message\' for non-standard messages', function(done) {
      var badSpy = sinon.spy(), goodSpy = sinon.spy();
      network.on('error', badSpy);
      network.on('message', goodSpy);
      var obj = {iid: crypto.randomBytes(8).toString('binary')};
      network.encode(obj, goodSpy);
      expect(goodSpy.calledOnce).to.be.ok();
      var msg = goodSpy.args[0][1];
      goodSpy.reset();
      network.socket.emit('message', msg, rinfo);
      process.nextTick(function() {
        expect(badSpy.called).not.to.be.ok();
        expect(goodSpy.calledOnce).to.be.ok();
        expect(goodSpy.args[0][0]).to.eql(obj);
        done();
      });
    });
  });

  describe('encoding', function() {
    it('should decode encoded data', function(done) {
      var plaintext = sampleObject();
      var network = new Network();
      network.encode(plaintext, function(err, buf) {
        expect(err).not.to.be.an(Error);
        expect(buf).to.be.a(Buffer);
        network.decode(buf, function(err, obj) {
          expect(err).not.to.be.an(Error);
          expect(obj).to.be.an('object');
          expect(obj).to.eql(plaintext);
          done();
        });
      });
    });

    it('should decode encrypted data', function(done) {
      var plaintext = sampleObject();
      var network = new Network({
        key: crypto.randomBytes(32)
      });
      network.encode(plaintext, function(err, buf) {
        expect(err).not.to.be.an(Error);
        expect(buf).to.be.a(Buffer);
        network.decode(buf, function(err, obj) {
          expect(err).not.to.be.an(Error);
          expect(obj).to.be.an('object');
          expect(obj).to.eql(plaintext);
          done();
        });
      });
    });
  });

  describe('networking', function() {
    var dgram = require('dgram');
    var primary, secondary, goodSpy, badSpy;

    beforeEach(function() {
      Network.__set__('dgram', dgram);
      goodSpy = sinon.spy();
      badSpy = sinon.spy();
    });

    var create = function(options) {
      primary = new Network(options);
      secondary = new Network(options);
    };

    var spies = function() {
      expect(goodSpy.calledOnce).to.be.ok();
      expect(badSpy.called).not.to.be.ok();
    };

    var basic = function(done) {
      secondary.on('error', badSpy);
      secondary.on('hello', goodSpy);
      secondary.on('message', badSpy);
      var obj = {thinking: true};
      primary.send('hello', obj);
      secondary.socket.on('message', function() {
        spies();
        expect(goodSpy.args[0][0]).to.eql(obj);
        expect(goodSpy.args[0][1].data).to.eql(obj);
        expect(goodSpy.args[0][2]).to.be.an('object');
        done();
      });
    };

    it('should transfer data without encryption', function(done) {
      create();
      basic(done);
    });

    it('should transfer data with encryption', function(done) {
      create({
        key: crypto.randomBytes(32),
      });
      basic(done);
    });
  });
});
