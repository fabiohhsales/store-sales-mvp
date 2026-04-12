// next.config.local.js
// Permite uploads grandes (até 70 MB) para rotas de API

module.exports = {
  api: {
    bodyParser: {
      sizeLimit: '70mb',
    },
  },
}
