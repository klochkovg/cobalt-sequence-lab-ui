// @vitest-environment node
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  CobaltError,
  buildInspectReport,
  collectWarnings,
  composition,
  detectFormat,
  gcFraction,
  guessMoleculeType,
  qualityStats,
  readFile,
  sortRows,
  writeRecords,
} from '../sequences.js';

const encode = (text) => new TextEncoder().encode(text);

const FASTQ =
  '@read1 high quality\nACGTACGTAC\n+\nIIIIIIIIII\n@read2 low quality, lowercase\nacgtnacgta\n+\n!!!!!+++++\n';

const GENBANK = `LOCUS       Z78533                   740 bp    DNA     linear   PLN 30-NOV-2006
DEFINITION  C.irapeanum 5.8S rRNA gene and ITS1 and ITS2 DNA.
ACCESSION   Z78533
VERSION     Z78533.1
SOURCE      Cypripedium irapeanum
  ORGANISM  Cypripedium irapeanum
            Eukaryota; Viridiplantae.
FEATURES             Location/Qualifiers
     source          1..12
     misc_feature    1..12
ORIGIN
        1 cgtaacaagg tt
//
`;

const PDB = `HEADER    PLANT PROTEIN                           30-APR-81   1CRN
ATOM      1  N   THR A   1      17.047  14.099   3.625  1.00 13.79           N
ATOM      2  CA  THR A   1      16.967  12.784   4.338  1.00 10.80           C
ATOM      3  CA  THR A   2      16.967  12.784   4.338  1.00 10.80           C
ATOM      4  CA  CYS B   1      16.967  12.784   4.338  1.00 10.80           C
END
`;

const CIF = `data_1ABC
loop_
_atom_site.group_PDB
_atom_site.id
_atom_site.label_atom_id
_atom_site.label_comp_id
_atom_site.auth_asym_id
_atom_site.auth_seq_id
ATOM 1 N GLY A 1
ATOM 2 CA GLY A 1
ATOM 3 CA ALA A 2
#
`;

describe('detectFormat', () => {
  it.each([
    ['>a\nACGT', 'fasta'],
    [GENBANK, 'genbank'],
    [FASTQ, 'fastq'],
    [PDB, 'pdb-atom'],
    ['ATOM      1  CA  GLY A   1', 'pdb-atom'],
    [CIF, 'cif-atom'],
    ['', null],
    ['  \n\n', null],
    ['hello world', undefined],
    ['@not\nfastq', undefined],
  ])('detects %#', (text, expected) => {
    expect(detectFormat(text)).toBe(expected);
  });
});

describe('readFile', () => {
  it('parses FASTA headers and multi-line sequences', () => {
    const parsed = readFile(encode('>a first one\nACG\nTT\n>b\n\n'), 'x.fa');
    expect(parsed.format).toBe('fasta');
    expect(parsed.records.map((r) => [r.id, r.description, r.sequence])).toEqual([
      ['a', 'first one', 'ACGTT'],
      ['b', '', ''],
    ]);
  });

  it('parses FASTQ qualities', () => {
    const { records } = readFile(encode(FASTQ), 'sample.fastq');
    expect(records).toHaveLength(2);
    expect(records[0].qualities).toEqual(Array(10).fill(40));
    expect(records[1].description).toBe('low quality, lowercase');
  });

  it('parses GenBank annotations', () => {
    const [record] = readFile(encode(GENBANK), 'ls_orchid.gbk').records;
    expect(record).toMatchObject({
      id: 'Z78533.1',
      description: 'C.irapeanum 5.8S rRNA gene and ITS1 and ITS2 DNA',
      sequence: 'CGTAACAAGGTT',
      length: 12,
      organism: 'Cypripedium irapeanum',
      molecule_type: 'DNA',
      topology: 'linear',
      feature_count: 2,
    });
  });

  it('gives GenBank records without ORIGIN a null sequence and the LOCUS length', () => {
    const text = GENBANK.replace(/ORIGIN[\s\S]*?\/\//, '//');
    const [record] = readFile(encode(text), 'wgs.gbk').records;
    expect(record.sequence).toBeNull();
    expect(record.length).toBe(740);
  });

  it('gives one protein record per PDB chain', () => {
    const { records } = readFile(encode(PDB), '1crn.pdb');
    expect(records.map((r) => [r.id, r.sequence])).toEqual([
      ['1CRN:A', 'TT'],
      ['1CRN:B', 'C'],
    ]);
  });

  it('gives one protein record per mmCIF chain', () => {
    const { records } = readFile(encode(CIF), '1abc.cif');
    expect(records.map((r) => [r.id, r.sequence])).toEqual([['1ABC:A', 'GA']]);
  });

  it('decompresses gzip input', () => {
    const parsed = readFile(gzipSync(encode('>a\nACGT\n')), 'x.fa.gz');
    expect(parsed.compression).toBe('gzip');
    expect(parsed.records[0].sequence).toBe('ACGT');
  });

  it('rejects unrecognized and broken files with a user-facing message', () => {
    expect(() => readFile(encode('hello'), 'notes.txt')).toThrow(CobaltError);
    expect(() => readFile(encode('hello'), 'notes.txt')).toThrow(
      /^notes\.txt: unrecognized format/,
    );
    expect(() => readFile(encode('@r\nACGT\n+\nII\n'), 'bad.fq')).toThrow(/could not parse fastq/);
  });

  it('returns no records for an empty file', () => {
    expect(readFile(encode(''), 'empty.fa')).toEqual({
      file: 'empty.fa',
      format: null,
      compression: null,
      records: [],
    });
  });
});

describe('statistics', () => {
  it('guesses molecule types', () => {
    expect(guessMoleculeType('ACGTN')).toBe('DNA');
    expect(guessMoleculeType('ACGUU')).toBe('RNA');
    expect(guessMoleculeType('MKVLAEFW')).toBe('protein');
    expect(guessMoleculeType('')).toBe('unknown');
  });

  it('computes GC fraction ignoring ambiguity codes', () => {
    expect(gcFraction('acgtnacgta')).toBeCloseTo(4 / 9);
    expect(gcFraction('')).toBe(0);
  });

  it('classifies the alphabet', () => {
    expect(composition('ACGT', 'DNA').alphabetic_class).toBe('unambiguous');
    expect(composition('ACGTNACGTA', 'DNA')).toEqual({
      alphabetic_class: 'ambiguous',
      ambiguity_fraction: 0.1,
      invalid_char_count: 0,
    });
    expect(composition('AC-GT', 'DNA')).toMatchObject({
      alphabetic_class: 'invalid',
      invalid_char_count: 1,
    });
    expect(composition(null, 'DNA')).toEqual({
      alphabetic_class: 'unknown',
      ambiguity_fraction: null,
      invalid_char_count: null,
    });
  });

  it('summarizes qualities', () => {
    expect(qualityStats([0, 10, 30, 40])).toEqual({
      mean_quality: 20,
      min_quality: 0,
      q30_fraction: 0.5,
    });
    expect(qualityStats(null)).toEqual({
      mean_quality: null,
      min_quality: null,
      q30_fraction: null,
    });
  });

  it('collects QC warnings', () => {
    const { records } = readFile(encode('>a\nACGT\n>a\nAC-T\n>b\n'), 'bad.fa');
    expect(collectWarnings(records)).toEqual([
      { record_id: 'a', kind: 'duplicate_id', message: 'duplicate ID' },
      { record_id: 'a', kind: 'invalid_characters', message: 'invalid characters' },
      { record_id: 'b', kind: 'empty_sequence', message: 'empty sequence' },
    ]);
  });

  it('builds an inspect report', () => {
    const report = buildInspectReport(readFile(encode(FASTQ), 'sample.fastq'), { limit: 1 });
    expect(report).toMatchObject({
      records_num: 2,
      format: 'fastq',
      min_length: 10,
      max_length: 10,
      mean_length: 10,
      molecule_types: { DNA: 2 },
    });
    expect(report.records).toHaveLength(1);
  });

  it('sorts stably with nulls last in both directions', () => {
    const rows = [
      { id: 'a', v: null },
      { id: 'b', v: 2 },
      { id: 'c', v: 1 },
      { id: 'd', v: 2 },
    ];
    expect(sortRows(rows, 'v').map((r) => r.id)).toEqual(['c', 'b', 'd', 'a']);
    expect(sortRows(rows, 'v', true).map((r) => r.id)).toEqual(['b', 'd', 'c', 'a']);
  });
});

describe('writeRecords', () => {
  const parsed = readFile(encode(FASTQ), 'sample.fastq');

  it('writes uppercase FASTA', () => {
    expect(writeRecords(parsed, 'fasta')).toBe(
      '>read1 high quality\nACGTACGTAC\n>read2 low quality, lowercase\nACGTNACGTA\n',
    );
  });

  it('round-trips FASTQ', () => {
    expect(writeRecords(parsed, 'fastq')).toBe(FASTQ.replace('acgtnacgta', 'ACGTNACGTA'));
  });

  it('writes GenBank', () => {
    const out = writeRecords(parsed, 'genbank');
    expect(out).toMatch(/^LOCUS {7}read1 /);
    expect(out).toContain('        1 acgtacgtac\n//\n');
  });

  it('skips records without qualities for FASTQ', () => {
    expect(writeRecords(readFile(encode('>a\nACGT\n'), 'x.fa'), 'fastq')).toBe('');
  });
});
