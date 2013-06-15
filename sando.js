(function(exports) {

  var sando = function() {};

  sando.version = "1.0.1";

  var async = require("async");

  if (typeof module !== "undefined" && module.exports) {
    module.exports = sando;
  } else {
    exports.sando = sando;
  }

  sando.prototype.canvas = typeof document !== "undefined"
    ? function(width, height, callback) {
      var canvas = document.createElement("canvas");
      if (width) canvas.width = canvas.height = width;
      if (height) canvas.height = height;
      return callback(null, canvas);
    }
    : (function() {
      var Canvas = require("canvas");
      return function(width, height, callback) {
        return callback(null, new Canvas(width, height || width));
      };
    })();

  var DEFAULT_OP = "over";

  /**
   * Make a canvas if necessary.
   * Expects a callback accepting (err, canvas, hasSize)
   */
  sando.prototype.makeCanvas = function(canvas, width, height, callback) {
    if (canvas) {
      return callback(null, canvas, true);
    }

    return this.canvas(width, height, function(err, canvas) {
      return callback(null, canvas, false);
    });
  };

  sando.prototype.makeSource = function(canvas, layer, width, height, depth, callback) {
    // if the layer has a fill, create a new canvas and fill it with that
    // style (either a CSS color, gradient, or pattern)
    if (layer.fill) {
      this.canvas(canvas.width, canvas.height, function(err, colorCanvas) {
        console.log("canvas_id=%s source=%s comp=%s alpha=%s complete=%s",
                    colorCanvas.id,
                    layer.url || layer.fill || "grouped",
                    layer.comp || "",
                    layer.alpha || "",
                    layer.url ? layer.source.complete : "");

        var colorContext = colorCanvas.getContext("2d");
        colorContext.fillStyle = layer.fill;
        colorContext.fillRect(0, 0, canvas.width, canvas.height);

        // alpha "pre-blending"
        if (!layer.post) {
          colorContext.globalCompositeOperation = "destination-in";
          colorContext.drawImage(canvas, 0, 0);
        }

        return setImmediate(function() {
          return callback(null, colorCanvas);
        });
      });

    // otherwise, assume source is an Image or Canvas
    } else if (Array.isArray(layer.layers)) {
      return this.make(layer.layers, null, width, height, depth + 1, callback);
    } else {
      return callback(null, layer.source);
    }
  };

  sando.prototype.make = function(stack, canvas, width, height, depth, callback) {
    if (canvas instanceof Function) {
      callback = canvas;
      canvas = null;
    } else {
      // width, height, and depth are optional arguments, so fetch the last arg
      // for the callback
      callback = arguments[arguments.length - 1];
    }

    var self = this;

    if (!Array.isArray(stack)) {
      throw "sando stack must be an Array (got " + typeof stack + ")";
    }

    this.makeCanvas(canvas, width, height, function(err, canvas, hasSize) {
      console.log("canvas_id=%s grouped", canvas.id);

      var ctx = canvas.getContext("2d");
      async.eachSeries(stack, function(layer, cb) {
        if (!layer || typeof layer !== "object") {
          throw "sando layer must be an object (got " + typeof layer + ")";
        }

        self.makeSource(canvas, layer, width, height, depth, function(err, source) {
          if (source) {
            if (!hasSize) {
              canvas.width = width = source.width;
              canvas.height = height = source.height;
              hasSize = true;
            }

            ctx.globalAlpha = isNaN(layer.alpha) ? 1 : layer.alpha / 100;
            ctx.globalCompositeOperation = layer.comp || DEFAULT_OP;
            ctx.drawImage(source, 0, 0, source.width, source.height); // TODO: x, y, width, height
          }

          return setImmediate(cb);
        });
      }, function() {
        return callback(null, canvas);
      });
    });
  };

  sando.parse = function(str) {
    var stack = [],
        current = [],
        buffer = [],
        len = str.length;

    for (var i = 0; i < len; i++) {
      var c = str.charAt(i);
      switch (c) {
        case ",":
          if (buffer.length) current.push(buffer.join(""));
          buffer = [];
          break;
        case "(":
          var child = [];
          current.push(child);
          stack.push(current);
          current = child;
          break;
        case ")":
          if (buffer.length) current.push(buffer.join(""));
          current = stack.pop();
          if (!current) throw "Parse error: unexpected ( @ " + i;
          buffer = [];
          break;
        default:
          buffer.push(c);
      }
    }

    if (buffer.length) current.push(buffer.join(""));

    function parseLayer(layer) {
      if (Array.isArray(layer)) {
        var layers = layer.map(parseLayer),
            layer = layers.length > 1
              ? {layers: layers}
              : layers[0];
        for (var i = 1; i < layers.length; i++) {
          if (typeof layers[i] === "string") {
            var chad = layers.splice(i, 1)[0],
                match = chad.match(/^\[([-a-z]*)(@(\d*)(p)?)?\]$/);
            if (match) {
              var prev = layers[i - 1];
              prev.comp = match[1] || DEFAULT_OP;
              prev.alpha = numor(match[3], 100);
            } else {
              throw 'Bad syntax for grouped layer op: "' + chad + '"';
            }
            i--;
          }
        }
        return layer;
      } else {
        var match = layer.match(/^([^\[]+)(\[([-a-z]*)(@(\d*)(p)?)?\])?$/);
        if (match) {
          var source = match[1];
          layer = {
            url: source,
            comp: match[3] || DEFAULT_OP,
            alpha: numor(match[5], 100)
          };
          if (source.charAt(0) === "$") {
            layer.fill = sando.parse.fill(source);
            delete layer.url;
          }
          if (match[6]) {
            layer.post = true;
          }
          return layer;
        } else {
          // XXX keep around unmatched strings just in case they apply
          // comp/alpha to groups
          return layer;
        }
      }
    }

    var layer = parseLayer(current);
    return layer.layers || [layer];
  };

  sando.serialize = function(layer, depth) {
    if (Array.isArray(layer)) {
      layer = {layers: layer};
    }

    if (!depth) depth = 0;

    var buffer = [];
    if (layer.layers) {
      if (depth > 0) buffer.push("(");
      buffer.push(layer.layers.map(function(layer) {
        return sando.serialize(layer, depth + 1);
      }));
      if (depth > 0) buffer.push(")");
    } else {
      var source = layer.fill
        ? sando.serialize.fill(layer.fill)
        : layer.url;
      buffer.push(source);
    }

    var hasComp = layer.comp && layer.comp !== DEFAULT_OP,
        hasAlpha = !isNaN(layer.alpha) && layer.alpha < 100;
    if (hasComp || hasAlpha || layer.post) {
      buffer.push("[");
      if (hasComp) buffer.push(layer.comp);
      if (hasAlpha) buffer.push("@", ~~layer.alpha, layer.post ? "p" : "");
      else if (layer.post) buffer.push("@p");
      buffer.push("]");
    }

    return buffer.join("");
  };

  sando.parse.fill = function(str) {
    // TODO something more sophisticated here?
    return str.replace("$", "#");
  };

  sando.serialize.fill = function(fill) {
    // TODO anything else here?
    return String(fill).replace("#", "$");
  };

  sando.eachLayer = function(stack, callback, context) {
    var layers = [];
    stack.forEach(function(layer) {
      if (Array.isArray(layer.layers)) {
        layers = layers.concat(sando.eachLayer(layer.layers, callback));
      } else {
        layers.push(layer);
        callback.call(context || stack, layer);
      }
    });
    return layers;
  };

  function numor(str, def) {
    var num = parseInt(str);
    return isNaN(num) ? def : num;
  }

})(this);
