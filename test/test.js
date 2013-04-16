var sando = require("../sando"),
    assert = require("assert");

describe("sando", function() {

  describe("parse()", function() {

    it("should parse a single layer name", function() {
      var stack = sando.parse("foo"),
          layer = stack[0];
      assert.equal(stack.length, 1);
      assert.equal(layer.url, "foo");
      assert.equal(layer.alpha, 100);
      assert.equal(layer.post, undefined);
    });

    it("should parse two layer names", function() {
      var stack = sando.parse("foo,bar");
      assert.equal(stack.length, 2);
      assert.equal(stack[0].url, "foo");
      assert.equal(stack[1].url, "bar");
    });

  });

  describe("serialize()", function() {

    it("should serialize a single array simply", function() {
      assert.equal(
        sando.serialize([{url: "foo"}]),
        "foo");
    });

    it("should serialize non-100 alpha values", function() {
      assert.equal(
        sando.serialize([{url: "foo", alpha: 50}]),
        "foo[@50]");
    });

    it("should serialize the 'post-blend' flag", function() {
      assert.equal(
        sando.serialize([{url: "foo", alpha: 50, post: true}]),
        "foo[@50p]");
    });

  });

});
