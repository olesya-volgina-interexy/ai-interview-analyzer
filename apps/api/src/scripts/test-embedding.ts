import { embedText } from '../services/embedding.service';

async function testEmbedding() {
  const vector = await embedText('Привет, это тестовый текст');
  console.log('Размер вектора:', vector.length); // должно быть 1536
}

testEmbedding();