/**
 * Test setup for enhanced transaction extraction
 */

import fs from 'fs';
import path from 'path';

/**
 * Load a test PDF file
 * 
 * @param filename The name of the PDF file in the test-pdfs directory
 * @returns Buffer containing the PDF data
 */
export function loadTestPdf(filename: string): Buffer {
  const testPdfPath = path.join(process.cwd(), 'test-pdfs', filename);
  
  if (!fs.existsSync(testPdfPath)) {
    throw new Error(`Test PDF not found: ${testPdfPath}`);
  }
  
  return fs.readFileSync(testPdfPath);
}

/**
 * Create test PDF directory if it doesn't exist
 */
export function ensureTestPdfDirectory(): void {
  const testPdfDir = path.join(process.cwd(), 'test-pdfs');
  
  if (!fs.existsSync(testPdfDir)) {
    fs.mkdirSync(testPdfDir, { recursive: true });
    console.log(`Created test PDF directory: ${testPdfDir}`);
  }
}

/**
 * Copy example PDFs to test directory
 */
export function copyExamplePdfs(): void {
  ensureTestPdfDirectory();
  
  const testPdfDir = path.join(process.cwd(), 'test-pdfs');
  const exampleFiles = ['example.eml', 'test.eml'];
  
  for (const file of exampleFiles) {
    const sourcePath = path.join(process.cwd(), file);
    const destPath = path.join(testPdfDir, file);
    
    if (fs.existsSync(sourcePath) && !fs.existsSync(destPath)) {
      fs.copyFileSync(sourcePath, destPath);
      console.log(`Copied ${file} to test directory`);
    }
  }
}