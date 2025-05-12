import type { Request } from 'express';
import { IncomingForm, Fields, Files } from 'formidable';
import fs from 'fs';
import { Readable } from 'stream';

export interface ParsedFile {
  buffer: Buffer;
  mimetype: string;
  filename: string;
}

export interface ParsedForm {
  fields: Record<string, any>;
  files: Record<string, ParsedFile>;
}

export async function parseMultipartForm(request: Request): Promise<ParsedForm> {
  return new Promise((resolve, reject) => {
    const parsedFields: Record<string, any> = {};
    const parsedFiles: Record<string, ParsedFile> = {};

    const form = new IncomingForm({ keepExtensions: true, multiples: true });

    const stream = new Readable();
    stream.push((request as any).rawBody);
    stream.push(null);
    (stream as any).headers = request.headers;

    form.parse(stream as any, (err: Error | null, fields: Fields, files: Files) => {
      if (err) return reject(err);

      Object.entries(fields).forEach(([key, value]) => {
        parsedFields[key] = Array.isArray(value) ? value[0] : value;
      });

      Object.entries(files).forEach(([key, fileOrArray]) => {
        const file = Array.isArray(fileOrArray) ? fileOrArray[0] : fileOrArray;
        if (file && 'filepath' in file) {
          try {
            const buffer = fs.readFileSync(file.filepath);
            parsedFiles[key] = {
              buffer,
              mimetype: typeof file.mimetype === 'string' ? file.mimetype : 'application/octet-stream',
              filename: typeof file.originalFilename === 'string'
                  ? file.originalFilename
                  : typeof file.newFilename === 'string'
                      ? file.newFilename
                      : 'unknown'
            };
          } catch (readErr) {
            console.error(`❌ Failed to read file ${key} from disk:`, readErr);
          }
        }
      });

      resolve({ fields: parsedFields, files: parsedFiles });
    });
  });
}
