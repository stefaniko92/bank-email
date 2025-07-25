/**
 * Enhanced Transaction Extractor Implementation
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { createHash } from 'crypto';
import { config } from 'dotenv';
import path from 'path';
import {
  BankFormat,
  EnhancedTransaction,
  ExtractionResult,
  Transaction
} from '../../types/extraction';
import { EnhancedTransactionExtractor } from './interfaces';

// Load environment variables explicitly
config({ path: path.join(process.cwd(), '.env.local') });
config({ path: path.join(process.cwd(), '.env') });

// Initialize Google GenAI directly
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENAI_API_KEY!);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

/**
 * Enhanced Transaction Extractor implementation
 */
export class DefaultEnhancedTransactionExtractor implements EnhancedTransactionExtractor {
  /**
   * Clean JSON response that might be wrapped in markdown code blocks
   */
  private cleanJsonResponse(responseText: string): string {
    // Remove markdown code block wrappers
    let cleaned = responseText.trim();

    // Remove ```json and ``` wrappers
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.substring(7);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.substring(3);
    }

    if (cleaned.endsWith('```')) {
      cleaned = cleaned.substring(0, cleaned.length - 3);
    }

    return cleaned.trim();
  }

  /**
   * Extract transactions with confidence scoring
   */
  async extractWithConfidence(pdfBuffer: Buffer): Promise<ExtractionResult> {
    const startTime = Date.now();

    try {
      // First detect bank format
      const bankFormat = await this.detectBankFormat(pdfBuffer);

      // Use specialized prompt if we have high confidence in the bank format
      if (bankFormat.confidence > 0.7) {
        return await this.extractWithSpecializedPrompt(pdfBuffer, bankFormat.id);
      }

      // Otherwise use the default extraction
      const base64Pdf = pdfBuffer.toString('base64');

      // Enhanced prompt with confidence scoring instructions
      const prompt = `
        You are a JSON generator that extracts transaction details from bank statements.
        Analyze the provided PDF and extract ALL transactions, including:
        - Regular transfers and payments
        - Bank fees and charges
        - Interest payments
        - Card transactions
        - ATM withdrawals
        - Standing orders
        - Direct debits
        - Any other financial movements
        
        Return ONLY a valid JSON array of transactions with these exact fields:
        {
          "nazivSedistePrimaoca": "string (recipient name or transaction description)",
          "iznosOdobrenja": "string (amount - include + or - prefix for credits/debits)",
          "pozivNaBrojOdobrenja": "string (reference number, transaction ID, or any identifying number)",
          "referentnaOznaka": "string (reference mark, code, or transaction type)",
          "datumKnjizenja": "string (posting date)",
          "confidence": number (between 0 and 1, indicating your confidence in the extraction),
          "transactionType": "string (type: transfer, fee, interest, card, atm, standing_order, direct_debit, other)"
        }
        
        CRITICAL EXTRACTION RULES:
        1. Return ONLY the JSON array, no other text
        2. Use "N/A" for missing values, but try to extract something meaningful
        3. Ensure all values are strings except confidence which is a number
        4. Format must be exactly as shown above
        5. Do not include any explanations or markdown
        6. Extract EVERY SINGLE transaction from the document - do not skip any rows
        7. For each transaction, add a confidence score between 0 and 1
        8. Use lower confidence (0.1-0.5) when data is unclear or potentially incorrect
        9. Use higher confidence (0.6-1.0) when data is clearly visible and correctly extracted
        10. Pay special attention to reference numbers (pozivNaBrojOdobrenja) and ensure they are accurate
        11. Look for transactions in tables, lists, and any structured format
        12. Include transactions that might be in different sections (summary, details, etc.)
        13. For fees/charges, use the fee description as nazivSedistePrimaoca
        14. For card transactions, include merchant name and card details
        15. Scan the ENTIRE document - transactions might be spread across multiple pages
        16. If you see partial transactions or continuation rows, combine them into complete transactions
        17. Look for both incoming (credit) and outgoing (debit) transactions
        18. Check for transactions in headers, footers, or sidebar areas
        19. Include balance changes, opening/closing balances if they represent transactions
        20. Double-check you haven't missed any transaction rows by scanning systematically
      `;

      // Generate transaction details using AI with PDF input
      const result = await model.generateContent([
        prompt,
        {
          inlineData: {
            data: base64Pdf,
            mimeType: 'application/pdf'
          }
        }
      ]);

      const response = await result.response;
      const responseText = response.text();

      // Parse and enhance the response
      const cleanedResponse = this.cleanJsonResponse(responseText);
      const parsedResponse = JSON.parse(cleanedResponse);
      if (!Array.isArray(parsedResponse)) {
        throw new Error('Response is not an array');
      }

      // Transform into enhanced transactions
      const transactions: EnhancedTransaction[] = parsedResponse.map(transaction => {
        // Extract confidence if provided, otherwise default to 0.5
        const confidence = typeof transaction.confidence === 'number'
          ? transaction.confidence
          : 0.5;

        // Remove confidence from the original transaction object
        const { confidence: _, ...transactionData } = transaction;

        return {
          ...transactionData,
          confidence,
          extractionMethod: 'primary-ai',
          qualityFlags: this.generateQualityFlags(transactionData),
          validationStatus: this.determineValidationStatus(transactionData),
          qualityIssues: []
        };
      });

      // Calculate overall confidence
      const averageConfidence = transactions.reduce(
        (sum, t) => sum + t.confidence, 0
      ) / transactions.length;

      // If we have low confidence or few transactions, try fallback extraction
      let finalTransactions = transactions;
      let finalConfidence = averageConfidence;
      let finalMethod = 'primary-ai-extraction';

      if (averageConfidence < 0.6 || transactions.length < 2) {
        console.log('Low confidence or few transactions detected, attempting fallback extraction...');
        const fallbackResult = await this.fallbackExtraction(pdfBuffer);

        if (fallbackResult.transactions.length > transactions.length) {
          console.log(`Fallback found ${fallbackResult.transactions.length} vs ${transactions.length} transactions`);
          finalTransactions = fallbackResult.transactions;
          finalConfidence = fallbackResult.confidence;
          finalMethod = 'fallback-extraction';
        } else if (fallbackResult.transactions.length > 0) {
          // Merge unique transactions from both methods
          const mergedTransactions = this.mergeTransactions(transactions, fallbackResult.transactions);
          finalTransactions = mergedTransactions;
          finalConfidence = Math.max(averageConfidence, fallbackResult.confidence);
          finalMethod = 'hybrid-extraction';
        }
      }

      return {
        transactions: finalTransactions,
        confidence: finalConfidence,
        method: finalMethod,
        processingTime: Date.now() - startTime,
        errors: [],
        bankFormat
      };
    } catch (error) {
      console.error('Error in enhanced extraction:', error);
      return {
        transactions: [],
        confidence: 0,
        method: 'enhanced-ai-extraction',
        processingTime: Date.now() - startTime,
        errors: [{
          type: 'EXTRACTION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        }]
      };
    }
  }

  /**
   * Extract transactions with a specialized prompt for a specific bank format
   */
  async extractWithSpecializedPrompt(pdfBuffer: Buffer, bankType: string): Promise<ExtractionResult> {
    const startTime = Date.now();

    try {
      const base64Pdf = pdfBuffer.toString('base64');

      // Get specialized prompt for the bank type
      const prompt = this.getSpecializedPrompt(bankType);

      // Generate transaction details using AI with PDF input
      const result = await model.generateContent([
        prompt,
        {
          inlineData: {
            data: base64Pdf,
            mimeType: 'application/pdf'
          }
        }
      ]);

      const response = await result.response;
      const responseText = response.text();

      // Parse and enhance the response
      const cleanedResponse = this.cleanJsonResponse(responseText);
      const parsedResponse = JSON.parse(cleanedResponse);
      if (!Array.isArray(parsedResponse)) {
        throw new Error('Response is not an array');
      }

      // Transform into enhanced transactions
      const transactions: EnhancedTransaction[] = parsedResponse.map(transaction => {
        // Extract confidence if provided, otherwise default to 0.7 (higher for specialized prompts)
        const confidence = typeof transaction.confidence === 'number'
          ? transaction.confidence
          : 0.7;

        // Remove confidence from the original transaction object
        const { confidence: _, ...transactionData } = transaction;

        return {
          ...transactionData,
          confidence,
          extractionMethod: `specialized-${bankType}`,
          qualityFlags: this.generateQualityFlags(transactionData),
          validationStatus: this.determineValidationStatus(transactionData),
          qualityIssues: []
        };
      });

      // Calculate overall confidence
      const averageConfidence = transactions.reduce(
        (sum, t) => sum + t.confidence, 0
      ) / transactions.length;

      return {
        transactions,
        confidence: averageConfidence,
        method: `specialized-${bankType}-extraction`,
        processingTime: Date.now() - startTime,
        errors: [],
        bankFormat: { id: bankType, name: bankType, confidence: 0.9, features: [] }
      };
    } catch (error) {
      console.error(`Error in specialized extraction for ${bankType}:`, error);
      return {
        transactions: [],
        confidence: 0,
        method: `specialized-${bankType}-extraction`,
        processingTime: Date.now() - startTime,
        errors: [{
          type: 'SPECIALIZED_EXTRACTION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        }]
      };
    }
  }

  /**
   * Detect the bank format from a PDF
   */
  async detectBankFormat(pdfBuffer: Buffer): Promise<BankFormat> {
    try {
      const base64Pdf = pdfBuffer.toString('base64');

      // Prompt to detect bank format
      const prompt = `
        Analyze this bank statement PDF and determine the bank format.
        Return ONLY a JSON object with the following structure:
        {
          "id": "string (unique identifier for this bank format)",
          "name": "string (human-readable name of the bank)",
          "confidence": number (between 0 and 1, indicating your confidence in the detection),
          "features": ["array", "of", "distinctive", "features"]
        }
        
        Rules:
        1. Return ONLY the JSON object, no other text
        2. Be specific about the bank name and format
        3. Include distinctive features you observed in the document
        4. Use lower confidence (0.1-0.5) when format is unclear
        5. Use higher confidence (0.6-1.0) when format is clearly identifiable
      `;

      const result = await model.generateContent([
        prompt,
        {
          inlineData: {
            data: base64Pdf,
            mimeType: 'application/pdf'
          }
        }
      ]);

      const response = await result.response;
      const responseText = response.text();

      // Parse the response
      const cleanedResponse = this.cleanJsonResponse(responseText);
      const bankFormat = JSON.parse(cleanedResponse);

      return {
        id: bankFormat.id || 'unknown',
        name: bankFormat.name || 'Unknown Bank',
        confidence: bankFormat.confidence || 0.5,
        features: Array.isArray(bankFormat.features) ? bankFormat.features : []
      };
    } catch (error) {
      console.error('Error detecting bank format:', error);

      // Return default format on error
      return {
        id: 'unknown',
        name: 'Unknown Bank',
        confidence: 0.1,
        features: []
      };
    }
  }

  /**
   * Get specialized prompt for a specific bank type
   */
  private getSpecializedPrompt(bankType: string): string {
    const basePrompt = `
      You are a specialized JSON generator for ${bankType} bank statements.
      Extract ALL transactions including transfers, fees, charges, interest, card payments, ATM withdrawals, etc.
      
      Return ONLY a valid JSON array of transactions with these exact fields:
      {
        "nazivSedistePrimaoca": "string (recipient name or transaction description)",
        "iznosOdobrenja": "string (amount with +/- prefix for credits/debits)",
        "pozivNaBrojOdobrenja": "string (reference number, transaction ID, or any identifying number)",
        "referentnaOznaka": "string (reference mark, code, or transaction type)",
        "datumKnjizenja": "string (posting date)",
        "confidence": number (between 0 and 1),
        "transactionType": "string (transfer, fee, interest, card, atm, standing_order, direct_debit, other)"
      }
      
      CRITICAL RULES:
      1. Return ONLY the JSON array, no other text
      2. Extract EVERY transaction - scan the entire document systematically
      3. Include all transaction types: payments, receipts, fees, charges, interest
      4. Use "N/A" for missing values but try to extract something meaningful
      5. Higher confidence (0.7-1.0) for clear data, lower (0.3-0.6) for unclear
      6. Look in tables, lists, headers, footers, and all document sections
      7. Combine partial transaction data spread across multiple lines
      8. Include balance changes if they represent actual transactions
    `;

    // Add bank-specific instructions
    const bankSpecificInstructions = this.getBankSpecificInstructions(bankType);

    return basePrompt + bankSpecificInstructions;
  }

  /**
   * Get bank-specific extraction instructions
   */
  private getBankSpecificInstructions(bankType: string): string {
    const lowerBankType = bankType.toLowerCase();

    if (lowerBankType.includes('komercijalna') || lowerBankType.includes('kbc')) {
      return `
        
        KOMERCIJALNA BANKA SPECIFIC INSTRUCTIONS:
        - Look for transaction tables with columns: Datum, Opis, Iznos, Saldo
        - Reference numbers often in format: XXX-XXXX-XXXXX or similar
        - Amounts use comma as decimal separator (e.g., 1.234,56)
        - Dates in DD.MM.YYYY format
        - Card transactions often have "KARTICE" or "POS" in description
        - ATM withdrawals marked as "BANKOMAT" or "ATM"
        - Fees typically marked as "NAKNADA" or "PROVIZIJA"
        - Standing orders as "TRAJNI NALOG"
        - Direct debits as "DIREKTNO ZADUZENJE"
        - Look for continuation pages with "Strana" or "Page"
      `;
    }

    if (lowerBankType.includes('raiffeisen') || lowerBankType.includes('rba')) {
      return `
        
        RAIFFEISEN BANK SPECIFIC INSTRUCTIONS:
        - Transaction tables typically have: Datum knjiženja, Opis, Iznos, Stanje
        - Reference numbers in various formats: XXXX-XXXX-XXXX
        - Look for "Promet na računu" section
        - Card payments often marked "Kartično plaćanje"
        - Internet banking transactions marked "RBA e-banking"
        - Fees as "Naknada za" or "Kamata"
        - Check for multi-page statements
      `;
    }

    if (lowerBankType.includes('unicredit') || lowerBankType.includes('hvb')) {
      return `
        
        UNICREDIT BANK SPECIFIC INSTRUCTIONS:
        - Look for "Pregled prometa" or transaction overview sections
        - Columns: Datum valute, Opis transakcije, Iznos, Stanje
        - Reference numbers often numeric or alphanumeric
        - Card transactions marked "POS transakcija"
        - Online banking as "UniCredit e-banking"
        - Fees typically "Naknada" or "Provizija"
      `;
    }

    if (lowerBankType.includes('erste') || lowerBankType.includes('sparkasse')) {
      return `
        
        ERSTE BANK SPECIFIC INSTRUCTIONS:
        - Transaction sections often titled "Promet po računu"
        - Standard columns: Datum, Opis, Iznos, Saldo računa
        - Look for George (online banking) transactions
        - Card payments marked "Kartično plaćanje" or "POS"
        - ATM as "Podizanje gotovine"
        - Fees as "Naknada" with detailed descriptions
      `;
    }

    // Default instructions for unknown banks
    return `
      
      GENERAL BANK STATEMENT INSTRUCTIONS:
      - Look for any tabular data with dates, amounts, and descriptions
      - Common column headers: Datum, Opis, Iznos, Saldo, Stanje
      - Reference numbers can be in various formats
      - Card transactions often contain "POS", "KARTICE", or merchant names
      - ATM withdrawals marked "ATM", "BANKOMAT", or "PODIZANJE"
      - Fees typically contain "NAKNADA", "PROVIZIJA", or "KAMATA"
      - Standing orders as "TRAJNI NALOG" or "STALNI NALOG"
      - Direct debits as "DIREKTNO ZADUZENJE"
      - Scan entire document including headers, footers, and summary sections
    `;
  }

  /**
   * Generate quality flags for a transaction
   */
  private generateQualityFlags(transaction: Transaction): string[] {
    const flags: string[] = [];

    // Check for missing or N/A values
    if (transaction.nazivSedistePrimaoca === 'N/A' || !transaction.nazivSedistePrimaoca) {
      flags.push('missing-recipient');
    }

    if (transaction.iznosOdobrenja === 'N/A' || !transaction.iznosOdobrenja) {
      flags.push('missing-amount');
    }

    if (transaction.pozivNaBrojOdobrenja === 'N/A' || !transaction.pozivNaBrojOdobrenja) {
      flags.push('missing-reference-number');
    }

    if (transaction.referentnaOznaka === 'N/A' || !transaction.referentnaOznaka) {
      flags.push('missing-reference-mark');
    }

    if (transaction.datumKnjizenja === 'N/A' || !transaction.datumKnjizenja) {
      flags.push('missing-date');
    }

    // Check for potentially invalid values
    if (!/^\d+([.,]\d+)?$/.test(transaction.iznosOdobrenja.replace(/[^\d.,]/g, ''))) {
      flags.push('invalid-amount-format');
    }

    // Check for potentially invalid reference number
    if (transaction.pozivNaBrojOdobrenja !== 'N/A' &&
      !/^[\d\-\/]+$/.test(transaction.pozivNaBrojOdobrenja) &&
      transaction.pozivNaBrojOdobrenja.length > 0) {
      flags.push('suspicious-reference-number');
    }

    return flags;
  }

  /**
   * Fallback extraction method using alternative AI prompt
   */
  private async fallbackExtraction(pdfBuffer: Buffer): Promise<ExtractionResult> {
    const startTime = Date.now();

    try {
      const base64Pdf = pdfBuffer.toString('base64');

      // Alternative prompt focusing on table structure and systematic scanning
      const prompt = `
        You are a meticulous transaction extractor. Your task is to systematically scan this bank statement PDF and find EVERY transaction.
        
        SCANNING STRATEGY:
        1. Start from the top of each page
        2. Look for any table-like structures with financial data
        3. Scan line by line for amounts, dates, and descriptions
        4. Check headers, footers, and margins for additional transactions
        5. Look for continuation of transactions across pages
        
        Extract ALL financial movements as JSON array with these fields:
        {
          "nazivSedistePrimaoca": "string (any description, merchant, or entity name)",
          "iznosOdobrenja": "string (any amount found, with +/- if possible)",
          "pozivNaBrojOdobrenja": "string (any number, ID, or reference)",
          "referentnaOznaka": "string (any code, type, or category)",
          "datumKnjizenja": "string (any date found)",
          "confidence": number (0.1-1.0),
          "transactionType": "string (best guess of type)"
        }
        
        CRITICAL: Return ONLY the JSON array. Include even partial or unclear transactions with low confidence.
        Look for: transfers, payments, fees, charges, interest, card transactions, ATM, direct debits, standing orders.
        Don't skip anything that looks like a financial movement.
      `;

      const result = await model.generateContent([
        prompt,
        {
          inlineData: {
            data: base64Pdf,
            mimeType: 'application/pdf'
          }
        }
      ]);

      const response = await result.response;
      const responseText = response.text();

      const cleanedResponse = this.cleanJsonResponse(responseText);
      const parsedResponse = JSON.parse(cleanedResponse);
      if (!Array.isArray(parsedResponse)) {
        throw new Error('Fallback response is not an array');
      }

      const transactions: EnhancedTransaction[] = parsedResponse.map(transaction => {
        const confidence = typeof transaction.confidence === 'number'
          ? transaction.confidence
          : 0.4;

        const { confidence: _, ...transactionData } = transaction;

        return {
          ...transactionData,
          confidence,
          extractionMethod: 'fallback-ai',
          qualityFlags: this.generateQualityFlags(transactionData),
          validationStatus: this.determineValidationStatus(transactionData),
          qualityIssues: []
        };
      });

      const averageConfidence = transactions.length > 0
        ? transactions.reduce((sum, t) => sum + t.confidence, 0) / transactions.length
        : 0;

      return {
        transactions,
        confidence: averageConfidence,
        method: 'fallback-extraction',
        processingTime: Date.now() - startTime,
        errors: []
      };
    } catch (error) {
      console.error('Error in fallback extraction:', error);
      return {
        transactions: [],
        confidence: 0,
        method: 'fallback-extraction',
        processingTime: Date.now() - startTime,
        errors: [{
          type: 'FALLBACK_EXTRACTION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        }]
      };
    }
  }

  /**
   * Merge transactions from two extraction methods, removing duplicates
   */
  private mergeTransactions(primary: EnhancedTransaction[], fallback: EnhancedTransaction[]): EnhancedTransaction[] {
    const merged: EnhancedTransaction[] = [...primary];

    for (const fallbackTransaction of fallback) {
      // Check if this transaction is already in the primary results
      const isDuplicate = primary.some(primaryTransaction =>
        this.areTransactionsSimilar(primaryTransaction, fallbackTransaction)
      );

      if (!isDuplicate) {
        merged.push({
          ...fallbackTransaction,
          extractionMethod: 'fallback-supplement'
        });
      }
    }

    return merged;
  }

  /**
   * Check if two transactions are similar (likely duplicates)
   */
  private areTransactionsSimilar(t1: EnhancedTransaction, t2: EnhancedTransaction): boolean {
    // Compare key fields to detect duplicates
    const amount1 = t1.iznosOdobrenja.replace(/[^\d.,]/g, '');
    const amount2 = t2.iznosOdobrenja.replace(/[^\d.,]/g, '');

    const date1 = t1.datumKnjizenja;
    const date2 = t2.datumKnjizenja;

    const recipient1 = t1.nazivSedistePrimaoca.toLowerCase().trim();
    const recipient2 = t2.nazivSedistePrimaoca.toLowerCase().trim();

    // Consider similar if amount and date match, or if amount and recipient are very similar
    return (amount1 === amount2 && date1 === date2) ||
      (amount1 === amount2 && this.stringSimilarity(recipient1, recipient2) > 0.8);
  }

  /**
   * Calculate string similarity (simple implementation)
   */
  private stringSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1.0;
    if (str1.length === 0 || str2.length === 0) return 0.0;

    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Determine validation status based on quality flags
   */
  private determineValidationStatus(transaction: Transaction): 'valid' | 'warning' | 'error' {
    const flags = this.generateQualityFlags(transaction);

    if (flags.includes('missing-amount') ||
      flags.includes('missing-date') ||
      flags.includes('invalid-amount-format')) {
      return 'error';
    }

    if (flags.length > 0) {
      return 'warning';
    }

    return 'valid';
  }
}