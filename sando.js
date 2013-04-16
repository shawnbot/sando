(function(exports) {

  var sando = {
    version: "0.0.1"
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = sando;
  } else {
    exports.sando = sando;
  }

  sando.canvas = typeof document !== "undefined"
    ? function(width, height) {
      var canvas = document.createElement("canvas");
      if (width) canvas.width = canvas.height = width;
      if (height) canvas.height = height;
      return canvas;
    }
    : function(width, height) {
      return new Canvas(width, height || width);
    };

  var DEFAULT_OP = "over";

  sando.make = function(stack, canvas, width, height, depth) {
    if (!Array.isArray(stack)) {
      throw "sando stack must be an Array (got " + typeof stack + ")";
    }

    var hasSize = true;
    if (Array.isArray(canvas)) {
      canvas = sando.canvas.apply(sando, canvas);
    } else if (!canvas) {
      canvas = sando.canvas(width, height);
      hasSize = false;
    }

    var ctx = canvas.getContext("2d");
    stack.forEach(function(layer, i) {

      if (!layer || typeof layer !== "object") {
        throw "sando layer must be an object (got " + typeof layer + ")";
      }

      var source;
      // if the layer has a fill, create a new canvas and fill it with that
      // style (either a CSS color, gradient, or pattern)
      if (layer.fill) {
        var colorCanvas = sando.canvas(canvas.width, canvas.height),
            colorContext = colorCanvas.getContext("2d");
        colorContext.fillStyle = layer.fill;
        colorContext.fillRect(0, 0, canvas.width, canvas.height);
        source = colorCanvas;

        // XXX alpha "pre-blending"
        if (!layer.post) {
          colorContext.globalCompositeOperation = "destination-in";
          colorCanvas.drawImage(canvas, 0, 0, width, height);
        }

      // otherwise, assume source is an Image or Canvas
      } else if (Array.isArray(layer.layers)) {
        source = sando.make(layer.layers, null, width, height, depth + 1);
      } else {
        source = layer.source;
      }


      if (!hasSize) {
        canvas.width = width = source.width;
        canvas.height = height = source.height;
        hasSize = true;
      }

      ctx.globalAlpha = isNaN(layer.alpha) ? 1 : layer.alpha / 100;
      ctx.globalCompositeOperation = layer.comp || DEFAULT_OP;
      ctx.drawImage(source, 0, 0); // TODO: x, y, width, height

    });

    return canvas;
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
