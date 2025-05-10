"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseMultipartForm = parseMultipartForm;
const formidable_1 = require("formidable");
const fs_1 = __importDefault(require("fs"));
const stream_1 = require("stream");
async function parseMultipartForm(request) {
    return new Promise((resolve, reject) => {
        const parsedFields = {};
        const parsedFiles = {};
        const form = new formidable_1.IncomingForm({ keepExtensions: true, multiples: true });
        const stream = new stream_1.Readable();
        stream.push(request.rawBody);
        stream.push(null);
        stream.headers = request.headers;
        form.parse(stream, (err, fields, files) => {
            if (err)
                return reject(err);
            Object.entries(fields).forEach(([key, value]) => {
                parsedFields[key] = Array.isArray(value) ? value[0] : value;
            });
            Object.entries(files).forEach(([key, fileOrArray]) => {
                const file = Array.isArray(fileOrArray) ? fileOrArray[0] : fileOrArray;
                if (file && 'filepath' in file) {
                    try {
                        const buffer = fs_1.default.readFileSync(file.filepath);
                        parsedFiles[key] = {
                            buffer,
                            mimetype: typeof file.mimetype === 'string' ? file.mimetype : 'application/octet-stream',
                            filename: typeof file.originalFilename === 'string'
                                ? file.originalFilename
                                : typeof file.newFilename === 'string'
                                    ? file.newFilename
                                    : 'unknown'
                        };
                    }
                    catch (readErr) {
                        console.error(`❌ Failed to read file ${key} from disk:`, readErr);
                    }
                }
            });
            resolve({ fields: parsedFields, files: parsedFiles });
        });
    });
}
//# sourceMappingURL=multipart-form.js.map