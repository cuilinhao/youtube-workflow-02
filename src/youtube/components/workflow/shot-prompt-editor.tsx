'use client';

import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { ShotPrompt } from '@youtube/lib/types';
import { FileSpreadsheet, FileJson, PlusCircle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface ShotPromptEditorProps {
  value: ShotPrompt[];
  onChange: (shots: ShotPrompt[]) => void;
  title?: string;
  description?: string;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function normalizeShotsFromCsv(text: string): ShotPrompt[] {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) {
    throw new Error('CSV 文件内容为空');
  }

  const headers = lines[0].split(',').map((header) => header.replace(/"/g, '').trim().toLowerCase());
  const indexShotId = headers.indexOf('shot_id');
  const indexPrompt = headers.indexOf('image_prompt');

  if (indexShotId === -1 || indexPrompt === -1) {
    throw new Error('CSV 文件缺少 shot_id 或 image_prompt 列');
  }

  const shots: ShotPrompt[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const values = parseCSVLine(lines[i]);
    const shotId = values[indexShotId];
    const prompt = values[indexPrompt];
    if (!shotId || !prompt) continue;
    shots.push({ shot_id: shotId, image_prompt: prompt });
  }
  return shots;
}

function normalizeShotsFromJson(text: string): ShotPrompt[] {
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) {
    return parsed
      .map((item) =>
        typeof item === 'object' && item
          ? { shot_id: String(item.shot_id ?? ''), image_prompt: String(item.image_prompt ?? '') }
          : null,
      )
      .filter((item): item is ShotPrompt => Boolean(item?.shot_id && item.image_prompt));
  }
  if (typeof parsed === 'object' && parsed && Array.isArray(parsed.shots)) {
    return normalizeShotsFromJson(JSON.stringify(parsed.shots));
  }
  throw new Error('JSON 文件格式不正确，应为数组或 { shots: [...] }');
}

export function ShotPromptEditor({ value, onChange, title, description }: ShotPromptEditorProps) {
  const csvInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);

  const handleAddShot = () => {
    const next = [
      ...value,
      {
        shot_id: `shot_${(value.length + 1).toString().padStart(3, '0')}`,
        image_prompt: '',
      },
    ];
    onChange(next);
  };

  const handleUpdate = (index: number, field: keyof ShotPrompt, newValue: string) => {
    const next = value.map((item, idx) =>
      idx === index ? { ...item, [field]: newValue } : item,
    );
    onChange(next);
  };

  const handleRemove = (index: number) => {
    const next = value.filter((_, idx) => idx !== index);
    onChange(next);
  };

  const handleCsvImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const shots = normalizeShotsFromCsv(text);
      if (!shots.length) {
        toast.error('CSV 未解析到有效分镜');
        return;
      }
      onChange(shots);
      toast.success(`已导入 ${shots.length} 条分镜`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '导入 CSV 失败');
    } finally {
      event.target.value = '';
    }
  };

  const handleJsonImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const shots = normalizeShotsFromJson(text);
      if (!shots.length) {
        toast.error('JSON 未解析到有效分镜');
        return;
      }
      onChange(shots);
      toast.success(`已导入 ${shots.length} 条分镜`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '导入 JSON 失败');
    } finally {
      event.target.value = '';
    }
  };

  return (
    <Card>
      <input ref={csvInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleCsvImport} />
      <input ref={jsonInputRef} type="file" accept=".json,application/json" className="hidden" onChange={handleJsonImport} />
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            {title ? <h3 className="text-lg font-semibold text-slate-800">{title}</h3> : null}
            {description ? <p className="text-sm text-slate-500">{description}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => csvInputRef.current?.click()}>
              <FileSpreadsheet className="mr-2 h-4 w-4" /> 导入 CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => jsonInputRef.current?.click()}>
              <FileJson className="mr-2 h-4 w-4" /> 导入 JSON
            </Button>
            <Button size="sm" onClick={handleAddShot}>
              <PlusCircle className="mr-2 h-4 w-4" /> 新增分镜
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          {value.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              暂无分镜，请导入或手动添加。
            </div>
          ) : (
            value.map((shot, index) => (
              <div key={`${shot.shot_id}-${index}`} className="rounded-lg border border-slate-200 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`shot-id-${index}`} className="text-sm font-medium text-slate-600">
                      镜头 ID
                    </Label>
                    <Input
                      id={`shot-id-${index}`}
                      value={shot.shot_id}
                      onChange={(event) => handleUpdate(index, 'shot_id', event.target.value)}
                      className="w-40"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-rose-600 hover:text-rose-700"
                    onClick={() => handleRemove(index)}
                    disabled={value.length === 1}
                  >
                    <Trash2 className="mr-2 h-4 w-4" /> 删除
                  </Button>
                </div>
                <div>
                  <Label htmlFor={`shot-prompt-${index}`} className="mb-2 block text-sm text-slate-600">
                    分镜提示词
                  </Label>
                  <Textarea
                    id={`shot-prompt-${index}`}
                    value={shot.image_prompt}
                    onChange={(event) => handleUpdate(index, 'image_prompt', event.target.value)}
                    rows={4}
                    placeholder="请输入分镜描述..."
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
