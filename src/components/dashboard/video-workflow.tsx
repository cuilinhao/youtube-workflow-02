'use client';

import { useState, useCallback, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Play, 
  Upload, 
  Download, 
  Copy, 
  Trash2, 
  RotateCcw, 
  RefreshCw,
  FileText,
  Image as ImageIcon,
  Video,
  CheckCircle,
  XCircle,
  AlertCircle
} from 'lucide-react';
import { 
  ShotPrompt, 
  GeneratedImage, 
  VideoPrompt, 
  ApiError,
  ShotPromptsResponse,
  BatchImagesResponse,
  UploadResponse,
  ReorderResponse,
  VideoPromptsResponse
} from '@/lib/types';

interface WorkflowStep {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed' | 'error';
  data?: unknown;
}

export function VideoWorkflow() {
  const [script, setScript] = useState('');
  const [steps, setSteps] = useState<WorkflowStep[]>([
    { id: 'script', title: '输入脚本', description: '输入故事脚本', status: 'pending' },
    { id: 'shots', title: '生成分镜', description: 'AI 生成分镜 JSON', status: 'pending' },
    { id: 'images', title: '批量出图', description: '生成图片（Mock）', status: 'pending' },
    { id: 'edit', title: '编辑排序', description: '拖拽排序、上传补图', status: 'pending' },
    { id: 'video-prompts', title: '视频提示词', description: '生成图生视频提示词', status: 'pending' },
    { id: 'export', title: '导出结果', description: '导出 JSON/CSV', status: 'pending' }
  ]);
  
  const [shotPrompts, setShotPrompts] = useState<ShotPrompt[]>([]);
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [videoPrompts, setVideoPrompts] = useState<VideoPrompt[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [maxRetries] = useState(3);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateStepStatus = useCallback((stepId: string, status: WorkflowStep['status'], data?: unknown) => {
    setSteps(prev =>
      prev.map(step =>
        step.id === stepId
          ? { ...step, status, data }
          : step
      )
    );
  }, []);

  const applyReorderResult = useCallback((data: ReorderResponse) => {
    setImages(data.images);
    let updatedShots: ShotPrompt[] | null = null;
    setShotPrompts(prev => {
      const next = prev.map(shot => {
        const newId = data.mapping[shot.shot_id];
        return newId ? { ...shot, shot_id: newId } : shot;
      });
      updatedShots = next;
      return next;
    });
    if (updatedShots) {
      updateStepStatus('shots', 'completed', updatedShots);
    }
    setVideoPrompts(prev => (prev.length > 0 ? [] : prev));
    updateStepStatus('images', 'completed', data.images);
    updateStepStatus('edit', 'pending');
    updateStepStatus('video-prompts', 'pending');
    updateStepStatus('export', 'pending');
  }, [updateStepStatus]);

  const requestReorder = useCallback(async (payloadImages: GeneratedImage[]) => {
    const response = await fetch('/api/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images: payloadImages })
    });

    if (!response.ok) {
      const error: ApiError = await response.json();
      throw new Error(error.hint);
    }

    const data: ReorderResponse = await response.json();
    applyReorderResult(data);
    return data;
  }, [applyReorderResult]);

  const ensureSequentialImages = useCallback(async (): Promise<GeneratedImage[]> => {
    const sequential = images.every(
      (image, index) => image.shot_id === `shot_${(index + 1).toString().padStart(3, '0')}`
    );
    if (sequential) {
      return images;
    }
    const data = await requestReorder(images);
    return data.images;
  }, [images, requestReorder]);

  const retryWithBackoff = async <T,>(
    operation: () => Promise<T>,
    operationName: string,
    maxRetries: number = 3
  ): Promise<T> => {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          // 指数退避：200ms * 1.6^attempt，最大5秒
          const delay = Math.min(200 * Math.pow(1.6, attempt - 1), 5000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        const result = await operation();
        setRetryCount(0); // 成功后重置重试计数
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('未知错误');
        
        if (attempt === maxRetries) {
          throw lastError;
        }
        
        setRetryCount(attempt + 1);
        console.warn(`${operationName} 第${attempt + 1}次尝试失败，${attempt < maxRetries ? '准备重试' : '已达到最大重试次数'}:`, lastError.message);
      }
    }
    
    throw lastError;
  };

  const handleGenerateShots = async () => {
    if (!script.trim()) {
      setError('请输入故事脚本');
      return;
    }

    setIsLoading(true);
    setError(null);
    updateStepStatus('shots', 'in-progress');

    try {
      const data = await retryWithBackoff(
        async () => {
          const response = await fetch('/api/shot-prompts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ script })
          });

          if (!response.ok) {
            const error: ApiError = await response.json();
            throw new Error(error.hint);
          }

          return await response.json() as ShotPromptsResponse;
        },
        '生成分镜'
      );

      setShotPrompts(data.shots);
      updateStepStatus('shots', 'completed', data.shots);
      updateStepStatus('images', 'pending');
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成分镜失败');
      updateStepStatus('shots', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateImages = async () => {
    if (shotPrompts.length === 0) {
      setError('请先生成分镜');
      return;
    }

    setIsLoading(true);
    setError(null);
    updateStepStatus('images', 'in-progress');

    try {
      const data = await retryWithBackoff(
        async () => {
          const response = await fetch('/api/images/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              shots: shotPrompts, 
              aspectRatio: '9:16' 
            })
          });

          if (!response.ok) {
            const error: ApiError = await response.json();
            throw new Error(error.hint);
          }

          return await response.json() as BatchImagesResponse;
        },
        '批量出图'
      );

      setImages(data.images);
      updateStepStatus('images', 'completed', data.images);
      updateStepStatus('edit', 'pending');
    } catch (err) {
      setError(err instanceof Error ? err.message : '批量出图失败');
      updateStepStatus('images', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageUpload = async (files: FileList) => {
    const uploadPromises = Array.from(files).map(async (file) => {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const error: ApiError = await response.json();
        throw new Error(error.hint);
      }

      return (await response.json() as UploadResponse).image;
    });

    try {
      const uploadedImages = await Promise.all(uploadPromises);
      setImages(prev => [...prev, ...uploadedImages]);
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败');
    }
  };

  const handleReorder = async () => {
    if (images.length === 0) {
      setError('没有图片需要重排');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await requestReorder(images);
    } catch (err) {
      setError(err instanceof Error ? err.message : '重排失败');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateVideoPrompts = async () => {
    if (images.length === 0) {
      setError('请先生成或上传图片');
      return;
    }

    setIsLoading(true);
    setError(null);
    updateStepStatus('video-prompts', 'in-progress');

    try {
      const orderedImages = await ensureSequentialImages();

      const data = await retryWithBackoff(
        async () => {
          const response = await fetch('/api/video-prompts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              script, 
              images: orderedImages.map(img => ({ shot_id: img.shot_id, url: img.url }))
            })
          });

          if (!response.ok) {
            const error: ApiError = await response.json();
            throw new Error(error.hint);
          }

          return await response.json() as VideoPromptsResponse;
        },
        '生成视频提示词'
      );

      setVideoPrompts(data.prompts);
      updateStepStatus('video-prompts', 'completed', data.prompts);
      updateStepStatus('export', 'pending');
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成视频提示词失败');
      updateStepStatus('video-prompts', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleMoveImage = (fromIndex: number, toIndex: number) => {
    setImages(prev => {
      const newImages = [...prev];
      const [movedImage] = newImages.splice(fromIndex, 1);
      newImages.splice(toIndex, 0, movedImage);
      return newImages;
    });
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== dropIndex) {
      handleMoveImage(draggedIndex, dropIndex);
    }
    setDraggedIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const exportToJSON = () => {
    const data = {
      script,
      shotPrompts,
      images,
      videoPrompts
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `video-workflow-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const exportToCSV = (type: 'shots' | 'video-prompts') => {
    let csvContent = '';
    let filename = '';

    if (type === 'shots' && shotPrompts.length > 0) {
      // CSV-A: 分镜 → 文生图
      csvContent = 'shot_id,image_prompt,aspect\n';
      shotPrompts.forEach(shot => {
        const escapedPrompt = shot.image_prompt.replace(/"/g, '""');
        csvContent += `"${shot.shot_id}","${escapedPrompt}","9:16"\n`;
      });
      filename = `shots-${new Date().toISOString().split('T')[0]}.csv`;
    } else if (type === 'video-prompts' && videoPrompts.length > 0) {
      // CSV-B: 图生视频
      csvContent = 'shot_id,image_prompt\n';
      videoPrompts.forEach(prompt => {
        const escapedPrompt = prompt.image_prompt.replace(/"/g, '""');
        csvContent += `"${prompt.shot_id}","${escapedPrompt}"\n`;
      });
      filename = `video-prompts-${new Date().toISOString().split('T')[0]}.csv`;
    }

    if (csvContent) {
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const importFromCSV = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;

      try {
        const lines = text.split('\n').filter(line => line.trim());
        if (lines.length < 2) {
          setError('CSV文件格式不正确');
          return;
        }

        const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
        const isShotsCSV = headers.includes('image_prompt') && headers.includes('shot_id');
        const isVideoPromptsCSV = headers.includes('image_prompt') && headers.includes('shot_id') && headers.length === 2;

        if (isShotsCSV) {
          const shots: ShotPrompt[] = [];
          for (let i = 1; i < lines.length; i++) {
            const values = parseCSVLine(lines[i]);
            if (values.length >= 2) {
              shots.push({
                shot_id: values[0],
                image_prompt: values[1]
              });
            }
          }
          if (shots.length > 0) {
            setShotPrompts(shots);
            updateStepStatus('shots', 'completed', shots);
            updateStepStatus('images', 'pending');
          }
        } else if (isVideoPromptsCSV) {
          const prompts: VideoPrompt[] = [];
          for (let i = 1; i < lines.length; i++) {
            const values = parseCSVLine(lines[i]);
            if (values.length >= 2) {
              prompts.push({
                shot_id: values[0],
                image_prompt: values[1]
              });
            }
          }
          if (prompts.length > 0) {
            setVideoPrompts(prompts);
            updateStepStatus('video-prompts', 'completed', prompts);
            updateStepStatus('export', 'pending');
          }
        } else {
          setError('CSV文件格式不支持，请使用正确的分镜或视频提示词CSV格式');
        }
      } catch {
        setError('CSV文件解析失败');
      }
    };
    reader.readAsText(file);
  };

  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++; // 跳过下一个引号
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
  };

  const getStepIcon = (status: WorkflowStep['status']) => {
    switch (status) {
      case 'completed': return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'in-progress': return <RefreshCw className="h-5 w-5 text-blue-500 animate-spin" />;
      case 'error': return <XCircle className="h-5 w-5 text-red-500" />;
      default: return <div className="h-5 w-5 rounded-full border-2 border-gray-300" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* 工作流步骤指示器 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Video className="h-5 w-5" />
            视频生成工作流
          </CardTitle>
          <CardDescription>
            从文本脚本到视频提示词的完整工作流程
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {steps.map((step) => (
              <div key={step.id} className="flex flex-col items-center space-y-2">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-100">
                  {getStepIcon(step.status)}
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium">{step.title}</p>
                  <p className="text-xs text-gray-500">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* CSV导入功能 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            CSV导入/导出
          </CardTitle>
          <CardDescription>
            支持从现有CSV文件导入分镜或视频提示词，或导出当前数据为CSV格式
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Button 
              variant="outline"
              onClick={() => document.getElementById('csv-import')?.click()}
            >
              <Upload className="mr-2 h-4 w-4" />
              导入CSV
            </Button>
            <input
              id="csv-import"
              type="file"
              accept=".csv"
              onChange={importFromCSV}
              className="hidden"
            />
            <Button 
              variant="outline"
              onClick={() => exportToCSV('shots')}
              disabled={shotPrompts.length === 0}
            >
              <Download className="mr-2 h-4 w-4" />
              导出分镜CSV
            </Button>
            <Button 
              variant="outline"
              onClick={() => exportToCSV('video-prompts')}
              disabled={videoPrompts.length === 0}
            >
              <Download className="mr-2 h-4 w-4" />
              导出视频提示词CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 错误提示 */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error}
            {retryCount > 0 && (
              <div className="mt-2 text-sm">
                重试次数: {retryCount}/{maxRetries}
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* 重试提示 */}
      {retryCount > 0 && retryCount < maxRetries && (
        <Alert>
          <RefreshCw className="h-4 w-4 animate-spin" />
          <AlertDescription>
            正在重试操作... ({retryCount}/{maxRetries})
          </AlertDescription>
        </Alert>
      )}

      {/* 步骤1: 脚本输入 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            步骤1: 输入故事脚本
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="script">故事脚本</Label>
            <Textarea
              id="script"
              placeholder="请输入您的故事脚本..."
              value={script}
              onChange={(e) => setScript(e.target.value)}
              className="min-h-[200px]"
              maxLength={4000}
            />
            <p className="text-sm text-gray-500 mt-1">
              {script.length}/4000 字符
            </p>
          </div>
          <Button 
            onClick={handleGenerateShots}
            disabled={!script.trim() || isLoading}
            className="w-full"
          >
            <Play className="mr-2 h-4 w-4" />
            生成分镜
          </Button>
        </CardContent>
      </Card>

      {/* 步骤2: 分镜预览 */}
      {shotPrompts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              步骤2: 分镜预览 ({shotPrompts.length} 个镜头)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {shotPrompts.map((shot, index) => (
                <div key={shot.shot_id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="outline">{shot.shot_id}</Badge>
                    <span className="text-sm text-gray-500">镜头 {index + 1}</span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{shot.image_prompt}</p>
                </div>
              ))}
              <div className="flex gap-2">
                <Button 
                  onClick={handleGenerateImages}
                  disabled={isLoading}
                  className="flex-1"
                >
                  <ImageIcon className="mr-2 h-4 w-4" />
                  批量生成图片 (Mock)
                </Button>
                <Button 
                  onClick={() => exportToCSV('shots')}
                  variant="outline"
                  disabled={shotPrompts.length === 0}
                >
                  <Download className="mr-2 h-4 w-4" />
                  导出CSV
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 步骤3: 图片网格 */}
      {images.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5" />
              步骤3: 图片编辑 ({images.length} 张图片)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  上传补图
                </Button>
                <Button 
                  variant="outline" 
                  onClick={handleReorder}
                  disabled={isLoading}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  重排编号
                </Button>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {images.map((image, index) => (
                  <div 
                    key={`${image.shot_id}-${index}`} 
                    className={`relative group cursor-move transition-all duration-200 ${
                      draggedIndex === index ? 'opacity-50 scale-95' : ''
                    }`}
                    draggable
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, index)}
                    onDragEnd={handleDragEnd}
                  >
                    <div className="aspect-[9/16] bg-gray-100 rounded-lg overflow-hidden border-2 border-transparent hover:border-blue-300 transition-colors">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img 
                        src={image.url} 
                        alt={image.shot_id}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="absolute top-2 left-2">
                      <Badge variant={image.source === 'generated' ? 'default' : 'secondary'}>
                        {image.source === 'generated' ? 'AI生成' : '上传'}
                      </Badge>
                    </div>
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDeleteImage(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="absolute bottom-2 left-2 right-2">
                      <p className="text-xs text-white bg-black bg-opacity-50 px-2 py-1 rounded">
                        {image.shot_id}
                      </p>
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="bg-blue-500 text-white px-3 py-1 rounded-full text-sm font-medium">
                        拖拽排序
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <Button 
                onClick={handleGenerateVideoPrompts}
                disabled={isLoading}
                className="w-full"
              >
                <Video className="mr-2 h-4 w-4" />
                生成视频提示词
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 步骤4: 视频提示词 */}
      {videoPrompts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Video className="h-5 w-5" />
              步骤4: 视频提示词 ({videoPrompts.length} 个)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {videoPrompts.map((prompt, index) => (
                <div key={prompt.shot_id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="outline">{prompt.shot_id}</Badge>
                    <span className="text-sm text-gray-500">镜头 {index + 1}</span>
                  </div>
                  <p className="text-sm">{prompt.image_prompt}</p>
                </div>
              ))}
              
              <div className="flex flex-wrap gap-2">
                <Button 
                  onClick={() => copyToClipboard(JSON.stringify(videoPrompts, null, 2))}
                  variant="outline"
                >
                  <Copy className="mr-2 h-4 w-4" />
                  复制JSON
                </Button>
                <Button 
                  onClick={exportToJSON}
                  variant="outline"
                >
                  <Download className="mr-2 h-4 w-4" />
                  下载JSON
                </Button>
                <Button 
                  onClick={() => exportToCSV('video-prompts')}
                  variant="outline"
                >
                  <Download className="mr-2 h-4 w-4" />
                  导出CSV
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 隐藏的文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*"
        onChange={(e) => e.target.files && handleImageUpload(e.target.files)}
        className="hidden"
      />
    </div>
  );
}
