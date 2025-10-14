import { NextResponse } from 'next/server';
import { promisify } from 'util';
import { execFile } from 'child_process';
import os from 'os';

const execFileAsync = promisify(execFile);

async function pickFolder(): Promise<string | null> {
  const platform = os.platform();

  if (platform === 'darwin') {
    const script = `
      set theFolder to choose folder with prompt "请选择存放图生视频的文件夹"
      POSIX path of theFolder
    `;
    const { stdout } = await execFileAsync('osascript', ['-e', script]);
    const result = stdout.trim();
    return result ? result.replace(/\/+$/, '') : null;
  }

  if (platform === 'win32') {
    const psScript = `
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = "请选择存放图生视频的文件夹"
$dialog.ShowNewFolderButton = $true
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
  Write-Output $dialog.SelectedPath
}`;
    const { stdout } = await execFileAsync('powershell', ['-NoProfile', '-STA', '-Command', psScript], {
      windowsHide: true,
    });
    const result = stdout.trim();
    return result ? result.replace(/\\+$/, '') : null;
  }

  if (platform === 'linux') {
    try {
      const { stdout } = await execFileAsync('zenity', ['--file-selection', '--directory', '--title=选择存放图生视频的文件夹']);
      const result = stdout.trim();
      return result ? result.replace(/\/+$/, '') : null;
    } catch (error) {
      throw new Error('当前环境不支持文件夹选择，请手动在设置中心填写保存路径');
    }
  }

  throw new Error(`暂不支持的系统平台: ${platform}`);
}

export async function POST() {
  try {
    const folder = await pickFolder();
    if (!folder) {
      return NextResponse.json({ success: false, message: '已取消选择' }, { status: 200 });
    }

    return NextResponse.json({ success: true, path: folder }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: (error as Error).message || '选择文件夹失败' },
      { status: 500 },
    );
  }
}
