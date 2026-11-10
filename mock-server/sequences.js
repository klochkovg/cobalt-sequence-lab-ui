// Sequence parsing and statistics for the mock Cobalt API.
// Deliberately small: enough to give believable answers, not a Biopython replacement.
import { gunzipSync } from 'node:zlib';

export const WARNING_KINDS = [
  'duplicate_id',
  'empty_sequence',
  'invalid_characters',
  'undefined_sequence',
];

const WARNING_MESSAGES = {
  duplicate_id: 'duplicate ID',
  empty_sequence: 'empty sequence',
  invalid_characters: 'invalid characters',
  undefined_sequence: 'undefined sequence',
};

export const UNRECOGNIZED_FORMAT_MESSAGE =
  "unrecognized format, expected FASTA (starts with '>'), GenBank (starts with 'LOCUS'), " +
  "FASTQ (starts with '@'), PDB (starts with a record name like 'HEADER' or 'ATOM') " +
  "or mmCIF (starts with 'data_')";

/** Error whose message is shown to the user as a 422 string `detail`. */
export class CobaltError extends Error {}

const PDB_RECORD_NAMES = [
  'HEADER',
  'OBSLTE',
  'TITLE',
  'SPLIT',
  'CAVEAT',
  'COMPND',
  'SOURCE',
  'KEYWDS',
  'EXPDTA',
  'NUMMDL',
  'MDLTYP',
  'AUTHOR',
  'REVDAT',
  'SPRSDE',
  'JRNL',
  'REMARK',
  'DBREF',
  'SEQRES',
  'HET',
  'HELIX',
  'SHEET',
  'CRYST1',
  'ORIGX1',
  'SCALE1',
  'MODEL',
  'ATOM',
  'HETATM',
];

const DNA_STRICT = new Set('ACGT');
const RNA_STRICT = new Set('ACGU');
const NUCLEOTIDE_AMBIGUOUS = new Set('RYSWKMBDHVN');
const PROTEIN_STRICT = new Set('ACDEFGHIKLMNPQRSTVWY');
const PROTEIN_AMBIGUOUS = new Set('BZXJUO');

const THREE_TO_ONE = {
  ALA: 'A',
  ARG: 'R',
  ASN: 'N',
  ASP: 'D',
  CYS: 'C',
  GLN: 'Q',
  GLU: 'E',
  GLY: 'G',
  HIS: 'H',
  ILE: 'I',
  LEU: 'L',
  LYS: 'K',
  MET: 'M',
  PHE: 'F',
  PRO: 'P',
  SER: 'S',
  THR: 'T',
  TRP: 'W',
  TYR: 'Y',
  VAL: 'V',
  SEC: 'U',
  PYL: 'O',
  MSE: 'M',
};

// ---------------------------------------------------------------------------
// Decoding and format detection
// ---------------------------------------------------------------------------

/**
 * Decompress (if needed) and decode an uploaded file.
 * @param {Uint8Array} bytes
 * @param {string} fileName
 * @returns {{ text: string, compression: 'gzip' | 'bzip2' | null }}
 */
export function decodeUpload(bytes, fileName) {
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    try {
      return { text: new TextDecoder().decode(gunzipSync(bytes)), compression: 'gzip' };
    } catch (err) {
      throw new CobaltError(`${fileName}: could not decompress gzip: ${err.message}`);
    }
  }
  if (bytes.length >= 3 && bytes[0] === 0x42 && bytes[1] === 0x5a && bytes[2] === 0x68) {
    throw new CobaltError(`${fileName}: bzip2 input is not supported by the mock server`);
  }
  return { text: new TextDecoder().decode(bytes), compression: null };
}

/**
 * Detect the input format from the content. Returns null for an empty file.
 * @param {string} text
 * @returns {'fasta'|'genbank'|'fastq'|'pdb-atom'|'cif-atom'|null|undefined}
 *   `undefined` means "not empty, but not recognized".
 */
export function detectFormat(text) {
  const trimmed = text.replace(/^\s+/, '');
  if (trimmed === '') return null;
  if (trimmed.startsWith('>')) return 'fasta';
  if (trimmed.startsWith('LOCUS')) return 'genbank';
  if (trimmed.startsWith('@')) {
    const lines = trimmed.split(/\r?\n/);
    if (lines.length >= 3 && lines[2].startsWith('+')) return 'fastq';
    return undefined;
  }
  if (trimmed.startsWith('data_')) return 'cif-atom';
  const firstWord = trimmed.slice(0, 6).trim();
  if (PDB_RECORD_NAMES.includes(firstWord)) return 'pdb-atom';
  return undefined;
}

// ---------------------------------------------------------------------------
// Parsers. Each returns an array of "raw records":
// { id, description, sequence: string|null, length, qualities: number[]|null,
//   organism, molecule_type, topology, feature_count, annotatedType }
// ---------------------------------------------------------------------------

function baseRecord(overrides) {
  return {
    id: '',
    description: '',
    sequence: '',
    length: 0,
    qualities: null,
    organism: null,
    molecule_type: null,
    topology: null,
    feature_count: 0,
    annotatedType: null,
    ...overrides,
  };
}

function splitHeader(header) {
  const match = /^(\S*)\s*(.*)$/.exec(header.trim());
  return { id: match[1], description: match[2].trim() };
}

function parseFasta(text) {
  const records = [];
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('>')) {
      current = { ...splitHeader(line.slice(1)), parts: [] };
      records.push(current);
    } else if (current) {
      current.parts.push(line.replace(/\s+/g, ''));
    } else if (line.trim() !== '') {
      throw new Error('sequence data before the first header');
    }
  }
  return records.map(({ id, description, parts }) => {
    const sequence = parts.join('');
    return baseRecord({ id, description, sequence, length: sequence.length });
  });
}

function parseFastq(text) {
  const lines = text.split(/\r?\n/);
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
  const records = [];
  for (let i = 0; i < lines.length; i += 4) {
    const [header, seq = '', plus, qual = ''] = lines.slice(i, i + 4);
    if (!header.startsWith('@'))
      throw new Error(`record ${records.length + 1}: header must start with '@'`);
    if (plus === undefined || !plus.startsWith('+')) {
      throw new Error(`record ${records.length + 1}: missing '+' separator line`);
    }
    if (seq.length !== qual.length) {
      throw new Error(`record ${records.length + 1}: sequence and quality lengths differ`);
    }
    const qualities = [...qual].map((c) => c.charCodeAt(0) - 33);
    records.push(
      baseRecord({ ...splitHeader(header.slice(1)), sequence: seq, length: seq.length, qualities }),
    );
  }
  return records;
}

function parseGenbank(text) {
  const chunks = text.split(/^\/\/\s*$/m).filter((chunk) => chunk.trim() !== '');
  return chunks.map((chunk) => {
    const lines = chunk.replace(/^\s+/, '').split(/\r?\n/);
    const locus = lines[0];
    if (!locus.startsWith('LOCUS')) throw new Error('record does not start with LOCUS');
    const tokens = locus.split(/\s+/).slice(1);
    const name = tokens[0] ?? '';
    const unitIndex = tokens.findIndex((t) => t === 'bp' || t === 'aa');
    const locusLength = unitIndex > 0 ? Number(tokens[unitIndex - 1]) : 0;
    const isProtein = tokens[unitIndex] === 'aa';
    const rest = unitIndex >= 0 ? tokens.slice(unitIndex + 1) : [];
    const topology = rest.find((t) => t === 'linear' || t === 'circular') ?? null;
    const moleculeType = isProtein ? 'protein' : (rest.find((t) => /(DNA|RNA)/i.test(t)) ?? null);

    let id = name;
    let definition = '';
    let organism = null;
    let featureCount = 0;
    let inFeatures = false;
    let inDefinition = false;
    let sequenceParts = null;
    for (const line of lines.slice(1)) {
      if (sequenceParts) {
        sequenceParts.push(line.replace(/[\d\s]/g, ''));
        continue;
      }
      const key = line.slice(0, 12).trim();
      if (line.startsWith('ORIGIN')) {
        sequenceParts = [];
        continue;
      }
      if (/^[A-Z]/.test(line)) {
        inFeatures = line.startsWith('FEATURES');
        inDefinition = line.startsWith('DEFINITION');
      }
      if (inDefinition) {
        definition += ' ' + line.slice(12).trim();
      } else if (key === 'VERSION') {
        id = line.slice(12).trim().split(/\s+/)[0] || id;
      } else if (key === 'ORGANISM') {
        organism = line.slice(12).trim();
      } else if (inFeatures && /^ {5}\S/.test(line)) {
        featureCount += 1;
      }
    }
    definition = definition.trim().replace(/\.$/, '');
    const sequence = sequenceParts ? sequenceParts.join('').toUpperCase() : null;
    return baseRecord({
      id,
      description: definition,
      sequence,
      length: sequence !== null ? sequence.length : locusLength,
      organism,
      molecule_type: moleculeType,
      topology,
      feature_count: featureCount,
      annotatedType: annotatedTypeOf(moleculeType),
    });
  });
}

function annotatedTypeOf(moleculeType) {
  if (!moleculeType) return null;
  if (moleculeType === 'protein') return 'protein';
  if (/RNA/i.test(moleculeType)) return 'RNA';
  if (/DNA/i.test(moleculeType)) return 'DNA';
  return null;
}

function chainsToRecords(structureId, chains) {
  if (chains.size === 0) throw new Error('no ATOM records with CA atoms found');
  return [...chains].map(([chain, residues]) => {
    const sequence = residues.join('');
    return baseRecord({
      id: `${structureId}:${chain}`,
      description: '',
      sequence,
      length: sequence.length,
      annotatedType: 'protein',
    });
  });
}

function parsePdb(text) {
  let structureId = '????';
  const chains = new Map();
  const seen = new Set();
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('HEADER') && line.length >= 66) {
      structureId = line.slice(62, 66).trim() || structureId;
    }
    if (line.startsWith('ENDMDL')) break; // first model only
    if (!line.startsWith('ATOM')) continue;
    const atomName = line.slice(12, 16).trim();
    if (atomName !== 'CA') continue;
    const resName = line.slice(17, 20).trim();
    const chain = line.slice(21, 22).trim() || 'A';
    const resKey = `${chain}|${line.slice(22, 27)}`;
    if (seen.has(resKey)) continue;
    seen.add(resKey);
    if (!chains.has(chain)) chains.set(chain, []);
    chains.get(chain).push(THREE_TO_ONE[resName] ?? 'X');
  }
  return chainsToRecords(structureId, chains);
}

function parseCif(text) {
  const lines = text.split(/\r?\n/);
  const structureId = lines[0].trim().slice('data_'.length) || '????';
  const columns = [];
  const chains = new Map();
  const seen = new Set();
  let inAtomSite = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('_atom_site.')) {
      inAtomSite = true;
      columns.push(trimmed.slice('_atom_site.'.length).split(/\s+/)[0]);
      continue;
    }
    if (!inAtomSite || columns.length === 0) continue;
    if (
      trimmed === '' ||
      trimmed === '#' ||
      trimmed.startsWith('loop_') ||
      trimmed.startsWith('_')
    ) {
      if (chains.size > 0 || trimmed.startsWith('_') || trimmed.startsWith('loop_'))
        inAtomSite = false;
      continue;
    }
    const values = trimmed.split(/\s+/);
    const get = (name) => values[columns.indexOf(name)];
    if (get('group_PDB') !== 'ATOM') continue;
    if ((get('label_atom_id') ?? get('auth_atom_id'))?.replace(/"/g, '') !== 'CA') continue;
    const modelNum = get('pdbx_PDB_model_num');
    if (modelNum !== undefined && modelNum !== '1') continue;
    const chain = get('auth_asym_id') ?? get('label_asym_id') ?? 'A';
    const resKey = `${chain}|${get('auth_seq_id') ?? get('label_seq_id')}`;
    if (seen.has(resKey)) continue;
    seen.add(resKey);
    if (!chains.has(chain)) chains.set(chain, []);
    chains.get(chain).push(THREE_TO_ONE[get('label_comp_id') ?? get('auth_comp_id')] ?? 'X');
  }
  return chainsToRecords(structureId, chains);
}

const PARSERS = {
  fasta: parseFasta,
  fastq: parseFastq,
  genbank: parseGenbank,
  'pdb-atom': parsePdb,
  'cif-atom': parseCif,
};

/**
 * Parse an uploaded file into raw records.
 * @param {Uint8Array} bytes
 * @param {string} fileName
 */
export function readFile(bytes, fileName) {
  const { text, compression } = decodeUpload(bytes, fileName);
  const format = detectFormat(text);
  if (format === undefined) throw new CobaltError(`${fileName}: ${UNRECOGNIZED_FORMAT_MESSAGE}`);
  if (format === null) return { file: fileName, format: null, compression, records: [] };
  try {
    return { file: fileName, format, compression, records: PARSERS[format](text) };
  } catch (err) {
    throw new CobaltError(`${fileName}: could not parse ${format}: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

/** Guess the molecule type from sequence letters. */
export function guessMoleculeType(sequence) {
  const letters = (sequence ?? '').toUpperCase().replace(/[^A-Z]/g, '');
  if (letters === '') return 'unknown';
  const isNucleotide = [...letters].every(
    (c) => DNA_STRICT.has(c) || c === 'U' || NUCLEOTIDE_AMBIGUOUS.has(c),
  );
  if (isNucleotide) {
    // Mostly ambiguity codes (e.g. "NNNN" is fine, "BDHV" looks like protein): require some strict bases.
    const strict = [...letters].filter((c) => DNA_STRICT.has(c) || c === 'U').length;
    if (strict / letters.length >= 0.5 || /^N+$/.test(letters)) {
      return letters.includes('U') && !letters.includes('T') ? 'RNA' : 'DNA';
    }
  }
  const isProtein = [...letters].every((c) => PROTEIN_STRICT.has(c) || PROTEIN_AMBIGUOUS.has(c));
  return isProtein ? 'protein' : 'unknown';
}

function alphabetFor(type) {
  switch (type) {
    case 'DNA':
      return { strict: DNA_STRICT, ambiguous: NUCLEOTIDE_AMBIGUOUS };
    case 'RNA':
      return { strict: RNA_STRICT, ambiguous: NUCLEOTIDE_AMBIGUOUS };
    case 'protein':
      return { strict: PROTEIN_STRICT, ambiguous: PROTEIN_AMBIGUOUS };
    default:
      return null;
  }
}

/** GC fraction like Biopython's gc_fraction(ambiguous="remove"). */
export function gcFraction(sequence) {
  let gc = 0;
  let total = 0;
  for (const c of sequence.toUpperCase()) {
    if (c === 'G' || c === 'C' || c === 'S') {
      gc += 1;
      total += 1;
    } else if (c === 'A' || c === 'T' || c === 'U' || c === 'W') {
      total += 1;
    }
  }
  return total === 0 ? 0 : gc / total;
}

/** Character composition of a sequence for a given molecule type. */
export function composition(sequence, type) {
  if (sequence === null) {
    return { alphabetic_class: 'unknown', ambiguity_fraction: null, invalid_char_count: null };
  }
  const alphabet = alphabetFor(type);
  if (sequence.length === 0) {
    return { alphabetic_class: 'unknown', ambiguity_fraction: 0, invalid_char_count: 0 };
  }
  if (!alphabet) {
    return { alphabetic_class: 'unknown', ambiguity_fraction: null, invalid_char_count: null };
  }
  let ambiguous = 0;
  let invalid = 0;
  for (const c of sequence.toUpperCase()) {
    if (alphabet.strict.has(c)) continue;
    if (alphabet.ambiguous.has(c)) ambiguous += 1;
    else invalid += 1;
  }
  const alphabetic_class = invalid > 0 ? 'invalid' : ambiguous > 0 ? 'ambiguous' : 'unambiguous';
  return {
    alphabetic_class,
    ambiguity_fraction: ambiguous / sequence.length,
    invalid_char_count: invalid,
  };
}

/** Phred quality summary; all null when there are no qualities. */
export function qualityStats(qualities) {
  if (!qualities) return { mean_quality: null, min_quality: null, q30_fraction: null };
  if (qualities.length === 0) return { mean_quality: null, min_quality: null, q30_fraction: null };
  const sum = qualities.reduce((a, b) => a + b, 0);
  return {
    mean_quality: sum / qualities.length,
    min_quality: Math.min(...qualities),
    q30_fraction: qualities.filter((q) => q >= 30).length / qualities.length,
  };
}

/** Compute all derived values for one raw record. */
export function analyzeRecord(raw) {
  const type = raw.annotatedType ?? guessMoleculeType(raw.sequence);
  const comp = composition(raw.sequence, type);
  const isNucleotide = type === 'DNA' || type === 'RNA';
  return {
    type,
    gc_fraction: raw.sequence !== null && isNucleotide ? gcFraction(raw.sequence) : null,
    ...comp,
    ...qualityStats(raw.qualities),
  };
}

/** QC warnings for a list of raw records. */
export function collectWarnings(records) {
  const warnings = [];
  const seen = new Set();
  for (const raw of records) {
    const add = (kind) =>
      warnings.push({ record_id: raw.id, kind, message: WARNING_MESSAGES[kind] });
    if (seen.has(raw.id)) add('duplicate_id');
    seen.add(raw.id);
    if (raw.sequence === null) {
      add('undefined_sequence');
    } else if (raw.length === 0) {
      add('empty_sequence');
    } else if (analyzeRecord(raw).invalid_char_count > 0) {
      add('invalid_characters');
    }
  }
  return warnings;
}

export function countWarnings(warnings) {
  const counts = Object.fromEntries(WARNING_KINDS.map((kind) => [kind, 0]));
  for (const w of warnings) counts[w.kind] += 1;
  return counts;
}

// ---------------------------------------------------------------------------
// Report builders
// ---------------------------------------------------------------------------

export function inspectRecord(raw) {
  const a = analyzeRecord(raw);
  return {
    id: raw.id,
    length: raw.length,
    sequence: raw.sequence,
    gc_fraction: a.gc_fraction,
    type: a.type,
    molecule_type: raw.molecule_type,
    description: raw.description,
    organism: raw.organism,
    mean_quality: a.mean_quality,
    min_quality: a.min_quality,
    q30_fraction: a.q30_fraction,
  };
}

export function buildInspectReport(parsed, { overviewOnly = false, limit = null } = {}) {
  const { records } = parsed;
  const lengths = records.map((r) => r.length);
  const typeCounts = {};
  for (const raw of records) {
    const { type } = analyzeRecord(raw);
    typeCounts[type] = (typeCounts[type] ?? 0) + 1;
  }
  const warnings = collectWarnings(records);
  const listed = overviewOnly ? [] : limit === null ? records : records.slice(0, limit);
  return {
    file: parsed.file,
    records_num: records.length,
    format: parsed.format,
    compression: parsed.compression,
    min_length: lengths.length ? Math.min(...lengths) : null,
    max_length: lengths.length ? Math.max(...lengths) : null,
    mean_length: lengths.length ? lengths.reduce((a, b) => a + b, 0) / lengths.length : null,
    molecule_types: Object.fromEntries(Object.entries(typeCounts).sort((a, b) => b[1] - a[1])),
    warning_counts: countWarnings(warnings),
    warnings,
    records: listed.map(inspectRecord),
  };
}

export function buildQcReport(parsed) {
  const warnings = collectWarnings(parsed.records);
  return {
    file: parsed.file,
    records_num: parsed.records.length,
    format: parsed.format,
    compression: parsed.compression,
    passed: warnings.length === 0,
    warning_counts: countWarnings(warnings),
    warnings,
  };
}

export function statsRow(raw, sourceFormat, sourceFile) {
  const a = analyzeRecord(raw);
  return {
    id: raw.id,
    length: raw.length,
    description: raw.description,
    gc_fraction: a.gc_fraction,
    type: a.type,
    source_format: sourceFormat,
    source_file: sourceFile,
    alphabetic_class: a.alphabetic_class,
    ambiguity_fraction: a.ambiguity_fraction,
    invalid_char_count: a.invalid_char_count,
    organism: raw.organism,
    molecule_type: raw.molecule_type,
    topology: raw.topology,
    feature_count: raw.feature_count,
    mean_quality: a.mean_quality,
    min_quality: a.min_quality,
    q30_fraction: a.q30_fraction,
  };
}

export const SORT_KEYS = [
  'id',
  'length',
  'gc_fraction',
  'ambiguity_fraction',
  'invalid_char_count',
  'mean_quality',
  'q30_fraction',
];

/** Stable sort; null values always go last. */
export function sortRows(rows, key, desc = false) {
  const indexed = rows.map((row, index) => ({ row, index }));
  indexed.sort((a, b) => {
    const va = a.row[key];
    const vb = b.row[key];
    if (va === null && vb === null) return a.index - b.index;
    if (va === null) return 1;
    if (vb === null) return -1;
    let cmp = typeof va === 'string' ? (va < vb ? -1 : va > vb ? 1 : 0) : va - vb;
    if (desc) cmp = -cmp;
    return cmp !== 0 ? cmp : a.index - b.index;
  });
  return indexed.map(({ row }) => row);
}

// ---------------------------------------------------------------------------
// Normalize writers
// ---------------------------------------------------------------------------

function wrap(sequence, width) {
  const lines = [];
  for (let i = 0; i < sequence.length; i += width) lines.push(sequence.slice(i, i + width));
  return lines;
}

function header(raw) {
  return raw.description ? `${raw.id} ${raw.description}` : raw.id;
}

export const OUTPUT_FORMATS = ['fasta', 'genbank', 'fastq'];

/**
 * Write normalized records in the requested format.
 * @throws {CobaltError} when a record cannot be written
 */
export function writeRecords(parsed, format) {
  const fail = (reason) => {
    throw new CobaltError(`${parsed.file}: could not write ${format}: ${reason}`);
  };
  let out = '';
  for (const raw of parsed.records) {
    if (raw.sequence === null) fail(`record ${raw.id} has an undefined sequence`);
    const seq = raw.sequence.toUpperCase();
    if (format === 'fasta') {
      out += `>${header(raw)}\n${wrap(seq, 60)
        .map((l) => l + '\n')
        .join('')}`;
    } else if (format === 'fastq') {
      if (!raw.qualities) continue;
      const qual = raw.qualities.map((q) => String.fromCharCode(Math.min(q, 93) + 33)).join('');
      out += `@${header(raw)}\n${seq}\n+\n${qual}\n`;
    } else {
      const { type } = analyzeRecord(raw);
      const unit = type === 'protein' ? 'aa' : 'bp';
      const mol = type === 'protein' ? '' : (raw.molecule_type ?? (type === 'RNA' ? 'RNA' : 'DNA'));
      const name = raw.id.split('.')[0].slice(0, 16);
      out += `LOCUS       ${name.padEnd(16)} ${String(seq.length).padStart(11)} ${unit}    ${mol.padEnd(6)}  ${(raw.topology ?? 'linear').padEnd(8)} UNK 01-JAN-1980\n`;
      out += `DEFINITION  ${raw.description || '.'}\n`;
      out += `ACCESSION   ${raw.id.split('.')[0]}\n`;
      out += `VERSION     ${raw.id}\n`;
      out += `KEYWORDS    .\n`;
      out += `SOURCE      ${raw.organism ?? '.'}\n`;
      out += `  ORGANISM  ${raw.organism ?? '.'}\n`;
      out += `            .\n`;
      out += `FEATURES             Location/Qualifiers\n`;
      out += `ORIGIN\n`;
      const lower = seq.toLowerCase();
      for (let i = 0; i < lower.length; i += 60) {
        const groups = wrap(lower.slice(i, i + 60), 10).join(' ');
        out += `${String(i + 1).padStart(9)} ${groups}\n`;
      }
      out += '//\n';
    }
  }
  return out;
}
