import axios from 'axios';
import pdfParse from 'pdf-parse';

export async function extractCVText(cvUrl: string): Promise<string> {
  try {
    const response = await axios.get(cvUrl, {
      responseType: 'arraybuffer',
      timeout: 15000,
      headers: {
        // Если CV в Linear — нужен токен авторизации
        ...(cvUrl.includes('linear.app') && {
          Authorization: `Bearer ${process.env.LINEAR_API_KEY}`,
        }),
      },
    });

    const contentType = String(response.headers['content-type'] ?? '');

    if (contentType.includes('pdf')) {
      const parsed = await pdfParse(Buffer.from(response.data));
      return parsed.text.slice(0, 5000); // обрезаем до разумного размера
    }

    // Fallback для plain text
    return Buffer.from(response.data).toString('utf-8').slice(0, 5000);

  } catch (err) {
    console.warn(`Не удалось загрузить CV по URL ${cvUrl}:`, err);
    return ''; // не ломаем анализ если CV недоступен
  }
}