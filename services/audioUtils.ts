
export const pcmToAudioBuffer = (
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000
): AudioBuffer => {
  const pcm16 = new Int16Array(data.buffer);
  const frameCount = pcm16.length;
  const audioBuffer = ctx.createBuffer(1, frameCount, sampleRate);
  const channelData = audioBuffer.getChannelData(0);
  
  for (let i = 0; i < frameCount; i++) {
    channelData[i] = pcm16[i] / 32768.0;
  }
  
  return audioBuffer;
};

export const concatenateAudioBuffers = (buffers: AudioBuffer[], ctx: AudioContext): AudioBuffer | null => {
    if (buffers.length === 0) return null;
    
    let totalLength = 0;
    buffers.forEach(b => totalLength += b.length);
    
    const output = ctx.createBuffer(1, totalLength, buffers[0].sampleRate);
    const outputData = output.getChannelData(0);
    
    let offset = 0;
    buffers.forEach(buff => {
        const inputData = buff.getChannelData(0);
        for (let i = 0; i < inputData.length; i++) {
            outputData[offset + i] = inputData[i];
        }
        offset += buff.length;
    });
    
    return output;
};

export const audioBufferToWav = (buffer: AudioBuffer): Blob => {
  const numChannels = 1; // Force mono for consistency
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  
  const dataLength = buffer.length * numChannels * 2;
  const bufferLength = 44 + dataLength;
  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);
  
  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, 'data');
  view.setUint32(40, dataLength, true);

  const channelData = buffer.getChannelData(0);
  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    const sample = Math.max(-1, Math.min(1, channelData[i]));
    // Scale to 16-bit integer
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
    offset += 2;
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
};

// Helper to convert any Blob (like WebM) to WAV Base64
export const blobToWavBase64 = async (blob: Blob): Promise<string> => {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    const wavBlob = audioBufferToWav(audioBuffer);
    
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(wavBlob);
        reader.onloadend = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1]);
        };
        reader.onerror = reject;
    });
};
