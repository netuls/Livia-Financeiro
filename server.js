require('dotenv').config();

const path = require('path');
const express = require('express');

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');
const pino = require('pino');

const { parseGasto } = require('./parser');
const { salvarGasto } = require('./firebase');

const PORT = process.env.PORT || 3000;

const NUMEROS_AUTORIZADOS = (process.env.NUMEROS_AUTORIZADOS || '')
  .split(',')
  .map((n) => n.trim())
  .filter(Boolean);

function numeroAutorizado(jid) {
  if (NUMEROS_AUTORIZADOS.length === 0) return true; // sem restricao configurada
  const numero = jid.split('@')[0];
  return NUMEROS_AUTORIZADOS.includes(numero);
}

// Guarda os IDs das mensagens já processadas, pra evitar registrar a mesma
// mensagem duas vezes (o WhatsApp às vezes entrega o mesmo evento mais de
// uma vez, ou com JIDs diferentes — @s.whatsapp.net e @lid — pro mesmo id).
const mensagensProcessadas = new Set();
const LIMITE_CACHE_IDS = 500; // evita crescer pra sempre em memória

function jaProcessada(msgId) {
  if (!msgId) return false;
  if (mensagensProcessadas.has(msgId)) return true;

  mensagensProcessadas.add(msgId);
  if (mensagensProcessadas.size > LIMITE_CACHE_IDS) {
    const primeiro = mensagensProcessadas.values().next().value;
    mensagensProcessadas.delete(primeiro);
  }
  return false;
}

// Estado compartilhado entre o bot e o site, pra mostrar o QR code na pagina.
let qrCodeImagem = null; // data URL da imagem do QR, enquanto nao conectado
let whatsappConectado = false;

// ---------- Site (Express) ----------

function iniciarSite() {
  const app = express();

  // Estrutura sem subpastas: servimos só os arquivos do site, um a um,
  // pra não expor server.js, firebase.js, parser.js ou o .env pela web.
  app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
  app.get('/index.html', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
  app.get('/style.css', (req, res) => res.sendFile(path.join(__dirname, 'style.css')));
  app.get('/app.js', (req, res) => res.sendFile(path.join(__dirname, 'app.js')));
  app.get('/firebase-config.js', (req, res) => res.sendFile(path.join(__dirname, 'firebase-config.js')));

  app.get('/status-whatsapp', (req, res) => {
    res.json({ conectado: whatsappConectado, qr: qrCodeImagem });
  });

  app.listen(PORT, () => {
    console.log(`Livia Financeiro no ar em http://localhost:${PORT}`);
  });
}

// ---------- Bot do WhatsApp (Baileys) ----------

async function iniciarBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\nEscaneie o QR code abaixo com o WhatsApp (Aparelhos conectados),');
      console.log('ou acesse o site para escanear por lá:\n');
      qrcodeTerminal.generate(qr, { small: true });
      qrCodeImagem = await QRCode.toDataURL(qr);
      whatsappConectado = false;
    }

    if (connection === 'close') {
      const motivo = lastDisconnect?.error?.output?.statusCode;
      const deveReconectar = motivo !== DisconnectReason.loggedOut;
      whatsappConectado = false;
      console.log('Conexao encerrada.', motivo, 'Reconectando:', deveReconectar);
      if (deveReconectar) iniciarBot();
    } else if (connection === 'open') {
      whatsappConectado = true;
      qrCodeImagem = null;
      console.log('Conectado ao WhatsApp com sucesso.');
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      try {
        if (!msg.message) continue;

        // Evita processar a mesma mensagem duas vezes (duplicata do WhatsApp
        // ou entrega repetida com JID em formato diferente).
        const msgId = msg.key.id;
        if (jaProcessada(msgId)) continue;

        const jid = msg.key.remoteJid;
        const ehMensagemParaSiMesmo = msg.key.fromMe === true;

        // Debug temporário: mostra o JID real recebido e se está autorizado.
        // Pode remover essas linhas depois de confirmar que está tudo ok.
        console.log(
          '[debug] jid recebido:', jid,
          '| fromMe:', msg.key.fromMe,
          '| autorizado (por numero):', numeroAutorizado(jid)
        );

        if (!jid || jid.endsWith('@g.us')) continue; // ignora grupos

        // Mensagens que você manda pra você mesmo (fromMe = true) sempre são
        // liberadas, independente do formato do JID (numero@s.whatsapp.net
        // ou numero@lid — o WhatsApp mudou o formato recentemente).
        // Pra mensagens vindas de outros números, continua valendo a checagem
        // de NUMEROS_AUTORIZADOS.
        if (!ehMensagemParaSiMesmo && !numeroAutorizado(jid)) continue;

        const texto =
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          '';

        if (!texto.trim()) continue;

        console.log(`[mensagem recebida] ${texto}`);

        const gasto = await parseGasto(texto);

        if (!gasto || !gasto.valor) {
          await sock.sendMessage(jid, {
            text: 'Nao consegui identificar um valor nessa mensagem. Tente algo como: "agua 50" ou "mercado R$120,00".',
          });
          continue;
        }

        const id = await salvarGasto({ ...gasto, origem: 'whatsapp' });
        console.log(`[gasto salvo] id=${id}`, gasto);

        await sock.sendMessage(jid, {
          text: `Registrado: ${gasto.categoria} - R$ ${gasto.valor.toFixed(2).replace('.', ',')}`,
        });
      } catch (err) {
        console.error('[erro ao processar mensagem]', err);
      }
    }
  });
}

// ---------- Sobe tudo junto ----------

iniciarSite();
iniciarBot().catch((err) => {
  console.error('Falha ao iniciar o bot do WhatsApp:', err);
  console.error('O site continua no ar, mas sem registro automatico via WhatsApp.');
});
