// Função serverless da Vercel: encaminha todas as requisições /api/* para o Express
const app = require('../server');

module.exports = (req, res) => {
  // Garante o prefixo /api se a requisição chegar sem ele após o rewrite da Vercel
  if (req.url && !req.url.startsWith('/api')) {
    req.url = '/api' + (req.url.startsWith('/') ? '' : '/') + req.url;
  }
  return app(req, res);
};
