/* eslint-disable @typescript-eslint/no-require-imports */
const axios = require('axios');

const API_KEY = 'a0d601be40ab985e269fa28916b1d724';
const GENERATE_URL = 'https://api.kie.ai/api/v1/veo/generate';
const RECORD_URL = 'https://api.kie.ai/api/v1/veo/record-info';

const testPayload = {
  prompt: "A dog playing in a park",
  imageUrls: [],
  model: "veo3_fast",
  aspectRatio: "16:9",
  enableFallback: false,
  enableTranslation: true
};

console.log('\n⚠️  注意: 此测试使用空图片URL进行纯文本生成\n');

async function testVideoGeneration() {
  try {
    console.log('='.repeat(80));
    console.log('==================== 测试图生视频 API ====================');
    console.log('='.repeat(80));
    console.log('\n【步骤1】发送生成请求');
    console.log('请求 URL:', GENERATE_URL);
    console.log('请求方法: POST');
    console.log('请求头:', {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY.slice(0, 8)}...${API_KEY.slice(-4)}`
    });
    console.log('请求体:', JSON.stringify(testPayload, null, 2));

    let generateResponse;
    let retries = 3;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`\n尝试第 ${attempt} 次请求...`);
        generateResponse = await axios.post(GENERATE_URL, testPayload, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_KEY}`,
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive'
          },
          timeout: 900000
        });
        console.log('✅ 请求成功');
        break;
      } catch (err) {
        console.log(`❌ 第 ${attempt} 次请求失败:`, err.code || err.message);
        if (attempt < retries) {
          console.log(`等待 ${attempt * 2} 秒后重试...`);
          await new Promise(resolve => setTimeout(resolve, attempt * 2000));
        } else {
          throw err;
        }
      }
    }

    console.log('\n【步骤1】响应结果:');
    console.log(JSON.stringify(generateResponse.data, null, 2));

    const taskId = generateResponse.data?.data?.taskId;
    if (!taskId) {
      throw new Error('未获取到 taskId');
    }

    console.log(`\n✅ 成功获取 taskId: ${taskId}`);

    console.log('\n' + '='.repeat(80));
    console.log('【步骤2】轮询查询结果');
    console.log('='.repeat(80));

    const pollUrl = `${RECORD_URL}?taskId=${taskId}`;
    console.log('轮询 URL:', pollUrl);

    let pollCount = 0;
    const maxPolls = 120;
    const pollInterval = 5000;

    while (pollCount < maxPolls) {
      pollCount++;
      console.log(`\n-------------------- 第 ${pollCount} 次轮询 --------------------`);

      await new Promise(resolve => setTimeout(resolve, pollInterval));

      const pollResponse = await axios.get(pollUrl, {
        headers: {
          'Authorization': `Bearer ${API_KEY}`
        }
      });

      console.log('轮询响应:', JSON.stringify(pollResponse.data, null, 2));

      if (pollResponse.data?.code !== 200) {
        console.log('⏳ code != 200，继续等待...');
        continue;
      }

      const data = pollResponse.data.data;
      if (data.successFlag === 1) {
        console.log('\n✅ 视频生成成功！');
        console.log('视频链接:', data.response?.resultUrls);
        console.log('\n' + '='.repeat(80));
        console.log('==================== 测试完成 ====================');
        console.log('='.repeat(80));
        return;
      }

      if (data.errorMessage) {
        throw new Error(`API 错误: ${data.errorMessage}`);
      }

      console.log('⏳ 仍在处理中，继续轮询...');
    }

    throw new Error('轮询超时');
  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    if (error.response) {
      console.error('响应状态:', error.response.status);
      console.error('响应数据:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

testVideoGeneration();
