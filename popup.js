import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  signOut 
} from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBlDxvlw60NgUucb4xEcAdFrsjEW_3UOEI",
  authDomain: "educ-ia.firebaseapp.com",
  projectId: "educ-ia",
  storageBucket: "educ-ia.appspot.com",
  messagingSenderId: "792553477162",
  appId: "1:792553477162:web:76a3edd26aaaedd4959f53"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Elementos DOM
const mensagem = document.getElementById("mensagem");
const toggleIcon = document.getElementById("toggleIcon");
const loginForm = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const senhaInput = document.getElementById("senha");
const rememberMe = document.getElementById("rememberMe");
const statusBox = document.getElementById("statusBox");
const statusMsg = document.getElementById("statusMsg");
const logoutBtn = document.getElementById("logoutBtn");
const popupSubtitle = document.getElementById("popup-subtitle");

// 🌙 Toggle dark/light
toggleIcon.addEventListener("click", () => {
  document.body.classList.toggle("light");
  toggleIcon.textContent = document.body.classList.contains("light") ? "☀️" : "🌙";
});

// Recupera dados salvos
chrome.storage.local.get(["savedEmail", "savedSenha", "alunoUID", "nome", "turma"], (data) => {
  if (data.savedEmail) emailInput.value = data.savedEmail;
  if (data.savedSenha) {
    senhaInput.value = data.savedSenha;
    rememberMe.checked = true;
  } else {
    rememberMe.checked = false;
  }

  if (data.alunoUID && data.nome) {
    mostrarSessaoAtiva(data.nome, data.turma);
  }
});

// LOGIN
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = emailInput.value.trim();
  const senha = senhaInput.value.trim();

  mensagem.textContent = "🔐 Autenticando...";
  mensagem.className = "mensagem";

  try {
    const cred = await signInWithEmailAndPassword(auth, email, senha);
    const uid = cred.user.uid;

    // Buscar dados do aluno
    chrome.runtime.sendMessage({ tipo: "GET_ALUNO_DATA", alunoUID: uid }, async (resposta) => {
      if (resposta?.success) {
        const nome = resposta.data.nome || "Aluno";
        const turma = resposta.data.turma || "Turma não definida";

        // Salva sessão
        const storageData = { alunoUID: uid, nome, turma };
        if (rememberMe.checked) {
          storageData.savedEmail = email;
          storageData.savedSenha = senha;
        } else {
          chrome.storage.local.remove(["savedEmail", "savedSenha"]);
        }
        chrome.storage.local.set(storageData);

        // Atualiza interface
        mostrarSessaoAtiva(nome, turma);

        // Injetar reconhecimento facial
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["main.bundle.js"]
        });
      } else {
        mensagem.className = "mensagem erro";
        mensagem.textContent = "❌ Erro ao buscar dados do aluno.";
      }
    });

  } catch (err) {
    console.error("Erro no login:", err);
    mensagem.textContent = "❌ Erro: " + err.message;
    mensagem.classList.add("erro");
  }
});

// LOGOUT
logoutBtn.addEventListener("click", async () => {
  try {
    await signOut(auth);
    chrome.storage.local.remove(["alunoUID", "nome", "turma"]);
    loginForm.style.display = "block";
    statusBox.style.display = "none";
    popupSubtitle.innerText = "Login para iniciar a chamada";
    mensagem.className = "mensagem";
    mensagem.textContent = "Sessão encerrada.";
  } catch (err) {
    console.error("Erro ao sair:", err);
  }
});

// Função helper para UI da sessão
function mostrarSessaoAtiva(nome, turma) {
  loginForm.style.display = "none";
  statusBox.style.display = "block";
  popupSubtitle.innerText = "Sessão ativa";
  statusMsg.innerText = `✅ Usuário conectado: ${nome} (${turma})`;
  mensagem.textContent = "";
}
