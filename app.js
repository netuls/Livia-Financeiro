import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import {
  signInAnonymously,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { db, auth, COLLECTION_NAME } from "./firebase-config.js";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

let todosOsGastos = [];
let mesAtual = new Date().getMonth();
let anoAtual = new Date().getFullYear();

const formatBRL = (valor) =>
  valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function toDate(gasto) {
  return gasto.criadoEm?.toDate ? gasto.criadoEm.toDate() : new Date(gasto.criadoEm || Date.now());
}

function filtrarPorMes(gastos, mes, ano) {
  return gastos.filter((g) => {
    const d = toDate(g);
    return d.getMonth() === mes && d.getFullYear() === ano;
  });
}

function atualizarLabelMes() {
  document.getElementById("currentMonthLabel").textContent = `${MESES[mesAtual]} ${anoAtual}`;
}

function renderHero(gastosMes) {
  const total = gastosMes.reduce((soma, g) => soma + (Number(g.valor) || 0), 0);
  const viaWhats = gastosMes.filter((g) => g.origem === "whatsapp").length;

  const porCategoria = {};
  gastosMes.forEach((g) => {
    const cat = g.categoria || "outros";
    porCategoria[cat] = (porCategoria[cat] || 0) + Number(g.valor || 0);
  });
  const categoriaTop = Object.entries(porCategoria).sort((a, b) => b[1] - a[1])[0];

  document.getElementById("totalMes").textContent = formatBRL(total);
  document.getElementById("totalRegistros").textContent = gastosMes.length;
  document.getElementById("totalWhats").textContent = viaWhats;
  document.getElementById("categoriaTop").textContent = categoriaTop ? categoriaTop[0] : "—";

  return porCategoria;
}

function renderLedger(gastosMes) {
  const body = document.getElementById("ledgerBody");
  const empty = document.getElementById("ledgerEmpty");

  if (gastosMes.length === 0) {
    body.innerHTML = "";
    body.appendChild(empty);
    return;
  }

  const ordenados = [...gastosMes].sort((a, b) => toDate(b) - toDate(a));

  const grupos = new Map();
  ordenados.forEach((g) => {
    const d = toDate(g);
    const chave = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(g);
  });

  body.innerHTML = "";
  grupos.forEach((itens, dataLabel) => {
    const labelEl = document.createElement("p");
    labelEl.className = "ledger-group-label";
    labelEl.textContent = dataLabel;
    body.appendChild(labelEl);

    itens.forEach((g) => {
      const row = document.createElement("div");
      row.className = "ledger-row";

      const tag = document.createElement("span");
      tag.className = `origem-tag ${g.origem === "whatsapp" ? "whatsapp" : "manual"}`;
      tag.title = g.origem === "whatsapp" ? "Registrado via WhatsApp" : "Registrado manualmente";

      const categoria = document.createElement("span");
      categoria.className = "ledger-row-categoria";
      categoria.textContent = g.categoria || "outros";

      const leader = document.createElement("span");
      leader.className = "ledger-row-leader";

      const valor = document.createElement("span");
      valor.className = "ledger-row-valor";
      valor.textContent = `R$ ${formatBRL(Number(g.valor || 0))}`;

      row.append(tag, categoria, leader, valor);
      body.appendChild(row);
    });
  });
}

function renderChart7d(gastosTodos) {
  const container = document.getElementById("chart7d");
  container.innerHTML = "";

  const dias = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dias.push(d);
  }

  const totaisPorDia = dias.map((d) => {
    return gastosTodos
      .filter((g) => {
        const gd = toDate(g);
        return (
          gd.getDate() === d.getDate() &&
          gd.getMonth() === d.getMonth() &&
          gd.getFullYear() === d.getFullYear()
        );
      })
      .reduce((soma, g) => soma + Number(g.valor || 0), 0);
  });

  const max = Math.max(...totaisPorDia, 1);

  dias.forEach((d, i) => {
    const col = document.createElement("div");
    col.className = "chart-bar-col";

    const bar = document.createElement("div");
    bar.className = "chart-bar";
    const alturaPct = Math.max((totaisPorDia[i] / max) * 100, totaisPorDia[i] > 0 ? 6 : 2);
    bar.style.height = `${alturaPct}%`;
    bar.title = `R$ ${formatBRL(totaisPorDia[i])}`;

    const label = document.createElement("span");
    label.className = "chart-bar-label";
    label.textContent = d.toLocaleDateString("pt-BR", { weekday: "narrow" });

    col.append(bar, label);
    container.appendChild(col);
  });
}

function renderCategorias(porCategoria) {
  const container = document.getElementById("categoriaList");
  container.innerHTML = "";

  const entradas = Object.entries(porCategoria).sort((a, b) => b[1] - a[1]);
  if (entradas.length === 0) {
    container.innerHTML = '<p class="ledger-empty" style="color: var(--text-desk-muted); padding: 0;">Sem dados neste mês.</p>';
    return;
  }

  const max = entradas[0][1];

  entradas.forEach(([categoria, valor]) => {
    const item = document.createElement("div");
    item.className = "categoria-item";

    const nome = document.createElement("span");
    nome.className = "categoria-item-nome";
    nome.textContent = categoria;

    const barraWrap = document.createElement("span");
    barraWrap.className = "categoria-item-barra";
    const barraFill = document.createElement("span");
    barraFill.className = "categoria-item-barra-fill";
    barraFill.style.width = `${(valor / max) * 100}%`;
    barraWrap.appendChild(barraFill);

    const valorEl = document.createElement("span");
    valorEl.className = "categoria-item-valor";
    valorEl.textContent = formatBRL(valor);

    item.append(nome, barraWrap, valorEl);
    container.appendChild(item);
  });
}

function renderTudo() {
  atualizarLabelMes();
  const gastosMes = filtrarPorMes(todosOsGastos, mesAtual, anoAtual);
  const porCategoria = renderHero(gastosMes);
  renderLedger(gastosMes);
  renderChart7d(todosOsGastos);
  renderCategorias(porCategoria);
}

// Status da conexão do WhatsApp (bot rodando no mesmo servidor que serve o site)
async function atualizarStatusWhatsapp() {
  const statusEl = document.getElementById('whatsappStatus');
  const statusTextEl = document.getElementById('whatsappStatusText');
  const qrWrap = document.getElementById('whatsappQrWrap');
  const qrImg = document.getElementById('whatsappQrImg');

  try {
    const resp = await fetch('/status-whatsapp');
    const data = await resp.json();

    if (data.conectado) {
      statusEl.className = 'whatsapp-status conectado';
      statusTextEl.textContent = 'Conectado';
      qrWrap.hidden = true;
    } else if (data.qr) {
      statusEl.className = 'whatsapp-status pendente';
      statusTextEl.textContent = 'Aguardando leitura do QR code';
      qrImg.src = data.qr;
      qrWrap.hidden = false;
    } else {
      statusEl.className = 'whatsapp-status';
      statusTextEl.textContent = 'Iniciando conexão…';
      qrWrap.hidden = true;
    }
  } catch (err) {
    statusEl.className = 'whatsapp-status pendente';
    statusTextEl.textContent = 'Bot indisponível (rode "npm start" no servidor)';
    qrWrap.hidden = true;
  }
}

atualizarStatusWhatsapp();
setInterval(atualizarStatusWhatsapp, 4000);

// Autenticação anônima — necessária porque as regras do Firestore exigem
// "request.auth != null". Só depois de logado é que o site consegue ler/escrever.
onAuthStateChanged(auth, (user) => {
  if (!user) return;

  const q = query(collection(db, COLLECTION_NAME), orderBy("criadoEm", "desc"));
  onSnapshot(q, (snapshot) => {
    todosOsGastos = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    renderTudo();
  });
});

signInAnonymously(auth).catch((err) => {
  console.error("Falha ao autenticar no Firebase:", err.message);
});

// Navegação de mês
document.getElementById("prevMonth").addEventListener("click", () => {
  mesAtual -= 1;
  if (mesAtual < 0) {
    mesAtual = 11;
    anoAtual -= 1;
  }
  renderTudo();
});

document.getElementById("nextMonth").addEventListener("click", () => {
  mesAtual += 1;
  if (mesAtual > 11) {
    mesAtual = 0;
    anoAtual += 1;
  }
  renderTudo();
});

// Modal de novo lançamento manual
const modal = document.getElementById("novoLancamentoModal");
document.getElementById("novoLancamentoBtn").addEventListener("click", () => modal.showModal());
document.getElementById("cancelarModal").addEventListener("click", () => modal.close());

document.getElementById("novoLancamentoForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const categoria = document.getElementById("inputCategoria").value.trim();
  const valor = parseFloat(document.getElementById("inputValor").value);
  const descricao = document.getElementById("inputDescricao").value.trim();

  if (!categoria || !valor || valor <= 0) return;

  await addDoc(collection(db, COLLECTION_NAME), {
    categoria,
    valor,
    descricao: descricao || categoria,
    origem: "manual",
    criadoEm: serverTimestamp(),
  });

  e.target.reset();
  modal.close();
});
