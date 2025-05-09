"use strict";
/**
 * @fileOverview Extracts transaction details directly from PDF files using Gemini AI.
 *
 * - extractTransactionDetails - A function that extracts transaction details from text content.
 * - ExtractTransactionDetailsInput - The input type for the extractTransactionDetails function.
 * - ExtractTransactionDetailsOutput - The return type for the ExtractTransactionDetails function.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractTransactionDetails = extractTransactionDetails;
const genkit_1 = require("genkit");
const googleai_1 = require("@genkit-ai/googleai");
const zod_1 = require("zod");
const functions = __importStar(require("firebase-functions"));
const TransactionSchema = zod_1.z.object({
    nazivSedistePrimaoca: zod_1.z.string(),
    iznosOdobrenja: zod_1.z.string(),
    pozivNaBrojOdobrenja: zod_1.z.string(),
    referentnaOznaka: zod_1.z.string(),
    datumKnjizenja: zod_1.z.string()
});
async function extractTransactionDetails(pdfBuffer) {
    try {
        const ai = (0, genkit_1.genkit)({
            plugins: [(0, googleai_1.googleAI)({ apiKey: functions.config().google.genai_api_key })],
            model: googleai_1.gemini15Pro
        });
        // Convert PDF buffer to base64
        const base64Pdf = pdfBuffer.toString('base64');
        // Prepare the prompt with strict JSON output instructions
        const prompt = `
      You are a JSON generator that extracts transaction details from bank statements.
      Analyze the provided PDF and extract all transactions.
      
      Return ONLY a valid JSON array of transactions with these exact fields:
      {
        "nazivSedistePrimaoca": "string (recipient name)",
        "iznosOdobrenja": "string (amount)",
        "pozivNaBrojOdobrenja": "string (reference number)",
        "referentnaOznaka": "string (reference mark)",
        "datumKnjizenja": "string (posting date)"
      }
      
      Rules:
      1. Return ONLY the JSON array, no other text
      2. Use "N/A" for missing values
      3. Ensure all values are strings
      4. Format must be exactly as shown above
      5. Do not include any explanations or markdown
      6. Extract ALL transactions from the document
    `;
        // Generate transaction details using AI with PDF input
        const { text: responseText } = await ai.generate({
            model: googleai_1.gemini15Pro,
            prompt: [{
                    text: prompt
                }, {
                    media: {
                        url: `data:application/pdf;base64,${base64Pdf}`
                    }
                }],
            config: {
                temperature: 0.1,
                topP: 0.1,
                topK: 16,
                maxOutputTokens: 2048,
                responseMimeType: 'application/json'
            }
        });
        // Parse and validate the response
        try {
            const parsedResponse = JSON.parse(responseText);
            if (!Array.isArray(parsedResponse)) {
                throw new Error('Response is not an array');
            }
            // Validate each transaction against the schema
            const transactions = parsedResponse.map(transaction => {
                const result = TransactionSchema.safeParse(transaction);
                if (!result.success) {
                    throw new Error(`Invalid transaction format: ${result.error.message}`);
                }
                return result.data;
            });
            return transactions;
        }
        catch (error) {
            console.error('Error parsing AI response:', error);
            console.error('Raw response:', responseText);
            throw new Error(`Failed to parse AI response: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    catch (error) {
        console.error('Error in extractTransactionDetails:', error);
        throw error;
    }
}
//# sourceMappingURL=extract-transaction-details.js.map