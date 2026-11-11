import { parseCsv, toCsv } from './csv';

describe('CSV import helpers', () => {
  it('parses quoted fields and ignores empty trailing rows', () => {
    expect(parseCsv('studentNo,fullName\r\nS-1,"Nair, Priya"\r\n')).toEqual({
      headers: ['studentNo', 'fullName'],
      rows: [{ studentNo: 'S-1', fullName: 'Nair, Priya' }],
    });
  });

  it('escapes text when creating an export', () => {
    expect(toCsv(['name'], [{ name: 'Nair, "Priya"' }])).toBe('name\r\n"Nair, ""Priya"""');
  });
});
