// Captura de audio del micrófono y reencodeo a WAV PCM de 16 bits mono.
// MediaRecorder entrega webm/opus, que los modelos multimodales no aceptan;
// se decodifica con AudioContext y se reconstruye la cabecera WAV a mano.

const TARGET_SAMPLE_RATE = 16000

function writeString(view, offset, text) {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
}

// Construye un WAV mono de 16 bits a partir de muestras en punto flotante.
function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)

  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeString(view, 8, 'WAVE')
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true) // tamaño del bloque fmt
  view.setUint16(20, 1, true) // PCM sin comprimir
  view.setUint16(22, 1, true) // canales
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // bytes por segundo
  view.setUint16(32, 2, true) // alineación de bloque
  view.setUint16(34, 16, true) // bits por muestra
  writeString(view, 36, 'data')
  view.setUint32(40, samples.length * 2, true)

  let offset = 44
  for (const sample of samples) {
    const clamped = Math.max(-1, Math.min(1, sample))
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
    offset += 2
  }
  return new Blob([view], { type: 'audio/wav' })
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

// Inicia la grabación. Devuelve un objeto con stop(), que corta la captura y
// resuelve con el audio ya en WAV codificado en base64.
export async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const recorder = new MediaRecorder(stream)
  const chunks = []
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data)
  }
  recorder.start()

  return {
    stop: () =>
      new Promise((resolve, reject) => {
        recorder.onstop = async () => {
          stream.getTracks().forEach((track) => track.stop())
          try {
            const raw = new Blob(chunks, { type: recorder.mimeType })
            const context = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE })
            const decoded = await context.decodeAudioData(await raw.arrayBuffer())
            const wav = encodeWav(decoded.getChannelData(0), decoded.sampleRate)
            await context.close()
            resolve(await blobToBase64(wav))
          } catch (err) {
            reject(err)
          }
        }
        recorder.stop()
      }),
  }
}
