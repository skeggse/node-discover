var expect = require('expect.js');
var sinon = require('sinon');
var rewire = require('rewire');

var EventEmitter = require('eventemitter2').EventEmitter2;
var util = require('util');

var MockDiscovery = function(options) {
  if (!(this instanceof MockDiscovery))
    return new MockDiscovery(options);

  EventEmitter.call(this);

  this.advertise = sinon.spy();
};

util.inherits(MockDiscovery, EventEmitter);

describe('ServiceDiscovery', function() {
  var ServiceDiscovery;

  beforeEach(function() {
    ServiceDiscovery = rewire('../lib/service');
    ServiceDiscovery.__set__('Discovery', MockDiscovery);
  });

  it('should create a new Discovery instance', function() {
    var spy = sinon.spy(MockDiscovery);
    ServiceDiscovery.__set__('Discovery', spy);
    var discovery = new ServiceDiscovery();
    expect(spy.called).to.be.ok();
    expect(spy.calledWithNew()).to.be.ok();
  });

  it('should return an instance of EventEmitter and ServiceDiscovery', function() {
    var discovery = new ServiceDiscovery();
    expect(discovery).to.be.an(EventEmitter);
    expect(discovery).to.be.a(ServiceDiscovery);
    discovery = ServiceDiscovery();
    expect(discovery).to.be.an(EventEmitter);
    expect(discovery).to.be.a(ServiceDiscovery);
  });

  describe('#need', function() {
    var readySpy, discovery, added;

    beforeEach(function() {
      readySpy = sinon.spy();
      discovery = new ServiceDiscovery();
      discovery.on('ready', readySpy);
      added = function(info) {
        discovery.discovery.emit('added', {info: info});
      };
    });

    it('should emit ready when all needs are met', function(done) {
      discovery.need('a.service');
      added({name: 'a.service'});
      process.nextTick(function() {
        expect(readySpy.calledOnce).to.be.ok();
        var obj = readySpy.args[0][0];
        expect(obj).to.have.property('a.service');
        expect(obj['a.service']).to.have.length(1);
        expect(obj['a.service'][0]).to.have.property('info');
        expect(obj['a.service'][0].info).to.have.property('name', 'a.service');
        done();
      });
    });

    it('should emit ready when all needs are met and more', function(done) {
      discovery.need('a.service');
      added({name: 'b.service'});
      added({name: 'a.service'});
      process.nextTick(function() {
        expect(readySpy.calledOnce).to.be.ok();
        var obj = readySpy.args[0][0];
        expect(obj).to.have.property('a.service');
        expect(obj).to.have.property('b.service');
        expect(obj['a.service']).to.have.length(1);
        expect(obj['b.service']).to.have.length(1);
        expect(obj['a.service'][0]).to.have.property('info');
        expect(obj['b.service'][0]).to.have.property('info');
        expect(obj['a.service'][0].info).to.have.property('name', 'a.service');
        expect(obj['b.service'][0].info).to.have.property('name', 'b.service');
        done();
      });
    });

    it('should not emit ready when no needs are met', function(done) {
      discovery.need('a.service');
      added({name: 'another.service'});
      process.nextTick(function() {
        expect(readySpy.called).not.to.be.ok();
        done();
      });
    });

    it('should not emit ready when some needs are met', function(done) {
      discovery.need('a.service', 'some.other.service');
      added({name: 'some.other.service'});
      process.nextTick(function() {
        expect(readySpy.called).not.to.be.ok();
        done();
      });
    });

    it('should not emit ready when some needs are met and more', function(done) {
      discovery.need('a.service', 'some.other.service');
      added({name: 'yet.another.service'});
      added({name: 'some.other.service'});
      process.nextTick(function() {
        expect(readySpy.called).not.to.be.ok();
        done();
      });
    });
  });

  describe('#setup', function() {
    var readySpy, discovery, added;

    beforeEach(function() {
      readySpy = sinon.spy();
      discovery = new ServiceDiscovery();
      discovery.on('ready', readySpy);
      added = function(node) {
        discovery.discovery.emit('added', node);
      };
    });

    var expectHook = function(spy, node) {
      expect(spy.calledOnce).to.be.ok();
      expect(spy.args[0][0]).to.equal(node.info);
      expect(spy.args[0][1]).to.be.a('function');
    };

    it('should invoke the need method', function() {
      var needSpy = sinon.spy(discovery, 'need');
      discovery.setup('a.service', function() {});
      expect(needSpy.calledOnce).to.be.ok();
      expect(needSpy.calledWithExactly('a.service'));
    });

    it('should invoke the setup handler with correct parameters', function(done) {
      var setupSpy = sinon.spy();
      var node = {info: {name: 'a.service'}};
      discovery.setup('a.service', setupSpy);
      added(node);
      process.nextTick(function() {
        expectHook(setupSpy, node);
        done();
      });
    });

    it('should not emit ready until the setup hook has finished', function(done) {
      var setupSpy = sinon.spy();
      var node = {info: {name: 'a.service'}};
      discovery.setup('a.service', setupSpy);
      added(node);
      process.nextTick(function() {
        expect(readySpy.called).not.to.be.ok();
        expectHook(setupSpy, node);
        setupSpy.args[0][1]();
        process.nextTick(function() {
          expect(readySpy.called).to.be.ok();
          expect(readySpy.args[0][0]).to.have.property('a.service');
          var services = readySpy.args[0][0]['a.service'];
          expect(services).to.have.length(1);
          expect(services[0]).to.equal(node);
          done();
        });
      });
    });

    it('should invoke all setup hooks in-order and emit ready when finished', function(done) {
      var firstSpy = sinon.spy(), secondSpy = sinon.spy();
      var node = {info: {name: 'a.service'}};
      discovery.setup('a.service', firstSpy);
      discovery.setup('a.service', secondSpy);
      added(node);
      process.nextTick(function() {
        expect(readySpy.called).not.to.be.ok();
        expect(secondSpy.called).not.to.be.ok();
        expectHook(firstSpy, node);
        firstSpy.args[0][1]();
        process.nextTick(function() {
          expect(readySpy.called).not.to.be.ok();
          expectHook(firstSpy, node);
          expectHook(secondSpy, node);
          secondSpy.args[0][1]();
          process.nextTick(function() {
            expect(readySpy.calledOnce).to.be.ok();
            expect(firstSpy.calledOnce).to.be.ok();
            expect(secondSpy.calledOnce).to.be.ok();
            expect(readySpy.args[0][0]).to.equal(discovery.services);
            done();
          });
        });
      });
    });

    it('should stop handling setup hooks on error and emit error instead of ready', function(done) {
      var firstSpy = sinon.spy(), secondSpy = sinon.spy(), errorSpy = sinon.spy();
      var node = {info: {name: 'a.service'}};
      discovery.setup('a.service', firstSpy);
      discovery.setup('a.service', secondSpy);
      discovery.on('error', errorSpy);
      added(node);
      process.nextTick(function() {
        expect(readySpy.called).not.to.be.ok();
        expect(errorSpy.called).not.to.be.ok();
        expect(secondSpy.called).not.to.be.ok();
        expectHook(firstSpy, node);
        firstSpy.args[0][1]();
        process.nextTick(function() {
          expect(readySpy.called).not.to.be.ok();
          expect(errorSpy.called).not.to.be.ok();
          expectHook(firstSpy, node);
          expectHook(secondSpy, node);
          var err = new Error('something plopped');
          secondSpy.args[0][1](err);
          process.nextTick(function() {
            expect(readySpy.called).not.to.be.ok();
            expect(errorSpy.calledOnce).to.be.ok();
            expect(firstSpy.calledOnce).to.be.ok();
            expect(secondSpy.calledOnce).to.be.ok();
            expect(errorSpy.args[0][0]).to.equal(err);
            done();
          });
        });
      });
    });

    it('should handle one setup hook and one need', function(done) {
      var setupSpy = sinon.spy();
      var node = {info: {name: 'a.service'}}, needNode = {info: {name: 'b.service'}};
      discovery.need('b.service');
      discovery.setup('a.service', setupSpy);
      added(node);
      process.nextTick(function() {
        expect(readySpy.called).not.to.be.ok();
        expectHook(setupSpy, node);
        setupSpy.args[0][1]();
        added(needNode);
        process.nextTick(function() {
          expectHook(setupSpy, node);
          expect(readySpy.calledOnce).to.be.ok();
          expect(readySpy.args[0][0]).to.equal(discovery.services);
          done();
        });
      });
    });

    it('should handle different service setup hooks and only emit ready on complete', function(done) {
      var firstSpy = sinon.spy(), secondSpy = sinon.spy();
      var firstNode = {info: {name: 'a.service'}}, secondNode = {info: {name: 'b.service'}};
      discovery.setup('a.service', firstSpy);
      discovery.setup('b.service', secondSpy);
      added(firstNode);
      added(secondNode);
      process.nextTick(function() {
        expect(readySpy.called).not.to.be.ok();
        expectHook(firstSpy, firstNode);
        expectHook(secondSpy, secondNode);
        firstSpy.args[0][1]();
        process.nextTick(function() {
          expect(readySpy.called).not.to.be.ok();
          expectHook(firstSpy, firstNode);
          expectHook(secondSpy, secondNode);
          secondSpy.args[0][1]();
          process.nextTick(function() {
            expect(readySpy.calledOnce).to.be.ok();
            expect(readySpy.args[0][0]).to.equal(discovery.services);
            done();
          });
        });
      });
    });
  });

  describe('#advertise', function() {
    it('should simply call the discovery advertise method', function() {
      var me = {name: 'hello'};
      var discovery = new ServiceDiscovery();
      discovery.advertise(me);
      var sup = discovery.discovery.advertise;
      expect(sup.calledOnce).to.be.ok();
      expect(sup.calledWithExactly(me)).to.be.ok();
    });
  });
});
