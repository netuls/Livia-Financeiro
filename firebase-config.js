// Configuração do Firebase — pegue esses valores em:
// Firebase Console > Configurações do projeto > Seus apps > SDK setup and configuration
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBKhtHw8G7zSjPqH97ETSWO84gIvhbxgHk",
  authDomain: "financeiro-livia.firebaseapp.com",
  projectId: "financeiro-livia",
  storageBucket: "financeiro-livia.firebasestorage.app",
  messagingSenderId: "830536630544",
  appId: "1:830536630544:web:9a548a177141955908a595",
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// Nome da coleção no Firestore (deve ser igual ao FIRESTORE_COLLECTION do backend)
export const COLLECTION_NAME = "gastos";
