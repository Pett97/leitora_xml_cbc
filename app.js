import { agrupar, contem } from "./lib/agrupador.js";
import {
  Tipo,
  detectar,
  mensagemIncompativel,
  parseXml,
  rotuloTipo,
} from "./lib/detector.js";
import { parseFaturamento } from "./lib/parser.js";

const MAX_UCS = 5;
const fmtN0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const fmtN2 = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const state = {
  notas: [],
  notasVisiveis: [],
  notaSelecionada: null,
  gruposCompletos: [],
  gruposVisiveis: [],
  ignorados: [],
  termo: "",
  aba: 0,
  status: "Adicione um ou mais arquivos XML.",
};

const ui = {
  busca: document.getElementById("busca"),
  status: document.getElementById("status"),
  arquivo: document.getElementById("arquivo"),
  listaNotas: document.getElementById("lista-notas"),
  painelIgnorados: document.getElementById("painel-ignorados"),
  listaIgnorados: document.getElementById("lista-ignorados"),
  vazio: document.getElementById("vazio"),
  vazioIgnorados: document.getElementById("vazio-ignorados"),
  listaIgnoradosVazio: document.getElementById("lista-ignorados-vazio"),
  detalhe: document.getElementById("detalhe-nota"),
  breadcrumb: document.getElementById("breadcrumb"),
  titulo: document.getElementById("titulo-nota"),
  resumo: document.getElementById("resumo"),
  painelItens: document.getElementById("painel-itens"),
  painelInfo: document.getElementById("painel-info"),
  grade: document.getElementById("grade-itens"),
  infoComprador: document.getElementById("info-comprador"),
  infoEmitente: document.getElementById("info-emitente"),
  infoChave: document.getElementById("info-chave"),
  infoEmissao: document.getElementById("info-emissao"),
  infoArquivo: document.getElementById("info-arquivo"),
  infoValor: document.getElementById("info-valor"),
  abaItens: document.getElementById("aba-itens"),
  abaInfo: document.getElementById("aba-info"),
};

document.getElementById("btn-adicionar").addEventListener("click", () => ui.arquivo.click());
document.getElementById("btn-limpar").addEventListener("click", limpar);
document.getElementById("btn-baixar").addEventListener("click", baixarXml);
ui.arquivo.addEventListener("change", () => {
  if (ui.arquivo.files?.length) importarArquivos(ui.arquivo.files);
  ui.arquivo.value = "";
});
ui.busca.addEventListener("input", () => {
  state.termo = ui.busca.value;
  aplicarFiltros();
  render();
});
ui.abaItens.addEventListener("click", () => selecionarAba(0));
ui.abaInfo.addEventListener("click", () => selecionarAba(1));

let dragDepth = 0;
document.addEventListener("dragenter", (event) => {
  if (!eventoDeArquivo(event)) return;
  event.preventDefault();
  dragDepth += 1;
  document.body.classList.add("is-drag");
});
document.addEventListener("dragover", (event) => {
  if (!eventoDeArquivo(event)) return;
  event.preventDefault();
});
document.addEventListener("dragleave", () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) document.body.classList.remove("is-drag");
});
document.addEventListener("drop", (event) => {
  if (!eventoDeArquivo(event)) return;
  event.preventDefault();
  dragDepth = 0;
  document.body.classList.remove("is-drag");
  if (event.dataTransfer?.files?.length) importarArquivos(event.dataTransfer.files);
});

render();

async function importarArquivos(fileList) {
  const files = [...fileList];
  if (files.length === 0) return;

  let adicionados = 0;
  let ignorados = 0;
  const tiposIgnorados = new Set();
  const errosTecnicos = [];

  for (const file of files) {
    try {
      const texto = await file.text();
      const doc = parseXml(texto);
      const tipo = detectar(doc);
      if (tipo !== Tipo.CbcFaturamento) {
        registrarIgnorado(file.name, tipo);
        ignorados += 1;
        tiposIgnorados.add(rotuloTipo(tipo));
        continue;
      }
      state.notas.push(parseFaturamento(doc, file.name, texto));
      adicionados += 1;
    } catch (error) {
      const mensagem = error instanceof Error ? error.message : String(error);
      errosTecnicos.push(`${file.name}: ${mensagem}`);
      registrarIgnorado(file.name, Tipo.Desconhecido, mensagem);
      ignorados += 1;
      tiposIgnorados.add("Erro");
    }
  }

  aplicarFiltros();
  if (!state.notaSelecionada && state.notasVisiveis.length > 0) {
    state.notaSelecionada = state.notasVisiveis[0];
    carregarDetalhe();
  }
  state.status = montarMensagemImportacao(adicionados, ignorados, tiposIgnorados, errosTecnicos);
  render();
}

function limpar() {
  state.notas = [];
  state.notasVisiveis = [];
  state.notaSelecionada = null;
  state.gruposCompletos = [];
  state.gruposVisiveis = [];
  state.ignorados = [];
  state.status = "Lista limpa. Adicione arquivos XML.";
  render();
}

function registrarIgnorado(nomeArquivo, tipo, mensagem) {
  state.ignorados.unshift({
    nomeArquivo,
    tipoDetectado: rotuloTipo(tipo),
    mensagem: mensagem ?? mensagemIncompativel(tipo),
    dataHora: new Date(),
  });
}

function montarMensagemImportacao(adicionados, ignorados, tiposIgnorados, errosTecnicos) {
  const tipos = [...tiposIgnorados];
  const sufixo = ignorados === 0
    ? ""
    : tipos.length === 1
      ? ` ${ignorados} ignorado(s) (${tipos[0]}).`
      : ` ${ignorados} ignorado(s).`;

  if (adicionados === 0 && ignorados > 0) return `Nenhum XML de faturamento importado.${sufixo}`;
  if (adicionados > 0 && ignorados === 0) {
    return adicionados === 1 ? "1 arquivo carregado." : `${adicionados} arquivos carregados.`;
  }
  if (adicionados > 0 && ignorados > 0) return `${adicionados} importado(s),${sufixo}`;
  if (errosTecnicos.length > 0) return errosTecnicos.join(" | ");
  return "Nenhum arquivo processado.";
}

function aplicarFiltros() {
  const anterior = state.notaSelecionada;
  state.notasVisiveis = state.notas.filter(correspondeBuscaNota);
  if (anterior && !state.notasVisiveis.includes(anterior)) {
    state.notaSelecionada = state.notasVisiveis[0] ?? null;
    carregarDetalhe();
    return;
  }
  aplicarFiltrosGrupos();
}

function correspondeBuscaNota(nota) {
  const termo = state.termo.trim();
  if (!termo) return true;
  return contem(nota.numero, termo)
    || contem(nota.compradorNome, termo)
    || contem(nota.nomeArquivo, termo)
    || nota.linhas.some((linha) =>
      contem(linha.ucCodigo, termo) || contem(linha.lote, termo) || contem(linha.ud, termo));
}

function carregarDetalhe() {
  state.gruposCompletos = [];
  state.gruposVisiveis = [];
  if (!state.notaSelecionada) return;
  state.gruposCompletos = agrupar(state.notaSelecionada.linhas);
  aplicarFiltrosGrupos();
}

function aplicarFiltrosGrupos() {
  const termo = state.termo.trim();
  state.gruposVisiveis = state.gruposCompletos.filter((grupo) => correspondeBuscaGrupo(grupo, termo));
}

function correspondeBuscaGrupo(grupo, termo) {
  if (!termo) return true;
  return contem(grupo.descricao, termo)
    || contem(grupo.codigoItem, termo)
    || contem(grupo.lote, termo)
    || contem(grupo.ud, termo)
    || contem(grupo.codigoMaster, termo)
    || grupo.ucCodigos.some((uc) => contem(uc, termo));
}

function selecionarNota(nota) {
  if (state.notaSelecionada === nota) return;
  state.notaSelecionada = nota;
  carregarDetalhe();
  render();
}

function selecionarAba(indice) {
  state.aba = indice;
  renderAbas();
}

function baixarXml() {
  const nota = state.notaSelecionada;
  if (!nota || nota.xmlTexto == null || nota.xmlTexto === "") {
    state.status = "Arquivo XML não disponível para download.";
    renderStatus();
    return;
  }
  const blob = new Blob([nota.xmlTexto], { type: "application/xml" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nota.nomeArquivo || "nota.xml";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  state.status = "XML salvo com sucesso.";
  renderStatus();
}

async function copiar(texto, mensagem) {
  if (!texto) return;
  try {
    await navigator.clipboard.writeText(texto);
    state.status = mensagem;
  } catch {
    state.status = "Não foi possível copiar.";
  }
  renderStatus();
}

function render() {
  renderStatus();
  renderLista();
  renderIgnorados();
  renderDetalhe();
  renderAbas();
  renderGrupos();
}

function renderStatus() {
  ui.status.textContent = state.status;
  ui.status.classList.toggle("aviso", state.ignorados.length > 0);
}

function renderLista() {
  ui.listaNotas.replaceChildren(...state.notasVisiveis.map((nota) => {
    const selecionada = nota === state.notaSelecionada;
    return h("button", {
      type: "button",
      class: selecionada ? "nota selecionada" : "nota",
      onClick: () => selecionarNota(nota),
    },
      h("div", { class: "nota-numero", text: nota.listaRotulo }),
      h("div", { class: "nota-meta", text: nota.emissaoDisplay }),
      h("div", { class: "nota-meta", text: nota.compradorNome }),
      h("div", { class: "nota-arquivo", text: nota.nomeArquivo }),
    );
  }));
}

function renderIgnorados() {
  const tem = state.ignorados.length > 0;
  ui.painelIgnorados.hidden = !tem;
  ui.vazioIgnorados.hidden = !tem;
  const nos = state.ignorados.map((item) => h("div", { class: "ignorado" },
    h("p", { class: "ignorado-titulo" }, `${item.nomeArquivo} · ${item.tipoDetectado}`),
    h("p", { class: "ignorado-msg", text: item.mensagem }),
  ));
  ui.listaIgnorados.replaceChildren(...nos);
  ui.listaIgnoradosVazio.replaceChildren(...state.ignorados.map((item) => h("div", { class: "ignorado" },
    h("p", { class: "ignorado-titulo" }, `${item.nomeArquivo} · ${item.tipoDetectado}`),
    h("p", { class: "ignorado-msg", text: item.mensagem }),
  )));
}

function renderDetalhe() {
  const nota = state.notaSelecionada;
  ui.vazio.hidden = nota != null;
  ui.detalhe.hidden = nota == null;
  if (!nota) return;

  const tipo = nota.natOp || "NF-e";
  ui.breadcrumb.textContent = `Notas › ${nota.tituloNota}`;
  ui.titulo.textContent = nota.tituloNota;
  ui.resumo.textContent = `Fornecedor: CBC  |  Data: ${nota.dataNota}  |  Tipo: ${tipo}  |  Total itens: ${nota.totalItens}  |  Total quantidade: ${fmtN0.format(nota.totalQuantidade)}`;
  ui.infoComprador.textContent = `${nota.compradorNome} · CNPJ ${nota.compradorCnpj} · ${nota.compradorCidade}/${nota.compradorUf}`;
  ui.infoEmitente.textContent = `${nota.empresa} / ${nota.centro} · CNPJ ${nota.cnpjEmitente}`;
  ui.infoChave.textContent = nota.chave;
  ui.infoEmissao.textContent = `${nota.emissaoDisplay} · Guia ${nota.guia}`;
  ui.infoArquivo.textContent = nota.nomeArquivo;
  ui.infoValor.textContent = `R$ ${fmtN2.format(nota.totalValor)}`;
}

function renderAbas() {
  const itens = state.aba === 0;
  ui.abaItens.classList.toggle("ativa", itens);
  ui.abaInfo.classList.toggle("ativa", !itens);
  ui.abaItens.setAttribute("aria-selected", itens ? "true" : "false");
  ui.abaInfo.setAttribute("aria-selected", itens ? "false" : "true");
  ui.painelItens.hidden = !itens;
  ui.painelInfo.hidden = itens;
}

function renderGrupos() {
  const cabecalho = h("div", { class: "grade-cabecalho" },
    h("span", { text: "Descrição" }),
    h("span", { text: "Lote" }),
    h("span", { text: "UD · código master" }),
    h("span", { text: "Unidades (UC)" }),
    h("span", { text: "Quantidade" }),
    h("span"),
  );
  const linhas = state.gruposVisiveis.map(renderGrupo);
  ui.grade.replaceChildren(h("div", { class: "grade" }, cabecalho, ...linhas));
}

function renderGrupo(grupo) {
  const exibidas = grupo.expandido || grupo.ucCodigos.length <= MAX_UCS
    ? grupo.ucCodigos
    : grupo.ucCodigos.slice(0, MAX_UCS);
  const temMais = grupo.ucCodigos.length > MAX_UCS && !grupo.expandido;
  const mostrarExpandir = grupo.ucCodigos.length > MAX_UCS;

  return h("div", { class: "linha-item" },
    h("div", {},
      h("div", { class: "desc", text: grupo.descricao }),
      h("div", { class: "codigo-linha", text: `Cód. ${grupo.codigoItem} · Linha ${grupo.linha}` }),
      h("span", { class: "categoria", text: grupo.categoria }),
    ),
    h("div", { text: grupo.lote }),
    h("div", {},
      h("p", { class: "ud mono", text: grupo.ud }),
      h("p", { class: "master mono", text: grupo.codigoMaster }),
      h("div", { class: "acoes-ud" },
        h("span", { class: "pill-valido", text: "Válido" }),
        h("button", { type: "button", class: "btn link", onClick: () => copiar(grupo.ud, `UD ${grupo.ud} copiada.`) }, "Copiar UD"),
        h("button", { type: "button", class: "btn link", onClick: () => copiar(grupo.codigoMaster, "Código master copiado.") }, "Copiar master"),
      ),
    ),
    h("div", {},
      h("div", { class: "lista-ucs" }, ...exibidas.map((uc) => h("div", { class: "uc-linha" },
        h("span", { class: "ok", text: "✓" }),
        h("button", {
          type: "button",
          class: "uc-btn",
          title: "Clique para copiar",
          onClick: () => copiar(uc, `UC ${uc} copiada.`),
        }, uc),
      ))),
      h("div", { class: "acoes-ud" },
        temMais
          ? h("button", { type: "button", class: "btn link", onClick: () => alternarExpansao(grupo) }, `+ ${grupo.ucCodigos.length - MAX_UCS} mais`)
          : null,
        h("button", {
          type: "button",
          class: "btn link",
          onClick: () => {
            if (grupo.ucCodigos.length === 0) return;
            copiar(`[${grupo.ucCodigos.join(",")}]`, `${grupo.ucCodigos.length} UCs copiadas como array.`);
          },
        }, "Copiar UCs"),
      ),
    ),
    h("div", {},
      h("p", { class: "qtd", text: fmtN0.format(grupo.quantidadeTotal) }),
      h("p", { class: "caixas", text: `(${grupo.numeroCaixas} caixas)` }),
    ),
    mostrarExpandir
      ? h("button", {
        type: "button",
        class: "chevron",
        onClick: () => alternarExpansao(grupo),
      }, grupo.expandido ? "▼" : "▶")
      : h("span"),
  );
}

function alternarExpansao(grupo) {
  grupo.expandido = !grupo.expandido;
  renderGrupos();
}

function eventoDeArquivo(event) {
  return [...(event.dataTransfer?.types ?? [])].includes("Files");
}

function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = String(value);
    else if (key === "hidden") node.hidden = Boolean(value);
    else if (key === "title") node.title = String(value);
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children) append(node, child);
  return node;
}

function append(node, child) {
  if (child == null || child === false) return;
  if (Array.isArray(child)) {
    for (const item of child) append(node, item);
    return;
  }
  node.append(child instanceof Node ? child : document.createTextNode(String(child)));
}
