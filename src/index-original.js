// index.js com gerenciamento de estado e buffer de confirmação (v5 - Cálculo de Ausência)
console.log("📦 bundle.js v5 carregado e executando!");
import * as faceapi from "face-api.js";

// --- CONFIGURAÇÕES DE PRECISÃO (AJUSTADO PARA MAIOR TOLERÂNCIA) ---
const LIMITE_RECONHECIMENTO = 0.55;
const TAMANHO_HISTORICO = 5; 
const VOTOS_NECESSARIOS = 2; 

// --- VARIÁVEIS DE ESTADO ---
let ultimoStatusConhecido = 'carregando';
let historicoDeteccoes = [];
let timestampInicioAusencia = null; // NOVO: Variável para guardar quando a ausência começou

// 🟩 Overlay (Funções criarOverlay e atualizarOverlay continuam iguais)
function criarOverlay(mensagem = "") {
  const box = document.createElement("div");
  box.id = "presence-overlay";
  box.innerHTML = `
    <div class="overlay-header">🎥 Extensão de Presença</div>
    <div class="overlay-body">${mensagem}</div>
  `;
  box.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: #111827;
    color: white;
    padding: 14px 18px;
    border-radius: 12px;
    font-size: 14px;
    z-index: 9999;
    font-family: Inter, sans-serif;
    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    min-width: 220px;
    transition: all 0.3s ease;
  `;
  document.body.appendChild(box);
}

function atualizarOverlay(mensagem) {
  const box = document.getElementById("presence-overlay");
  if (box) {
    const body = box.querySelector(".overlay-body");
    if (body) body.innerText = mensagem;
    else box.innerText = mensagem;
  }
}

// Criar overlay inicial
criarOverlay("🔄 Carregando modelos...");

(async () => {
  await faceapi.nets.ssdMobilenetv1.loadFromUri(chrome.runtime.getURL("modelos/ssd_mobilenetv1"));
  await faceapi.nets.faceRecognitionNet.loadFromUri(chrome.runtime.getURL("modelos/face_recognition"));
  await faceapi.nets.faceLandmark68Net.loadFromUri(chrome.runtime.getURL("modelos/face_landmark_68"));

  atualizarOverlay("✅ Modelos carregados");

  chrome.storage.local.get("alunoUID", async (result) => {
    const alunoUID = result.alunoUID;

    if (!alunoUID) {
      alert("⚠️ Você precisa estar logado pelo popup da extensão.");
      return;
    }

    chrome.runtime.sendMessage({ tipo: "GET_ALUNO_DATA", alunoUID }, async (resposta) => {
      if (!resposta || !resposta.success) {
        alert("❌ Erro ao buscar dados do aluno.");
        return;
      }

      let vetoresSalvos = resposta.data.vetoresFaciais || [resposta.data.vetorFacial];
      const nomeAluno = resposta.data.nome || "Aluno";

      if (!vetoresSalvos || Object.keys(vetoresSalvos).length === 0) {
        alert("❌ Nenhum vetor facial cadastrado.");
        return;
      }
      
      if (!Array.isArray(vetoresSalvos)) {
        vetoresSalvos = Object.values(vetoresSalvos);
      }
      vetoresSalvos = vetoresSalvos.map(v => new Float32Array(v));
      
      ultimoStatusConhecido = 'ausente';

      const video = document.createElement("video");
      video.style.display = "none";
      document.body.appendChild(video);

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = stream;
        await video.play();

        atualizarOverlay("📷 Câmera ativa. Verificando...");
        console.log(`📷 Câmera ativada para: ${nomeAluno}`);
        
        chrome.runtime.sendMessage({ tipo: "START_MONITORING", alunoUID: alunoUID });

        setInterval(async () => {
          const detection = await faceapi
            .detectSingleFace(video)
            .withFaceLandmarks()
            .withFaceDescriptor();

          let resultadoDoFrame = 'ausente';

          if (detection) {
            const vetorAtual = new Float32Array(detection.descriptor);
            const reconhecido = vetoresSalvos.some(
              (v) => faceapi.euclideanDistance(v, vetorAtual) < LIMITE_RECONHECIMENTO
            );
            resultadoDoFrame = reconhecido ? 'presente' : 'rosto_nao_reconhecido';
          }

          historicoDeteccoes.push(resultadoDoFrame);

          if (historicoDeteccoes.length > TAMANHO_HISTORICO) {
            historicoDeteccoes.shift();
          }

          const votosPresente = historicoDeteccoes.filter(r => r === 'presente').length;
          let statusConsolidado = '';

          if (votosPresente >= VOTOS_NECESSARIOS) {
            statusConsolidado = 'presente';
          } else {
            statusConsolidado = resultadoDoFrame;
          }

          if (statusConsolidado !== ultimoStatusConhecido) {
            const timestamp = new Date().toISOString();
            let extraData = {}; // ALTERADO: Objeto para dados extras

            // ALTERADO: Lógica completa para cálculo de tempo ausente
            if ((ultimoStatusConhecido === 'ausente' || ultimoStatusConhecido === 'rosto_nao_reconhecido') && statusConsolidado === 'presente') {
                if (timestampInicioAusencia) {
                    const fimAusencia = new Date();
                    const inicioAusencia = new Date(timestampInicioAusencia);
                    const diffMinutos = (fimAusencia - inicioAusencia) / (1000 * 60);
                    
                    console.log(`Aluno retornou após ${diffMinutos.toFixed(2)} minutos de ausência.`);
                    extraData.tempoAusente = diffMinutos;
                    timestampInicioAusencia = null;
                }
            } 
            else if (ultimoStatusConhecido === 'presente' && (statusConsolidado === 'ausente' || statusConsolidado === 'rosto_nao_reconhecido')) {
                console.log("Iniciando contagem de tempo de ausência...");
                timestampInicioAusencia = new Date();
            }

            switch (statusConsolidado) {
              case 'presente':
                atualizarOverlay(`✅ ${nomeAluno} reconhecido (Estável)`);
                registrarPresenca(alunoUID, "presente", timestamp, "entrada_estavel", extraData, nomeAluno);
                break;
              case 'ausente':
                atualizarOverlay(`😶 Nenhum rosto detectado para ${nomeAluno}`);
                registrarPresenca(alunoUID, "ausente", timestamp, "saida_sem_rosto", {}, nomeAluno);
                break;
              case 'rosto_nao_reconhecido':
                atualizarOverlay(`❌ Rosto detectado, mas não corresponde a ${nomeAluno}`);
                registrarPresenca(alunoUID, "ausente", timestamp, "saida_rosto_diferente", {}, nomeAluno);
                break;
            }
            ultimoStatusConhecido = statusConsolidado;
          }
        }, 3000);

      } catch (err) {
        console.error(`❌ Erro ao acessar câmera para ${nomeAluno}:`, err);
        alert("❌ Não foi possível acessar a câmera.");
      }
    });
  });
})();

// (A função classificarAusencia não precisa de alterações)
function classificarAusencia(min) { /* ... */ }

// Envia log + console + overlay
function registrarPresenca(alunoUID, status, horario, tipo, extra = {}, nomeAluno = "Aluno") {
  const payload = { status, horario, tipo, nomeAluno, ...extra };

  chrome.runtime.sendMessage({
    tipo: "ADD_PRESENCA_LOG",
    alunoUID,
    payload
  }, (res) => {
    if (res?.success) {
      const hora = new Date(horario).toLocaleTimeString();
      console.log(`📡 Log enviado: ${nomeAluno} ${status.toUpperCase()} (${tipo}) às ${hora}`);
    } else {
      console.error("❌ Erro ao registrar presença:", res?.error || "Erro desconhecido");
    }
  });
}