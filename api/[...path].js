// Função serverless da Vercel: encaminha todas as rotas /api/* para o app Express.
const app = require('../server');

module.exports = (req, res) => {
  // Garante o prefixo /api mesmo se a Vercel alterar a URL recebida.
  if (req.url && !req.url.startsWith('/api')) {
    req.url = '/api' + (req.url.startsWith('/') ? '' : '/') + req.url;
  }
  return app(req, res);
};
