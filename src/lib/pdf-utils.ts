/**
 * Utility functions for PDF processing
 */

import * as pdfjsLib from 'pdfjs-dist';

// Polyfill required objects if they don't exist (for server-side rendering)
if (typeof window === 'undefined') {
  // @ts-ignore
  global.DOMMatrix = class DOMMatrix {
    constructor(transform?: string) {
      // Simple implementation
    }
  };
}

/**
 * Initialize PDF.js library
 * This should be called in client-side code before using PDF.js
 */
export function initPdfJs() {
  if (typeof window !== 'undefined') {
    const pdfjsVersion = pdfjsLib.version;
    
    // Try to use a local worker if available (in public directory)
    try {
      const workerSrc = `/pdf.worker.min.js`;
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
    } catch (e) {
      // Fallback to CDN
      const workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsVersion}/pdf.worker.min.js`;
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
    }
  }
}

/**
 * Extract text from a PDF file
 * @param arrayBuffer The PDF file as an ArrayBuffer
 * @returns Extracted text from the PDF
 */
export async function extractTextFromPdf(arrayBuffer: ArrayBuffer): Promise<string> {
  // Make sure PDF.js is initialized
  initPdfJs();
  
  try {
    // Parse the PDF using PDF.js
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    
    // Extract text from all pages
    let extractedText = '';
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const textItems = textContent.items;
      
      // Extract and concatenate the text
      for (const item of textItems) {
        if ('str' in item) {
          extractedText += item.str + ' ';
        }
      }
      
      // Add a page break
      extractedText += '\n\n';
    }
    
    return extractedText;
  } catch (error: unknown) {
    console.error('PDF extraction error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to extract text from PDF: ${errorMessage}`);
  }
} 