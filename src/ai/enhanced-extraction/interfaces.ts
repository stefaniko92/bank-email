/**
 * Core interfaces for the enhanced transaction extraction system
 */

import { 
  BankFormat, 
  EnhancedTransaction, 
  ExtractionContext, 
  ExtractionResult, 
  FailurePattern, 
  MethodStats, 
  PerformanceReport, 
  QualityIssue, 
  ValidationResult 
} from '../../types/extraction';

/**
 * Enhanced Transaction Extractor Interface
 */
export interface EnhancedTransactionExtractor {
  /**
   * Extract transactions with confidence scoring
   * 
   * @param pdfBuffer The PDF buffer to extract transactions from
   * @returns Promise resolving to extraction result
   */
  extractWithConfidence(pdfBuffer: Buffer): Promise<ExtractionResult>;

  /**
   * Extract transactions with a specialized prompt for a specific bank format
   * 
   * @param pdfBuffer The PDF buffer to extract transactions from
   * @param bankType The bank format type
   * @returns Promise resolving to extraction result
   */
  extractWithSpecializedPrompt(pdfBuffer: Buffer, bankType: string): Promise<ExtractionResult>;

  /**
   * Detect the bank format from a PDF
   * 
   * @param pdfBuffer The PDF buffer to analyze
   * @returns Promise resolving to detected bank format
   */
  detectBankFormat(pdfBuffer: Buffer): Promise<BankFormat>;
}

/**
 * Fallback Extractor Interface
 */
export interface FallbackExtractor {
  /**
   * Extract transactions using OCR
   * 
   * @param pdfBuffer The PDF buffer to extract transactions from
   * @returns Promise resolving to extraction result
   */
  extractWithOCR(pdfBuffer: Buffer): Promise<ExtractionResult>;

  /**
   * Extract transactions using pattern matching
   * 
   * @param pdfBuffer The PDF buffer to extract transactions from
   * @returns Promise resolving to extraction result
   */
  extractWithPatternMatching(pdfBuffer: Buffer): Promise<ExtractionResult>;

  /**
   * Extract transactions using alternative AI prompts
   * 
   * @param pdfBuffer The PDF buffer to extract transactions from
   * @returns Promise resolving to extraction result
   */
  extractWithAlternativePrompts(pdfBuffer: Buffer): Promise<ExtractionResult>;
}

/**
 * Transaction Validator Interface
 */
export interface TransactionValidator {
  /**
   * Validate a transaction
   * 
   * @param transaction The transaction to validate
   * @returns Validation result
   */
  validateTransaction(transaction: EnhancedTransaction): ValidationResult;

  /**
   * Normalize a transaction (standardize formats, etc.)
   * 
   * @param transaction The transaction to normalize
   * @returns Normalized transaction
   */
  normalizeTransaction(transaction: EnhancedTransaction): EnhancedTransaction;

  /**
   * Detect quality issues in a transaction
   * 
   * @param transaction The transaction to check
   * @returns Array of quality issues
   */
  detectQualityIssues(transaction: EnhancedTransaction): QualityIssue[];
}

/**
 * Extraction Analytics Interface
 */
export interface ExtractionAnalytics {
  /**
   * Log an extraction attempt
   * 
   * @param result The extraction result
   * @param metadata Additional metadata about the extraction
   */
  logExtractionAttempt(result: ExtractionResult, metadata: any): void;

  /**
   * Identify patterns in extraction failures
   * 
   * @returns Array of failure patterns
   */
  identifyFailurePatterns(): Promise<FailurePattern[]>;

  /**
   * Generate a performance report
   * 
   * @returns Performance report
   */
  generatePerformanceReport(): Promise<PerformanceReport>;

  /**
   * Track effectiveness of different extraction methods
   * 
   * @returns Method statistics
   */
  trackMethodEffectiveness(): Promise<MethodStats[]>;
}

/**
 * Extraction Orchestrator Interface
 */
export interface ExtractionOrchestrator {
  /**
   * Extract transactions using the best available method
   * 
   * @param pdfBuffer The PDF buffer to extract transactions from
   * @returns Promise resolving to extraction result
   */
  extract(pdfBuffer: Buffer): Promise<ExtractionResult>;

  /**
   * Register an extraction method
   * 
   * @param name Method name
   * @param method Extraction method function
   * @param priority Priority (higher number = higher priority)
   */
  registerMethod(name: string, method: (context: ExtractionContext) => Promise<ExtractionResult>, priority: number): void;
}

/**
 * Enhanced Webhook Service Interface
 */
export interface EnhancedWebhookService {
  /**
   * Send enhanced webhook with transaction data and quality metadata
   * 
   * @param url The webhook URL
   * @param result The extraction result
   * @returns Promise resolving when webhook is sent
   */
  sendEnhancedWebhook(url: string, result: ExtractionResult): Promise<void>;
}

/**
 * Error Handler Interface
 */
export interface ExtractionErrorHandler {
  /**
   * Handle an extraction failure
   * 
   * @param error The extraction error
   * @param context The extraction context
   * @returns Promise resolving to extraction result (possibly from fallback method)
   */
  handleExtractionFailure(error: Error, context: ExtractionContext): Promise<ExtractionResult>;
}