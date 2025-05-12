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
    console.log('📄 Parsing PDF to extract text...');
    const parsed = await (0, pdf_parse_1.default)(pdfBuffer);
    const extractedText = parsed.text;
    const openai = new openai_1.default({ apiKey: exports.OPENAI_API_KEY.value() });
    console.log('📄 PDF text extracted, sending to OpenAI...');
    const prompt = `
    You are a JSON generator that extracts transaction details from bank statements.
    Analyze the following bank statement text and extract all transactions.

    Text:
    ${extractedText}

    Return ONLY a valid JSON array of transactions with these exact fields:
    {
      "nazivSedistePrimaoca": "string",
      "iznosOdobrenja": "string",
      "pozivNaBrojOdobrenja": "string",
      "referentnaOznaka": "string",
      "datumKnjizenja": "string"
    }

    Rules:
    1. Return ONLY the JSON array, no other text
    2. Use "N/A" for missing values
    3. Ensure all values are strings
    4. Format must be exactly as shown above
    5. Do not include any explanations or markdown
    6. Extract ALL transactions from the document
  `;
    const response = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
            {
                role: 'user',
                content: prompt
            }
        ]
    });
    const content = response.choices?.[0]?.message?.content || '';
    console.log('✅ Response received from OpenAI.');
    try {
        const parsedResult = JSON.parse(content);
        if (!Array.isArray(parsedResult)) {
            throw new Error('OpenAI response is not a JSON array');
        }
        const validated = [];
        for (const item of parsedResult) {
            const result = TransactionSchema.safeParse(item);
            if (!result.success) {
                console.warn('⚠️ Skipping invalid transaction:', result.error.format());
                continue;
            }
            validated.push(result.data);
        }
        return validated;
    }
    catch (error) {
        console.error('❌ Failed to parse or validate OpenAI response:', error);
        throw new Error('OpenAI returned invalid JSON or structure');
    }
}
//# sourceMappingURL=extract-transaction-details.js.map