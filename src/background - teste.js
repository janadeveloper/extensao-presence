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

// --- SEÇÃO DE MONITORAMENTO DE ABAS ---
let isMonitoringActive = false;
let meetTabId = null;
let tabSwitchCount = 0;
// ------------------------------------

onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    currentUserUID = user.uid;
    console.log("✅ Usuário autenticado:", currentUserUID);
    chrome.storage.local.set({ alunoUID: currentUserUID });
  } else {
    currentUser = null;
    currentUserUID = null;
    isMonitoringActive = false;
    meetTabId = null;
    chrome.storage.local.remove("alunoUID");
    console.log("🔌 Usuário desconectado da extensão.");
  }
});

// --- SEÇÃO DE MONITORAMENTO DE ABAS ---
function registrarTrocaDeAba() {
  if (!isMonitoringActive || !currentUserUID) return;

  tabSwitchCount++;
  console.log(`DESENGAJAMENTO: Aluno ${currentUserUID} trocou de aba. Contagem: ${tabSwitchCount}`);
  
  const payload = {
    status: 'ausente',
    horario: new Date().toISOString(),
    tipo: 'troca_de_aba',
    nomeAluno: currentUser?.displayName || 'Aluno',
    contagem: tabSwitchCount
  };
  
  const logRef = collection(db, `presencas/${currentUserUID}/logs`);
  
  addDoc(logRef, payload)
    .then(() => console.log(`📡 Log de troca de aba #${tabSwitchCount} enviado.`))
    .catch((err) => console.error("❌ Erro ao registrar troca de aba:", err));

  if (tabSwitchCount === 4) {
    console.warn(`🔥🔥🔥 ALERTA: Aluno ${currentUserUID} atingiu 4 trocas de aba!`);
    const alertPayload = {
      status: 'desengajado',
      horario: new Date().toISOString(),
      tipo: 'desengajamento_por_abas',
      nomeAluno: currentUser?.displayName || 'Aluno',
      contagem: tabSwitchCount
    };
    addDoc(logRef, alertPayload)
      .then(() => console.log('📡 Log de ALERTA DE DESENGAJAMENTO enviado.'))
      .catch((err) => console.error("❌ Erro ao registrar alerta:", err));
  }
}

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
// ------------------------------------


chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  // --- SEÇÃO DE MONITORAMENTO DE ABAS ---
  if (msg.tipo === "START_MONITORING") {
    isMonitoringActive = true;
    meetTabId = sender.tab.id;
    tabSwitchCount = 0;
    console.log(`✅ Monitoramento de abas ATIVADO para ${currentUserUID} na aba ${meetTabId}. Contador zerado.`);
    sendResponse({ success: true });
    return true;
  }

  if (msg.tipo === "STOP_MONITORING") {
    isMonitoringActive = false;
    meetTabId = null;
    console.log(`🛑 Monitoramento de abas DESATIVADO para ${currentUserUID}`);
    sendResponse({ success: true });
    return true;
  }
  // ------------------------------------

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

  // Adicionar log individual (COM A LÓGICA DE FORTALECIMENTO)
  if (msg.tipo === "ADD_PRESENCA_LOG") {
    // AQUI ESTÁ A MUDANÇA: Tenta restaurar a sessão se a variável em memória for perdida
    if (!currentUser && auth.currentUser) {
        console.log("Sessão em memória perdida. Restaurando estado de autenticação...");
        currentUser = auth.currentUser;
        currentUserUID = auth.currentUser.uid;
    }

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

  // Obter vetores de todos os discentes (Omitido por brevidade)
  if (msg.tipo === "GET_VETORES_TODOS") {
    // ... seu código original aqui ...
    return true;
  }

  // Adicionar presença múltipla (Omitido por brevidade)
  if (msg.tipo === "ADD_PRESENCA_MULTIPLA") {
    // ... seu código original aqui ...
    return true;
  }
});




-------------- 25/09/2025 --------------------

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
  signInWithCustomToken,
  // ADICIONADO: Funções necessárias para a nova lógica
  query,
  where,
  onSnapshot,
  updateDoc,
  increment
} from "./firebase.js";

let currentUserUID = null;
let studentData = {};
let studentNameForAlerts = "Aluno";

// NOVO: Variáveis para a lógica da Sessão de Aula Ativa
let aulaAtivaId = null;
let unsubAulaListener = null;

// Variáveis de Monitoramento de Abas
let isMonitoringActive = false;
let meetTabId = null;
let tabSwitchCount = 0;

const getAuthenticatedUser = () => {
  return new Promise((resolve, reject) => {
    if (auth.currentUser) {
      resolve(auth.currentUser);
      return;
    }
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
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

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUserUID = user.uid;
    console.log("✅ Usuário autenticado:", currentUserUID);
    chrome.storage.local.set({ alunoUID: currentUserUID });

    // Busca os dados do aluno para pegar o nome e o docenteUID
    try {
        const userRef = doc(db, "usuarios", currentUserUID);
        const snap = await getDoc(userRef);
        if (snap.exists()) {
            studentData = snap.data();
            studentNameForAlerts = studentData.nome || "Aluno";
            console.log(`Dados do aluno carregados. Nome: ${studentNameForAlerts}. Docente: ${studentData.docenteUID}`);
            // Inicia o listener de aulas assim que temos o docenteUID
            iniciarListenerDeAulas(studentData.docenteUID);
        }
    } catch (error) {
        console.error("Erro ao buscar dados do usuário na autenticação:", error);
    }

  } else {
    currentUserUID = null;
    isMonitoringActive = false;
    meetTabId = null;
    if (unsubAulaListener) unsubAulaListener(); // Para o listener de aulas ao deslogar
    chrome.storage.local.remove("alunoUID");
    console.log("🔌 Usuário desconectado da extensão.");
  }
});

// NOVO: Função que procura por aulas ativas do docente do aluno
function iniciarListenerDeAulas(docenteUID) {
  if (unsubAulaListener) unsubAulaListener(); // Garante que não haja listeners duplicados
  if (!docenteUID) {
    console.log("Aluno sem docenteUID definido. Não é possível procurar aulas ativas.");
    return;
  }

  const q = query(collection(db, "sessoesDeAula"), where("docenteUID", "==", docenteUID), where("status", "==", "ativa"));

  unsubAulaListener = onSnapshot(q, (snapshot) => {
    if (!snapshot.empty) {
      const aulaDoc = snapshot.docs[0];
      aulaAtivaId = aulaDoc.id;
      console.log(`👨‍🏫 Conectado à aula ativa: ${aulaAtivaId} (${aulaDoc.data().disciplinaNome})`);
      tabSwitchCount = 0; // Zera a contagem ao se conectar a uma nova aula
    } else {
      if (aulaAtivaId) console.log(`Aula ${aulaAtivaId} foi finalizada pelo docente.`);
      aulaAtivaId = null;
    }
  });
}

// ATUALIZADO: Função de troca de aba agora atualiza o documento do participante
async function registrarTrocaDeAba() {
  if (!isMonitoringActive || !aulaAtivaId) return;

  try {
    const user = await getAuthenticatedUser();
    tabSwitchCount++;
    console.log(`DESENGAJAMENTO: Aluno ${user.uid} trocou de aba. Contagem: ${tabSwitchCount}`);
    
    const participanteRef = doc(db, "sessoesDeAula", aulaAtivaId, "participantes", user.uid);
    
    // Apenas atualiza o documento existente com a nova contagem de cliques
    await updateDoc(participanteRef, {
      cliquesFora: increment(1), // Incrementa o valor no banco
      ultimoLog: new Date().toISOString(),
    });
    console.log(`📡 Contagem de cliques atualizada para ${tabSwitchCount} no Firestore.`);

    if (tabSwitchCount === 4) {
      console.warn(`🔥🔥🔥 ALERTA: Aluno ${studentNameForAlerts} (${user.uid}) atingiu 4 trocas de aba!`);
      // A lógica de enviar um log separado para o histórico do aluno pode ser mantida
      const logRef = collection(db, `presencas/${user.uid}/logs`);
      const alertPayload = {
        status: 'desengajado',
        horario: new Date().toISOString(),
        tipo: 'desengajamento_por_abas',
        nomeAluno: studentNameForAlerts,
        contagem: tabSwitchCount
      };
      await addDoc(logRef, alertPayload);
      console.log('📡 Log de ALERTA DE DESENGAJAMENTO enviado para o histórico do aluno.');
    }
  } catch (error) {
    console.error("❌ Erro ao registrar troca de aba:", error);
  }
}

chrome.tabs.onActivated.addListener(registrarTrocaDeAba);
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (isMonitoringActive && windowId === chrome.windows.WINDOW_ID_NONE) {
    registrarTrocaDeAba();
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg.tipo === "START_MONITORING") {
      isMonitoringActive = true;
      meetTabId = sender.tab.id;
      console.log(`✅ Monitoramento de abas ATIVADO para ${currentUserUID}`);
      sendResponse({ success: true });
      return;
    }

    if (msg.tipo === "STOP_MONITORING") {
      isMonitoringActive = false;
      meetTabId = null;
      console.log(`🛑 Monitoramento de abas DESATIVADO para ${currentUserUID}`);
      sendResponse({ success: true });
      return;
    }

    // NOVO: Mensagem para criar/atualizar o status do participante na aula ativa
    if (msg.tipo === "UPDATE_PARTICIPANT_STATUS") {
      if (!aulaAtivaId || !currentUserUID) {
        sendResponse({ success: false, error: "Nenhuma aula ativa para registrar status." });
        return;
      }
      try {
        const participanteRef = doc(db, "sessoesDeAula", aulaAtivaId, "participantes", currentUserUID);
        await setDoc(participanteRef, {
          nome: studentNameForAlerts,
          uid: currentUserUID,
          ...msg.payload
        }, { merge: true });
        sendResponse({ success: true });
      } catch (error) {
        console.error("Erro ao atualizar status do participante:", error);
        sendResponse({ success: false, error: error.message });
      }
      return;
    }

    if (msg.tipo === "LOGAR_NA_EXTENSAO_COM_TOKEN") {
      try {
        const cred = await signInWithCustomToken(auth, msg.token);
        sendResponse({ success: true, uid: cred.user.uid });
      } catch (err) {
        console.error("Erro no login:", err);
        sendResponse({ success: false, error: err.message });
      }
      return;
    }

    if (msg.tipo === "GET_ALUNO_DATA") {
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
      return;
    }

    if (msg.tipo === "ADD_PRESENCA_LOG") {
      try {
        const user = await getAuthenticatedUser();
        if (user && msg.alunoUID === user.uid) {
          const logRef = collection(db, `presencas/${user.uid}/logs`);
          await addDoc(logRef, msg.payload);
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: "Usuário não autenticado para log de presença ou UID divergente." });
        }
      } catch (error) {
        console.error("Erro ao salvar log:", error);
        sendResponse({ success: false, error: error.toString() });
      }
      return;
    }

    if (msg.tipo === "GET_VETORES_TODOS") {
      try {
        const snap = await getDocs(collection(db, "usuarios"));
        const alunos = snap.docs.map((doc) => ({ uid: doc.id, ...doc.data() })).filter((u) => u.tipo === "discente" && u.vetorFacial);
        const vetores = alunos.map((aluno) => ({ uid: aluno.uid, nome: aluno.nome, vetorFacial: aluno.vetorFacial }));
        sendResponse({ success: true, vetores });
      } catch (err) {
        console.error("Erro ao buscar vetores:", err);
        sendResponse({ success: false, error: err.message });
      }
      return;
    }

    if (msg.tipo === "ADD_PRESENCA_MULTIPLA") {
      const { meetId, participanteId, payload } = msg;
      const path = doc(db, `relatorio_aula/${meetId}/participantes/${participanteId}`);
      try {
        await setDoc(path, { ...payload, atualizadoEm: new Date().toISOString() }, { merge: true });
        sendResponse({ success: true });
      } catch (err) {
        console.error("Erro ao salvar múltipla:", err);
        sendResponse({ success: false, error: err.message });
      }
      return;
    }
  })();
  return true;
});






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

const getAuthenticatedUser = () => {
  return new Promise((resolve, reject) => {
    if (auth.currentUser) {
      resolve(auth.currentUser);
      return;
    }
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub(); 
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
// A lógica aqui não muda fundamentalmente, mas a forma como é iniciada sim.
let isMonitoringActive = false;
let meetTabId = null;
let tabSwitchCount = 0;
let studentNameForAlerts = "Aluno";

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

// A função registrarTrocaDeAba continua a mesma
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


chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    // --- SEÇÃO DE MONITORAMENTO DE ABAS ---
    if (msg.tipo === "START_MONITORING") {
      // ALTERADO: Adicionada uma trava para evitar reinicialização
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
      return;
    }

    if (msg.tipo === "STOP_MONITORING") {
      isMonitoringActive = false;
      meetTabId = null;
      console.log(`🛑 Monitoramento de abas DESATIVADO.`);
      sendResponse({ success: true });
      return;
    }
    
    if (msg.tipo === "LOGAR_NA_EXTENSAO_COM_TOKEN") {
      try {
        const cred = await signInWithCustomToken(auth, msg.token);
        sendResponse({ success: true, uid: cred.user.uid });
      } catch (err) {
        console.error("Erro no login:", err);
        sendResponse({ success: false, error: err.message });
      }
      return;
    }

    if (msg.tipo === "GET_ALUNO_DATA") {
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
      return;
    }
    
    // NOVO: Gerenciador para buscar dados de TODOS os alunos para o face-matcher.
    if (msg.tipo === "GET_ALL_ALUNOS_DATA") {
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
      return;
    }

    // A lógica para adicionar log individual continua perfeita para o novo sistema.
    if (msg.tipo === "ADD_PRESENCA_LOG") {
      try {
        // Validação não precisa mais checar o `currentUserUID` pois o log pode ser de qualquer aluno.
        const logRef = collection(db, `presencas/${msg.alunoUID}/logs`);
        await addDoc(logRef, msg.payload);
        sendResponse({ success: true });
      } catch (error) {
        console.error("Erro ao salvar log:", error);
        sendResponse({ success: false, error: error.toString() });
      }
      return;
    }

    if (msg.tipo === "ADD_PRESENCA_MULTIPLA") {
        // Esta função não precisa de alterações
        // ...
    }

  })();
  
  return true; // Essencial para respostas assíncronas
});