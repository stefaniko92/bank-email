import assert from 'node:assert/strict';

import { chunkText } from '../extract-transaction-details';

const SAMPLE_TEXT = `
First entry header
11-111-111-2025
123
03.11.2025 /
03.11.2025
details
1
Second entry header
22-222-222-2025
456
03.11.2025 /
03.11.2025
details
2
Third entry header
33-333-333-2025
789
03.11.2025 /
03.11.2025
details
3
Fourth entry header
44-444-444-2025
012
03.11.2025 /
03.11.2025
details
4
`.trim();

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✅ ${name}`);
  } catch (error) {
    console.error(`❌ ${name}`);
    throw error;
  }
}

test('chunkText keeps transaction boundaries intact', () => {
  const chunks = chunkText(SAMPLE_TEXT, 60);
  assert(chunks.length > 1);
  for (let i = 0; i < chunks.length - 1; i++) {
    assert(
      /\n\d+\n$/.test(chunks[i]),
      `Chunk ${i} should end with transaction number but ended with: ${JSON.stringify(
        chunks[i].slice(-10),
      )}`,
    );
  }
});

console.log('chunking tests passed.');
