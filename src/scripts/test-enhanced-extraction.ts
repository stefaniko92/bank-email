/**
 * Test script for enhanced transaction extraction
 */

import fs from 'fs';
import path from 'path';
import { config } from 'dotenv';
import { DefaultEnhancedTransactionExtractor } from '../ai/enhanced-extraction/enhanced-transaction-extractor';

// Load environment variables from the root directory
config({ path: path.join(process.cwd(), '.env.local') });
config({ path: path.join(process.cwd(), '.env') });

// Verify API key is loaded
if (!process.env.GOOGLE_GENAI_API_KEY) {
  console.error('❌ GOOGLE_GENAI_API_KEY not found in environment variables');
  console.error('Available environment variables:', Object.keys(process.env).filter(key => key.includes('API_KEY')));
  process.exit(1);
}

console.log('✅ Environment variables loaded successfully');
console.log('🔑 API Key loaded:', process.env.GOOGLE_GENAI_API_KEY ? 'Yes' : 'No');

async function main() {
  try {
    // Load the real-world PDF example
    const pdfPath = path.join(process.cwd(), 'test-pdfs', '2025-325950050032667856-105-sr (1).pdf');
    console.log(`Loading PDF from: ${pdfPath}`);

    if (!fs.existsSync(pdfPath)) {
      console.error(`PDF file not found: ${pdfPath}`);
      process.exit(1);
    }

    const pdfBuffer = fs.readFileSync(pdfPath);
    console.log(`Loaded PDF: ${pdfBuffer.length} bytes`);

    // Create the enhanced extractor
    const extractor = new DefaultEnhancedTransactionExtractor();

    // First, detect the bank format
    console.log('Detecting bank format...');
    const bankFormat = await extractor.detectBankFormat(pdfBuffer);
    console.log('Bank format detected:', JSON.stringify(bankFormat, null, 2));

    // Extract transactions with confidence
    console.log('Extracting transactions...');
    const result = await extractor.extractWithConfidence(pdfBuffer);

    // Log the results
    console.log(`Extraction completed in ${result.processingTime}ms`);
    console.log(`Extracted ${result.transactions.length} transactions with confidence: ${result.confidence.toFixed(2)}`);
    console.log(`Method used: ${result.method}`);

    if (result.errors.length > 0) {
      console.log('Errors encountered:');
      result.errors.forEach(error => console.log(`- ${error.type}: ${error.message}`));
    }

    // Print transaction summary
    console.log('\nTransaction Summary:');
    result.transactions.forEach((transaction, index) => {
      console.log(`\nTransaction #${index + 1}:`);
      console.log(`- Recipient: ${transaction.nazivSedistePrimaoca}`);
      console.log(`- Amount: ${transaction.iznosOdobrenja}`);
      console.log(`- Reference: ${transaction.pozivNaBrojOdobrenja}`);
      console.log(`- Date: ${transaction.datumKnjizenja}`);
      console.log(`- Confidence: ${transaction.confidence.toFixed(2)}`);
      console.log(`- Status: ${transaction.validationStatus}`);

      if (transaction.qualityFlags.length > 0) {
        console.log(`- Quality Flags: ${transaction.qualityFlags.join(', ')}`);
      }
    });

    // Save the results to a JSON file for further analysis
    const resultsDir = path.join(process.cwd(), 'test-results');
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const resultsPath = path.join(resultsDir, `extraction-results-${timestamp}.json`);
    fs.writeFileSync(resultsPath, JSON.stringify(result, null, 2));
    console.log(`\nResults saved to: ${resultsPath}`);

  } catch (error) {
    console.error('Error running test:', error);
    process.exit(1);
  }
}

// Run the test
main().catch(console.error);