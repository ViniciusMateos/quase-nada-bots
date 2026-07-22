/** @type {import('@bacons/apple-targets').Config} */
module.exports = {
  type: 'widget',
  name: 'BotsWidget',
  deploymentTarget: '16.2',
  // Duas imagens, com papéis diferentes:
  //  qnlogo → logo COMPLETA (gradiente + cachorro). Vai colorida no lock screen, onde tem
  //           espaço e o nome do bot já aparece do lado.
  //  qndog  → cachorro branco isolado. Vai como template (tingido pela cor do bot) na
  //           bolinha do Dynamic Island, onde NÃO tem nome e a cor é quem distingue.
  // IMPORTANTE: o path PRECISA começar com './' — sem isso o plugin procura na raiz,
  // não acha e pula calado (a imagem some do widget sem erro nenhum).
  images: {
    qnlogo: './logo.png',
    qndog: './dog.png',
  },
};
