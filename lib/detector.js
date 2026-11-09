export const NS_CBC = "http://cbc.com.br/sip/api/NFSchema.xsd";
export const NS_NFE = "http://www.portalfiscal.inf.br/nfe";

export const Tipo = {
  CbcFaturamento: "CbcFaturamento",
  NFe: "NFe",
  Desconhecido: "Desconhecido",
};

const RAIZES_NFE = new Set(["nfeProc", "NFe", "enviNFe", "procNFe"]);

const NS_XHTML = "http://www.w3.org/1999/xhtml";

export function parseXml(texto) {
  const doc = new DOMParser().parseFromString(texto, "application/xml");
  const mensagem = mensagemDeErro(doc);
  if (mensagem) throw new Error(mensagem);
  return doc;
}

function mensagemDeErro(doc) {
  const root = doc.documentElement;
  if (!root) return "XML inválido.";

  if (root.localName === "parsererror") return textoErro(root);

  const erro = [...root.getElementsByTagName("parsererror")].find((el) =>
    el.namespaceURI === NS_XHTML || root.namespaceURI === NS_XHTML);
  if (erro) return textoErro(erro);

  return null;
}

function textoErro(erro) {
  const detalhe = [...erro.getElementsByTagName("div")].map((el) => el.textContent.trim()).find(Boolean);
  return (detalhe || erro.textContent || "XML inválido.").replace(/\s+/g, " ").trim();
}

export function detectar(doc) {
  const root = doc.documentElement;
  if (!root) return Tipo.Desconhecido;

  if (root.namespaceURI === NS_CBC && root.localName === "Faturamento") {
    return Tipo.CbcFaturamento;
  }

  if (root.namespaceURI === NS_NFE || RAIZES_NFE.has(root.localName)) {
    return Tipo.NFe;
  }

  if (doc.getElementsByTagNameNS(NS_NFE, "infNFe").length > 0) {
    return Tipo.NFe;
  }

  return Tipo.Desconhecido;
}

export function rotuloTipo(tipo) {
  if (tipo === Tipo.NFe) return "NF-e";
  if (tipo === Tipo.CbcFaturamento) return "Faturamento CBC";
  return "Desconhecido";
}

export function mensagemIncompativel(tipo) {
  if (tipo === Tipo.NFe) {
    return "Este arquivo é NF-e (nota fiscal eletrônica). Este app lê o XML de faturamento CBC com rastreio UD/UC (elemento Faturamento).";
  }
  if (tipo === Tipo.Desconhecido) {
    return "Formato não reconhecido. Esperado: XML de faturamento CBC (elemento Faturamento).";
  }
  return "Arquivo incompatível.";
}
