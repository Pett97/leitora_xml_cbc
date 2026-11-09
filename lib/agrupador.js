export function gerarCodigoMaster(codigoItem, ud, lote) {
  return `M${codigoItem}H${ud}L${lote}`;
}

export function categoriaDe(descricao) {
  const texto = descricao ?? "";
  if (contem(texto, "MUN")) return "Munição";
  if (contem(texto, "CART")) return "Cartucho";
  if (contem(texto, "ESPOL")) return "Espoleta";
  return "Produto";
}

export function agrupar(linhas) {
  const grupos = new Map();

  for (const linha of linhas) {
    const chave = `${linha.linha}\0${linha.codigoItem}\0${linha.lote}\0${linha.ud}`;
    let grupo = grupos.get(chave);
    if (!grupo) {
      grupo = {
        linha: linha.linha,
        codigoItem: linha.codigoItem,
        descricao: linha.descricao,
        lote: linha.lote,
        ud: linha.ud,
        valorUnitario: linha.valor,
        quantidadeTotal: 0,
        numeroCaixas: 0,
        ucCodigos: [],
      };
      grupos.set(chave, grupo);
    }
    grupo.ucCodigos.push(linha.ucCodigo);
    grupo.quantidadeTotal += linha.quantidade;
    grupo.numeroCaixas += 1;
  }

  return [...grupos.values()]
    .sort((a, b) => cmp(a.linha, b.linha) || cmp(a.lote, b.lote) || cmp(a.ud, b.ud))
    .map((grupo) => ({
      ...grupo,
      codigoMaster: gerarCodigoMaster(grupo.codigoItem, grupo.ud, grupo.lote),
      categoria: categoriaDe(grupo.descricao),
      expandido: false,
    }));
}

export function contem(texto, termo) {
  return String(texto ?? "").toLocaleLowerCase("pt-BR").includes(String(termo ?? "").toLocaleLowerCase("pt-BR"));
}

function cmp(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
