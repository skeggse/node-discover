var Transform = require('stream').Transform;
var expect = require('expect.js');
var crypto = require('crypto');
var util = require('util');
var _ = require('underscore');

var streamutils = require('../lib/streamutils');

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

//var IterativeTransform = streamutils.IterativeTransform;
var MergeStream = streamutils.MergeStream;
var ReorderStream = streamutils.ReorderStream;
var LossyStream = streamutils.LossyStream;

describe('Utility Streams', function() {
  describe('MergeStream', function() {
    var merge, index, data;

    beforeEach(function() {
      index = 0;
      merge = new MergeStream();
      merge.on('data', function(chunk) {
        expect(chunk).to.eql(data[index++]);
      });
    });

    it('should merge pairs of blocks', function(done) {
      merge.on('end', function() {
        expect(index).to.equal(data.length);
        done();
      });
      data = new Array(4);
      for (var i = 0; i < data.length; i++) {
        data[i] = random(16, true);
        merge.write(data[i].slice(0, 8));
        merge.write(data[i].slice(8, 16));
      }
      merge.end();
    });

    it('should handle odd blocks', function(done) {
      merge.on('end', function() {
        expect(index).to.equal(data.length);
        done();
      });
      data = new Array(4);
      for (var i = 0; i < data.length - 1; i++) {
        data[i] = random(16, true);
        merge.write(data[i].slice(0, 8));
        merge.write(data[i].slice(8, 16));
      }
      merge.end(data[data.length - 1] = random(8, true));
    });
  });

  describe('ReorderStream', function() {
    it('should reorder the blocks', function(done) {
      var data = new Array(8);
      var reorder = new ReorderStream();
      reorder.on('data', function(chunk) {
        expect(chunk).to.have.length(16);
        var i = bufferIndex(data, chunk);
        expect(i).not.to.be.below(0);
        expect(chunk).to.eql(data[i]);
        data[i] = null;
      });
      reorder.on('end', function() {
        expect(_.compact(data)).to.be.empty();
        done();
      });
      for (var i = 0; i < data.length; i++)
        reorder.write(data[i] = random(16, true));
      reorder.end();
    });
  });

  describe('LossyStream', function() {
    xit('can\'t really test this');
  });
});
