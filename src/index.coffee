Mustache = require 'mustache'
async = require 'async'
path = require 'path'
md5 = require 'md5'
fs = require 'fs'
gm = require('gm').subClass imageMagick: true
gp = new (require '../lib/packer.growing')
_ = require 'underscore'


DEFAULT_TEMPLATES_ONE =
  json:
    file: path.resolve(__dirname, '..', 'templates', 'one', 'json.template')
    ext : '.json'

DEFAULT_TEMPLATES_MANY =
  json:
    file: path.resolve(__dirname, '..', 'templates', 'many', 'json.template')
    ext : '.json'


readSprites = (src, ext = ".png", callback) ->
  fs.readdir src, (error, files) ->
    return callback(error) if error

    sprites = files
      .map (file) -> path.join(src, file)
      .reduce (memo, file) ->
        base = path.basename(file, ext)
        memo[base] = file: file
        return memo
      , {}

    return callback null, {
      sprites: sprites
      src    : path.join(src)
      ext    : ext
      name   : path.basename(src)
    }
  return


readSizes = (args..., canvas, callback) ->
  trim = args[0] ? true
  async.each canvas.sprites
    , (info, callback) ->
      format = if trim then '%wx%h %@' else '%wx%h %wx%h+0+0'
      gm(info.file).identify format, (error, size) ->
        return callback(error) if error
        size = size.match(/[-+]?\d+/g)
        info.size =
          width      : Number size[2]
          height     : Number size[3]
          frameWidth : Number size[0]
          frameHeight: Number size[1]
          frameRegX  : Number size[4]
          frameRegY  : Number size[5]
        return callback(null, info)
    , (error, results) ->
      return callback(error) if error
      return callback(null, canvas)
  return


canvasInfo = (args..., canvas, callback) ->
  padding = args[0] ? 0
  fit = (sort) ->
    blocks = sort _(canvas.sprites).map (info, key) ->
      w        : info.size.width  + padding * 2
      h        : info.size.height + padding * 2
      frameRegX: info.size.frameRegX
      frameRegY: info.size.frameRegY
      key   : key
    gp.fit blocks
    blocksArea = _(blocks).reduce ((memo, b) -> memo += b.w * b.h), 0
    return {
      width : gp.root.w
      height: gp.root.h
      blocks: blocks
      rate  : blocksArea / (gp.root.w * gp.root.h)
    }

  result = _.chain([
    (blocks) -> _(blocks).sortBy (b) -> -b.w                # By width
    (blocks) -> _(blocks).sortBy (b) -> -b.h                # By height
    (blocks) -> _(blocks).sortBy (b) -> -Math.max(b.w, b.h) # By maxside
  ]).map(fit).max((r) -> r.rate).value()

  result.blocks.forEach (b) ->
    _.extend canvas.sprites[b.key].size,
      canvasX: b.fit.x - b.frameRegX + padding
      canvasY: b.fit.y - b.frameRegY + padding
      offsetX: b.fit.x + padding
      offsetY: b.fit.y + padding

  _.extend canvas,
    width : result.width
    height: result.height

  if typeof callback == 'function'
    return callback(null, canvas)
  return canvas


canvasImage = (dest = null, canvas, callback) ->
  return callback(new Error('Destination is no defined')) unless dest

  pipe = gm(canvas.width, canvas.height, "none")
  _(canvas.sprites).each (info, name) ->
    x = if info.size.canvasX >= 0 then "+#{info.size.canvasX}" else "#{info.size.canvasX}"
    y = if info.size.canvasY >= 0 then "+#{info.size.canvasY}" else "#{info.size.canvasY}"
    pipe
      .out(info.file)
      .geometry("#{x}#{y}")
      .out("-composite")

  pipe.toBuffer path.extname(dest), (error, buffer) ->
    return callback(error) if error
    hash = md5(buffer)
    dest = path.join(dest).replace(/\[hash\]/ig, hash)
    fs.writeFile dest, buffer, (error, result) ->
      return callback(error) if error
      canvas.hash = hash
      canvas.dest = dest
      return callback(null, canvas)
  return


templateData = (canvas, callback) ->
  result =
    sprites: _(canvas.sprites).map (info, name) ->
      name       : name
      file       : info.file

      width      : info.size.width
      height     : info.size.height
      offsetX    : info.size.offsetX
      offsetY    : info.size.offsetY

      canvasX    : info.size.canvasX
      canvasY    : info.size.canvasY

      frameWidth : info.size.frameWidth
      frameHeight: info.size.frameHeight
      frameRegX  : info.size.frameRegX
      frameRegY  : info.size.frameRegY

    src : canvas.src
    ext : canvas.ext
    name: canvas.name

    width : canvas.width
    height: canvas.height

    dest: canvas.dest
    hash: canvas.hash

  _(result.sprites).first()?.isFirst = true
  _(result.sprites).last()?.isLast = true

  if typeof callback == 'function'
    return callback(null, result)
  return result


canvasMeta = (templatePath, dest, data, callback) ->
  fs.readFile templatePath, 'utf8', (error, template) ->
    return callback(error) if error
    result = Mustache.render template, data
    fs.writeFile dest, result, 'utf8', (error, result) ->
      return callback(error) if error
      return callback(null, data)


makeOptions = (src, options = {}, templates = {}, destReplace = true) ->
  if _.isString options
    options = {dest: options}
  defaultOptions =
    ext : '.png'
    trim: true
    padding: 0
    templates: ['json']
  options = _.extend {}, defaultOptions, options

  basename = path.basename(src)
  if destReplace
    options.dest ?= basename + options.ext
    options.dest = options.dest.replace(/\[basename\]/ig, basename)
    options.dest = options.dest.replace(/\[ext\]/ig, options.ext)

  if _.isArray(options.templates)
    options.templates = _.chain(options.templates)
      .map (name) -> [name, templates[name] ? null]
      .object()
      .value()
  for key, value of options.templates when _.isString value
    options.templates[key] =
      dest: value
  for key, value of options.templates
    value.file ?= key
    value.dest ?= basename + (value.ext ? path.extname(value.file))

  options


templateProcess = (templates, data, callback) ->
  handlers = _(templates).map (value) ->
    canvasMeta.bind null, value.file, value.dest, data
  async.parallel handlers, (error, result) ->
    return callback(error) if error
    return callback(null, data)


processOne = (src, args..., callback = ->) ->
  options = makeOptions(src, args[0], DEFAULT_TEMPLATES_ONE)

  async.waterfall [
    readSprites.bind null, src, options.ext ? '.png'
    readSizes.bind null, options.trim ? true
    canvasInfo.bind null, options.padding ? 0
    canvasImage.bind null, options.dest
    templateData
    templateProcess.bind null, options.templates
  ], callback


processMany = (src, args..., callback = ->) ->
  options = makeOptions(src, args[0], DEFAULT_TEMPLATES_MANY, false)

  spritesProcess = (dirs, callback) ->
    hs = _(dirs).map (d) ->
      processOne.bind null, path.join(src, d), _.extend {}, options, {templates: {}}
    async.series hs, (error, results) ->
      return callback(error) if error
      templateData = { files: results }
      _(results).first()?.isFirstFile = true
      _(results).last()?.isLastFile = true
      templateProcess options.templates, templateData, (error, data) ->
        return callback(error) if error
        return callback(null, data)

  if _.isArray(src)
    spritesProcess(src, callback)
  else
    fs.readdir src, (error, dirs) ->
      return callback(error) if error
      spritesProcess(dirs, callback)


module.exports =
  processOne : processOne
  processMany: processMany
