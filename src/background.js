// background.js - v2 (compatível com multi-face)
console.log("!!! Background service v2 (multi-face) carregado!");

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

let currentUserUID = null;

/**
 * ✅ FUNÇÃO ASSÍNCRONA E ROBUSTA PARA OBTER O USUÁRIO AUTENTICADO
 * Resolve o problema do service worker "adormecido".
 * Retorna uma promessa que resolve com o objeto do usuário autenticado.
 */
const getAuthenticatedUser = () => {
  return new Promise((resolve, reject) => {
    // Se a sessão já está ativa no Firebase, resolve imediatamente.
    if (auth.currentUser) {
      resolve(auth.currentUser);
      return;
    }
    // Se não, espera o Firebase restaurar a sessão do usuário.
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub(); // Para de ouvir para não recriar a função
      if (user) {
        console.log("✅ Sessão do usuário restaurada via onAuthStateChanged.");
        resolve(user);
      } else {
        console.error("❌ Tentativa de obter usuário, mas ninguém está logado.");
        reject("Usuário não autenticado.");
      }
    });
  });
};


// --- SEÇÃO DE MONITORAMENTO DE ABAS ---
// A lógica aqui se aplica ao usuário LOGADO na extensão.
let isMonitoringActive = false;
let meetTabId = null;
let tabSwitchCount = 0;
let studentNameForAlerts = "Aluno"; // Nome do usuário logado para os alertas

// ------------------------------------

onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUserUID = user.uid;
    console.log("✅ Usuário autenticado:", currentUserUID);
    chrome.storage.local.set({ alunoUID: currentUserUID });
  } else {
    currentUserUID = null;
    isMonitoringActive = false; // Garante que o monitoramento pare ao deslogar
    meetTabId = null;
    chrome.storage.local.remove("alunoUID");
    console.log("🔌 Usuário desconectado da extensão.");
  }
});

// Função para registrar a troca de aba do usuário logado
async function registrarTrocaDeAba() {
  if (!isMonitoringActive) return;

  try {
    const user = await getAuthenticatedUser();
    tabSwitchCount++;
    console.log(`DESENGAJAMENTO: Aluno ${user.uid} trocou de aba. Contagem: ${tabSwitchCount}`);

    const payload = {
      status: 'ausente',
      horario: new Date().toISOString(),
      tipo: 'troca_de_aba',
      nomeAluno: studentNameForAlerts,
      contagem: tabSwitchCount
    };

    const logRef = collection(db, `presencas/${user.uid}/logs`);
    await addDoc(logRef, payload);
    console.log(`📡 Log de troca de aba #${tabSwitchCount} enviado.`);

    if (tabSwitchCount === 4) {
      console.warn(`🔥🔥🔥 ALERTA: Aluno ${studentNameForAlerts} (${user.uid}) atingiu 4 trocas de aba!`);
      const alertPayload = {
        status: 'desengajado',
        horario: new Date().toISOString(),
        tipo: 'desengajamento_por_abas',
        nomeAluno: studentNameForAlerts,
        contagem: tabSwitchCount
      };
      await addDoc(logRef, alertPayload);
      console.log('📡 Log de ALERTA DE DESENGAJAMENTO enviado.');
    }
  } catch (error) {
    console.error("❌ Erro ao registrar troca de aba (usuário deslogado?):", error);
  }
}

// Listeners para detectar troca de abas e janelas
chrome.tabs.onActivated.addListener((activeInfo) => {
  if (isMonitoringActive && activeInfo.tabId !== meetTabId) {
    registrarTrocaDeAba();
  }
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (isMonitoringActive && windowId === chrome.windows.WINDOW_ID_NONE) {
    registrarTrocaDeAba();
  }
});


// --- GERENCIADOR CENTRAL DE MENSAGENS ---
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Envolve a lógica em uma função assíncrona para usar 'await'
  (async () => {
    switch (msg.tipo) {
      // --- Monitoramento de Abas ---
      case "START_MONITORING":
        // Adicionada uma trava para evitar reinicialização
        if (isMonitoringActive) {
          sendResponse({ success: true, message: "Monitoramento já ativo." });
          return;
        }

        isMonitoringActive = true;
        meetTabId = sender.tab.id;
        tabSwitchCount = 0;

        try {
          const user = await getAuthenticatedUser();
          const userRef = doc(db, "usuarios", user.uid);
          const snap = await getDoc(userRef);
          if (snap.exists()) {
            studentNameForAlerts = snap.data().nome || "Aluno";
          }
          console.log(`✅ Monitoramento de abas ATIVADO para ${studentNameForAlerts} na aba ${meetTabId}.`);
          sendResponse({ success: true });
        } catch (error) {
          console.error("Falha ao iniciar monitoramento:", error);
          isMonitoringActive = false; // Desfaz a ativação em caso de erro
          sendResponse({ success: false, error: error.toString() });
        }
        break;

      case "STOP_MONITORING":
        isMonitoringActive = false;
        meetTabId = null;
        console.log(`🛑 Monitoramento de abas DESATIVADO.`);
        sendResponse({ success: true });
        break;

      // --- Autenticação ---
      case "LOGAR_NA_EXTENSAO_COM_TOKEN":
        try {
          const cred = await signInWithCustomToken(auth, msg.token);
          sendResponse({ success: true, uid: cred.user.uid });
        } catch (err) {
          console.error("Erro no login:", err);
          sendResponse({ success: false, error: err.message });
        }
        break;

      // --- Busca de Dados ---
      case "GET_ALUNO_DATA":
        try {
          const user = await getAuthenticatedUser();
          if (msg.alunoUID === user.uid) {
            const ref = doc(db, "usuarios", user.uid);
            const snap = await getDoc(ref);
            if (snap.exists()) {
              sendResponse({ success: true, uid: user.uid, data: snap.data() });
            } else {
              sendResponse({ success: false, error: "Documento do usuário não encontrado." });
            }
          } else {
            sendResponse({ success: false, error: "Conflito de UIDs." });
          }
        } catch (error) {
          sendResponse({ success: false, error: error.toString() });
        }
        break;

      // NOVO: Gerenciador para buscar dados de TODOS os alunos para o face-matcher.
      case "GET_ALL_ALUNOS_DATA":
        try {
          const snap = await getDocs(collection(db, "usuarios"));

          const alunos = snap.docs
            .map((doc) => ({ uid: doc.id, ...doc.data() }))
            .filter((u) => u.tipo === "discente" && (u.vetorFacial || u.vetoresFaciais));

          // Formata os dados para garantir que sempre haja um array `vetoresFaciais`
          const alunosFormatado = alunos.map(aluno => {
            let vetores = [];
            if (aluno.vetoresFaciais) {
              // Se o novo campo existe (e pode ser um objeto ou array), converte para array de vetores
              vetores = Array.isArray(aluno.vetoresFaciais) ? aluno.vetoresFaciais : Object.values(aluno.vetoresFaciais);
            } else if (aluno.vetorFacial) {
              // Se apenas o campo antigo existe, coloca ele dentro de um array
              vetores = [aluno.vetorFacial];
            }
            return {
              uid: aluno.uid,
              nome: aluno.nome,
              vetoresFaciais: vetores
            };
          });

          console.log(`Enviando dados de ${alunosFormatado.length} aluno(s) para o content script.`);
          sendResponse({ success: true, data: alunosFormatado });

        } catch (err) {
          console.error("❌ Erro ao buscar dados de todos os alunos:", err);
          sendResponse({ success: false, error: err.message });
        }
        break;

      // --- Registro de Logs ---
      case "ADD_PRESENCA_LOG":
        // Esta função agora registra o log para o UID fornecido na mensagem,
        // o que a torna perfeita para o sistema multifacial.
        try {
          const logRef = collection(db, `presencas/${msg.alunoUID}/logs`);
          await addDoc(logRef, msg.payload);
          sendResponse({ success: true });
        } catch (error) {
          console.error("Erro ao salvar log:", error);
          sendResponse({ success: false, error: error.toString() });
        }
        break;

      case "ADD_PRESENCA_MULTIPLA":
        // Função completa para atualizar um relatório de aula
        const { meetId, participanteId, payload } = msg;
        const path = doc(db, `relatorio_aula/${meetId}/participantes/${participanteId}`);
        try {
          await setDoc(path, { ...payload, atualizadoEm: new Date().toISOString() }, { merge: true });
          sendResponse({ success: true });
        } catch (err) {
          console.error("Erro ao salvar presença múltipla:", err);
          sendResponse({ success: false, error: err.message });
        }
        break;
    }
  })(); // Auto-executa a função assíncrona.

  // Retorna 'true' para indicar que a resposta será enviada de forma assíncrona.
  return true;
});