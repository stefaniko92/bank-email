#!/usr/bin/env node
/**
 * Minimal TypeScript test runner that transpiles `.ts` imports on the fly.
 * Usage: node scripts/run-ts-tests.js path/to/test.ts
 */

const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const Module = require('module');

const projectRoot = process.cwd();

// Support the "@/..." alias used throughout the app.
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function patchedResolve(request, parent, isMain, options) {
  if (request.startsWith('@/')) {
    const resolved = path.join(projectRoot, 'src', request.slice(2));
    return originalResolveFilename.call(this, resolved, parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const compilerOptions = {
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2020,
  esModuleInterop: true,
  moduleResolution: ts.ModuleResolutionKind.NodeJs,
  jsx: ts.JsxEmit.React,
};

require.extensions['.ts'] = function registerTsExtension(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions,
    fileName: filename,
  });
  return module._compile(outputText, filename);
};

const testFile =
  process.argv[2] ?? 'src/ai/flows/__tests__/reference-normalizer.test.ts';
const resolvedTest = path.resolve(projectRoot, testFile);
require(resolvedTest);
