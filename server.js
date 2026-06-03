const express = require('express');
const { ExpressPeerServer } = require('peer');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Servir arquivos estáticos do cliente da raiz do projeto
app.use(express.static(path.join(__dirname)));

// Configurar o servidor PeerJS montado em /peer
const peerServer = ExpressPeerServer(server, {
  debug: true,
  path: '/'
});

app.use('/peer', peerServer);

// Rota fallback para o index.html (útil para PWA/SPA se houver roteamento)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 9000;
server.listen(PORT, () => {
  console.log('==================================================');
  console.log('Vocal - Servidor Local Iniciado!');
  console.log(`Interface: http://localhost:${PORT}`);
  console.log(`PeerJS Server: http://localhost:${PORT}/peer`);
  console.log('==================================================');
});
