console.log("!!! Background service carregado!");
chrome.runtime.onInstalled.addListener(() => {
  console.log("Extensão instalada com sucesso!");
});

import {
  auth,
  db,
  doc,
  getDoc,
  collection,
  addDoc,
  getDocs,
  setDoc,
  onAuthStateChanged,
  signInWithCustomToken
} from "./firebase.js";

let currentUser = null;
let currentUserUID = null;

onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    currentUserUID = user.uid;
    console.log("✅ Usuário autenticado:", currentUserUID);
    chrome.storage.local.set({ alunoUID: currentUserUID });
  } else {
    currentUser = null;
    currentUserUID = null;
    chrome.storage.local.remove("alunoUID");
    console.log("🔌 Usuário desconectado da extensão.");
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Login com token
  if (msg.tipo === "LOGAR_NA_EXTENSAO_COM_TOKEN") {
    signInWithCustomToken(auth, msg.token)
      .then((cred) => {
        sendResponse({ success: true, uid: cred.user.uid });
      })
      .catch((err) => {
        console.error("Erro no login:", err);
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }

  // Obter dados do aluno atual
  if (msg.tipo === "GET_ALUNO_DATA") {
    if (currentUser && msg.alunoUID === currentUserUID) {
      const ref = doc(db, "usuarios", currentUserUID);
      getDoc(ref)
        .then((snap) => {
          if (snap.exists()) {
            sendResponse({ success: true, uid: currentUserUID, data: snap.data() });
          } else {
            sendResponse({ success: false, error: "Documento do usuário não encontrado." });
          }
        })
        .catch((err) => {
          sendResponse({ success: false, error: err.message });
        });
    } else {
      sendResponse({ success: false, error: "Usuário não autenticado ou UID inválido." });
    }
    return true;
  }

  // Adicionar log individual
  if (msg.tipo === "ADD_PRESENCA_LOG") {
    if (currentUser && msg.alunoUID === currentUserUID) {
      const logRef = collection(db, `presencas/${currentUserUID}/logs`);
      addDoc(logRef, msg.payload)
        .then(() => sendResponse({ success: true }))
        .catch((err) => {
          console.error("Erro ao salvar log:", err);
          sendResponse({ success: false, error: err.message });
        });
    } else {
      sendResponse({ success: false, error: "Usuário não autenticado para log de presença." });
    }
    return true;
  }

  // ✅ NOVO: Obter vetores de todos os discentes
  if (msg.tipo === "GET_VETORES_TODOS") {
    getDocs(collection(db, "usuarios"))
      .then((snap) => {
        const alunos = snap.docs
          .map((doc) => ({ uid: doc.id, ...doc.data() }))
          .filter((u) => u.tipo === "discente" && u.vetorFacial);

        const vetores = alunos.map((aluno) => ({
          uid: aluno.uid,
          nome: aluno.nome,
          vetorFacial: aluno.vetorFacial
        }));

        sendResponse({ success: true, vetores });
      })
      .catch((err) => {
        console.error("Erro ao buscar vetores:", err);
        sendResponse({ success: false, error: err.message });
      });

    return true;
  }

  // ✅ NOVO: Adicionar presença múltipla
  if (msg.tipo === "ADD_PRESENCA_MULTIPLA") {
    const { meetId, participanteId, payload } = msg;
    const path = doc(db, `relatorio_aula/${meetId}/participantes/${participanteId}`);

    setDoc(path, {
      ...payload,
      atualizadoEm: new Date().toISOString()
    }, { merge: true })
      .then(() => sendResponse({ success: true }))
      .catch((err) => {
        console.error("Erro ao salvar múltipla:", err);
        sendResponse({ success: false, error: err.message });
      });

    return true;
  }

  return false;
});
