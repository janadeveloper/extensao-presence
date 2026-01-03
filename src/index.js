// index.js com gerenciamento de múltiplos rostos e estados individuais (v6)
console.log("📦 bundle.js v6 (multi-face) carregado e executando!");
import * as faceapi from "face-api.js";

// --- CONFIGURAÇÕES DE PRECISÃO ---
const LIMITE_RECONHECIMENTO = 0.60; // Distância máxima para considerar um rosto como correspondente
const TAMANHO_HISTORICO = 5;       // Quantos frames recentes analisar para estabilizar o status
const VOTOS_NECESSARIOS = 2;       // Quantos votos "presente" são necessários no histórico para confirmar presença

// --- VARIÁVEIS DE ESTADO ---
// ALTERADO: Agora gerenciamos o estado de cada aluno em um objeto.
// A chave será o nome do aluno.
let estadosAlunos = {}; 
let faceMatcher = null; // NOVO: O objeto que fará a correspondência dos rostos
let listaDeAlunos = []; // NOVO: Guardará os dados de todos os alunos a serem monitorados

// 🟩 Overlay (Funções criarOverlay e atualizarOverlay)
function criarOverlay(mensagem = "") {
  // A criação do overlay não muda
  const box = document.createElement("div");
  box.id = "presence-overlay";
  box.innerHTML = `
    <div class="overlay-header">🎥 Monitor de Presença</div>
    <div class="overlay-body" style="white-space: pre-line;">${mensagem}</div>
  `;
  box.style.cssText = `
    position: fixed; bottom: 20px; right: 20px; background: #111827;
    color: white; padding: 14px 18px; border-radius: 12px; font-size: 14px;
    z-index: 9999; font-family: Inter, sans-serif; box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    min-width: 250px; transition: all 0.3s ease;
  `;
  document.body.appendChild(box);
}

// ALTERADO: A atualização agora formata uma lista de status
function atualizarOverlay() {
  const box = document.getElementById("presence-overlay");
  if (!box) return;

  const body = box.querySelector(".overlay-body");
  if (!body) return;

  if (listaDeAlunos.length === 0) {
    body.innerText = "Nenhum aluno para monitorar.";
    return;
  }

  let mensagem = listaDeAlunos.map(aluno => {
    const estado = estadosAlunos[aluno.nome];
    if (!estado) return `🔄 ${aluno.nome}: Aguardando...`;
    
    switch (estado.ultimoStatusConhecido) {
      case 'presente':
        return `✅ ${aluno.nome}: Presente`;
      case 'ausente':
        return `😶 ${aluno.nome}: Ausente`;
      case 'rosto_nao_reconhecido':
        return `❓ ${aluno.nome}: Outro rosto`; // Usado se houver rostos não identificados
      default:
        return `🔄 ${aluno.nome}: Verificando...`;
    }
  }).join('\n'); // Usa quebra de linha para separar os alunos

  body.innerText = mensagem;
}


// Criar overlay inicial
criarOverlay("🔄 Carregando modelos...");

(async () => {
  await faceapi.nets.ssdMobilenetv1.loadFromUri(chrome.runtime.getURL("modelos/ssd_mobilenetv1"));
  await faceapi.nets.faceRecognitionNet.loadFromUri(chrome.runtime.getURL("modelos/face_recognition"));
  await faceapi.nets.faceLandmark68Net.loadFromUri(chrome.runtime.getURL("modelos/face_landmark_68"));

  atualizarOverlay();

  // NOVO: Mensagem para buscar dados de TODOS os alunos.
  // Você precisará implementar a lógica para isso no seu background script.
  chrome.runtime.sendMessage({ tipo: "GET_ALL_ALUNOS_DATA" }, async (resposta) => {
    if (!resposta || !resposta.success || !Array.isArray(resposta.data)) {
      alert("❌ Erro ao buscar dados dos alunos ou nenhum aluno encontrado.");
      return;
    }

    listaDeAlunos = resposta.data;

    // NOVO: Inicializa o estado para cada aluno
    listaDeAlunos.forEach(aluno => {
        estadosAlunos[aluno.nome] = {
            uid: aluno.uid,
            ultimoStatusConhecido: 'ausente',
            historicoDeteccoes: [],
            timestampInicioAusencia: new Date() // Começa a contar ausência desde o início
        };
    });

    // NOVO: Prepara os vetores para o FaceMatcher
    // NOVO: Prepara os vetores para o FaceMatcher (COM VALIDAÇÃO)
const labeledDescriptors = listaDeAlunos
  .map(aluno => {
    // Filtra apenas os vetores válidos que têm 128 dimensões
    const validDescriptors = aluno.vetoresFaciais
      .map(v => new Float32Array(Object.values(v)))
      .filter(descriptor => {
        if (descriptor.length === 128) {
          return true;
        } else {
          // AVISA no console qual aluno tem um vetor com problema!
          console.warn(`⚠️ Vetor inválido para o aluno ${aluno.nome}. Tamanho: ${descriptor.length}. Esperado: 128. Vetor será ignorado.`);
          return false;
        }
      });

    // Só cria um LabeledFaceDescriptors se o aluno tiver pelo menos um vetor válido
    if (validDescriptors.length > 0) {
      return new faceapi.LabeledFaceDescriptors(aluno.nome, validDescriptors);
    }
    
    // Se nenhum vetor for válido, retorna null para ser filtrado depois
    return null; 
  })
  .filter(ld => ld !== null); // Remove os alunos que não tinham nenhum vetor válido

if (labeledDescriptors.length === 0) {
    alert("❌ Nenhum vetor facial VÁLIDO (128 dimensões) foi encontrado para os alunos. Verifique os cadastros.");
    return;
}

    if (labeledDescriptors.length === 0) {
        alert("❌ Nenhum vetor facial cadastrado para os alunos.");
        return;
    }

    faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, LIMITE_RECONHECIMENTO);
    console.log("✅ FaceMatcher criado com os dados dos alunos.");

    const video = document.createElement("video");
    video.style.display = "none";
    document.body.appendChild(video);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      video.srcObject = stream;
      await video.play();

      console.log(`📷 Câmera ativada. Monitorando ${listaDeAlunos.length} aluno(s).`);
      
      // Envia uma mensagem de início para cada aluno
      listaDeAlunos.forEach(aluno => {
        chrome.runtime.sendMessage({ tipo: "START_MONITORING", alunoUID: aluno.uid });
      });
      
      setInterval(async () => {
        // ALTERADO: Usando detectAllFaces
        const detections = await faceapi
          .detectAllFaces(video)
          .withFaceLandmarks()
          .withFaceDescriptors();

        const nomesReconhecidosNoFrame = [];
        if (detections.length > 0) {
            detections.forEach(detection => {
                const bestMatch = faceMatcher.findBestMatch(detection.descriptor);
                // Adicionamos apenas se não for "unknown"
                if (bestMatch.label !== 'unknown') {
                    nomesReconhecidosNoFrame.push(bestMatch.label);
                }
            });
        }
        
        // ALTERADO: Lógica de atualização de estado individual
        listaDeAlunos.forEach(aluno => {
            const estado = estadosAlunos[aluno.nome];
            const resultadoDoFrame = nomesReconhecidosNoFrame.includes(aluno.nome) ? 'presente' : 'ausente';
            
            estado.historicoDeteccoes.push(resultadoDoFrame);
            if (estado.historicoDeteccoes.length > TAMANHO_HISTORICO) {
                estado.historicoDeteccoes.shift();
            }

            const votosPresente = estado.historicoDeteccoes.filter(r => r === 'presente').length;
            let statusConsolidado = (votosPresente >= VOTOS_NECESSARIOS) ? 'presente' : 'ausente';
            
            // Lógica de mudança de estado e registro (muito similar à sua, mas dentro do loop de aluno)
            if (statusConsolidado !== estado.ultimoStatusConhecido) {
                const timestamp = new Date().toISOString();
                let extraData = {};

                if (estado.ultimoStatusConhecido === 'ausente' && statusConsolidado === 'presente') {
                    if (estado.timestampInicioAusencia) {
                        const fimAusencia = new Date();
                        const inicioAusencia = new Date(estado.timestampInicioAusencia);
                        const diffMinutos = (fimAusencia - inicioAusencia) / (1000 * 60);
                        extraData.tempoAusente = diffMinutos;
                        console.log(`✅ ${aluno.nome} retornou após ${diffMinutos.toFixed(2)} minutos.`);
                        estado.timestampInicioAusencia = null;
                    }
                    registrarPresenca(aluno.uid, "presente", timestamp, "entrada_estavel", extraData, aluno.nome);
                } else if (estado.ultimoStatusConhecido === 'presente' && statusConsolidado === 'ausente') {
                    estado.timestampInicioAusencia = new Date();
                    console.log(`😶 ${aluno.nome} ficou ausente.`);
                    registrarPresenca(aluno.uid, "ausente", timestamp, "saida_sem_rosto", {}, aluno.nome);
                }
                
                estado.ultimoStatusConhecido = statusConsolidado;
            }
        });

        // NOVO: Atualiza o overlay com o status de todos
        atualizarOverlay();

      }, 3000);

    } catch (err) {
      console.error(`❌ Erro ao acessar câmera:`, err);
      alert("❌ Não foi possível acessar a câmera.");
    }
  });
})();

// A função registrarPresenca não precisa de alterações, ela já é chamada com dados individuais.
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
      console.error(`❌ Erro ao registrar presença para ${nomeAluno}:`, res?.error || "Erro desconhecido");
    }
  });
}