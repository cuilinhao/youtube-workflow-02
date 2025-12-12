import Papa from 'papaparse';
import { videoCsvColumns, normalizeVideoCsvHeader } from './csvSchemaVideo';
import type { SubmitPayload } from '../types/provider';

export type CsvRecord = SubmitPayload & {
  id: string;
  note?: string;
  fallback_model?: string;
};

export function parseVideoCsv(text: string): CsvRecord[] {
  const { data, errors } = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: true,
  });

  if (errors.length) {
    const first = errors[0];
    throw new Error(first.message || 'CSV 解析失败');
  }

  const rows = data.filter((row) => Array.isArray(row) && row.length > 0) as string[][];
  if (rows.length <= 1) {
    return [];
  }

  const headerRow = rows[0];
  const columnMap = headerRow.map(normalizeVideoCsvHeader);

  return rows.slice(1).map((row, rowIndex) => {
    const record: Partial<CsvRecord> = {
      extra: {},
    };

    headerRow.forEach((originalHeader, colIndex) => {
      const value = row[colIndex]?.trim() ?? '';
      const mapped = columnMap[colIndex];
      if (!mapped) {
        record.extra = {
          ...(record.extra as Record<string, unknown>),
          [originalHeader]: value,
        };
        return;
      }

      switch (mapped) {
        case 'id':
          record.id = value || `row_${rowIndex + 1}`;
          break;
        case 'prompt':
          record.prompt = value;
          break;
        case 'image_url':
          record.imageUrl = value;
          break;
        case 'ratio':
          record.ratio = value as CsvRecord['ratio'];
          break;
        case 'seed':
          record.seed = value ? Number.parseInt(value, 10) : undefined;
          break;
        case 'watermark':
          record.watermark = value;
          break;
        case 'callback_url':
          record.callbackUrl = value;
          break;
        case 'translate':
          record.translate = value as CsvRecord['translate'];
          break;
        case 'fallback_model':
          record.extra = { ...(record.extra as Record<string, unknown>), fallback_model: value };
          break;
        case 'note':
          record.extra = { ...(record.extra as Record<string, unknown>), note: value };
          break;
        default:
          break;
      }
    });

    if (!record.id) {
      record.id = `row_${rowIndex + 1}`;
    }

    return record as CsvRecord;
  });
}

export function serializeVideoCsv(records: CsvRecord[]): string {
  const header = [...videoCsvColumns];

  const rows = records.map((record) => {
    const row: Record<string, string | number | undefined> = {};
    header.forEach((column) => {
      switch (column) {
        case 'id':
          row[column] = record.id;
          break;
        case 'prompt':
          row[column] = record.prompt;
          break;
        case 'image_url':
          row[column] = record.imageUrl;
          break;
        case 'ratio':
          row[column] = record.ratio;
          break;
        case 'seed':
          row[column] = record.seed;
          break;
        case 'watermark':
          row[column] = record.watermark;
          break;
        case 'callback_url':
          row[column] = record.callbackUrl;
          break;
        case 'translate':
          row[column] = record.translate;
          break;
        case 'fallback_model':
          row[column] = (record.extra as Record<string, unknown> | undefined)?.fallback_model as
            | string
            | undefined;
          break;
        case 'note':
          row[column] = (record.extra as Record<string, unknown> | undefined)?.note as string | undefined;
          break;
        default:
          break;
      }
    });
    return row;
  });

  return Papa.unparse({
    fields: header,
    data: rows,
  });
}
