import assert from 'node:assert/strict';

import {
  completeYearMonthSuffix,
  normalizePozivNaBroj,
} from '../extract-transaction-details';

function withFixedDate<T>(isoDate: string, fn: () => T): T {
  const RealDate = Date;
class MockDate extends Date {
  constructor(...args: any[]) {
      if (args.length === 0) {
        super(isoDate);
      } else {
        super(...(args as ConstructorParameters<typeof Date>));
      }
    }

    static now() {
      return new RealDate(isoDate).getTime();
    }
  }

  (globalThis as any).Date = MockDate as typeof Date;
  try {
    return fn();
  } finally {
    (globalThis as any).Date = RealDate;
  }
}

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✅ ${name}`);
  } catch (error) {
    console.error(`❌ ${name}`);
    throw error;
  }
}

test('normalizes dashed references that spill the month digits onto the next line', () => {
  const raw = `(00)      
11-202-113-2025
11
87000150860`;
  const normalized = normalizePozivNaBroj(raw, '03.11.2025');
  assert.equal(normalized, '11-202-113-202511');
});

test('rebuilds dashed references when only digits remain', () => {
  const raw = '(00)         1121214220251 1';
  const normalized = normalizePozivNaBroj(raw, '03.11.2025');
  assert.equal(normalized, '11-212-142-202511');
});

test('completeYearMonthSuffix uses the booking date month when suffix is just the year', () => {
  const result = completeYearMonthSuffix('2025', '', '03.11.2025');
  assert.equal(result, '202511');
});

test('completeYearMonthSuffix falls back to booking date month when only a single month digit is present', () => {
  const result = completeYearMonthSuffix('20251', '', '03.11.2025');
  assert.equal(result, '202511');
});

test('completeYearMonthSuffix uses trailing digits to fill the suffix when available', () => {
  const result = completeYearMonthSuffix('2025', '1187001508606072', '03.11.2025');
  assert.equal(result, '202511');
});

test('completeYearMonthSuffix falls back to the current month when booking date is missing', () => {
  const result = withFixedDate('2025-11-15T10:00:00Z', () =>
    completeYearMonthSuffix('2025', '', undefined),
  );
  assert.equal(result, '202511');
});

console.log('All reference normalizer tests passed.');
