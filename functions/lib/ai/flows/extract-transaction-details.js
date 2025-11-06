"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OPENAI_API_KEY = void 0;
exports.extractTransactionDetails = extractTransactionDetails;
const openai_1 = __importDefault(require("openai"));
const zod_1 = require("zod");
const pdf_parse_1 = __importDefault(require("pdf-parse"));
const params_1 = require("firebase-functions/params");
exports.OPENAI_API_KEY = (0, params_1.defineSecret)('OPENAI_API_KEY');
const TransactionSchema = zod_1.z.object({
    nazivSedistePrimaoca: zod_1.z.string(),
    iznosOdobrenja: zod_1.z.string(),
    pozivNaBrojOdobrenja: zod_1.z.string(),
    referentnaOznaka: zod_1.z.string(),
    datumKnjizenja: zod_1.z.string()
});
console.log('🔧 Initialized OpenAI client');
async function extractTransactionDetails(pdfBuffer) {
    // Add debug mode flag
    const DEBUG_MODE = process.env.DEBUG_TRANSACTIONS === 'true';
    console.log('📄 Parsing PDF to extract text...');
    const parsed = await (0, pdf_parse_1.default)(pdfBuffer);
    const extractedText = parsed.text;
    const openai = new openai_1.default({ apiKey: exports.OPENAI_API_KEY.value() });
    console.log('📄 PDF text extracted, sending to OpenAI...');
    if (DEBUG_MODE) {
        console.log('🔍 DEBUG: Full extracted text:', extractedText);
    }
    const prompt = `You are a JSON generator that extracts structured transaction data from Serbian bank statements in tabular PDF format.

IMPORTANT: You must respond with ONLY a valid JSON array, no explanations, no markdown, no extra text.

Extract all potražni promet (credited) transactions using this exact schema:

{
  "nazivSedistePrimaoca": "string",       // Full name and address of recipient
  "iznosOdobrenja": "string",             // Credited amount (decimal with comma separator)
  "pozivNaBrojOdobrenja": "string",       // Reference number shown in the "Poziv na broj - odobrenje" column
  "referentnaOznaka": "string",           // Internal bank code like "87000138856 963(2)" or "N/A"
  "datumKnjizenja": "string"              // Booking date in DD.MM.YYYY format
}

📌 Extraction Guidelines:
1. Extract ONLY transactions from the potražni promet (credits) section.
2. Use only values as shown in the bank table, with exact spelling and punctuation.
3. 'referentnaOznaka' is usually in format "87000138856 963(2)". If not present, return "N/A".
4. 'pozivNaBrojOdobrenja' must exactly match a string shown under the "Poziv na broj - odobrenje" column.
   - Valid formats include structured reference numbers like: "01-263-205-202505", "05-194-80-202505", "05-222-96-202505"
   - IMPORTANT: Reference numbers MUST include ALL digits, especially the last two digits of the year (e.g., "202505" not "2025")
   - Do NOT extract long internal numeric IDs like "87000138423" unless they are explicitly labeled as "Poziv na broj"
   - If "Poziv na broj - odobrenje" is empty or missing, return "N/A"
5. If a field is missing or cannot be found, return "N/A"
6. Return ONLY a valid JSON array, no explanations, markdown, or extra text.
7. Every field must be a string.

Here is the extracted raw text from the bank statement:
${extractedText}

Example output format (respond with ONLY this format, no other text):
[
  {
    "nazivSedistePrimaoca": "UDRUŽENJE ORGANIZACIJA STARI GRAD, PJARONA DE MONDEZIRA 36",
    "iznosOdobrenja": "3.600,00",
    "pozivNaBrojOdobrenja": "01-263-205-202505",
    "referentnaOznaka": "87000138783 572(2)",
    "datumKnjizenja": "15.05.2025"
  },
  {
    "nazivSedistePrimaoca": "ANICA ZURKIC PR ANGELOS TRAVEL",
    "iznosOdobrenja": "3.000,00",
    "pozivNaBrojOdobrenja": "05-222-96-202505",
    "referentnaOznaka": "87000138856 963(2)",
    "datumKnjizenja": "15.05.2025"
  }
]`;
    const response = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
            {
                role: 'system',
                content: 'You are a JSON generator. You must respond with ONLY a valid JSON array containing transaction data. Do not include any explanations, markdown, or additional text.'
            },
            {
                role: 'user',
                content: prompt
            }
        ]
    });
    const content = response.choices?.[0]?.message?.content || '';
    console.log('✅ Response received from OpenAI.');
    console.log('📄 Raw OpenAI response:', content);
    try {
        // Try to parse the response as JSON
        let parsedResult;
        try {
            parsedResult = JSON.parse(content);
        }
        catch (parseError) {
            console.error('Failed to parse OpenAI response as JSON:', content);
            throw new Error('OpenAI response is not valid JSON');
        }
        // Ensure we have an array
        if (!Array.isArray(parsedResult)) {
            console.error('OpenAI response is not an array:', parsedResult);
            throw new Error('OpenAI response is not a JSON array');
        }
        const validated = [];
        const rejectedTransactions = [];
        if (DEBUG_MODE) {
            console.log(`🔍 DEBUG: OpenAI returned ${parsedResult.length} transactions for validation`);
        }
        for (let i = 0; i < parsedResult.length; i++) {
            const item = parsedResult[i];
            if (DEBUG_MODE) {
                console.log(`🔍 DEBUG: Validating transaction ${i + 1}:`, JSON.stringify(item, null, 2));
            }
            const result = TransactionSchema.safeParse(item);
            if (!result.success) {
                console.warn(`⚠️ Skipping invalid transaction ${i + 1} (schema validation failed):`, result.error.format());
                rejectedTransactions.push({ reason: 'schema_validation_failed', transaction: item, error: result.error.format() });
                continue;
            }
            // Additional validation and fixing for pozivNaBrojOdobrenja format
            if (result.data.pozivNaBrojOdobrenja !== 'N/A') {
                const refNum = result.data.pozivNaBrojOdobrenja;
                if (DEBUG_MODE) {
                    console.log(`🔍 DEBUG: Processing reference number for transaction ${i + 1}:`, refNum);
                }
                // Check if it's a dash-separated format
                if (refNum.includes('-')) {
                    const refParts = refNum.split('-');
                    if (DEBUG_MODE) {
                        console.log(`🔍 DEBUG: Reference number parts for transaction ${i + 1}:`, refParts);
                    }
                    // Attempt to reconstruct a truncated YYYYMM suffix using the booking date
                    if (refParts.length >= 4) {
                        const dateParts = result.data.datumKnjizenja.split('.').map(part => part.trim());
                        const [, monthStr, yearStr] = dateParts;
                        const normalizedMonth = monthStr && monthStr.length > 0 ? monthStr.padStart(2, '0') : null;
                        const normalizedYear = yearStr && yearStr.length === 4 ? yearStr : null;
                        const expectedYearMonth = normalizedYear && normalizedMonth ? `${normalizedYear}${normalizedMonth}` : null;
                        if (expectedYearMonth) {
                            const lastIndex = refParts.length - 1;
                            const lastPart = refParts[lastIndex];
                            const isNumeric = /^\d+$/.test(lastPart);
                            if (!isNumeric || lastPart.length < 6) {
                                refParts[lastIndex] = expectedYearMonth;
                                result.data.pozivNaBrojOdobrenja = refParts.join('-');
                                console.log('🔧 Normalized reference number using booking date:', result.data.pozivNaBrojOdobrenja);
                            }
                        }
                    }
                    // More lenient validation - accept if it has dashes and reasonable length
                    const finalRefParts = result.data.pozivNaBrojOdobrenja.split('-');
                    if (finalRefParts.length < 3 || finalRefParts.length > 5) {
                        console.warn(`⚠️ Invalid reference number format (wrong structure) for transaction ${i + 1}:`, result.data.pozivNaBrojOdobrenja);
                        rejectedTransactions.push({
                            reason: 'invalid_reference_structure',
                            transaction: result.data,
                            referenceNumber: result.data.pozivNaBrojOdobrenja,
                            parts: finalRefParts
                        });
                        continue;
                    }
                    // Check if last part is reasonable (4-6 digits for year/month)
                    const lastPart = finalRefParts[finalRefParts.length - 1];
                    if (lastPart.length < 4 || lastPart.length > 6 || !/^\d+$/.test(lastPart)) {
                        console.warn(`⚠️ Invalid reference number format (invalid last part) for transaction ${i + 1}:`, result.data.pozivNaBrojOdobrenja);
                        rejectedTransactions.push({
                            reason: 'invalid_reference_last_part',
                            transaction: result.data,
                            referenceNumber: result.data.pozivNaBrojOdobrenja,
                            lastPart: lastPart
                        });
                        continue;
                    }
                }
                else {
                    // Handle non-dash formats (like "0617910120250")
                    // Accept if it's all digits and reasonable length
                    if (!/^\d+$/.test(refNum) || refNum.length < 8 || refNum.length > 15) {
                        console.warn(`⚠️ Invalid reference number format (non-standard format) for transaction ${i + 1}:`, result.data.pozivNaBrojOdobrenja);
                        rejectedTransactions.push({
                            reason: 'invalid_reference_non_standard',
                            transaction: result.data,
                            referenceNumber: result.data.pozivNaBrojOdobrenja
                        });
                        continue;
                    }
                    if (DEBUG_MODE) {
                        console.log(`✅ Accepted non-standard reference format for transaction ${i + 1}:`, refNum);
                    }
                }
            }
            validated.push(result.data);
        }
        if (DEBUG_MODE || rejectedTransactions.length > 0) {
            console.log(`📊 VALIDATION SUMMARY:
        - Total from OpenAI: ${parsedResult.length}
        - Successfully validated: ${validated.length}
        - Rejected: ${rejectedTransactions.length}`);
            if (rejectedTransactions.length > 0) {
                console.log('❌ REJECTED TRANSACTIONS:', JSON.stringify(rejectedTransactions, null, 2));
            }
        }
        if (validated.length === 0) {
            console.error('❌ No valid transactions found after validation and fixes');
            throw new Error('No valid transactions found in the response');
        }
        console.log('✅ Successfully validated transactions:', validated);
        return validated;
    }
    catch (error) {
        console.error('❌ Failed to parse or validate OpenAI response:', error);
        throw new Error('OpenAI returned invalid JSON or structure');
    }
}
//# sourceMappingURL=extract-transaction-details.js.map