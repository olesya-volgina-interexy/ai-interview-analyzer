import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import pdfParse from 'pdf-parse';
import { describeError } from '../utils/errorLogger';
import { sanitizePdfText, assertExtractedTextPlausible } from '../utils/pdfUtils';

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_TEXT_CHARS = 100_000;

export async function uploadRoutes(fastify: FastifyInstance) {
  await fastify.register(multipart, {
    limits: { fileSize: MAX_FILE_BYTES, files: 1 },
  });

  fastify.post('/upload', async (request, reply) => {
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: 'No file uploaded' });
    }

    const filename = data.filename ?? '';
    const mime = data.mimetype ?? '';
    const isPdf = mime === 'application/pdf' || /\.pdf$/i.test(filename);
    const isText = mime.startsWith('text/') || /\.(txt|rtf|md)$/i.test(filename);

    if (!isPdf && !isText) {
      return reply.status(400).send({
        error: 'Unsupported file type. Use PDF or TXT.',
      });
    }

    let buffer: Buffer;
    try {
      buffer = await data.toBuffer();
    } catch (err: any) {
      if (err?.code === 'FST_REQ_FILE_TOO_LARGE') {
        return reply.status(413).send({ error: 'File too large (max 10 MB)' });
      }
      throw err;
    }

    try {
      let text: string;
      if (isPdf) {
        const parsed = await pdfParse(buffer);
        text = sanitizePdfText(parsed.text);
        assertExtractedTextPlausible(text, buffer.length, filename);
      } else {
        text = buffer.toString('utf-8');
      }

      const trimmed = text.slice(0, MAX_TEXT_CHARS);
      if (!trimmed) {
        return reply.status(422).send({ error: 'File is empty or unreadable' });
      }

      return { text: trimmed, filename };
    } catch (err: any) {
      const msg = String(err?.message ?? '');
      if (msg.startsWith('PDF_IMAGE_ONLY:')) {
        return reply.status(422).send({ error: 'PDF appears to be a scanned image — please upload a text-based PDF or paste the text directly' });
      }
      fastify.log.warn({ ...describeError(err), filename }, 'Failed to extract text from upload');
      return reply.status(422).send({ error: 'Failed to extract text from file' });
    }
  });
}
