const Groq = require('groq-sdk');

let groqClient = null;
function getGroqClient() {
  if (!process.env.GROQ_API_KEY) return null;
  if (!groqClient) groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return groqClient;
}

/**
 * Extrai {categoria, valor, descricao} de uma mensagem usando regex simples.
 * Funciona bem para padroes tipo: "agua 50", "agua R$50,00", "50 agua"
 */
function parseComRegex(texto) {
  const valorMatch = texto.match(/(\d+[.,]?\d*)/);
  if (!valorMatch) return null;

  const valor = parseFloat(valorMatch[1].replace(',', '.'));
  if (isNaN(valor) || valor <= 0) return null;

  const categoria = texto
    .replace(valorMatch[0], '')
    .replace(/r\$/gi, '')
    .replace(/reais|conta de|conta do|conta da/gi, '')
    .trim() || 'outros';

  return { categoria, valor, descricao: texto.trim() };
}

/**
 * Extrai {categoria, valor, descricao} usando a Groq (gratis) para entender frases livres.
 * Cai para regex automaticamente se a chave nao estiver configurada ou a chamada falhar.
 */
async function parseGasto(texto) {
  const client = getGroqClient();

  if (!client) {
    return parseComRegex(texto);
  }

  try {
    const completion = await client.chat.completions.create({
      model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
      messages: [
        {
          role: 'system',
          content:
            'Voce extrai dados de gastos financeiros de mensagens em portugues do Brasil. ' +
            'Responda APENAS com um JSON no formato {"categoria": string, "valor": number, "descricao": string}, ' +
            'sem nenhum texto adicional, sem markdown. Se a mensagem nao descrever um gasto valido, responda {"categoria": null, "valor": null, "descricao": null}.',
        },
        { role: 'user', content: texto },
      ],
      temperature: 0,
      max_tokens: 200,
    });

    const raw = completion.choices[0]?.message?.content?.trim() || '';
    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    if (!parsed.valor || !parsed.categoria) {
      return parseComRegex(texto);
    }

    return {
      categoria: parsed.categoria,
      valor: Number(parsed.valor),
      descricao: parsed.descricao || texto,
    };
  } catch (err) {
    console.error('[parser] Groq falhou, usando regex como fallback:', err.message);
    return parseComRegex(texto);
  }
}

module.exports = { parseGasto, parseComRegex };
