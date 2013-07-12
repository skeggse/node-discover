var expect = require('expect.js');
var sinon = require('sinon');
var _ = require('underscore');
var util = require('util');

var crypto = require('crypto');
var Transform = require('stream').Transform;
var streams = require('../lib/streams');
var streamutils = require('../lib/streamutils');

var IterativeTransform = streamutils.IterativeTransform;
var MergeStream = streamutils.MergeStream;
var ReorderStream = streamutils.ReorderStream;
var LossyStream = streamutils.LossyStream;

var EncryptStream = streams.EncryptStream;
var DecryptStream = streams.DecryptStream;
var WrapStream = streams.WrapStream;
var UnwrapStream = streams.UnwrapStream;

// the buffer will be sorta random, but doesn't need to be securely random
// this might speed the test up a little
var random = function(length, secure) {
  if (secure)
    return crypto.randomBytes(length);
  return new Buffer(length);
};

var bufferEquals = function(a, b) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b) || a.length !== b.length)
    return false;
  for (var i = 0; i < a.length; i++)
    if (a[i] !== b[i])
      return false;
  return true;
};

var bufferIndex = function(arr, buf) {
  for (var i = 0; i < arr.length; i++)
    if (bufferEquals(arr[i], buf))
      return i;
  return -1;
};

describe('Streams', function() {
  // TODO: move this suite elsewhere
  describe('options', function() {
    var sample = function() {
      return {
        alpha: 'beta',
        gamma: +63174,
        epsilon: ['z','e','t','a'],
        eta: {t:'h',et:'a'},
        iota: !'kappa'
      };
    };
    it('should merge options correctly', function() {
      var out = {}, defaults = sample();
      _.options(out, {
        epsilon: 'maybe',
        never: true
      }, defaults);
      var expected = sample();
      expected.epsilon = 'maybe';
      expect(out).to.eql(expected);
    });

    it('should handle no user-defined options', function() {
      var out = {}, defaults = sample();
      _.options(out, null, defaults);
      expect(out).to.eql(defaults);
    });
  });

  describe('EncryptStream', function() {
    it('should return an instance of Transform and EncryptStream', function() {
      var stream = new EncryptStream();
      expect(stream).to.be.a(Transform);
      expect(stream).to.be.an(EncryptStream);
      stream = EncryptStream();
      expect(stream).to.be.a(Transform);
      expect(stream).to.be.an(EncryptStream);
    });
  });

  describe('DecryptStream', function() {
    it('should return an instance of Transform and DecryptStream', function() {
      var stream = new DecryptStream();
      expect(stream).to.be.a(Transform);
      expect(stream).to.be.a(DecryptStream);
      stream = DecryptStream();
      expect(stream).to.be.a(Transform);
      expect(stream).to.be.a(DecryptStream);
    });
  });

  describe('WrapStream', function() {
    var checkHeader = function(data) {
      expect(data.toString(null, 0, 4)).to.equal('WRAP');

    };

    it('should return an instance of Transform and WrapStream', function() {
      var stream = new WrapStream();
      expect(stream).to.be.a(Transform);
      expect(stream).to.be.a(WrapStream);
      stream = WrapStream();
      expect(stream).to.be.a(Transform);
      expect(stream).to.be.a(WrapStream);
    });

    it('should output one block for small buffers', function(done) {
      var stream = new WrapStream();
      var calls = 0;
      stream.on('data', function(data) {
        expect(data).to.be.a(Buffer);
        checkHeader(data);
        calls++;
      });
      stream.on('end', function() {
        expect(calls).to.equal(1);
        done();
      });
      stream.end(random(128));
    });

    it('should output multiple blocks for large buffers', function(done) {
      var stream = new WrapStream();
      var calls = 0;
      stream.on('data', function(data) {
        expect(data).to.be.a(Buffer);
        checkHeader(data);
        calls++;
      });
      stream.on('end', function() {
        expect(calls).to.equal(2);
        done();
      });
      stream.end(random(2500));
    });

    it('should handle the blockSize option', function(done) {
      var stream = new WrapStream({blockSize: 750});
      var calls = 0;
      stream.on('data', function(data) {
        expect(data).to.be.a(Buffer);
        checkHeader(data);
        calls++;
      });
      stream.on('end', function() {
        expect(calls).to.equal(4);
        done();
      });
      stream.end(random(2500));
    });
  });

  describe('UnwrapStream', function() {
    this.timeout(500);

    it('should return an instance of Transform and UnwrapStream', function() {
      var stream = new UnwrapStream()
      expect(stream).to.be.a(Transform);
      expect(stream).to.be.an(UnwrapStream);
      stream = UnwrapStream();
      expect(stream).to.be.a(Transform);
      expect(stream).to.be.an(UnwrapStream);
    });

    it('should unwrap a wrapped block', function(done) {
      var stream = new UnwrapStream();
      var count = 0;
      stream.on('data', function(data) {
        expect(data).to.eql(new Buffer('c064b300', 'hex'));
        count++;
      });
      stream.on('error', function(err) {
        throw err;
      });
      stream.on('end', function() {
        expect(count).to.equal(1);
        done();
      });
      stream.end(new Buffer('5752415000000000000000000000000000000000d73faf9d000000040000002800000000c064b300', 'hex'));
    });

    it('should unwrap multiple wrapped blocks', function(done) {
      var stream = new UnwrapStream();
      var count = 0;
      stream.on('data', function(data) {
        expect(data).to.eql(new Buffer('c064b300', 'hex'));
        count++;
      });
      stream.on('error', function(err) {
        throw err;
      });
      stream.on('end', function() {
        expect(count).to.equal(2);
        done();
      });
      stream.end(new Buffer('5752415000000000000000000000000000000000d73faf9d000000040000002800000000c064b300' +
        '5752415000000000000000000000000000000001d73faf9d000000040000002800000000c064b300', 'hex'));
    });

    it('should error for a small block', function(done) {
      var stream = new UnwrapStream();
      var count = 0;
      stream.on('data', function(data) {
        throw new Error('there should be no data');
      });
      stream.on('error', function(err) {
        expect(err).to.be.an(Error);
        count++;
      });
      stream.on('end', function() {
        expect(count).to.equal(1);
        done();
      });
      stream.end(random(4));
    });

    var badHeader = random(37);
    badHeader[0] = 0x00;

    it('should error for a bad header', function(done) {
      var stream = new UnwrapStream();
      var count = 0;
      stream.on('data', function(data) {
        throw new Error('there should be no data');
      });
      stream.on('error', function(err) {
        expect(err).to.be.an(Error);
        count++;
      });
      stream.on('end', function() {
        expect(count).to.equal(1);
        done();
      });
      stream.end(badHeader);
    });

    it('should error for incomplete blocks', function(done) {
      var stream = new UnwrapStream();
      var count = 0;
      stream.on('data', function(data) {
        throw new Error('expected no data');
      });
      stream.on('error', function(err) {
        expect(err).to.be.an(Error);
        count++;
      });
      stream.on('end', function() {
        expect(count).to.equal(1);
        done();
      });
      stream.end(new Buffer('5752415000000000000000000000000000000000d73faf9d000000040000002800000000c064', 'hex'));
    });

    it('should error for bad checksum', function(done) {
      var stream = new UnwrapStream();
      var count = 0;
      stream.on('data', function(data) {
        throw new Error('expected no data');
      });
      stream.on('error', function(err) {
        expect(err).to.be.an(Error);
        count++;
      });
      stream.on('end', function() {
        expect(count).to.equal(1);
        done();
      });
      stream.end(new Buffer('5752415000000000000000000000000000000000c73faf9d000000040000002800000000c064b300', 'hex'));
    });

    it('should not error with ignoreDataErrors', function(done) {
      var stream = new UnwrapStream({ignoreDataErrors: true});
      stream.on('data', function(data) {
        throw new Error('expected no data');
      });
      stream.on('error', function(err) {
        throw err;
      });
      stream.on('end', done);
      stream.write(random(4));
      stream.end(badHeader);
    });

    it('should work around errors with ignoreDataErrors', function(done) {
      var stream = new UnwrapStream({ignoreDataErrors: true});
      var count = 0;
      stream.on('data', function(data) {
        var expected = ['c064b300', 'bdc85452'];
        expect(data).to.eql(new Buffer(expected[count], 'hex'));
        count++;
      });
      stream.on('error', function(err) {
        throw err;
      });
      stream.on('end', function() {
        expect(count).to.equal(2);
        done();
      });
      stream.write(random(4));
      stream.write(new Buffer('5752415000000000000000000000000000000000d73faf9d000000040000002800000000c064b300', 'hex'));
      // this one has a bad checksum
      stream.write(new Buffer('5752415000000000000000000000000000000000d73faf9d000000040000002800000000b4485452', 'hex'));
      stream.write(new Buffer('57524150000000000000000000000000000000000a52262b000000040000002800000000bdc85452', 'hex'));
      stream.end(badHeader);
    });
  });

  describe('Encryption', function() {
    var key, encrypt, decrypt;

    this.timeout(100);

    beforeEach(function() {
      key = random(32);
    });

    var create = function(pipe) {
      encrypt = new EncryptStream({key: key});
      decrypt = new DecryptStream({key: key});
      if (pipe)
        encrypt.pipe(decrypt);
    };

    it('should handle data', function(done) {
      var data = random(4096), count = 0;
      create(true);
      decrypt.on('data', function(data) {
        expect(data).to.be.a(Buffer);
        expect(data).to.eql(data);
        count++;
      });
      decrypt.on('end', function() {
        expect(count).to.equal(1);
        done();
      });
      encrypt.write(data);
      encrypt.end();
    });

    it('should handle data in blocks', function(done) {
      var slices = new Array(16);
      create(true);
      var index = 0;
      decrypt.on('data', function(data) {
        expect(data).to.be.a(Buffer);
        expect(data).to.eql(slices[index++]);
      });
      decrypt.on('end', function() {
        expect(index).to.equal(slices.length);
        done();
      });
      for (var i = 0; i < slices.length; i++) 
        encrypt.write(slices[i] = random(1024));
      encrypt.end();
    });
  });

  describe('Wrapping', function() {
    var wrapper, unwrapper, options;

    var create = function() {
      wrapper = new WrapStream(options);
      unwrapper = new UnwrapStream(options);
      var args = _.toArray(arguments);
      args.unshift(wrapper);
      args.push(unwrapper);
      for (var i = 1; i < args.length; i++)
        args[i - 1].pipe(args[i]);
    };

    it('should handle data', function(done) {
      create();
      var data = random(1024, true);
      var count = 0;
      unwrapper.on('data', function(block) {
        expect(block).to.eql(data);
        count++;
      });
      unwrapper.on('error', function(err) {
        throw err;
      });
      unwrapper.on('end', function() {
        expect(count).to.equal(1);
        done();
      });
      wrapper.end(data);
    });

    it('should handle lots of data', function(done) {
      create();
      var data = new Array(16);
      var index = 0;
      unwrapper.on('data', function(block) {
        expect(block).to.eql(data[index++]);
      });
      unwrapper.on('error', function(err) {
        throw err;
      });
      unwrapper.on('end', function() {
        expect(index).to.equal(data.length);
        done();
      });
      for (var i = 0; i < data.length; i++)
        wrapper.write(data[i] = random(32768, true));
      wrapper.end();
    });

    it('should handle data in merged blocks', function(done) {
      create(new MergeStream());
      var data = new Array(8);
      var index = 0;
      unwrapper.on('data', function(block) {
        expect(block).to.eql(data[index]);
        index++;
      });
      unwrapper.on('error', function(err) {
        throw err;
      });
      unwrapper.on('end', function() {
        expect(index).to.equal(data.length);
        done();
      });
      for (var i = 0; i < data.length; i++)
        wrapper.write(data[i] = random(8192, true));
      wrapper.end();
    });

    it('should handle an unordered connection', function(done) {
      var data = new Array(8);
      create(new ReorderStream());
      unwrapper.on('data', function(chunk) {
        expect(chunk).to.have.length(8192);
        var i = bufferIndex(data, chunk);
        expect(i).not.to.be.below(0);
        expect(chunk).to.eql(data[i]);
        data[i] = null;
      });
      unwrapper.on('end', function() {
        expect(_.compact(data)).to.be.empty();
        done();
      });
      for (var i = 0; i < data.length; i++)
        wrapper.write(data[i] = random(8192, true));
      wrapper.end();
    });

    it('should handle a lossy connection', function(done) {
      var data = new Array(64);
      options = {blockTimeout: 1000, ignoreDataErrors: true};
      create(new LossyStream());
      var count = 0;
      unwrapper.on('data', function(chunk) {
        expect(chunk).to.have.length(2048);
        var i = bufferIndex(data, chunk);
        expect(chunk).to.eql(data[i]);
        data[i] = null;
        count++;
      });
      unwrapper.on('end', function() {
        expect(count).to.be.above(0);
        done();
      });
      for (var i = 0; i < data.length; i++)
        wrapper.write(data[i] = random(2048, true));
      wrapper.end();
    });

    it('should handle a bad connection', function(done) {
      var data = new Array(8);
      create(new MergeStream(), new ReorderStream());
      unwrapper.on('data', function(chunk) {
        expect(chunk).to.have.length(8192);
        var i = bufferIndex(data, chunk);
        expect(i).not.to.be.below(0);
        expect(chunk).to.eql(data[i]);
        data[i] = null;
      });
      unwrapper.on('end', function() {
        expect(_.compact(data)).to.be.empty();
        done();
      });
      for (var i = 0; i < data.length; i++)
        wrapper.write(data[i] = random(8192, true));
      wrapper.end();
    });

    it('should handle a terrible connection', function(done) {
      var data = new Array(64);
      options = {blockTimeout: 1000, ignoreDataErrors: true};
      create(new MergeStream(), new ReorderStream(), new LossyStream());
      var count = 0;
      unwrapper.on('data', function(chunk) {
        expect(chunk).to.have.length(2048);
        var i = bufferIndex(data, chunk);
        expect(chunk).to.eql(data[i]);
        data[i] = null;
        count++;
      });
      unwrapper.on('end', function() {
        expect(count).to.be.above(0);
        done();
      });
      for (var i = 0; i < data.length; i++)
        wrapper.write(data[i] = random(2048, true));
      wrapper.end();
    });
  });
});
