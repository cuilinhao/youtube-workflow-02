import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('批量图生视频任务创建', () => {
  test.beforeEach(async ({ page }) => {
    // 访问批量图生视频页面
    await page.goto('/?tab=image-to-video', { waitUntil: 'domcontentloaded' });

    // 等待右侧表单出现
    await page.waitForSelector('text=新建图生视频任务', { timeout: 60000 });
  });

  test('上传2个图片应该创建2个任务', async ({ page }) => {
    // 设置控制台监听，捕获调试日志
    const consoleLogs: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'log' && msg.text().includes('[VideoTaskBoard]')) {
        consoleLogs.push(msg.text());
      }
    });

    // 准备文件路径
    const file1 = path.join(process.cwd(), 'public', 'test', '女人miya.png');
    const file2 = path.join(process.cwd(), 'public', 'test', '女医生rumi.png');

    console.log('文件路径1:', file1);
    console.log('文件路径2:', file2);

    // 找到"添加单张图片"按钮并点击两次，分别上传两个文件
    // 注意：有两个input，第一个是文件夹上传，第二个是单张图片上传
    const singleImageInput = page.locator('input[type="file"]:not([multiple])');

    // 上传第一个文件
    await singleImageInput.setInputFiles(file1);
    await page.waitForTimeout(3000); // 等待上传

    // 上传第二个文件
    await singleImageInput.setInputFiles(file2);
    await page.waitForTimeout(3000); // 等待上传

    // 检查右侧表单是否显示了行（包括默认空行）
    const rows = page.locator('table tbody tr');
    const rowCount = await rows.count();
    console.log('表单中的行数:', rowCount);

    // 应该有3行（1个默认空行 + 2个上传的图片）
    expect(rowCount).toBe(3);

    // 填写提示词（只填第一行，让第二行使用同一个提示词）
    const firstPromptInput = page.locator('textarea').first();
    await firstPromptInput.fill('测试提示词：美女在海边');

    // 点击添加任务按钮
    const submitButton = page.locator('button:has-text("添加任务")');
    await submitButton.click();

    // 等待提交完成
    await page.waitForTimeout(2000);

    // 打印控制台日志
    console.log('\\n===== 控制台日志 =====');
    consoleLogs.forEach(log => console.log(log));
    console.log('======================\\n');

    // 检查左侧任务列表
    const taskRows = page.locator('.shadow-sm.border.border-slate-200').first().locator('table tbody tr');
    const taskCount = await taskRows.count();

    console.log('任务列表中的任务数量:', taskCount);

    // 应该有2个任务
    expect(taskCount).toBeGreaterThanOrEqual(2);

    // 检查任务编号
    const taskNumbers = await taskRows.locator('td:nth-child(2)').allTextContents();
    console.log('任务编号:', taskNumbers);

    // 截图保存结果
    await page.screenshot({ path: 'test-results/batch-video-tasks.png', fullPage: true });
  });
});
