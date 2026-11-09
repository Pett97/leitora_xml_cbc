import {
  NS_CBC,
  Tipo,
  detectar,
  mensagemIncompativel,
} from "./detector.js";

export function parseFaturamento(doc, nomeArquivo, xmlTexto) {
  const root = doc.documentElement;
  if (!root) throw new Error("XML sem elemento raiz.");

  const tipo = detectar(doc);
  if (tipo !== Tipo.CbcFaturamento) {
    throw new Error(mensagemIncompativel(tipo));
  }

  if (root.namespaceURI !== NS_CBC || root.localName !== "Faturamento") {
    throw new Error(mensagemIncompativel(Tipo.Desconhecido));
  }

  const nf = elemento(root, "NF");
  if (!nf) throw new Error("Elemento NF não encontrado.");

  const comprador = elemento(nf, "Comprador");
  const endereco = comprador ? elemento(comprador, "Endereco") : null;
  const linhas = [];
  const itens = elemento(root, "Itens");

  if (itens) {
    for (const item of elementos(itens, "Item")) {
      const linha = (item.getAttribute("Linha") ?? "").trim();
      const codigo = item.getAttribute("Codigo") ?? "";
      const descricao = item.getAttribute("Descricao") ?? "";

      for (const lote of elementos(item, "Lote")) {
        const loteCodigo = lote.getAttribute("Codigo") ?? "";
        for (const ud of elementos(lote, "UD")) {
          const udCodigo = ud.getAttribute("Codigo") ?? "";
          for (const uc of elementos(ud, "UC")) {
            const quantidade = parseDecimal(uc.getAttribute("Quantidade"));
            const valor = parseDecimal(uc.getAttribute("Valor"));
            linhas.push({
              linha,
              codigoItem: codigo,
              descricao,
              lote: loteCodigo,
              ud: udCodigo,
              ucCodigo: uc.getAttribute("Codigo") ?? "",
              quantidade,
              valor,
              subtotal: quantidade * valor,
            });
          }
        }
      }
    }
  }

  const numero = texto(nf, "Numero");
  const emissao = texto(nf, "Emissao");

  return {
    nomeArquivo,
    xmlTexto,
    numero,
    chave: nf.getAttribute("Chave") ?? "",
    empresa: texto(nf, "Empresa"),
    centro: texto(nf, "Centro"),
    cnpjEmitente: texto(nf, "CNPJ"),
    emissao,
    natOp: texto(nf, "NatOp"),
    guia: texto(nf, "Guia"),
    compradorNome: texto(comprador, "Nome"),
    compradorCnpj: comprador?.getAttribute("CNPJ") ?? "",
    compradorCidade: texto(endereco, "Cidade"),
    compradorUf: texto(endereco, "UF"),
    linhas,
    quantidadeUcs: linhas.length,
    totalItens: new Set(linhas.map((linha) => linha.codigoItem)).size,
    totalQuantidade: linhas.reduce((soma, linha) => soma + linha.quantidade, 0),
    totalValor: linhas.reduce((soma, linha) => soma + linha.subtotal, 0),
    dataNota: formatDataNota(emissao),
    tituloNota: numero ? `Nota #${numero}` : "Nota",
    listaRotulo: numero || nomeArquivo,
    emissaoDisplay: formatEmissao(emissao),
  };
}

function elementos(pai, nome) {
  if (!pai) return [];
  return [...pai.children].filter(
    (el) => el.namespaceURI === NS_CBC && el.localName === nome,
  );
}

function elemento(pai, nome) {
  return elementos(pai, nome)[0] ?? null;
}

function texto(pai, nome) {
  return elemento(pai, nome)?.textContent ?? "";
}

export function parseDecimal(value) {
  if (value == null) return 0;
  const raw = String(value).trim();
  if (!raw) return 0;
  if (!/^[+-]?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d*)?|\.\d+)$/.test(raw)) return 0;
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function parseEmissao(value) {
  const s = (value ?? "").trim();
  if (!s) return null;

  let match = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (match) return dataValida(match[1], match[2], match[3], match[4], match[5]);

  match = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (match) return dataValida(match[3], match[2], match[1], match[4], match[5]);

  const instante = Date.parse(s);
  if (!Number.isNaN(instante)) return new Date(instante);
  return null;
}

function dataValida(ano, mes, dia, hora, minuto) {
  const y = Number(ano);
  const m = Number(mes);
  const d = Number(dia);
  const date = new Date(y, m - 1, d, Number(hora || 0), Number(minuto || 0));
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

function pad(n) {
  return String(n).padStart(2, "0");
}

export function formatEmissao(value) {
  const data = parseEmissao(value);
  if (!data) return value ?? "";
  return `${pad(data.getDate())}/${pad(data.getMonth() + 1)}/${data.getFullYear()} ${pad(data.getHours())}:${pad(data.getMinutes())}`;
}

export function formatDataNota(value) {
  const data = parseEmissao(value);
  if (!data) return value ?? "";
  return `${data.getFullYear()}-${pad(data.getMonth() + 1)}-${pad(data.getDate())}`;
}
