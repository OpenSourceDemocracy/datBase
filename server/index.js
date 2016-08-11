const http = require('http')
const router = require('./router')

const PORT = process.env.DATLAND_PORT || 8080

http
  .createServer(router)
  .listen(PORT, () => console.log('dat.land listening on port: ' + PORT))