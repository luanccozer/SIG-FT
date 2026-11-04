// Extrai o texto por página como o Extract from File do n8n (utils/binary.ts, parseText):
// itens na mesma altura (transform[5]) são colados sem separador; altura nova = '\n' antes do item.
// Uso: npm i pdfjs-dist@4.10.38  e  node indice/extrai_como_n8n.mjs <pasta de PDFs> dados/textos_{sistema}.json
import fs from 'fs';
import path from 'path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const [pasta, saida] = process.argv.slice(2);
const docs = [];
for (const arquivo of fs.readdirSync(pasta).filter(f => /\.pdf$/i.test(f)).sort()) {
  const t0 = Date.now();
  try {
    const data = new Uint8Array(fs.readFileSync(path.join(pasta, arquivo)));
    const doc = await getDocument({ data, isEvalSupported: false, verbosity: 0 }).promise;
    const paginas = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      let lastY; const text = [];
      for (const item of tc.items) {
        if (!('str' in item)) continue;
        if (lastY == item.transform[5] || !lastY) text.push(item.str); else text.push(`\n${item.str}`);
        lastY = item.transform[5];
      }
      paginas.push(text.join(''));
      page.cleanup();
    }
    await doc.destroy();
    docs.push({ arquivo, paginas });
    console.log(arquivo, paginas.length, 'p', ((Date.now() - t0) / 1000).toFixed(1), 's');
  } catch (e) {
    docs.push({ arquivo, erro: String(e.message || e) });
    console.log(arquivo, 'ERRO', e.message);
  }
}
fs.writeFileSync(saida, JSON.stringify(docs));
