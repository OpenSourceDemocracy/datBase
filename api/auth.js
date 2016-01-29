var debug = require('debug')('publicbits/auth')
var concat = require('concat-stream')
var crypto = require('crypto')
var shasum = require('shasum')
var uuid = require('uuid')
var pipe = require('pump')

var auth = function (db, creds, cb) {
  db('users').where({email: creds.email}).asCallback(function (err, rows) {
    if (err) return cb(err)
    var user = rows[0]
    if (!user) return cb(new Error('User does not exist'))
    // borrowed from substack/accountdown-basic
    if (!user.salt) return cb(new Error('salt required'))
    if (!user.hash) return cb(new Error('hash required'))
    var pw = Buffer(creds.password, 'utf-8')
    var salt = Buffer(user.salt, 'hex')
    var h = shasum(Buffer.concat([ salt, pw ]))
    if (h === user.hash) return cb(null, user)
    else cb({status: 401}, user)
  })
}

var generateCreds = function (password) {
  var salt = crypto.randomBytes(16)
  var pw = new Buffer(password, 'utf-8')
  return {
    hash: shasum(Buffer.concat([ salt, pw ])),
    salt: salt.toString('hex')
  }
}

module.exports = function (db, router) {
  router.set('/auth/login', function (req, res, opts, cb) {
    pipe(req, concat(function (body) {
      try {
        var user = JSON.parse(body)
      } catch (err) {
        return cb(err)
      }
      if (!user.email || !user.password) return cb(new Error('Email and password required.'))
      auth(db, {email: user.email, password: user.password}, function (err, user) {
        if (err) {
          res.writeHead(401, {'WWW-Authenticate': 'Basic realm="Secure Area"'})
          return res.end(JSON.stringify({error: 'Login failed'}))
        }
        debug('Logging in', user)
        return res.end(JSON.stringify({
          id: user.id,
          nickname: user.nickname,
          email: user.email,
          verified: user.verified
        }))
      })
      return
    }), function (err) {
      if (err) return cb(err)
    })
  })

  router.set('/auth/verify', function (req, res, opts, cb) {
    pipe(req, concat(function (body) {
      try {
        var user = JSON.parse(body)
      } catch (err) {
        return cb(err)
      }
      if (!user.email) return cb(new Error('Email required.'))
      debug('verifying', user.email)

      db('users').where({ email: user.email }).update({
        verified: true
      }).asCallback(function (err, rows) {
        if (err) return cb(err)
        return res.end(JSON.stringify({updated: true}))
      })
    }), function (err) {
      if (err) return cb(err)
    })
  })

  router.set('/auth/create', function (req, res, opts, cb) {
    pipe(req, concat(function (body) {
      try {
        var user = JSON.parse(body)
      } catch (err) {
        return cb(err)
      }
      if (!user.email || !user.password) return cb(new Error('Email and password required.'))
      var creds = generateCreds(user.password)
      debug('creating', user.email)
      db('users').insert({
        id: uuid.v1(),
        email: user.email,
        verified: false,
        hash: creds.hash,
        salt: creds.salt
      }).asCallback(function (err, rows) {
        if (err) return cb(err)
        debug('created user id', rows[0])
        res.writeHead(201)
        return res.end(JSON.stringify({ id: rows[0] }))
      })
    }), function (err) {
      if (err) return cb(err)
    })
  })

  router.set('/auth/change_password', function (req, res, opts, cb) {
    pipe(req, concat(function (body) {
      try {
        var user = JSON.parse(body)
      } catch (err) {
        return cb(err)
      }
      if (!user.email || !user.newPassword) return cb(new Error('Email and newPassword required.'))
      debug('changing password', user.email)
      var creds = generateCreds(user.newPassword)
      db('users').where({ email: user.email }).update({
        hash: creds.hash,
        salt: creds.salt
      }).asCallback(function (err, row) {
        if (err) return cb(err)
        return res.end(JSON.stringify({updated: true}))
      })
    }), function (err) {
      if (err) return cb(err)
    })
  })

  router.set('/auth/remove', function (req, res, opts, cb) {
    pipe(req, concat(function (body) {
      try {
        var user = JSON.parse(body)
      } catch (err) {
        return cb(err)
      }
      if (!user.id) return cb(new Error('Id required.'))
      debug('removing', user.id)
      db('users').where({id: user.id}).del().asCallback(function (err) {
        if (err) return cb(err)
        res.writeHead(200)
        return res.end(JSON.stringify({removed: true}))
      })
    }), function (err) {
      if (err) return cb(err)
    })
  })
}