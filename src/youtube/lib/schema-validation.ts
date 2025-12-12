// JSON Schema 验证工具
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ShotPrompt Schema
export const ShotPromptSchema = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ShotPromptArray",
  "type": "array",
  "minItems": 1,
  "items": {
    "type": "object",
    "additionalProperties": false,
    "required": ["shot_id", "image_prompt"],
    "properties": {
      "shot_id": { 
        "type": "string", 
        "pattern": "^shot_[0-9]{3,}$" 
      },
      "image_prompt": { 
        "type": "string", 
        "minLength": 10, 
        "maxLength": 4000 
      }
    }
  }
};

// GeneratedImage Schema
export const GeneratedImageSchema = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "GeneratedImageArray",
  "type": "array",
  "items": {
    "type": "object",
    "additionalProperties": false,
    "required": ["shot_id", "url", "source"],
    "properties": {
      "shot_id": { 
        "type": "string", 
        "pattern": "^shot_[0-9]{3,}$|^shot_upload_[0-9]{3,}$" 
      },
      "url": { 
        "type": "string", 
        "format": "uri" 
      },
      "source": { 
        "type": "string", 
        "enum": ["generated", "uploaded"] 
      }
    }
  }
};

// VideoPrompt Schema
export const VideoPromptSchema = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "VideoPromptArray",
  "type": "array",
  "minItems": 1,
  "items": {
    "type": "object",
    "additionalProperties": false,
    "required": ["shot_id", "image_prompt"],
    "properties": {
      "shot_id": { 
        "type": "string", 
        "pattern": "^shot_[0-9]{3,}$" 
      },
      "image_prompt": { 
        "type": "string", 
        "minLength": 6, 
        "maxLength": 1000 
      }
    }
  }
};

// 简单的Schema验证函数
export function validateShotPrompts(data: unknown): ValidationResult {
  const errors: string[] = [];

  if (!Array.isArray(data)) {
    errors.push('数据必须是数组');
    return { valid: false, errors };
  }

  if (data.length === 0) {
    errors.push('数组不能为空');
    return { valid: false, errors };
  }

  (data as unknown[]).forEach((item, index) => {
    if (typeof item !== 'object' || item === null) {
      errors.push(`第${index + 1}项必须是对象`);
      return;
    }
    const record = item as Record<string, unknown>;

    // 检查必需字段
    const shotId = record.shot_id;
    if (!shotId) {
      errors.push(`第${index + 1}项缺少shot_id字段`);
    } else if (typeof shotId !== 'string') {
      errors.push(`第${index + 1}项的shot_id必须是字符串`);
    } else if (!/^shot_[0-9]{3,}$/.test(shotId)) {
      errors.push(`第${index + 1}项的shot_id格式不正确，应为shot_001格式`);
    }

    const imagePrompt = record.image_prompt;
    if (!imagePrompt) {
      errors.push(`第${index + 1}项缺少image_prompt字段`);
    } else if (typeof imagePrompt !== 'string') {
      errors.push(`第${index + 1}项的image_prompt必须是字符串`);
    } else if (imagePrompt.length < 10) {
      errors.push(`第${index + 1}项的image_prompt长度不能少于10个字符`);
    } else if (imagePrompt.length > 4000) {
      errors.push(`第${index + 1}项的image_prompt长度不能超过4000个字符`);
    }

    // 检查额外字段
    const allowedFields = ['shot_id', 'image_prompt'];
    const extraFields = Object.keys(record).filter(key => !allowedFields.includes(key));
    if (extraFields.length > 0) {
      errors.push(`第${index + 1}项包含不允许的字段: ${extraFields.join(', ')}`);
    }
  });

  return { valid: errors.length === 0, errors };
}

export function validateGeneratedImages(data: unknown): ValidationResult {
  const errors: string[] = [];

  if (!Array.isArray(data)) {
    errors.push('数据必须是数组');
    return { valid: false, errors };
  }

  (data as unknown[]).forEach((item, index) => {
    if (typeof item !== 'object' || item === null) {
      errors.push(`第${index + 1}项必须是对象`);
      return;
    }
    const record = item as Record<string, unknown>;

    // 检查必需字段
    const shotId = record.shot_id;
    if (!shotId) {
      errors.push(`第${index + 1}项缺少shot_id字段`);
    } else if (typeof shotId !== 'string') {
      errors.push(`第${index + 1}项的shot_id必须是字符串`);
    } else if (!/^shot_[0-9]{3,}$|^shot_upload_[0-9]{3,}$/.test(shotId)) {
      errors.push(`第${index + 1}项的shot_id格式不正确`);
    }

    const url = record.url;
    if (!url) {
      errors.push(`第${index + 1}项缺少url字段`);
    } else if (typeof url !== 'string') {
      errors.push(`第${index + 1}项的url必须是字符串`);
    } else if (!isValidUrl(url)) {
      errors.push(`第${index + 1}项的url格式不正确`);
    }

    const source = record.source;
    if (!source) {
      errors.push(`第${index + 1}项缺少source字段`);
    } else if (typeof source !== 'string' || !['generated', 'uploaded'].includes(source)) {
      errors.push(`第${index + 1}项的source必须是'generated'或'uploaded'`);
    }

    // 检查额外字段
    const allowedFields = ['shot_id', 'url', 'source'];
    const extraFields = Object.keys(record).filter(key => !allowedFields.includes(key));
    if (extraFields.length > 0) {
      errors.push(`第${index + 1}项包含不允许的字段: ${extraFields.join(', ')}`);
    }
  });

  return { valid: errors.length === 0, errors };
}

export function validateVideoPrompts(data: unknown): ValidationResult {
  const errors: string[] = [];

  if (!Array.isArray(data)) {
    errors.push('数据必须是数组');
    return { valid: false, errors };
  }

  if (data.length === 0) {
    errors.push('数组不能为空');
    return { valid: false, errors };
  }

  (data as unknown[]).forEach((item, index) => {
    if (typeof item !== 'object' || item === null) {
      errors.push(`第${index + 1}项必须是对象`);
      return;
    }
    const record = item as Record<string, unknown>;

    // 检查必需字段
    const shotId = record.shot_id;
    if (!shotId) {
      errors.push(`第${index + 1}项缺少shot_id字段`);
    } else if (typeof shotId !== 'string') {
      errors.push(`第${index + 1}项的shot_id必须是字符串`);
    } else if (!/^shot_[0-9]{3,}$/.test(shotId)) {
      errors.push(`第${index + 1}项的shot_id格式不正确，应为shot_001格式`);
    }

    const imagePrompt = record.image_prompt;
    if (!imagePrompt) {
      errors.push(`第${index + 1}项缺少image_prompt字段`);
    } else if (typeof imagePrompt !== 'string') {
      errors.push(`第${index + 1}项的image_prompt必须是字符串`);
    } else if (imagePrompt.length < 6) {
      errors.push(`第${index + 1}项的image_prompt长度不能少于6个字符`);
    } else if (imagePrompt.length > 1000) {
      errors.push(`第${index + 1}项的image_prompt长度不能超过1000个字符`);
    }

    // 检查额外字段
    const allowedFields = ['shot_id', 'image_prompt'];
    const extraFields = Object.keys(record).filter(key => !allowedFields.includes(key));
    if (extraFields.length > 0) {
      errors.push(`第${index + 1}项包含不允许的字段: ${extraFields.join(', ')}`);
    }
  });

  return { valid: errors.length === 0, errors };
}

function isValidUrl(string: string): boolean {
  try {
    new URL(string);
    return true;
  } catch {
    return false;
  }
}

