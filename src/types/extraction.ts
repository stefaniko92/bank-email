/**
 * Core types for the enhanced transaction extraction system
 */

import { z } from 'zod';

/**
 * Base Transaction Schema (existing schema from extract-transaction-details.ts)
 */
export const TransactionSchema = z.object({
  nazivSedistePrimaoca: z.string(),
  iznosOdobrenja: z.string(),
  pozivNaBrojOdobrenja: z.string(),
  referentnaOznaka: z.string(),
  datumKnjizenja: z.string(),
  transactionType: z.string().optional()
});

/**
 * Base Transaction Type
 */
export type Transaction = z.infer<typeof TransactionSchema>;

/**
 * Enhanced Transaction Schema with additional metadata
 */
export const EnhancedTransactionSchema = TransactionSchema.extend({
  confidence: z.number(),
  extractionMethod: z.string(),
  qualityFlags: z.array(z.string()),
  validationStatus: z.enum(['valid', 'warning', 'error']),
  normalizedAmount: z.number().optional(),
  normalizedDate: z.date().optional(),
  qualityIssues: z.array(
    z.object({
      field: z.string(),
      issue: z.string(),
      severity: z.enum(['warning', 'error']),
      suggestion: z.string().optional()
    })
  ).optional()
});

/**
 * Enhanced Transaction Type
 */
export type EnhancedTransaction = z.infer<typeof EnhancedTransactionSchema>;

/**
 * Bank Format Type
 */
export interface BankFormat {
  id: string;
  name: string;
  confidence: number;
  features: string[];
}

/**
 * Extraction Error Type
 */
export interface ExtractionError {
  type: string;
  message: string;
  field?: string;
  details?: any;
}

/**
 * Extraction Result Type
 */
export interface ExtractionResult {
  transactions: EnhancedTransaction[];
  confidence: number;
  method: string;
  processingTime: number;
  errors: ExtractionError[];
  bankFormat?: BankFormat;
}

/**
 * Quality Issue Type
 */
export interface QualityIssue {
  field: string;
  issue: string;
  severity: 'warning' | 'error';
  suggestion?: string;
}

/**
 * Validation Result Type
 */
export interface ValidationResult {
  isValid: boolean;
  issues: QualityIssue[];
  confidence: number;
  suggestions: string[];
}

/**
 * Extraction Metadata Type
 */
export interface ExtractionMetadata {
  pdfHash: string;
  fileSize: number;
  pageCount: number;
  bankFormat?: string;
  timestamp: Date;
}

/**
 * Enhanced Webhook Payload Type
 */
export interface EnhancedWebhookPayload {
  transactions: EnhancedTransaction[];
  extractionMetadata: {
    totalTransactions: number;
    successfulExtractions: number;
    averageConfidence: number;
    extractionMethod: string;
    processingTime: number;
    qualityScore: number;
  };
  qualityReport: {
    issues: QualityIssue[];
    warnings: string[];
    recommendations: string[];
  };
}

/**
 * Extraction Context Type
 */
export interface ExtractionContext {
  pdfBuffer: Buffer;
  bankFormat?: BankFormat;
  previousAttempts?: string[];
  options?: Record<string, any>;
}

/**
 * Performance Report Type
 */
export interface PerformanceReport {
  totalAttempts: number;
  successRate: number;
  averageConfidence: number;
  averageProcessingTime: number;
  methodBreakdown: Record<string, number>;
  commonErrors: Array<{
    type: string;
    count: number;
    percentage: number;
  }>;
}

/**
 * Method Stats Type
 */
export interface MethodStats {
  method: string;
  successRate: number;
  averageConfidence: number;
  averageProcessingTime: number;
  usageCount: number;
}

/**
 * Failure Pattern Type
 */
export interface FailurePattern {
  pattern: string;
  frequency: number;
  commonErrors: string[];
  suggestedFix: string;
}