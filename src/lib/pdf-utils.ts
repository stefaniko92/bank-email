import pdfParse from 'pdf-parse';

type SupportedInput = Buffer | ArrayBuffer | Uint8Array;

function toBuffer(input: SupportedInput): Buffer {
  if (Buffer.isBuffer(input)) {
    return input;
  }

  if (input instanceof ArrayBuffer) {
    return Buffer.from(input);
  }

  return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
}

/**
 * Extracts the raw text contents from a PDF binary.
 * Falls back to an empty string if the PDF cannot be parsed.
 */
export async function extractTextFromPdf(input: SupportedInput): Promise<string> {
  try {
    const buffer = toBuffer(input);
    const result = await pdfParse(buffer);
    return result.text ?? '';
  } catch (error) {
    console.error('Failed to extract text from PDF attachment', error);
    return '';
  }
}
