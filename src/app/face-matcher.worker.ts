/// <reference lib="webworker" />

function calculateCosineSimilarity(v1: Float32Array | number[], v2: Float32Array | number[]): number {
  if (!v1 || !v2 || v1.length !== v2.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < v1.length; i++) {
    const a = v1[i];
    const b = v2[i];
    dotProduct += a * b;
    normA += a * a;
    normB += b * b;
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

function getEmbeddingArray(embedding: any): Float32Array | number[] {
  if (embedding instanceof ArrayBuffer) {
    return new Float32Array(embedding);
  }
  if (embedding instanceof Float32Array) {
    return embedding;
  }
  if (Array.isArray(embedding)) {
    return embedding;
  }
  if (ArrayBuffer.isView(embedding) && 'length' in (embedding as any)) {
    return embedding as unknown as Float32Array;
  }
  return new Float32Array(embedding);
}

addEventListener("message", ({ data }) => {
  const { currentEmbedding, enrolledEmbeddings } = data;

  if (!currentEmbedding || !enrolledEmbeddings) {
    postMessage({ bestMatchScore: -1, secondBestMatchScore: -1, bestMatchEmployeeId: null });
    return;
  }

  const currentVector = getEmbeddingArray(currentEmbedding);

  let bestMatchScore = -1;
  let secondBestMatchScore = -1;
  let bestMatchEmployeeId: number | null = null;

  for (const emp of enrolledEmbeddings) {
    const empVector = getEmbeddingArray(emp.embedding);

    const score = calculateCosineSimilarity(currentVector, empVector);
    if (score > bestMatchScore) {
      secondBestMatchScore = bestMatchScore;
      bestMatchScore = score;
      bestMatchEmployeeId = emp.employee_id;
    } else if (score > secondBestMatchScore) {
      secondBestMatchScore = score;
    }
  }

  postMessage({ bestMatchScore, secondBestMatchScore, bestMatchEmployeeId });
});
