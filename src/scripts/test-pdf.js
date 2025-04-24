/**
 * A debug script for testing PDF extraction with Gemini AI
 * 
 * Run with:
 * node -r dotenv/config src/scripts/test-pdf.js
 * 
 * Make sure to set GOOGLE_API_KEY in your .env file
 */

const fs = require('fs');
const path = require('path');
const pdfjsLib = require('pdfjs-dist');

// Initialize PDF.js (workaround for Node.js environment)
const PDFJS_PATH = path.dirname(require.resolve('pdfjs-dist/package.json'));
const PDFJS_WORKER_PATH = path.join(PDFJS_PATH, 'build', 'pdf.worker.js');
pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_PATH;

// Load a PDF file and extract its text
async function extractTextFromPDF(filePath) {
  // Read the PDF file
  const data = new Uint8Array(fs.readFileSync(filePath));
  
  // Parse the PDF
  const loadingTask = pdfjsLib.getDocument({ data });
  const pdf = await loadingTask.promise;
  
  console.log(`PDF has ${pdf.numPages} pages`);
  
  // Extract text from all pages
  let extractedText = '';
  
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const textItems = textContent.items;
    
    console.log(`Processing page ${i}...`);
    
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
}

// Main function
async function main() {
  if (!process.argv[2]) {
    console.error('Please provide a path to a PDF file');
    process.exit(1);
  }
  
  const filePath = process.argv[2];
  
  try {
    console.log(`Extracting text from ${filePath}...`);
    const text = await extractTextFromPDF(filePath);
    
    console.log('\n--- EXTRACTED TEXT ---\n');
    console.log(text);
    
    // Save the extracted text to a file
    const outputPath = `${filePath}.txt`;
    fs.writeFileSync(outputPath, text);
    console.log(`\nExtracted text saved to ${outputPath}`);
    
    // TODO: Add Gemini API call to extract transaction details
    // This is left as an exercise for the implementer
    
  } catch (error) {
    console.error('Error processing PDF:', error);
  }
}

main().catch(console.error); 