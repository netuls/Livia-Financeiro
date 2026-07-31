const admin = require('firebase-admin');
const path = require('path');

let db = null;

function initFirebase() {
  if (db) return db;

  const serviceAccountPath = path.resolve(
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './serviceAccountKey.json'
  );

  const serviceAccount = require(serviceAccountPath);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: process.env.FIREBASE_PROJECT_ID,
  });

  db = admin.firestore();
  return db;
}

/**
 * Salva um gasto no Firestore.
 * @param {{categoria: string, valor: number, descricao: string, origem: string}} gasto
 */
async function salvarGasto(gasto) {
  const firestore = initFirebase();
  const collectionName = process.env.FIRESTORE_COLLECTION || 'gastos';

  const doc = {
    categoria: gasto.categoria,
    valor: gasto.valor,
    descricao: gasto.descricao || gasto.categoria,
    origem: gasto.origem || 'whatsapp',
    criadoEm: admin.firestore.FieldValue.serverTimestamp(),
  };

  const ref = await firestore.collection(collectionName).add(doc);
  return ref.id;
}

module.exports = { initFirebase, salvarGasto };
