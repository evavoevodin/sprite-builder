// Generated by CoffeeScript 1.10.0
(function() {
  var DEFAULT_TEMPLATES_MANY, DEFAULT_TEMPLATES_ONE, Mustache, _, async, canvasImage, canvasInfo, canvasMeta, fs, gm, gp, makeOptions, md5, path, processMany, processOne, readSizes, readSprites, templateData, templateProcess,
    slice = [].slice;

  Mustache = require('mustache');

  async = require('async');

  path = require('path');

  md5 = require('md5');

  fs = require('fs');

  gm = require('gm').subClass({
    imageMagick: true
  });

  gp = new (require('../lib/packer.growing'));

  _ = require('underscore');

  DEFAULT_TEMPLATES_ONE = {
    json: {
      file: path.resolve(__dirname, '..', 'templates', 'one', 'json.template'),
      ext: '.json'
    }
  };

  DEFAULT_TEMPLATES_MANY = {
    json: {
      file: path.resolve(__dirname, '..', 'templates', 'many', 'json.template'),
      ext: '.json'
    }
  };

  readSprites = function(src, ext, callback) {
    if (ext == null) {
      ext = ".png";
    }
    fs.readdir(src, function(error, files) {
      var sprites;
      if (error) {
        return callback(error);
      }
      sprites = files.map(function(file) {
        return path.join(src, file);
      }).reduce(function(memo, file) {
        var base;
        base = path.basename(file, ext);
        memo[base] = {
          file: file
        };
        return memo;
      }, {});
      return callback(null, {
        sprites: sprites,
        src: path.join(src),
        ext: ext,
        name: path.basename(src)
      });
    });
  };

  readSizes = function() {
    var args, callback, canvas, i, ref, trim;
    args = 3 <= arguments.length ? slice.call(arguments, 0, i = arguments.length - 2) : (i = 0, []), canvas = arguments[i++], callback = arguments[i++];
    trim = (ref = args[0]) != null ? ref : true;
    async.each(canvas.sprites, function(info, callback) {
      var format;
      format = trim ? '%wx%h %@' : '%wx%h %wx%h+0+0';
      return gm(info.file).identify(format, function(error, size) {
        if (error) {
          return callback(error);
        }
        size = size.match(/[-+]?\d+/g);
        info.size = {
          width: Number(size[2]),
          height: Number(size[3]),
          frameWidth: Number(size[0]),
          frameHeight: Number(size[1]),
          frameRegX: Number(size[4]),
          frameRegY: Number(size[5])
        };
        return callback(null, info);
      });
    }, function(error, results) {
      if (error) {
        return callback(error);
      }
      return callback(null, canvas);
    });
  };

  canvasInfo = function() {
    var args, callback, canvas, fit, i, padding, ref, result;
    args = 3 <= arguments.length ? slice.call(arguments, 0, i = arguments.length - 2) : (i = 0, []), canvas = arguments[i++], callback = arguments[i++];
    padding = (ref = args[0]) != null ? ref : 0;
    fit = function(sort) {
      var blocks, blocksArea;
      blocks = sort(_(canvas.sprites).map(function(info, key) {
        return {
          w: info.size.width + padding * 2,
          h: info.size.height + padding * 2,
          frameRegX: info.size.frameRegX,
          frameRegY: info.size.frameRegY,
          key: key
        };
      }));
      gp.fit(blocks);
      blocksArea = _(blocks).reduce((function(memo, b) {
        return memo += b.w * b.h;
      }), 0);
      return {
        width: gp.root.w,
        height: gp.root.h,
        blocks: blocks,
        rate: blocksArea / (gp.root.w * gp.root.h)
      };
    };
    result = _.chain([
      function(blocks) {
        return _(blocks).sortBy(function(b) {
          return -b.w;
        });
      }, function(blocks) {
        return _(blocks).sortBy(function(b) {
          return -b.h;
        });
      }, function(blocks) {
        return _(blocks).sortBy(function(b) {
          return -Math.max(b.w, b.h);
        });
      }
    ]).map(fit).max(function(r) {
      return r.rate;
    }).value();
    result.blocks.forEach(function(b) {
      return _.extend(canvas.sprites[b.key].size, {
        canvasX: b.fit.x - b.frameRegX + padding,
        canvasY: b.fit.y - b.frameRegY + padding,
        offsetX: b.fit.x + padding,
        offsetY: b.fit.y + padding
      });
    });
    _.extend(canvas, {
      width: result.width,
      height: result.height
    });
    if (typeof callback === 'function') {
      return callback(null, canvas);
    }
    return canvas;
  };

  canvasImage = function(dest, canvas, callback) {
    var pipe;
    if (dest == null) {
      dest = null;
    }
    if (!dest) {
      return callback(new Error('Destination is no defined'));
    }
    pipe = gm(canvas.width, canvas.height, "none");
    _(canvas.sprites).each(function(info, name) {
      var x, y;
      x = info.size.canvasX >= 0 ? "+" + info.size.canvasX : "" + info.size.canvasX;
      y = info.size.canvasY >= 0 ? "+" + info.size.canvasY : "" + info.size.canvasY;
      return pipe.out(info.file).geometry("" + x + y).out("-composite");
    });
    pipe.toBuffer(path.extname(dest), function(error, buffer) {
      var hash;
      if (error) {
        return callback(error);
      }
      hash = md5(buffer);
      dest = path.join(dest).replace(/\[hash\]/ig, hash);
      return fs.writeFile(dest, buffer, function(error, result) {
        if (error) {
          return callback(error);
        }
        canvas.hash = hash;
        canvas.dest = dest;
        return callback(null, canvas);
      });
    });
  };

  templateData = function(canvas, callback) {
    var ref, ref1, result;
    result = {
      sprites: _(canvas.sprites).map(function(info, name) {
        return {
          name: name,
          file: info.file,
          width: info.size.width,
          height: info.size.width,
          offsetX: info.size.offsetX,
          offsetY: info.size.offsetY,
          canvasX: info.size.canvasX,
          canvasY: info.size.canvasY,
          frameWidth: info.size.frameWidth,
          frameHeight: info.size.frameHeight,
          frameRegX: info.size.frameRegX,
          frameRegY: info.size.frameRegY
        };
      }),
      src: canvas.src,
      ext: canvas.ext,
      name: canvas.name,
      width: canvas.width,
      height: canvas.height,
      dest: canvas.dest,
      hash: canvas.hash
    };
    if ((ref = _(result.sprites).first()) != null) {
      ref.isFirst = true;
    }
    if ((ref1 = _(result.sprites).last()) != null) {
      ref1.isLast = true;
    }
    if (typeof callback === 'function') {
      return callback(null, result);
    }
    return result;
  };

  canvasMeta = function(templatePath, dest, data, callback) {
    return fs.readFile(templatePath, 'utf8', function(error, template) {
      var result;
      if (error) {
        return callback(error);
      }
      result = Mustache.render(template, data);
      return fs.writeFile(dest, result, 'utf8', function(error, result) {
        if (error) {
          return callback(error);
        }
        return callback(null, data);
      });
    });
  };

  makeOptions = function(src, options, templates, destReplace) {
    var basename, defaultOptions, key, ref, ref1, ref2, value;
    if (options == null) {
      options = {};
    }
    if (templates == null) {
      templates = {};
    }
    if (destReplace == null) {
      destReplace = true;
    }
    if (_.isString(options)) {
      options = {
        dest: options
      };
    }
    defaultOptions = {
      ext: '.png',
      trim: true,
      padding: 0,
      templates: ['json']
    };
    options = _.extend({}, defaultOptions, options);
    basename = path.basename(src);
    if (destReplace) {
      if (options.dest == null) {
        options.dest = basename + options.ext;
      }
      options.dest = options.dest.replace(/\[basename\]/ig, basename);
      options.dest = options.dest.replace(/\[ext\]/ig, options.ext);
    }
    if (_.isArray(options.templates)) {
      options.templates = _.chain(options.templates).map(function(name) {
        var ref;
        return [name, (ref = templates[name]) != null ? ref : null];
      }).object().value();
    }
    ref = options.templates;
    for (key in ref) {
      value = ref[key];
      if (_.isString(value)) {
        options.templates[key] = {
          dest: value
        };
      }
    }
    ref1 = options.templates;
    for (key in ref1) {
      value = ref1[key];
      if (value.file == null) {
        value.file = key;
      }
      if (value.dest == null) {
        value.dest = basename + ((ref2 = value.ext) != null ? ref2 : path.extname(value.file));
      }
    }
    return options;
  };

  templateProcess = function(templates, data, callback) {
    var handlers;
    handlers = _(templates).map(function(value) {
      return canvasMeta.bind(null, value.file, value.dest, data);
    });
    return async.parallel(handlers, function(error, result) {
      if (error) {
        return callback(error);
      }
      return callback(null, data);
    });
  };

  processOne = function() {
    var args, callback, i, options, ref, ref1, ref2, src;
    src = arguments[0], args = 3 <= arguments.length ? slice.call(arguments, 1, i = arguments.length - 1) : (i = 1, []), callback = arguments[i++];
    if (callback == null) {
      callback = function() {};
    }
    options = makeOptions(src, args[0], DEFAULT_TEMPLATES_ONE);
    return async.waterfall([readSprites.bind(null, src, (ref = options.ext) != null ? ref : '.png'), readSizes.bind(null, (ref1 = options.trim) != null ? ref1 : true), canvasInfo.bind(null, (ref2 = options.padding) != null ? ref2 : 0), canvasImage.bind(null, options.dest), templateData, templateProcess.bind(null, options.templates)], callback);
  };

  processMany = function() {
    var args, callback, i, options, spritesProcess, src;
    src = arguments[0], args = 3 <= arguments.length ? slice.call(arguments, 1, i = arguments.length - 1) : (i = 1, []), callback = arguments[i++];
    if (callback == null) {
      callback = function() {};
    }
    options = makeOptions(src, args[0], DEFAULT_TEMPLATES_MANY, false);
    spritesProcess = function(dirs, callback) {
      var hs;
      hs = _(dirs).map(function(d) {
        return processOne.bind(null, path.join(src, d), _.extend({}, options, {
          templates: {}
        }));
      });
      return async.series(hs, function(error, results) {
        var ref, ref1;
        if (error) {
          return callback(error);
        }
        templateData = {
          files: results
        };
        if ((ref = _(results).first()) != null) {
          ref.isFirstFile = true;
        }
        if ((ref1 = _(results).last()) != null) {
          ref1.isLastFile = true;
        }
        return templateProcess(options.templates, templateData, function(error, data) {
          if (error) {
            return callback(error);
          }
          return callback(null, data);
        });
      });
    };
    if (_.isArray(src)) {
      return spritesProcess(src, callback);
    } else {
      return fs.readdir(src, function(error, dirs) {
        if (error) {
          return callback(error);
        }
        return spritesProcess(dirs, callback);
      });
    }
  };

  module.exports = {
    processOne: processOne,
    processMany: processMany
  };

}).call(this);
